-- Allow legacy correction rows to be soft-deleted even if their historical
-- values are negative. The guard only applies to rows that remain active.

CREATE OR REPLACE FUNCTION reject_negative_financial_values()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(NEW.deleted, false) = true THEN
    RETURN NEW;
  END IF;

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

NOTIFY pgrst, 'reload schema';
