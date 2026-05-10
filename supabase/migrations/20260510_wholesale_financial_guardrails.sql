-- Wholesale financial guardrails.
-- Wholesale is owner-only, but it still needs no hard deletes, no negative
-- money rows, and idempotency metadata for payments.

ALTER TABLE ws_wholesale_customers ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE ws_wholesale_customers ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE ws_products ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE ws_products ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE ws_deliveries ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE ws_deliveries ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE ws_payments ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE ws_payments ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE ws_payments ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS unique_ws_payment_client_request_live
ON ws_payments(client_request_id)
WHERE client_request_id IS NOT NULL
  AND coalesce(deleted, false) = false;

CREATE OR REPLACE FUNCTION reject_negative_wholesale_values()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(NEW.deleted, false) = true THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'ws_deliveries' THEN
    IF NEW.quantity < 0 OR NEW.rate < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_WHOLESALE_DELIVERY_REJECTED' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ws_payments' THEN
    IF NEW.amount <= 0 THEN
      RAISE EXCEPTION 'WHOLESALE_PAYMENT_MUST_BE_POSITIVE' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ws_products' THEN
    IF NEW.default_rate < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_WHOLESALE_PRODUCT_RATE_REJECTED' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_negative_ws_deliveries ON ws_deliveries;
CREATE TRIGGER reject_negative_ws_deliveries
BEFORE INSERT OR UPDATE ON ws_deliveries
FOR EACH ROW EXECUTE PROCEDURE reject_negative_wholesale_values();

DROP TRIGGER IF EXISTS reject_negative_ws_payments ON ws_payments;
CREATE TRIGGER reject_negative_ws_payments
BEFORE INSERT OR UPDATE ON ws_payments
FOR EACH ROW EXECUTE PROCEDURE reject_negative_wholesale_values();

DROP TRIGGER IF EXISTS reject_negative_ws_products ON ws_products;
CREATE TRIGGER reject_negative_ws_products
BEFORE INSERT OR UPDATE ON ws_products
FOR EACH ROW EXECUTE PROCEDURE reject_negative_wholesale_values();

NOTIFY pgrst, 'reload schema';
