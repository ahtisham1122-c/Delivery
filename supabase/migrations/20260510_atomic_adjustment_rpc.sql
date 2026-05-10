-- Owner-only audited adjustment write path.
-- Keeps debit/credit corrections positive-valued and writes the audit log in
-- the same transaction as the money row.

CREATE OR REPLACE FUNCTION save_manual_adjustment(p_adjustment jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id text := p_adjustment ->> 'customer_id';
  v_type text := upper(coalesce(p_adjustment ->> 'type', ''));
  v_amount numeric := round(coalesce((p_adjustment ->> 'amount')::numeric, 0), 2);
  v_date date := coalesce(nullif(p_adjustment ->> 'date', '')::date, current_date);
  v_note text := nullif(p_adjustment ->> 'note', '');
  v_entity_id text := coalesce(nullif(p_adjustment ->> 'id', ''), gen_random_uuid()::text);
  v_audit_id text := coalesce(nullif(p_adjustment ->> 'audit_id', ''), gen_random_uuid()::text);
  v_adjustment_tag text := coalesce(nullif(p_adjustment ->> 'adjustment_tag', ''), 'MANUAL_ADJUSTMENT');
  v_linked_id text := nullif(p_adjustment ->> 'linked_delivery_id', '');
  v_mode text := coalesce(nullif(p_adjustment ->> 'mode', ''), 'Cash');
  v_customer_rider_id text;
  v_now timestamptz := now();
  v_delivery dp_deliveries%ROWTYPE;
  v_payment dp_payments%ROWTYPE;
  v_audit dp_audit_logs%ROWTYPE;
BEGIN
  IF app_has_session() IS NOT TRUE THEN
    RAISE EXCEPTION 'APP_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF app_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'OWNER_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_type NOT IN ('DEBIT', 'CREDIT') THEN
    RAISE EXCEPTION 'ADJUSTMENT_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'ADJUSTMENT_AMOUNT_MUST_BE_POSITIVE' USING ERRCODE = '23514';
  END IF;

  SELECT c.rider_id INTO v_customer_rider_id
  FROM dp_customers c
  WHERE c.id = v_customer_id
    AND coalesce(c.deleted, false) = false;

  IF v_customer_rider_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND_OR_UNASSIGNED' USING ERRCODE = '23503';
  END IF;

  IF v_type = 'DEBIT' THEN
    INSERT INTO dp_deliveries (
      id, customer_id, date, liters, price_at_time, total_amount, rider_id,
      is_locked, is_adjustment, adjustment_note, adjustment_tag,
      linked_delivery_id, updated_at, version, deleted
    )
    VALUES (
      v_entity_id,
      v_customer_id,
      v_date,
      0,
      0,
      v_amount,
      v_customer_rider_id,
      true,
      true,
      v_note,
      v_adjustment_tag,
      v_linked_id,
      v_now,
      1,
      false
    )
    RETURNING * INTO v_delivery;

    INSERT INTO dp_audit_logs (
      id, action, entity_id, entity_type, old_value, new_value,
      performed_by, timestamp, updated_at, version, deleted
    )
    VALUES (
      v_audit_id,
      'CREATE',
      v_entity_id,
      'Delivery',
      NULL,
      jsonb_build_object(
        'type', 'MANUAL_ADJUSTMENT',
        'direction', v_type,
        'customer_id', v_customer_id,
        'amount', v_amount,
        'note', v_note,
        'adjustment_tag', v_adjustment_tag,
        'linked_delivery_id', v_linked_id
      ),
      'OWNER',
      v_now,
      v_now,
      1,
      false
    )
    RETURNING * INTO v_audit;

    RETURN jsonb_build_object(
      'entry_kind', 'Delivery',
      'entry', to_jsonb(v_delivery),
      'audit', to_jsonb(v_audit)
    );
  END IF;

  INSERT INTO dp_payments (
    id, customer_id, date, amount, mode, note, is_adjustment,
    adjustment_note, adjustment_tag, linked_delivery_id,
    client_request_id, updated_at, version, deleted
  )
  VALUES (
    v_entity_id,
    v_customer_id,
    v_date,
    v_amount,
    v_mode,
    v_note,
    true,
    v_note,
    v_adjustment_tag,
    v_linked_id,
    coalesce(nullif(p_adjustment ->> 'client_request_id', ''), v_entity_id),
    v_now,
    1,
    false
  )
  RETURNING * INTO v_payment;

  INSERT INTO dp_audit_logs (
    id, action, entity_id, entity_type, old_value, new_value,
    performed_by, timestamp, updated_at, version, deleted
  )
  VALUES (
    v_audit_id,
    'CREATE',
    v_entity_id,
    'Payment',
    NULL,
    jsonb_build_object(
      'type', 'MANUAL_ADJUSTMENT',
      'direction', v_type,
      'customer_id', v_customer_id,
      'amount', v_amount,
      'note', v_note,
      'adjustment_tag', v_adjustment_tag,
      'linked_delivery_id', v_linked_id
    ),
    'OWNER',
    v_now,
    v_now,
    1,
    false
  )
  RETURNING * INTO v_audit;

  RETURN jsonb_build_object(
    'entry_kind', 'Payment',
    'entry', to_jsonb(v_payment),
    'audit', to_jsonb(v_audit)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_manual_adjustment(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
