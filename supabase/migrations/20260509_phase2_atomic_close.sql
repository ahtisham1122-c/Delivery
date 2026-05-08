-- Phase 2 ledger-stability fix (2026-05-09)
--
-- WHAT THIS DOES
-- 1. Adds preview_month_close(year, month) -> jsonb
--    A read-only dry-run. Returns counts and the closing balance per
--    customer WITHOUT mutating anything. The React app calls this
--    FIRST and shows the result to the Owner before they confirm.
--
-- 2. Adds close_month_transactional(year, month, performed_by) -> jsonb
--    A single atomic Postgres transaction that replaces the old
--    multi-step client-side close. It (a) refuses if the month is
--    already archived, (b) computes closing balances on the server
--    using authoritative data, (c) writes the archive row, (d) rolls
--    customer opening balances forward, (e) soft-deletes all records
--    dated on or before the month-end, (f) writes the audit log.
--    All in ONE transaction. If any step fails, NOTHING changes.
--    Soft-delete UPDATEs bump `version` so the OCC trigger is satisfied.
--
-- 3. Recreates dp_customer_balances view to FILTER deleted=false. The
--    original view summed deleted rows too, occasionally producing a
--    different number from the client (which DOES filter `!deleted`).
--
-- All operations are reversible by restoring from the backups taken in
-- Phase 1 Step 0. No data is destroyed by simply running this script;
-- it only creates / replaces functions and a view.
--
-- IMPORTANT: month parameter is 0-indexed (January = 0, December = 11)
-- matching the JavaScript Date convention used everywhere in the app.

-- ===========================================================================
-- 1. Fixed customer balances view (deleted filter)
-- ===========================================================================
DROP VIEW IF EXISTS dp_customer_balances CASCADE;

CREATE VIEW dp_customer_balances AS
WITH d AS (
    SELECT customer_id, SUM(total_amount) AS total
    FROM dp_deliveries
    WHERE deleted = false
    GROUP BY customer_id
), p AS (
    SELECT customer_id, SUM(amount) AS total
    FROM dp_payments
    WHERE deleted = false
    GROUP BY customer_id
)
SELECT
    c.id AS customer_id,
    ROUND(
        c.opening_balance
          + COALESCE(d.total, 0)
          - COALESCE(p.total, 0),
        2
    ) AS balance
FROM dp_customers c
LEFT JOIN d ON d.customer_id = c.id
LEFT JOIN p ON p.customer_id = c.id
WHERE c.deleted = false;

-- ===========================================================================
-- 2. Read-only month-close preview
-- ===========================================================================
DROP FUNCTION IF EXISTS preview_month_close(integer, integer);

CREATE OR REPLACE FUNCTION preview_month_close(
    p_year integer,
    p_month integer  -- 0-indexed
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_already_closed integer;
    v_deliveries_count integer;
    v_payments_count integer;
    v_expenses_count integer;
    v_deliveries_total numeric;
    v_payments_total numeric;
    v_expenses_total numeric;
    v_closing_balances jsonb;
    v_top_changes jsonb;
BEGIN
    v_start_date := make_date(p_year, p_month + 1, 1);
    v_end_date   := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::date;

    SELECT COUNT(*) INTO v_already_closed
    FROM dp_archives
    WHERE year = p_year AND month = p_month AND deleted = false;

    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
      INTO v_deliveries_count, v_deliveries_total
    FROM dp_deliveries
    WHERE deleted = false AND date >= v_start_date AND date <= v_end_date;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
      INTO v_payments_count, v_payments_total
    FROM dp_payments
    WHERE deleted = false AND date >= v_start_date AND date <= v_end_date;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
      INTO v_expenses_count, v_expenses_total
    FROM dp_expenses
    WHERE deleted = false AND date >= v_start_date AND date <= v_end_date;

    -- Closing balance per customer (= live balance through end_date)
    WITH d_sums AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM dp_deliveries
        WHERE deleted = false AND date <= v_end_date
        GROUP BY customer_id
    ),
    p_sums AS (
        SELECT customer_id, SUM(amount) AS total
        FROM dp_payments
        WHERE deleted = false AND date <= v_end_date
        GROUP BY customer_id
    ),
    bal AS (
        SELECT
            c.id,
            c.name,
            ROUND(c.opening_balance + COALESCE(ds.total, 0) - COALESCE(ps.total, 0), 2) AS new_balance,
            ROUND(c.opening_balance, 2) AS old_balance
        FROM dp_customers c
        LEFT JOIN d_sums ds ON ds.customer_id = c.id
        LEFT JOIN p_sums ps ON ps.customer_id = c.id
        WHERE c.deleted = false
    )
    SELECT
        COALESCE(jsonb_object_agg(id, new_balance), '{}'::jsonb)
      INTO v_closing_balances
    FROM bal;

    -- Top 10 customers by absolute balance change (helps the Owner sanity-check)
    WITH d_sums AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM dp_deliveries
        WHERE deleted = false AND date <= v_end_date
        GROUP BY customer_id
    ),
    p_sums AS (
        SELECT customer_id, SUM(amount) AS total
        FROM dp_payments
        WHERE deleted = false AND date <= v_end_date
        GROUP BY customer_id
    ),
    bal AS (
        SELECT
            c.id, c.name,
            ROUND(c.opening_balance + COALESCE(ds.total, 0) - COALESCE(ps.total, 0), 2) AS new_balance,
            ROUND(c.opening_balance, 2) AS old_balance
        FROM dp_customers c
        LEFT JOIN d_sums ds ON ds.customer_id = c.id
        LEFT JOIN p_sums ps ON ps.customer_id = c.id
        WHERE c.deleted = false
    )
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_changes
    FROM (
        SELECT id, name, old_balance, new_balance, (new_balance - old_balance) AS change
        FROM bal
        ORDER BY ABS(new_balance - old_balance) DESC
        LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'year',                p_year,
        'month',               p_month,
        'start_date',          v_start_date,
        'end_date',            v_end_date,
        'already_closed',      v_already_closed > 0,
        'deliveries_count',    v_deliveries_count,
        'deliveries_total',    v_deliveries_total,
        'payments_count',      v_payments_count,
        'payments_total',      v_payments_total,
        'expenses_count',      v_expenses_count,
        'expenses_total',      v_expenses_total,
        'closing_balances',    v_closing_balances,
        'top_changes',         v_top_changes
    );
END;
$$;

-- ===========================================================================
-- 3. Atomic transactional month-close
-- ===========================================================================
DROP FUNCTION IF EXISTS close_month_transactional(integer, integer, text);

CREATE OR REPLACE FUNCTION close_month_transactional(
    p_year integer,
    p_month integer,  -- 0-indexed
    p_performed_by text DEFAULT 'Owner'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date  date;
    v_end_date    date;
    v_existing    integer;
    v_archive_id  text;
    v_audit_id    text;
    v_now         timestamptz := NOW();
    v_deliveries  jsonb;
    v_payments    jsonb;
    v_expenses    jsonb;
    v_closing     jsonb;
    v_d_count     integer;
    v_p_count     integer;
    v_e_count     integer;
    v_l_count     integer;
    v_c_count     integer;
    v_cust_updated integer;
BEGIN
    v_start_date := make_date(p_year, p_month + 1, 1);
    v_end_date   := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- ----- Idempotency: refuse if already closed -----
    SELECT COUNT(*) INTO v_existing
    FROM dp_archives
    WHERE year = p_year AND month = p_month AND deleted = false;

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'MONTH_ALREADY_CLOSED: archive for %-% already exists', p_year, p_month
            USING ERRCODE = 'P0002';
    END IF;

    -- ----- Snapshot the month's transactions as JSONB (for the archive) -----
    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.date, d.id), '[]'::jsonb)
      INTO v_deliveries
    FROM dp_deliveries d
    WHERE d.deleted = false
      AND d.date >= v_start_date
      AND d.date <= v_end_date;

    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.date, p.id), '[]'::jsonb)
      INTO v_payments
    FROM dp_payments p
    WHERE p.deleted = false
      AND p.date >= v_start_date
      AND p.date <= v_end_date;

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.date, e.id), '[]'::jsonb)
      INTO v_expenses
    FROM dp_expenses e
    WHERE e.deleted = false
      AND e.date >= v_start_date
      AND e.date <= v_end_date;

    -- ----- Compute closing balances per customer (live, server-side) -----
    WITH d_sums AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM dp_deliveries
        WHERE deleted = false AND date <= v_end_date
        GROUP BY customer_id
    ),
    p_sums AS (
        SELECT customer_id, SUM(amount) AS total
        FROM dp_payments
        WHERE deleted = false AND date <= v_end_date
        GROUP BY customer_id
    ),
    bal AS (
        SELECT
            c.id,
            ROUND(c.opening_balance + COALESCE(ds.total, 0) - COALESCE(ps.total, 0), 2) AS new_balance
        FROM dp_customers c
        LEFT JOIN d_sums ds ON ds.customer_id = c.id
        LEFT JOIN p_sums ps ON ps.customer_id = c.id
        WHERE c.deleted = false
    )
    SELECT COALESCE(jsonb_object_agg(id, new_balance), '{}'::jsonb)
      INTO v_closing
    FROM bal;

    -- ----- Insert archive row -----
    v_archive_id := gen_random_uuid()::text;

    INSERT INTO dp_archives (id, year, month, payload, updated_at, version, deleted)
    VALUES (
        v_archive_id,
        p_year,
        p_month,
        jsonb_build_object(
            'deliveries',      v_deliveries,
            'payments',        v_payments,
            'expenses',        v_expenses,
            'closingBalances', v_closing
        ),
        v_now,
        1,
        false
    );

    -- ----- Roll customer opening balances forward (OCC: bump version) -----
    UPDATE dp_customers c
    SET opening_balance = COALESCE((v_closing ->> c.id)::numeric, c.opening_balance),
        updated_at      = v_now,
        version         = COALESCE(c.version, 0) + 1
    WHERE c.deleted = false
      AND v_closing ? c.id;
    GET DIAGNOSTICS v_cust_updated = ROW_COUNT;

    -- ----- Soft-delete every transaction on or before month-end -----
    -- (Each UPDATE bumps version so the OCC trigger is satisfied.)
    UPDATE dp_deliveries
    SET deleted = true, updated_at = v_now, version = COALESCE(version, 0) + 1
    WHERE deleted = false AND date <= v_end_date;
    GET DIAGNOSTICS v_d_count = ROW_COUNT;

    UPDATE dp_payments
    SET deleted = true, updated_at = v_now, version = COALESCE(version, 0) + 1
    WHERE deleted = false AND date <= v_end_date;
    GET DIAGNOSTICS v_p_count = ROW_COUNT;

    UPDATE dp_expenses
    SET deleted = true, updated_at = v_now, version = COALESCE(version, 0) + 1
    WHERE deleted = false AND date <= v_end_date;
    GET DIAGNOSTICS v_e_count = ROW_COUNT;

    UPDATE dp_rider_loads
    SET deleted = true, updated_at = v_now, version = COALESCE(version, 0) + 1
    WHERE deleted = false AND date <= v_end_date;
    GET DIAGNOSTICS v_l_count = ROW_COUNT;

    UPDATE dp_closing_records
    SET deleted = true, updated_at = v_now, version = COALESCE(version, 0) + 1
    WHERE deleted = false AND date <= v_end_date;
    GET DIAGNOSTICS v_c_count = ROW_COUNT;

    -- ----- Audit log -----
    v_audit_id := gen_random_uuid()::text;

    INSERT INTO dp_audit_logs (
        id, action, entity_id, entity_type, performed_by,
        timestamp, new_value, updated_at, version, deleted
    )
    VALUES (
        v_audit_id,
        'CREATE',
        p_year || '-' || p_month,
        'System',
        p_performed_by,
        v_now,
        jsonb_build_object(
            'action',              'MONTH_CLOSE',
            'year',                p_year,
            'month',               p_month,
            'archive_id',          v_archive_id,
            'customers_updated',   v_cust_updated,
            'deliveries_archived', v_d_count,
            'payments_archived',   v_p_count,
            'expenses_archived',   v_e_count
        ),
        v_now,
        1,
        false
    );

    RETURN jsonb_build_object(
        'success',              true,
        'archive_id',           v_archive_id,
        'audit_id',             v_audit_id,
        'customers_updated',    v_cust_updated,
        'deliveries_archived',  v_d_count,
        'payments_archived',    v_p_count,
        'expenses_archived',    v_e_count,
        'rider_loads_archived', v_l_count,
        'closings_archived',    v_c_count
    );
END;
$$;

-- Refresh PostgREST schema cache so the new RPCs are visible immediately.
NOTIFY pgrst, 'reload schema';
