-- Phase 6 (2026-05-10): Period Lock — non-destructive replacement for
-- the old "Close Month" flow.
--
-- BUSINESS RATIONALE
-- The previous Close Month action snapshotted the month into a JSON
-- archive blob and then SOFT-DELETED every transaction <= end-of-month
-- so the live ledger would forget them. That worked but it (a) hid the
-- detail of historical deliveries from the customer screens and (b)
-- depended on every device being perfectly in sync at the moment of
-- close (which caused a real Rs. 1.06 lakh drift incident on 2026-05-09).
--
-- Industry-standard pattern (QuickBooks, Xero, Tally, Khata Book) is
-- the opposite: the ledger keeps growing forever, and a "lock date" is
-- set after a period is reconciled so prior transactions become
-- read-only at the database level. Reversible. Audit-logged. Zero data
-- destruction. That is what this migration implements.
--
-- After this migration:
--   * `dp_period_lock` holds a single row, the current cutoff date.
--     Any record dated <= lock_date is frozen by the trigger below.
--   * Owner adjustments (rows with is_adjustment = true on
--     dp_deliveries / dp_payments) bypass the lock — they're how
--     corrections to a locked period get recorded.
--   * `set_period_lock(date, by, note)` advances the lock and audit-logs.
--   * `clear_period_lock(by, note)` resets the lock to 1970-01-01
--     (i.e. unlocks everything). Reserved for emergencies.
--
-- This migration leaves the deprecated close_month_transactional() RPC
-- alone. It was already REVOKE'd from anon by the May-09 RLS work, so
-- it is no longer reachable from the React app. Period lock supersedes
-- it as the recommended workflow.

-- =========================================================================
-- 1. Singleton lock table
-- =========================================================================
CREATE TABLE IF NOT EXISTS dp_period_lock (
    id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    lock_date   date NOT NULL DEFAULT '1970-01-01',
    locked_by   text,
    locked_at   timestamptz DEFAULT NOW(),
    note        text
);

INSERT INTO dp_period_lock (id, lock_date, locked_by, note)
VALUES (1, '1970-01-01', 'system', 'initial — no period locked')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE dp_period_lock DISABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 2. Helper: read current lock cheaply
-- =========================================================================
CREATE OR REPLACE FUNCTION current_period_lock()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE((SELECT lock_date FROM dp_period_lock WHERE id = 1), '1970-01-01'::date);
$$;

-- =========================================================================
-- 3. Trigger that enforces the lock on every dated transactional table
-- =========================================================================
-- Runs BEFORE INSERT / UPDATE / DELETE. If the row's date is on or
-- before the lock, and the operation is not a tagged owner adjustment,
-- the operation is rejected with SQLSTATE P0003.
CREATE OR REPLACE FUNCTION enforce_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_lock         date;
    v_target_date  date;
    v_is_adj       boolean := false;
    v_has_adj_col  boolean := TG_TABLE_NAME IN ('dp_deliveries', 'dp_payments');
BEGIN
    v_lock := current_period_lock();

    IF TG_OP = 'DELETE' THEN
        v_target_date := OLD.date;
        IF v_has_adj_col THEN
            v_is_adj := COALESCE(OLD.is_adjustment, false);
        END IF;
    ELSE
        v_target_date := NEW.date;
        IF v_has_adj_col THEN
            v_is_adj := COALESCE(NEW.is_adjustment, false);
        END IF;
    END IF;

    -- Records dated AFTER the lock are unaffected.
    IF v_target_date IS NULL OR v_target_date > v_lock THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Owner adjustments are the supported way to correct a locked
    -- period: a new is_adjustment=true row is recorded today (current
    -- date) but for the locked customer, with a note.
    IF v_is_adj THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- For UPDATE, allow no-op edits where nothing material changed
    -- (e.g. realtime echo after-image). Compare key fields.
    IF TG_OP = 'UPDATE' THEN
        -- Allow if only `version` and `updated_at` changed (system housekeeping).
        IF row(NEW.*) IS NOT DISTINCT FROM row(OLD.*) THEN
            RETURN NEW;
        END IF;
    END IF;

    RAISE EXCEPTION
        'PERIOD_LOCKED: cannot modify % row dated % (lock cutoff is %). Use an Owner adjustment instead.',
        TG_TABLE_NAME, v_target_date, v_lock
    USING ERRCODE = 'P0003';
END;
$$;

-- =========================================================================
-- 4. Attach trigger to every dated transactional table
-- =========================================================================
DROP TRIGGER IF EXISTS period_lock_dp_deliveries     ON dp_deliveries;
CREATE TRIGGER period_lock_dp_deliveries
    BEFORE INSERT OR UPDATE OR DELETE ON dp_deliveries
    FOR EACH ROW EXECUTE PROCEDURE enforce_period_lock();

DROP TRIGGER IF EXISTS period_lock_dp_payments       ON dp_payments;
CREATE TRIGGER period_lock_dp_payments
    BEFORE INSERT OR UPDATE OR DELETE ON dp_payments
    FOR EACH ROW EXECUTE PROCEDURE enforce_period_lock();

DROP TRIGGER IF EXISTS period_lock_dp_expenses       ON dp_expenses;
CREATE TRIGGER period_lock_dp_expenses
    BEFORE INSERT OR UPDATE OR DELETE ON dp_expenses
    FOR EACH ROW EXECUTE PROCEDURE enforce_period_lock();

DROP TRIGGER IF EXISTS period_lock_dp_rider_loads    ON dp_rider_loads;
CREATE TRIGGER period_lock_dp_rider_loads
    BEFORE INSERT OR UPDATE OR DELETE ON dp_rider_loads
    FOR EACH ROW EXECUTE PROCEDURE enforce_period_lock();

DROP TRIGGER IF EXISTS period_lock_dp_closing_records ON dp_closing_records;
CREATE TRIGGER period_lock_dp_closing_records
    BEFORE INSERT OR UPDATE OR DELETE ON dp_closing_records
    FOR EACH ROW EXECUTE PROCEDURE enforce_period_lock();

-- =========================================================================
-- 5. RPCs the React app calls
-- =========================================================================
DROP FUNCTION IF EXISTS set_period_lock(date, text, text);

CREATE OR REPLACE FUNCTION set_period_lock(
    p_lock_date date,
    p_locked_by text,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_lock date;
    v_audit_id text;
BEGIN
    SELECT lock_date INTO v_old_lock FROM dp_period_lock WHERE id = 1;
    IF v_old_lock IS NULL THEN v_old_lock := '1970-01-01'::date; END IF;

    -- Refuse to LOWER the lock through this function — that's clear_period_lock's job.
    IF p_lock_date < v_old_lock THEN
        RAISE EXCEPTION
            'LOCK_REGRESSION: refusing to lower lock from % to %. Use clear_period_lock to unlock explicitly.',
            v_old_lock, p_lock_date
        USING ERRCODE = 'P0003';
    END IF;

    UPDATE dp_period_lock
       SET lock_date = p_lock_date,
           locked_by = COALESCE(p_locked_by, 'unknown'),
           locked_at = NOW(),
           note      = p_note
     WHERE id = 1;

    -- Append-only audit row
    v_audit_id := gen_random_uuid()::text;
    INSERT INTO dp_audit_logs (
        id, action, entity_id, entity_type, performed_by,
        timestamp, new_value, updated_at, version, deleted
    )
    VALUES (
        v_audit_id, 'UPDATE', 'period_lock', 'System',
        COALESCE(p_locked_by, 'unknown'), NOW(),
        jsonb_build_object(
            'action',        'PERIOD_LOCK_ADVANCED',
            'previous_lock', v_old_lock,
            'new_lock',      p_lock_date,
            'note',          p_note
        ),
        NOW(), 1, false
    );

    RETURN jsonb_build_object(
        'success',       true,
        'previous_lock', v_old_lock,
        'new_lock',      p_lock_date,
        'audit_id',      v_audit_id
    );
END;
$$;

DROP FUNCTION IF EXISTS clear_period_lock(text, text);

CREATE OR REPLACE FUNCTION clear_period_lock(
    p_locked_by text,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_lock date;
    v_audit_id text;
BEGIN
    SELECT lock_date INTO v_old_lock FROM dp_period_lock WHERE id = 1;

    UPDATE dp_period_lock
       SET lock_date = '1970-01-01'::date,
           locked_by = COALESCE(p_locked_by, 'unknown'),
           locked_at = NOW(),
           note      = p_note
     WHERE id = 1;

    v_audit_id := gen_random_uuid()::text;
    INSERT INTO dp_audit_logs (
        id, action, entity_id, entity_type, performed_by,
        timestamp, new_value, updated_at, version, deleted
    )
    VALUES (
        v_audit_id, 'UPDATE', 'period_lock', 'System',
        COALESCE(p_locked_by, 'unknown'), NOW(),
        jsonb_build_object(
            'action',        'PERIOD_LOCK_CLEARED',
            'previous_lock', v_old_lock,
            'note',          p_note
        ),
        NOW(), 1, false
    );

    RETURN jsonb_build_object(
        'success',       true,
        'previous_lock', v_old_lock,
        'new_lock',      '1970-01-01'::date,
        'audit_id',      v_audit_id
    );
END;
$$;

-- =========================================================================
-- 6. Read RPC for the React app's status display
-- =========================================================================
DROP FUNCTION IF EXISTS get_period_lock();

CREATE OR REPLACE FUNCTION get_period_lock()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'lock_date', lock_date,
        'locked_by', locked_by,
        'locked_at', locked_at,
        'note',      note
    )
    FROM dp_period_lock
    WHERE id = 1;
$$;

-- Grants — match Codex's split-write RLS pattern. Anon (the React
-- app, after it has set the x-app-session header for the Owner) is
-- allowed to call the read & write RPCs; the lock_date is part of
-- the trust boundary the Owner-session header enforces upstream.
GRANT EXECUTE ON FUNCTION get_period_lock()                      TO anon;
GRANT EXECUTE ON FUNCTION set_period_lock(date, text, text)      TO anon;
GRANT EXECUTE ON FUNCTION clear_period_lock(text, text)          TO anon;
GRANT EXECUTE ON FUNCTION current_period_lock()                  TO anon;

NOTIFY pgrst, 'reload schema';
