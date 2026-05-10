-- Closed rider-day guardrails.
-- After a daily closing exists, normal route rows for that rider/date are
-- immutable. Corrections must go through owner-only adjustment rows.

CREATE OR REPLACE FUNCTION reject_writes_after_rider_closing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_rider_id text;
  v_is_adjustment boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'dp_deliveries' THEN
    v_date := NEW.date;
    v_is_adjustment := coalesce(NEW.is_adjustment, false);
    v_rider_id := NEW.rider_id;
    IF v_rider_id IS NULL OR v_rider_id = '' THEN
      SELECT c.rider_id INTO v_rider_id FROM dp_customers c WHERE c.id = NEW.customer_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_payments' THEN
    v_date := NEW.date;
    v_is_adjustment := coalesce(NEW.is_adjustment, false);
    SELECT c.rider_id INTO v_rider_id FROM dp_customers c WHERE c.id = NEW.customer_id;
  ELSIF TG_TABLE_NAME = 'dp_expenses' THEN
    v_date := NEW.date;
    v_rider_id := NEW.rider_id;
  ELSIF TG_TABLE_NAME = 'dp_rider_loads' THEN
    v_date := NEW.date;
    v_rider_id := NEW.rider_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_is_adjustment THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'dp_deliveries'
     AND TG_OP = 'UPDATE'
     AND coalesce(OLD.deleted, false) = false
     AND coalesce(NEW.deleted, false) = false
     AND coalesce(OLD.is_adjustment, false) = false
     AND coalesce(NEW.is_adjustment, false) = false
     AND coalesce(NEW.is_locked, false) = true
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.liters IS NOT DISTINCT FROM OLD.liters
     AND NEW.price_at_time IS NOT DISTINCT FROM OLD.price_at_time
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.rider_id IS NOT DISTINCT FROM OLD.rider_id THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.deleted, false) = true THEN
    RETURN NEW;
  END IF;

  IF v_date IS NULL OR v_rider_id IS NULL OR v_rider_id = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dp_closing_records cr
    WHERE cr.rider_id = v_rider_id
      AND cr.date = v_date
      AND coalesce(cr.deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'RIDER_DAY_ALREADY_CLOSED' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS closed_day_guard_dp_deliveries ON dp_deliveries;
CREATE TRIGGER closed_day_guard_dp_deliveries
BEFORE INSERT OR UPDATE ON dp_deliveries
FOR EACH ROW EXECUTE PROCEDURE reject_writes_after_rider_closing();

DROP TRIGGER IF EXISTS closed_day_guard_dp_payments ON dp_payments;
CREATE TRIGGER closed_day_guard_dp_payments
BEFORE INSERT OR UPDATE ON dp_payments
FOR EACH ROW EXECUTE PROCEDURE reject_writes_after_rider_closing();

DROP TRIGGER IF EXISTS closed_day_guard_dp_expenses ON dp_expenses;
CREATE TRIGGER closed_day_guard_dp_expenses
BEFORE INSERT OR UPDATE ON dp_expenses
FOR EACH ROW EXECUTE PROCEDURE reject_writes_after_rider_closing();

DROP TRIGGER IF EXISTS closed_day_guard_dp_rider_loads ON dp_rider_loads;
CREATE TRIGGER closed_day_guard_dp_rider_loads
BEFORE INSERT OR UPDATE ON dp_rider_loads
FOR EACH ROW EXECUTE PROCEDURE reject_writes_after_rider_closing();

NOTIFY pgrst, 'reload schema';
