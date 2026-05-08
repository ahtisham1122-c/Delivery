
-- 1. Add revision column to mutable tables
ALTER TABLE dp_customers ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_deliveries ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;
ALTER TABLE dp_payments ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 0;

-- 2. Ensure dp_metadata has the system_revision key
INSERT INTO dp_metadata (key, value) 
VALUES ('system_revision', 1) 
ON CONFLICT (key) DO NOTHING;

-- 3. Create a function to increment system_revision and return the new value
CREATE OR REPLACE FUNCTION increment_system_revision()
RETURNS TRIGGER AS $$
DECLARE
    new_rev BIGINT;
BEGIN
    UPDATE dp_metadata 
    SET value = value + 1 
    WHERE key = 'system_revision'
    RETURNING value INTO new_rev;
    
    NEW.revision := new_rev;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create triggers for each table
DROP TRIGGER IF EXISTS tr_dp_customers_revision ON dp_customers;
CREATE TRIGGER tr_dp_customers_revision
BEFORE INSERT OR UPDATE ON dp_customers
FOR EACH ROW EXECUTE FUNCTION increment_system_revision();

DROP TRIGGER IF EXISTS tr_dp_deliveries_revision ON dp_deliveries;
CREATE TRIGGER tr_dp_deliveries_revision
BEFORE INSERT OR UPDATE ON dp_deliveries
FOR EACH ROW EXECUTE FUNCTION increment_system_revision();

DROP TRIGGER IF EXISTS tr_dp_payments_revision ON dp_payments;
CREATE TRIGGER tr_dp_payments_revision
BEFORE INSERT OR UPDATE ON dp_payments
FOR EACH ROW EXECUTE FUNCTION increment_system_revision();

-- 5. Initialize existing records with a baseline revision
UPDATE dp_customers SET revision = 1 WHERE revision = 0;
UPDATE dp_deliveries SET revision = 1 WHERE revision = 0;
UPDATE dp_payments SET revision = 1 WHERE revision = 0;
