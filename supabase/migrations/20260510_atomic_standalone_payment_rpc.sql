-- Atomic standalone payment write path.
-- Prevents double taps / replayed requests from creating duplicate cash rows.

ALTER TABLE dp_payments
ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS unique_dp_payment_client_request_live
ON dp_payments(client_request_id)
WHERE client_request_id IS NOT NULL
  AND coalesce(deleted, false) = false;

CREATE OR REPLACE FUNCTION save_standalone_payment(p_payment jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id text := p_payment ->> 'customer_id';
  v_date date := (p_payment ->> 'date')::date;
  v_amount numeric := round(coalesce((p_payment ->> 'amount')::numeric, 0), 2);
  v_mode text := coalesce(nullif(p_payment ->> 'mode', ''), 'Cash');
  v_note text := nullif(p_payment ->> 'note', '');
  v_client_request_id text := coalesce(nullif(p_payment ->> 'client_request_id', ''), nullif(p_payment ->> 'id', ''));
  v_payment_id text;
  v_existing_id text;
  v_customer_rider_id text;
  v_now timestamptz := now();
  v_saved_payment dp_payments%ROWTYPE;
  v_duplicate boolean := false;
BEGIN
  IF app_has_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'APP_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF coalesce((p_payment ->> 'is_adjustment')::boolean, false) THEN
    RAISE EXCEPTION 'USE_ADJUSTMENT_WRITE_PATH' USING ERRCODE = '23514';
  END IF;

  IF v_customer_id IS NULL OR v_customer_id = '' THEN
    RAISE EXCEPTION 'CUSTOMER_REQUIRED' USING ERRCODE = '23502';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_MUST_BE_POSITIVE' USING ERRCODE = '23514';
  END IF;

  SELECT c.rider_id INTO v_customer_rider_id
  FROM dp_customers c
  WHERE c.id = v_customer_id
    AND coalesce(c.deleted, false) = false;

  IF v_customer_rider_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND_OR_UNASSIGNED' USING ERRCODE = '23503';
  END IF;

  IF app_is_owner() IS NOT TRUE AND v_customer_rider_id <> app_session_rider_id() THEN
    RAISE EXCEPTION 'RIDER_SCOPE_VIOLATION' USING ERRCODE = '42501';
  END IF;

  IF v_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM dp_payments
    WHERE client_request_id = v_client_request_id
      AND coalesce(deleted, false) = false
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      SELECT * INTO v_saved_payment FROM dp_payments WHERE id = v_existing_id;
      RETURN jsonb_build_object(
        'payment', to_jsonb(v_saved_payment),
        'created', false,
        'duplicate', false
      );
    END IF;
  END IF;

  SELECT id INTO v_existing_id
  FROM dp_payments
  WHERE customer_id = v_customer_id
    AND date = v_date
    AND amount = v_amount
    AND mode = v_mode
    AND coalesce(note, '') = coalesce(v_note, '')
    AND linked_delivery_id IS NULL
    AND coalesce(is_adjustment, false) = false
    AND coalesce(deleted, false) = false
    AND updated_at > (v_now - interval '120 seconds')
  ORDER BY updated_at DESC NULLS LAST, id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    v_duplicate := true;
    SELECT * INTO v_saved_payment FROM dp_payments WHERE id = v_existing_id;
    RETURN jsonb_build_object(
      'payment', to_jsonb(v_saved_payment),
      'created', false,
      'duplicate', v_duplicate
    );
  END IF;

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
    v_amount,
    v_mode,
    v_note,
    false,
    NULL,
    NULL,
    NULL,
    v_client_request_id,
    v_now,
    1,
    false
  );

  SELECT * INTO v_saved_payment FROM dp_payments WHERE id = v_payment_id;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_saved_payment),
    'created', true,
    'duplicate', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_standalone_payment(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
