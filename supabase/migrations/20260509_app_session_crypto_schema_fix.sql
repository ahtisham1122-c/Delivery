-- Supabase installs pgcrypto in the extensions schema, while the security
-- definer functions intentionally use a locked-down search_path. Qualify
-- crypto calls so login/session checks work under that safer path.

CREATE OR REPLACE FUNCTION app_session_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  token text;
  role_value text;
BEGIN
  token := app_header_session_token();
  IF token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT user_role INTO role_value
  FROM dp_app_sessions
  WHERE token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    AND revoked = false
    AND expires_at > now()
  LIMIT 1;

  RETURN role_value;
END;
$$;

CREATE OR REPLACE FUNCTION app_session_rider_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  token text;
  rider_value text;
BEGIN
  token := app_header_session_token();
  IF token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT rider_id INTO rider_value
  FROM dp_app_sessions
  WHERE token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    AND revoked = false
    AND expires_at > now()
  LIMIT 1;

  RETURN rider_value;
END;
$$;

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
BEGIN
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
    INSERT INTO dp_login_attempts(success) VALUES (false);
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

  INSERT INTO dp_login_attempts(success, role, rider_id)
  VALUES (true, matched_role, matched_rider_id);

  RETURN json_build_object(
    'success', true,
    'role', matched_role,
    'id', matched_rider_id,
    'token', session_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app_session_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_session_rider_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_pin(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
