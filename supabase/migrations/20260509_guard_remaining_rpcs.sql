-- Guard remaining RPCs that can expose balances or mutate accounting counters.

CREATE OR REPLACE FUNCTION get_start_of_month_balances(target_date date)
RETURNS TABLE(customer_id text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF app_has_session() IS NOT TRUE THEN
        RAISE EXCEPTION 'APP_SESSION_REQUIRED' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH transaction_totals AS (
        SELECT
            d.customer_id,
            SUM(d.total_amount) AS total_deliveries,
            0::numeric          AS total_payments
        FROM dp_deliveries d
        WHERE d.deleted = false
          AND d.date < DATE_TRUNC('month', target_date)::date
        GROUP BY d.customer_id
        UNION ALL
        SELECT
            p.customer_id,
            0::numeric          AS total_deliveries,
            SUM(p.amount)       AS total_payments
        FROM dp_payments p
        WHERE p.deleted = false
          AND p.date < DATE_TRUNC('month', target_date)::date
        GROUP BY p.customer_id
    )
    SELECT
        c.id AS customer_id,
        ROUND(
            c.opening_balance
              + COALESCE(SUM(t.total_deliveries), 0)
              - COALESCE(SUM(t.total_payments),   0),
            2
        ) AS balance
    FROM dp_customers c
    LEFT JOIN transaction_totals t ON t.customer_id = c.id
    WHERE c.deleted = false
      AND (app_is_owner() OR c.rider_id = app_session_rider_id())
    GROUP BY c.id, c.opening_balance;
END;
$$;

CREATE OR REPLACE FUNCTION live_reconcile(p_local_balances jsonb)
RETURNS TABLE (
    out_customer_id   text,
    out_customer_name text,
    out_local_balance numeric,
    out_server_balance numeric,
    out_difference    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF app_is_owner() IS NOT TRUE THEN
        RAISE EXCEPTION 'OWNER_SESSION_REQUIRED' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH d AS (
        SELECT dpd.customer_id AS cid, SUM(dpd.total_amount) AS total
        FROM dp_deliveries dpd
        WHERE dpd.deleted = false
        GROUP BY dpd.customer_id
    ),
    p AS (
        SELECT dpp.customer_id AS cid, SUM(dpp.amount) AS total
        FROM dp_payments dpp
        WHERE dpp.deleted = false
        GROUP BY dpp.customer_id
    ),
    server AS (
        SELECT
            c.id   AS cid,
            c.name AS cname,
            ROUND(c.opening_balance + COALESCE(d.total, 0) - COALESCE(p.total, 0), 2) AS sbal
        FROM dp_customers c
        LEFT JOIN d ON d.cid = c.id
        LEFT JOIN p ON p.cid = c.id
        WHERE c.deleted = false
    )
    SELECT
        s.cid                                                                        AS out_customer_id,
        s.cname                                                                      AS out_customer_name,
        ROUND(COALESCE((p_local_balances ->> s.cid)::numeric, 0), 2)                 AS out_local_balance,
        s.sbal                                                                       AS out_server_balance,
        ROUND(s.sbal - COALESCE((p_local_balances ->> s.cid)::numeric, 0), 2)        AS out_difference
    FROM server s
    WHERE ABS(
        s.sbal - COALESCE((p_local_balances ->> s.cid)::numeric, 0)
    ) > 0.01
    ORDER BY ABS(s.sbal - COALESCE((p_local_balances ->> s.cid)::numeric, 0)) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  next_val integer;
BEGIN
  IF app_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'OWNER_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE ws_metadata
  SET value = (value::integer + 1)::text,
      updated_at = now()
  WHERE key = 'last_invoice_number'
  RETURNING value::integer INTO next_val;

  IF next_val IS NULL THEN
    RAISE EXCEPTION 'INVOICE_COUNTER_MISSING' USING ERRCODE = 'P0001';
  END IF;

  RETURN next_val;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_start_of_month_balances(date) FROM public;
REVOKE EXECUTE ON FUNCTION live_reconcile(jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION get_next_invoice_number() FROM public;
REVOKE EXECUTE ON FUNCTION app_customer_balances() FROM public;
REVOKE EXECUTE ON FUNCTION verify_pin(text) FROM public;
GRANT EXECUTE ON FUNCTION get_start_of_month_balances(date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION live_reconcile(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_next_invoice_number() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_customer_balances() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_pin(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
