-- App-session RLS hardening.
-- The browser still uses the public Supabase anon key, so the server must
-- enforce an app-issued session token on every table request.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dp_app_sessions (
  token_hash text PRIMARY KEY,
  user_role text NOT NULL CHECK (user_role IN ('OWNER', 'RIDER')),
  rider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);

ALTER TABLE dp_app_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dp_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false,
  role text,
  rider_id text
);

ALTER TABLE dp_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_ping()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT true; $$;

CREATE OR REPLACE FUNCTION app_header_session_token()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  raw_headers text;
BEGIN
  raw_headers := current_setting('request.headers', true);
  IF raw_headers IS NULL OR raw_headers = '' THEN
    RETURN NULL;
  END IF;
  RETURN nullif(raw_headers::json ->> 'x-app-session', '');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

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

CREATE OR REPLACE FUNCTION app_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT app_session_role() = 'OWNER'; $$;

CREATE OR REPLACE FUNCTION app_has_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT app_session_role() IN ('OWNER', 'RIDER'); $$;

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

CREATE OR REPLACE FUNCTION app_customer_balances()
RETURNS TABLE(customer_id text, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.customer_id, b.balance
  FROM dp_customer_balances b
  JOIN dp_customers c ON c.id = b.customer_id
  WHERE app_is_owner()
     OR c.rider_id = app_session_rider_id();
$$;

-- Remove legacy permissive policies.
DROP POLICY IF EXISTS "Allow public access" ON dp_customers;
DROP POLICY IF EXISTS "Allow public access to metadata" ON dp_metadata;
DROP POLICY IF EXISTS "Allow public read access to metadata" ON dp_metadata;
DROP POLICY IF EXISTS "Allow public update access to metadata" ON dp_metadata;

DROP POLICY IF EXISTS allow_all_dp_archives ON dp_archives;
DROP POLICY IF EXISTS allow_all_dp_audit_logs ON dp_audit_logs;
DROP POLICY IF EXISTS allow_all_dp_closing_records ON dp_closing_records;
DROP POLICY IF EXISTS allow_all_dp_customers ON dp_customers;
DROP POLICY IF EXISTS allow_all_dp_deliveries ON dp_deliveries;
DROP POLICY IF EXISTS allow_all_dp_expenses ON dp_expenses;
DROP POLICY IF EXISTS allow_all_dp_metadata ON dp_metadata;
DROP POLICY IF EXISTS allow_all_dp_payments ON dp_payments;
DROP POLICY IF EXISTS allow_all_dp_prices ON dp_prices;
DROP POLICY IF EXISTS allow_all_dp_rider_loads ON dp_rider_loads;
DROP POLICY IF EXISTS allow_all_dp_riders ON dp_riders;

DROP POLICY IF EXISTS "Riders can view themselves or Owner can view all" ON dp_riders;
DROP POLICY IF EXISTS "Owner can manage riders" ON dp_riders;
DROP POLICY IF EXISTS "Riders can view their customers or Owner can view all" ON dp_customers;
DROP POLICY IF EXISTS "Owner can manage customers" ON dp_customers;
DROP POLICY IF EXISTS "Riders can manage their deliveries or Owner can manage all" ON dp_deliveries;
DROP POLICY IF EXISTS "Riders can manage their payments or Owner can manage all" ON dp_payments;
DROP POLICY IF EXISTS "Riders can manage their expenses or Owner can manage all" ON dp_expenses;
DROP POLICY IF EXISTS "Riders can view their loads or Owner can manage all" ON dp_rider_loads;
DROP POLICY IF EXISTS "Riders can view their closing or Owner can manage all" ON dp_closing_records;
DROP POLICY IF EXISTS "Authenticated users can view prices" ON dp_prices;
DROP POLICY IF EXISTS "Owner can manage prices" ON dp_prices;

DROP POLICY IF EXISTS allow_all_ws_customers ON ws_wholesale_customers;
DROP POLICY IF EXISTS allow_all_ws_products ON ws_products;
DROP POLICY IF EXISTS allow_all_ws_deliveries ON ws_deliveries;
DROP POLICY IF EXISTS allow_all_ws_payments ON ws_payments;
DROP POLICY IF EXISTS allow_all_ws_metadata ON ws_metadata;

-- Retail policies.
CREATE POLICY dp_riders_select_app ON dp_riders
FOR SELECT TO anon USING (app_is_owner() OR id = app_session_rider_id());
CREATE POLICY dp_riders_owner_write ON dp_riders
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());

CREATE POLICY dp_customers_select_app ON dp_customers
FOR SELECT TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_customers_owner_write ON dp_customers
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());

CREATE POLICY dp_deliveries_select_app ON dp_deliveries
FOR SELECT TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_deliveries_write_app ON dp_deliveries
FOR ALL TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());

CREATE POLICY dp_payments_select_app ON dp_payments
FOR SELECT TO anon USING (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
);
CREATE POLICY dp_payments_write_app ON dp_payments
FOR ALL TO anon
USING (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
)
WITH CHECK (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
);

CREATE POLICY dp_expenses_select_app ON dp_expenses
FOR SELECT TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_expenses_write_app ON dp_expenses
FOR ALL TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());

CREATE POLICY dp_rider_loads_select_app ON dp_rider_loads
FOR SELECT TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_rider_loads_write_app ON dp_rider_loads
FOR ALL TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());

CREATE POLICY dp_closing_records_select_app ON dp_closing_records
FOR SELECT TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_closing_records_write_app ON dp_closing_records
FOR ALL TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());

CREATE POLICY dp_prices_select_app ON dp_prices
FOR SELECT TO anon USING (app_has_session());
CREATE POLICY dp_prices_owner_write ON dp_prices
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());

CREATE POLICY dp_archives_owner_select ON dp_archives
FOR SELECT TO anon USING (app_is_owner());
CREATE POLICY dp_audit_logs_owner_select ON dp_audit_logs
FOR SELECT TO anon USING (app_is_owner());
CREATE POLICY dp_audit_logs_app_insert ON dp_audit_logs
FOR INSERT TO anon WITH CHECK (app_has_session());

-- Metadata and app-session tables intentionally have no anon table policies.

-- Wholesale is owner-only until it gets the same rider-level security model.
CREATE POLICY ws_customers_owner_all ON ws_wholesale_customers
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY ws_products_owner_all ON ws_products
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY ws_deliveries_owner_all ON ws_deliveries
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY ws_payments_owner_all ON ws_payments
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY ws_metadata_owner_all ON ws_metadata
FOR ALL TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());

GRANT EXECUTE ON FUNCTION app_ping() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_header_session_token() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_session_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_session_rider_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_owner() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_has_session() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_customer_balances() TO anon, authenticated;

REVOKE SELECT ON dp_customer_balances FROM anon, authenticated, public;

NOTIFY pgrst, 'reload schema';
