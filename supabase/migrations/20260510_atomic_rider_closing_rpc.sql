-- Atomic rider closing write path.
-- Stores the audit row and locks that rider's delivery rows in one transaction.

CREATE OR REPLACE FUNCTION save_rider_closing(p_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rider_id text := p_record ->> 'rider_id';
  v_date date := (p_record ->> 'date')::date;
  v_record_id text := coalesce(nullif(p_record ->> 'id', ''), gen_random_uuid()::text);
  v_returned numeric := round(coalesce((p_record ->> 'returned_milk_liters')::numeric, 0), 2);
  v_wastage numeric := round(coalesce((p_record ->> 'wastage_liters')::numeric, 0), 2);
  v_physical_cash numeric := round(coalesce((p_record ->> 'physical_cash_received')::numeric, 0), 2);
  v_remarks text := nullif(p_record ->> 'audit_remarks', '');
  v_morning_load numeric := 0;
  v_app_deliveries numeric := 0;
  v_expected_cash numeric := 0;
  v_expenses numeric := 0;
  v_existing_id text;
  v_now timestamptz := now();
  v_locked_count integer := 0;
  v_saved_record dp_closing_records%ROWTYPE;
BEGIN
  IF app_has_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'APP_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_rider_id IS NULL OR v_rider_id = '' THEN
    RAISE EXCEPTION 'RIDER_REQUIRED' USING ERRCODE = '23502';
  END IF;

  IF app_is_owner() IS NOT TRUE AND v_rider_id <> app_session_rider_id() THEN
    RAISE EXCEPTION 'RIDER_SCOPE_VIOLATION' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dp_riders r
    WHERE r.id = v_rider_id
      AND coalesce(r.deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'RIDER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF v_returned < 0 OR v_wastage < 0 OR v_physical_cash < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_CLOSING_VALUE_REJECTED' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_existing_id
  FROM dp_closing_records
  WHERE rider_id = v_rider_id
    AND date = v_date
    AND coalesce(deleted, false) = false
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'CLOSING_ALREADY_EXISTS' USING ERRCODE = '23505';
  END IF;

  SELECT round(coalesce(sum(l.liters), 0), 2) INTO v_morning_load
  FROM dp_rider_loads l
  WHERE l.rider_id = v_rider_id
    AND l.date = v_date
    AND coalesce(l.deleted, false) = false;

  IF v_morning_load <= 0 THEN
    RAISE EXCEPTION 'ROUTE_DISPATCH_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT round(coalesce(sum(d.liters), 0), 2) INTO v_app_deliveries
  FROM dp_deliveries d
  LEFT JOIN dp_customers c ON c.id = d.customer_id
  WHERE d.date = v_date
    AND (d.rider_id = v_rider_id OR c.rider_id = v_rider_id)
    AND coalesce(d.deleted, false) = false
    AND coalesce(d.is_adjustment, false) = false;

  SELECT round(coalesce(sum(p.amount), 0), 2) INTO v_expected_cash
  FROM dp_payments p
  JOIN dp_customers c ON c.id = p.customer_id
  WHERE p.date = v_date
    AND c.rider_id = v_rider_id
    AND p.mode = 'Cash'
    AND coalesce(p.deleted, false) = false
    AND coalesce(p.is_adjustment, false) = false;

  SELECT round(coalesce(sum(e.amount), 0), 2) INTO v_expenses
  FROM dp_expenses e
  WHERE e.rider_id = v_rider_id
    AND e.date = v_date
    AND coalesce(e.deleted, false) = false;

  INSERT INTO dp_closing_records (
    id, rider_id, date, morning_load_liters, app_deliveries_liters,
    returned_milk_liters, wastage_liters, expected_cash_recovery,
    expense_deductions, physical_cash_received, audit_remarks,
    timestamp, updated_at, version, deleted
  )
  VALUES (
    v_record_id,
    v_rider_id,
    v_date,
    v_morning_load,
    v_app_deliveries,
    v_returned,
    v_wastage,
    v_expected_cash,
    v_expenses,
    v_physical_cash,
    v_remarks,
    v_now,
    v_now,
    1,
    false
  );

  UPDATE dp_deliveries d
  SET is_locked = true,
      updated_at = v_now,
      version = coalesce(d.version, 0) + 1
  FROM dp_customers c
  WHERE c.id = d.customer_id
    AND d.date = v_date
    AND (d.rider_id = v_rider_id OR c.rider_id = v_rider_id)
    AND coalesce(d.deleted, false) = false
    AND coalesce(d.is_adjustment, false) = false;

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  SELECT * INTO v_saved_record FROM dp_closing_records WHERE id = v_record_id;

  RETURN jsonb_build_object(
    'closing_record', to_jsonb(v_saved_record),
    'locked_delivery_count', v_locked_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_rider_closing(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
