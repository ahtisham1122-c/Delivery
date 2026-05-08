
-- Gujjar Milk Shop - Performance Indexing & Full Delta Sync
-- Date: 2026-03-09
-- Description: Adds revision columns to remaining tables and B-Tree indexes for O(log n) sync.

-- 1. Add revision column to remaining mutable tables
ALTER TABLE dp_riders ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_prices ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_expenses ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_archives ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_audit_logs ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_rider_loads ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_closing_records ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;

-- 2. Create triggers for the new tables
CREATE TRIGGER tr_dp_riders_revision BEFORE INSERT OR UPDATE ON dp_riders FOR EACH ROW EXECUTE FUNCTION increment_system_revision();
CREATE TRIGGER tr_dp_prices_revision BEFORE INSERT OR UPDATE ON dp_prices FOR EACH ROW EXECUTE FUNCTION increment_system_revision();
CREATE TRIGGER tr_dp_expenses_revision BEFORE INSERT OR UPDATE ON dp_expenses FOR EACH ROW EXECUTE FUNCTION increment_system_revision();
CREATE TRIGGER tr_dp_archives_revision BEFORE INSERT OR UPDATE ON dp_archives FOR EACH ROW EXECUTE FUNCTION increment_system_revision();
CREATE TRIGGER tr_dp_audit_logs_revision BEFORE INSERT OR UPDATE ON dp_audit_logs FOR EACH ROW EXECUTE FUNCTION increment_system_revision();
CREATE TRIGGER tr_dp_rider_loads_revision BEFORE INSERT OR UPDATE ON dp_rider_loads FOR EACH ROW EXECUTE FUNCTION increment_system_revision();
CREATE TRIGGER tr_dp_closing_records_revision BEFORE INSERT OR UPDATE ON dp_closing_records FOR EACH ROW EXECUTE FUNCTION increment_system_revision();

-- 3. Initialize existing records
UPDATE dp_riders SET revision = 1 WHERE revision = 0;
UPDATE dp_prices SET revision = 1 WHERE revision = 0;
UPDATE dp_expenses SET revision = 1 WHERE revision = 0;
UPDATE dp_archives SET revision = 1 WHERE revision = 0;
UPDATE dp_audit_logs SET revision = 1 WHERE revision = 0;
UPDATE dp_rider_loads SET revision = 1 WHERE revision = 0;
UPDATE dp_closing_records SET revision = 1 WHERE revision = 0;

-- 4. B-Tree Indexes for O(log n) delta sync performance
CREATE INDEX IF NOT EXISTS idx_dp_customers_revision ON dp_customers(revision);
CREATE INDEX IF NOT EXISTS idx_dp_deliveries_revision ON dp_deliveries(revision);
CREATE INDEX IF NOT EXISTS idx_dp_payments_revision ON dp_payments(revision);
CREATE INDEX IF NOT EXISTS idx_dp_riders_revision ON dp_riders(revision);
CREATE INDEX IF NOT EXISTS idx_dp_prices_revision ON dp_prices(revision);
CREATE INDEX IF NOT EXISTS idx_dp_expenses_revision ON dp_expenses(revision);
CREATE INDEX IF NOT EXISTS idx_dp_archives_revision ON dp_archives(revision);
CREATE INDEX IF NOT EXISTS idx_dp_audit_logs_revision ON dp_audit_logs(revision);
CREATE INDEX IF NOT EXISTS idx_dp_rider_loads_revision ON dp_rider_loads(revision);
CREATE INDEX IF NOT EXISTS idx_dp_closing_records_revision ON dp_closing_records(revision);
