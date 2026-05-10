-- Production financial guardrails.
-- Applied after a full JSON backup. This migration is intentionally
-- conservative: it normalizes live flags, restores OCC triggers on all
-- money tables, and replaces nullable partial unique indexes with
-- predicates that treat NULL as false.

-- Boolean flags must never be NULL on operational tables. A nullable
-- `is_adjustment` previously allowed duplicate daily deliveries to bypass
-- the unique index because `is_adjustment = false` does not match NULL.
UPDATE dp_deliveries SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;
UPDATE dp_deliveries SET is_adjustment = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE is_adjustment IS NULL;
UPDATE dp_payments SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;
UPDATE dp_payments SET is_adjustment = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE is_adjustment IS NULL;
UPDATE dp_expenses SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;
UPDATE dp_rider_loads SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;
UPDATE dp_closing_records SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;
UPDATE dp_archives SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;
UPDATE dp_audit_logs SET deleted = false, version = coalesce(version, 0) + 1, updated_at = now() WHERE deleted IS NULL;

ALTER TABLE dp_deliveries ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_deliveries ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_deliveries ALTER COLUMN is_adjustment SET DEFAULT false;
ALTER TABLE dp_deliveries ALTER COLUMN is_adjustment SET NOT NULL;

ALTER TABLE dp_payments ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_payments ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_payments ALTER COLUMN is_adjustment SET DEFAULT false;
ALTER TABLE dp_payments ALTER COLUMN is_adjustment SET NOT NULL;

ALTER TABLE dp_expenses ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_expenses ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_rider_loads ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_rider_loads ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_closing_records ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_closing_records ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_archives ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_archives ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_audit_logs ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_audit_logs ALTER COLUMN deleted SET NOT NULL;

-- Replace earlier duplicate/nullable indexes with one canonical index each.
DROP INDEX IF EXISTS dp_deliveries_unique_entry;
DROP INDEX IF EXISTS unique_delivery_per_day;
CREATE UNIQUE INDEX IF NOT EXISTS unique_delivery_per_day_live
ON dp_deliveries (customer_id, date, rider_id)
WHERE coalesce(is_adjustment, false) = false AND coalesce(deleted, false) = false;

DROP INDEX IF EXISTS dp_rider_loads_unique_entry;
DROP INDEX IF EXISTS unique_load_per_day;
CREATE UNIQUE INDEX IF NOT EXISTS unique_load_per_day_live
ON dp_rider_loads (rider_id, date)
WHERE coalesce(deleted, false) = false;

DROP INDEX IF EXISTS dp_closing_records_unique_entry;
DROP INDEX IF EXISTS unique_closing_per_day;
CREATE UNIQUE INDEX IF NOT EXISTS unique_closing_per_day_live
ON dp_closing_records (rider_id, date)
WHERE coalesce(deleted, false) = false;

DROP INDEX IF EXISTS uniq_dp_archives_active_month;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dp_archives_active_month_live
ON dp_archives (year, month)
WHERE coalesce(deleted, false) = false;

-- Strict OCC: every update must carry a strictly greater version.
CREATE OR REPLACE FUNCTION enforce_occ_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.version IS NULL OR OLD.version IS NULL OR NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'Concurrency Conflict: Stale data update blocked on table %', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.updated_at IS NULL OR NEW.updated_at <= OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS occ_dp_customers ON dp_customers;
CREATE TRIGGER occ_dp_customers BEFORE UPDATE ON dp_customers
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_deliveries ON dp_deliveries;
CREATE TRIGGER occ_dp_deliveries BEFORE UPDATE ON dp_deliveries
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_payments ON dp_payments;
CREATE TRIGGER occ_dp_payments BEFORE UPDATE ON dp_payments
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_expenses ON dp_expenses;
CREATE TRIGGER occ_dp_expenses BEFORE UPDATE ON dp_expenses
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_riders ON dp_riders;
CREATE TRIGGER occ_dp_riders BEFORE UPDATE ON dp_riders
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_prices ON dp_prices;
CREATE TRIGGER occ_dp_prices BEFORE UPDATE ON dp_prices
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_rider_loads ON dp_rider_loads;
CREATE TRIGGER occ_dp_rider_loads BEFORE UPDATE ON dp_rider_loads
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_closing_records ON dp_closing_records;
CREATE TRIGGER occ_dp_closing_records BEFORE UPDATE ON dp_closing_records
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_archives ON dp_archives;
CREATE TRIGGER occ_dp_archives BEFORE UPDATE ON dp_archives
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

DROP TRIGGER IF EXISTS occ_dp_audit_logs ON dp_audit_logs;
CREATE TRIGGER occ_dp_audit_logs BEFORE UPDATE ON dp_audit_logs
FOR EACH ROW EXECUTE PROCEDURE enforce_occ_version();

-- Month-close RPCs are dormant in the UI. Do not allow public callers to
-- execute them directly.
REVOKE EXECUTE ON FUNCTION close_month_transactional(integer, integer, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION preview_month_close(integer, integer) FROM anon, authenticated, public;

NOTIFY pgrst, 'reload schema';
