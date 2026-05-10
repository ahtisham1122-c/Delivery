-- Owner-only wholesale integrity checklist, kept separate from the retail
-- checklist so it can evolve independently.

CREATE OR REPLACE FUNCTION production_wholesale_integrity_check()
RETURNS TABLE (
  check_name text,
  severity text,
  value numeric,
  expected text,
  ok boolean
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
  WITH raw_checks AS (
    SELECT 'ws_delivery_orphans'::text AS check_name, 'critical'::text AS severity, count(*)::numeric AS value, '0'::text AS expected
    FROM ws_deliveries d
    LEFT JOIN ws_wholesale_customers c ON c.id = d.customer_id
    WHERE coalesce(d.deleted,false) = false
      AND c.id IS NULL

    UNION ALL
    SELECT 'ws_payment_orphans', 'critical', count(*)::numeric, '0'
    FROM ws_payments p
    LEFT JOIN ws_wholesale_customers c ON c.id = p.customer_id
    WHERE coalesce(p.deleted,false) = false
      AND c.id IS NULL

    UNION ALL
    SELECT 'ws_delivery_product_orphans', 'critical', count(*)::numeric, '0'
    FROM ws_deliveries d
    LEFT JOIN ws_products pr ON pr.id = d.product_id
    WHERE coalesce(d.deleted,false) = false
      AND pr.id IS NULL

    UNION ALL
    SELECT 'ws_null_deleted_flags', 'critical', count(*)::numeric, '0'
    FROM (
      SELECT deleted FROM ws_wholesale_customers WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM ws_products WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM ws_deliveries WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM ws_payments WHERE deleted IS NULL
    ) n

    UNION ALL
    SELECT 'ws_negative_delivery_values', 'critical', count(*)::numeric, '0'
    FROM ws_deliveries
    WHERE coalesce(deleted,false) = false
      AND (quantity < 0 OR rate < 0 OR total_amount < 0)

    UNION ALL
    SELECT 'ws_nonpositive_payment_values', 'critical', count(*)::numeric, '0'
    FROM ws_payments
    WHERE coalesce(deleted,false) = false
      AND amount <= 0

    UNION ALL
    SELECT 'ws_duplicate_payment_client_request_groups', 'critical', count(*)::numeric, '0'
    FROM (
      SELECT client_request_id
      FROM ws_payments
      WHERE client_request_id IS NOT NULL
        AND coalesce(deleted,false) = false
      GROUP BY client_request_id
      HAVING count(*) > 1
    ) x

    UNION ALL
    SELECT 'ws_payments_missing_request_id', 'critical', count(*)::numeric, '0'
    FROM ws_payments
    WHERE coalesce(deleted,false) = false
      AND client_request_id IS NULL
  )
  SELECT
    raw_checks.check_name,
    raw_checks.severity,
    raw_checks.value,
    raw_checks.expected,
    raw_checks.value = 0 AS ok
  FROM raw_checks
  ORDER BY raw_checks.check_name;
END;
$$;

GRANT EXECUTE ON FUNCTION production_wholesale_integrity_check() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
