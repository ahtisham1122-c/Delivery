-- Owner-only production integrity checklist for repeatable daily/deploy checks.

CREATE OR REPLACE FUNCTION production_integrity_check()
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
    SELECT 'active_duplicate_delivery_groups'::text AS check_name, 'critical'::text AS severity, count(*)::numeric AS value, '0'::text AS expected
    FROM (
      SELECT customer_id, date, rider_id
      FROM dp_deliveries
      WHERE coalesce(deleted,false) = false
        AND coalesce(is_adjustment,false) = false
      GROUP BY customer_id, date, rider_id
      HAVING count(*) > 1
    ) x

    UNION ALL
    SELECT 'active_delivery_orphans', 'critical', count(*)::numeric, '0'
    FROM dp_deliveries d
    LEFT JOIN dp_customers c ON c.id = d.customer_id
    WHERE coalesce(d.deleted,false) = false
      AND c.id IS NULL

    UNION ALL
    SELECT 'active_payment_orphans', 'critical', count(*)::numeric, '0'
    FROM dp_payments p
    LEFT JOIN dp_customers c ON c.id = p.customer_id
    WHERE coalesce(p.deleted,false) = false
      AND c.id IS NULL

    UNION ALL
    SELECT 'active_customer_missing_rider', 'high', count(*)::numeric, '0'
    FROM dp_customers c
    LEFT JOIN dp_riders r ON r.id = c.rider_id
    WHERE coalesce(c.deleted,false) = false
      AND c.rider_id IS NOT NULL
      AND r.id IS NULL

    UNION ALL
    SELECT 'null_deleted_flags_dp_core', 'critical', count(*)::numeric, '0'
    FROM (
      SELECT deleted FROM dp_customers WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_deliveries WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_payments WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_expenses WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_riders WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_prices WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_rider_loads WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_closing_records WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_archives WHERE deleted IS NULL
      UNION ALL SELECT deleted FROM dp_audit_logs WHERE deleted IS NULL
    ) n

    UNION ALL
    SELECT 'null_adjustment_flags', 'critical', count(*)::numeric, '0'
    FROM (
      SELECT is_adjustment FROM dp_deliveries WHERE is_adjustment IS NULL
      UNION ALL SELECT is_adjustment FROM dp_payments WHERE is_adjustment IS NULL
    ) n

    UNION ALL
    SELECT 'server_balance_mismatches', 'critical', count(*)::numeric, '0'
    FROM (
      WITH calc AS (
        SELECT c.id, round((c.opening_balance + coalesce(d.total,0) - coalesce(p.total,0))::numeric, 2) AS calc_balance
        FROM dp_customers c
        LEFT JOIN (
          SELECT customer_id, sum(total_amount) total
          FROM dp_deliveries
          WHERE coalesce(deleted,false)=false
          GROUP BY customer_id
        ) d ON d.customer_id = c.id
        LEFT JOIN (
          SELECT customer_id, sum(amount) total
          FROM dp_payments
          WHERE coalesce(deleted,false)=false
          GROUP BY customer_id
        ) p ON p.customer_id = c.id
        WHERE coalesce(c.deleted,false)=false
      )
      SELECT calc.id
      FROM calc
      JOIN dp_customer_balances b ON b.customer_id = calc.id
      WHERE abs(calc.calc_balance - round(b.balance::numeric,2)) > 0.01
    ) m

    UNION ALL
    SELECT 'linked_delivery_payment_duplicates', 'critical', count(*)::numeric, '0'
    FROM (
      SELECT linked_delivery_id
      FROM dp_payments
      WHERE linked_delivery_id IS NOT NULL
        AND coalesce(deleted,false) = false
        AND coalesce(is_adjustment,false) = false
      GROUP BY linked_delivery_id
      HAVING count(*) > 1
    ) x

    UNION ALL
    SELECT 'active_archive_count', 'info', count(*)::numeric, '0 while archive feature is disabled'
    FROM dp_archives
    WHERE coalesce(deleted,false)=false

    UNION ALL
    SELECT 'legacy_active_negative_delivery_rows_preserved', 'info', count(*)::numeric, 'review only; new rows blocked'
    FROM dp_deliveries
    WHERE coalesce(deleted,false)=false
      AND (liters < 0 OR price_at_time < 0 OR total_amount < 0)

    UNION ALL
    SELECT 'legacy_active_non_positive_payment_adjustments_preserved', 'info', count(*)::numeric, 'review only; new rows blocked'
    FROM dp_payments
    WHERE coalesce(deleted,false)=false
      AND coalesce(is_adjustment,false)=true
      AND amount <= 0
  )
  SELECT
    raw_checks.check_name,
    raw_checks.severity,
    raw_checks.value,
    raw_checks.expected,
    CASE
      WHEN raw_checks.severity = 'info' THEN true
      ELSE raw_checks.value = 0
    END AS ok
  FROM raw_checks
  ORDER BY
    CASE raw_checks.severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      ELSE 3
    END,
    raw_checks.check_name;
END;
$$;

GRANT EXECUTE ON FUNCTION production_integrity_check() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
