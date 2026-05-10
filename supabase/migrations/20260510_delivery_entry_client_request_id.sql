-- Preserve idempotency metadata for same-screen delivery payments too.

CREATE OR REPLACE FUNCTION save_delivery_entry(p_delivery jsonb, p_payment jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id text := p_delivery ->> 'customer_id';
  v_date date := (p_delivery ->> 'date')::date;
  v_rider_id text := nullif(p_delivery ->> 'rider_id', '');
  v_customer_rider_id text;
  v_existing_delivery_id text;
  v_delivery_id text;
  v_payment_id text;
  v_existing_payment_id text;
  v_now timestamptz := now();
  v_saved_delivery dp_deliveries%ROWTYPE;
  v_saved_payment dp_payments%ROWTYPE;
  v_payment_amount numeric;
BEGIN
  IF app_has_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'APP_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF coalesce((p_delivery ->> 'is_adjustment')::boolean, false) THEN
    RAISE EXCEPTION 'USE_ADJUSTMENT_WRITE_PATH' USING ERRCODE = '23514';
  END IF;

  SELECT c.rider_id INTO v_customer_rider_id
  FROM dp_customers c
  WHERE c.id = v_customer_id
    AND coalesce(c.deleted, false) = false;

  IF v_customer_rider_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND_OR_UNASSIGNED' USING ERRCODE = '23503';
  END IF;

  v_rider_id := coalesce(v_rider_id, v_customer_rider_id);

  IF v_rider_id <> v_customer_rider_id THEN
    RAISE EXCEPTION 'DELIVERY_RIDER_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF app_is_owner() IS NOT TRUE AND v_rider_id <> app_session_rider_id() THEN
    RAISE EXCEPTION 'RIDER_SCOPE_VIOLATION' USING ERRCODE = '42501';
  END IF;

  IF (p_delivery ->> 'liters')::numeric < 0
     OR (p_delivery ->> 'price_at_time')::numeric < 0
     OR (p_delivery ->> 'total_amount')::numeric < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_DELIVERY_VALUE_REJECTED' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_existing_delivery_id
  FROM dp_deliveries
  WHERE customer_id = v_customer_id
    AND date = v_date
    AND rider_id = v_rider_id
    AND coalesce(deleted, false) = false
    AND coalesce(is_adjustment, false) = false
  ORDER BY updated_at DESC NULLS LAST, id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_delivery_id IS NULL THEN
    v_delivery_id := coalesce(nullif(p_delivery ->> 'id', ''), gen_random_uuid()::text);

    INSERT INTO dp_deliveries (
      id, customer_id, date, liters, price_at_time, total_amount, rider_id,
      is_locked, is_adjustment, adjustment_note, adjustment_tag,
      linked_delivery_id, updated_at, version, deleted
    )
    VALUES (
      v_delivery_id,
      v_customer_id,
      v_date,
      (p_delivery ->> 'liters')::numeric,
      (p_delivery ->> 'price_at_time')::numeric,
      round((p_delivery ->> 'total_amount')::numeric, 2),
      v_rider_id,
      coalesce((p_delivery ->> 'is_locked')::boolean, true),
      false,
      nullif(p_delivery ->> 'adjustment_note', ''),
      nullif(p_delivery ->> 'adjustment_tag', ''),
      nullif(p_delivery ->> 'linked_delivery_id', ''),
      v_now,
      1,
      false
    );
  ELSE
    v_delivery_id := v_existing_delivery_id;

    UPDATE dp_deliveries
    SET liters = (p_delivery ->> 'liters')::numeric,
        price_at_time = (p_delivery ->> 'price_at_time')::numeric,
        total_amount = round((p_delivery ->> 'total_amount')::numeric, 2),
        is_locked = coalesce((p_delivery ->> 'is_locked')::boolean, true),
        updated_at = v_now,
        version = coalesce(version, 0) + 1,
        deleted = false
    WHERE id = v_delivery_id;
  END IF;

  SELECT * INTO v_saved_delivery FROM dp_deliveries WHERE id = v_delivery_id;

  IF p_payment IS NOT NULL THEN
    v_payment_amount := coalesce((p_payment ->> 'amount')::numeric, 0);

    IF v_payment_amount > 0 THEN
      IF coalesce((p_payment ->> 'is_adjustment')::boolean, false) THEN
        RAISE EXCEPTION 'USE_ADJUSTMENT_WRITE_PATH' USING ERRCODE = '23514';
      END IF;

      SELECT id INTO v_existing_payment_id
      FROM dp_payments
      WHERE linked_delivery_id = v_delivery_id
        AND coalesce(deleted, false) = false
        AND coalesce(is_adjustment, false) = false
      LIMIT 1
      FOR UPDATE;

      IF v_existing_payment_id IS NULL THEN
        v_payment_id := coalesce(nullif(p_payment ->> 'id', ''), gen_random_uuid()::text);

        INSERT INTO dp_payments (
          id, customer_id, date, amount, mode, note, is_adjustment,
          adjustment_note, adjustment_tag, linked_delivery_id,
          client_request_id, updated_at, version, deleted
        )
        VALUES (
          v_payment_id,
          v_customer_id,
          v_date,
          round(v_payment_amount, 2),
          coalesce(nullif(p_payment ->> 'mode', ''), 'Cash'),
          nullif(p_payment ->> 'note', ''),
          false,
          nullif(p_payment ->> 'adjustment_note', ''),
          nullif(p_payment ->> 'adjustment_tag', ''),
          v_delivery_id,
          coalesce(nullif(p_payment ->> 'client_request_id', ''), v_payment_id),
          v_now,
          1,
          false
        );
      ELSE
        v_payment_id := v_existing_payment_id;

        UPDATE dp_payments
        SET customer_id = v_customer_id,
            date = v_date,
            amount = round(v_payment_amount, 2),
            mode = coalesce(nullif(p_payment ->> 'mode', ''), mode),
            note = nullif(p_payment ->> 'note', ''),
            client_request_id = coalesce(client_request_id, nullif(p_payment ->> 'client_request_id', ''), v_payment_id),
            updated_at = v_now,
            version = coalesce(version, 0) + 1,
            deleted = false
        WHERE id = v_payment_id;
      END IF;

      SELECT * INTO v_saved_payment FROM dp_payments WHERE id = v_payment_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'delivery', to_jsonb(v_saved_delivery),
    'payment', CASE WHEN v_saved_payment.id IS NULL THEN NULL ELSE to_jsonb(v_saved_payment) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_delivery_entry(jsonb, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
