-- OCC AND SECURITY PATCH MIGRATION
-- Apply this to Supabase to enforce data integrity

-- 1. Create the OCC (Optimistic Concurrency Control) Trigger Function
CREATE OR REPLACE FUNCTION enforce_occ_version()
RETURNS TRIGGER AS $$
BEGIN
    -- If the incoming version is NOT strictly strictly greater than the existing version,
    -- and we are doing an update, reject the change.
    -- (We allow it to pass if they are bypassing version, but a strict OCC requires it)
    IF NEW.version <= OLD.version THEN
        RAISE EXCEPTION 'Concurrency Conflict: Stale data update blocked on table %', TG_TABLE_NAME
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach OCC Triggers to all operational tables
DROP TRIGGER IF EXISTS occ_dp_customers ON dp_customers;
CREATE TRIGGER occ_dp_customers
    BEFORE UPDATE ON dp_customers
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_deliveries ON dp_deliveries;
CREATE TRIGGER occ_dp_deliveries
    BEFORE UPDATE ON dp_deliveries
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_payments ON dp_payments;
CREATE TRIGGER occ_dp_payments
    BEFORE UPDATE ON dp_payments
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_expenses ON dp_expenses;
CREATE TRIGGER occ_dp_expenses
    BEFORE UPDATE ON dp_expenses
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_riders ON dp_riders;
CREATE TRIGGER occ_dp_riders
    BEFORE UPDATE ON dp_riders
    FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

-- 3. Replace current_setting auth with proper Supabase auth mappings if relying on custom claims
-- Note: A completely secure RLS setup requires users to be authenticated via auth.users.
