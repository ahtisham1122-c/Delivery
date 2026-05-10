-- Normalize remaining nullable soft-delete flags and prevent future negative
-- operational money rows. Existing historical correction rows are preserved.

UPDATE dp_customers
SET deleted = false,
    updated_at = now(),
    version = coalesce(version, 0) + 1
WHERE deleted IS NULL;

UPDATE dp_riders
SET deleted = false,
    updated_at = now(),
    version = coalesce(version, 0) + 1
WHERE deleted IS NULL;

UPDATE dp_prices
SET deleted = false,
    updated_at = now(),
    version = coalesce(version, 0) + 1
WHERE deleted IS NULL;

ALTER TABLE dp_customers ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_customers ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_riders ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_riders ALTER COLUMN deleted SET NOT NULL;
ALTER TABLE dp_prices ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE dp_prices ALTER COLUMN deleted SET NOT NULL;

CREATE OR REPLACE FUNCTION reject_negative_financial_values()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'dp_deliveries' THEN
    IF NEW.liters < 0 OR NEW.price_at_time < 0 OR NEW.total_amount < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_DELIVERY_VALUE_REJECTED' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_payments' THEN
    IF NEW.amount <= 0 THEN
      RAISE EXCEPTION 'NON_POSITIVE_PAYMENT_REJECTED' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_expenses' THEN
    IF NEW.amount < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_EXPENSE_REJECTED' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_prices' THEN
    IF NEW.price <= 0 THEN
      RAISE EXCEPTION 'NON_POSITIVE_PRICE_REJECTED' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_negative_financial_values_deliveries ON dp_deliveries;
CREATE TRIGGER reject_negative_financial_values_deliveries
BEFORE INSERT OR UPDATE ON dp_deliveries
FOR EACH ROW EXECUTE FUNCTION reject_negative_financial_values();

DROP TRIGGER IF EXISTS reject_negative_financial_values_payments ON dp_payments;
CREATE TRIGGER reject_negative_financial_values_payments
BEFORE INSERT OR UPDATE ON dp_payments
FOR EACH ROW EXECUTE FUNCTION reject_negative_financial_values();

DROP TRIGGER IF EXISTS reject_negative_financial_values_expenses ON dp_expenses;
CREATE TRIGGER reject_negative_financial_values_expenses
BEFORE INSERT OR UPDATE ON dp_expenses
FOR EACH ROW EXECUTE FUNCTION reject_negative_financial_values();

DROP TRIGGER IF EXISTS reject_negative_financial_values_prices ON dp_prices;
CREATE TRIGGER reject_negative_financial_values_prices
BEFORE INSERT OR UPDATE ON dp_prices
FOR EACH ROW EXECUTE FUNCTION reject_negative_financial_values();

NOTIFY pgrst, 'reload schema';
