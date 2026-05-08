-- Phase 3 defensive integrity (2026-05-09)
--
-- Phase 1 fixed device-to-device divergence.
-- Phase 2 made month-close atomic.
-- Phase 3 hardens every other write path against the same class of bugs:
--   (1) OCC triggers on the five remaining `dp_*` tables.
--   (2) A unique partial index on (year, month) for active archives so
--       you can never double-archive the same month, even if the RPC
--       check were ever bypassed (defence in depth).
--   (3) A read-only `live_reconcile()` RPC that returns every customer
--       whose local balance differs from the server-computed balance.
--       The Owner-facing UI calls this and shows the drift table.
--
-- Safe to run on a live database. Triggers fire on UPDATE only, and a
-- code review confirmed every UPDATE path in the React app already
-- bumps `version: (x.version || 0) + 1`. The unique index uses
-- WHERE deleted = false so soft-deleted archives don't conflict.

-- ===========================================================================
-- 1. Extend OCC enforcement to remaining operational tables
-- ===========================================================================
-- Trigger function `enforce_occ_version` already exists from
-- 20260427_enforce_occ.sql. Just attach it to the missing tables.

DROP TRIGGER IF EXISTS occ_dp_prices ON dp_prices;
CREATE TRIGGER occ_dp_prices
    BEFORE UPDATE ON dp_prices
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_rider_loads ON dp_rider_loads;
CREATE TRIGGER occ_dp_rider_loads
    BEFORE UPDATE ON dp_rider_loads
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_closing_records ON dp_closing_records;
CREATE TRIGGER occ_dp_closing_records
    BEFORE UPDATE ON dp_closing_records
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_archives ON dp_archives;
CREATE TRIGGER occ_dp_archives
    BEFORE UPDATE ON dp_archives
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_audit_logs ON dp_audit_logs;
CREATE TRIGGER occ_dp_audit_logs
    BEFORE UPDATE ON dp_audit_logs
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

-- ===========================================================================
-- 2. Belt-and-braces: prevent double-archive even outside the RPC
-- ===========================================================================
-- The Phase 2 RPC already refuses if a non-deleted archive exists for the
-- same (year, month). This index makes the database itself enforce that
-- invariant — useful if anyone ever inserts directly via the dashboard or
-- a future code path forgets the check.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_dp_archives_active_month
    ON dp_archives (year, month)
    WHERE deleted = false;

-- ===========================================================================
-- 3. Live reconciliation: show drift between client and server
-- ===========================================================================
-- The React app passes its locally-computed balances; this function returns
-- the rows where the server-computed balance differs by more than 1 paisa.
-- It is read-only and SECURITY DEFINER so the React app can call it from
-- the anon key without RLS surprises.
--
-- INPUT: jsonb of {customer_id: local_balance}, e.g. {"c1": 4250, "c2": 0}
-- OUTPUT: rows for any customer whose local != server, including missing.

DROP FUNCTION IF EXISTS live_reconcile(jsonb);

CREATE OR REPLACE FUNCTION live_reconcile(p_local_balances jsonb)
RETURNS TABLE (
    customer_id     text,
    customer_name   text,
    local_balance   numeric,
    server_balance  numeric,
    difference      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH d AS (
        SELECT customer_id AS cid, SUM(total_amount) AS total
        FROM dp_deliveries
        WHERE deleted = false
        GROUP BY customer_id
    ),
    p AS (
        SELECT customer_id AS cid, SUM(amount) AS total
        FROM dp_payments
        WHERE deleted = false
        GROUP BY customer_id
    ),
    server AS (
        SELECT
            c.id   AS cid,
            c.name AS cname,
            ROUND(c.opening_balance + COALESCE(d.total, 0) - COALESCE(p.total, 0), 2) AS sbal
        FROM dp_customers c
        LEFT JOIN d ON d.cid = c.id
        LEFT JOIN p ON p.cid = c.id
        WHERE c.deleted = false
    )
    SELECT
        s.cid,
        s.cname,
        ROUND(COALESCE((p_local_balances ->> s.cid)::numeric, 0), 2) AS local_balance,
        s.sbal,
        ROUND(s.sbal - COALESCE((p_local_balances ->> s.cid)::numeric, 0), 2) AS difference
    FROM server s
    WHERE ABS(
        s.sbal - COALESCE((p_local_balances ->> s.cid)::numeric, 0)
    ) > 0.01
    ORDER BY ABS(s.sbal - COALESCE((p_local_balances ->> s.cid)::numeric, 0)) DESC;
END;
$$;

NOTIFY pgrst, 'reload schema';
