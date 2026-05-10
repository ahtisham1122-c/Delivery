-- Rate-limit PIN verification attempts by request IP and attempted PIN hash.

ALTER TABLE dp_login_attempts ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE dp_login_attempts ADD COLUMN IF NOT EXISTS request_ip text;

CREATE INDEX IF NOT EXISTS idx_dp_login_attempts_recent_failures
ON dp_login_attempts(attempted_at DESC, success, request_ip, pin_hash);

CREATE OR REPLACE FUNCTION verify_pin(pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owner_pin text;
  matched_rider_id text;
  session_token text;
  matched_role text;
  raw_headers text;
  v_request_ip text;
  v_attempted_hash text;
  recent_ip_failures integer := 0;
  recent_pin_failures integer := 0;
BEGIN
  raw_headers := current_setting('request.headers', true);
  IF raw_headers IS NOT NULL AND raw_headers <> '' THEN
    v_request_ip := nullif(split_part(coalesce(
      raw_headers::json ->> 'x-forwarded-for',
      raw_headers::json ->> 'cf-connecting-ip',
      raw_headers::json ->> 'x-real-ip',
      ''
    ), ',', 1), '');
  END IF;

  v_attempted_hash := encode(extensions.digest(coalesce(pin, ''), 'sha256'), 'hex');

  IF v_request_ip IS NOT NULL THEN
    SELECT count(*) INTO recent_ip_failures
    FROM dp_login_attempts
    WHERE success = false
      AND request_ip = v_request_ip
      AND attempted_at > now() - interval '10 minutes';
  END IF;

  SELECT count(*) INTO recent_pin_failures
  FROM dp_login_attempts
  WHERE success = false
    AND pin_hash = v_attempted_hash
    AND attempted_at > now() - interval '10 minutes';

  IF recent_ip_failures >= 12 OR recent_pin_failures >= 8 THEN
    INSERT INTO dp_login_attempts(success, pin_hash, request_ip)
    VALUES (false, v_attempted_hash, v_request_ip);
    RETURN json_build_object(
      'success', false,
      'error', 'Too many failed attempts. Wait 10 minutes and try again.'
    );
  END IF;

  SELECT value::text INTO owner_pin FROM dp_metadata WHERE key = 'owner_pin';

  IF pin = owner_pin THEN
    matched_role := 'OWNER';
  ELSE
    SELECT id INTO matched_rider_id
    FROM dp_riders
    WHERE (dp_riders.pin = pin OR dp_riders.pin = lpad(pin, 4, '0'))
      AND deleted = false
    LIMIT 1;

    IF matched_rider_id IS NOT NULL THEN
      matched_role := 'RIDER';
    END IF;
  END IF;

  IF matched_role IS NULL THEN
    INSERT INTO dp_login_attempts(success, pin_hash, request_ip)
    VALUES (false, v_attempted_hash, v_request_ip);
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  session_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO dp_app_sessions(token_hash, user_role, rider_id, expires_at)
  VALUES (
    encode(extensions.digest(session_token, 'sha256'), 'hex'),
    matched_role,
    matched_rider_id,
    now() + interval '14 hours'
  );

  INSERT INTO dp_login_attempts(success, role, rider_id, pin_hash, request_ip)
  VALUES (true, matched_role, matched_rider_id, v_attempted_hash, v_request_ip);

  RETURN json_build_object(
    'success', true,
    'role', matched_role,
    'id', matched_rider_id,
    'token', session_token
  );
EXCEPTION WHEN invalid_text_representation THEN
  INSERT INTO dp_login_attempts(success, pin_hash)
  VALUES (false, v_attempted_hash);
  RETURN json_build_object('success', false, 'error', 'Invalid request');
END;
$$;

GRANT EXECUTE ON FUNCTION verify_pin(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
