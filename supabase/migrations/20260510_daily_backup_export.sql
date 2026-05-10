-- Phase 7: Daily backup export RPC.
--
-- Provides a single SECURITY DEFINER function that returns everything the
-- nightly GitHub Actions cron needs to email the owner a backup of the day:
--   * summary (headline numbers for the email body)
--   * deliveries (array of deliveries dated p_date)
--   * payments   (array of payments   dated p_date)
--   * customer_balances (current opening + computed balance per active customer)
--
-- It is callable only by the service_role key, which the GitHub Actions
-- workflow uses. Anon (the browser) is explicitly NOT granted EXECUTE so this
-- cannot be used as a backdoor around the x-app-session RLS hardening from
-- 20260509_app_session_rls.sql.
--
-- Idempotent: re-running this migration is safe.

CREATE OR REPLACE FUNCTION export_daily_backup(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_balances_view boolean;
  v_deliveries jsonb;
  v_payments jsonb;
  v_balances jsonb;
  v_summary jsonb;
  v_delivery_count integer := 0;
  v_total_liters numeric := 0;
  v_cash_collected numeric := 0;
  v_total_expenses numeric := 0;
  v_active_customers integer := 0;
  v_outstanding numeric := 0;
BEGIN
  -- Detect whether the materialised/regular view exists; fall back if missing.
  SELECT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'dp_customer_balances'
      AND relkind IN ('v', 'm')
  ) INTO has_balances_view;

  -- Today's deliveries (excluding soft-deleted).
  SELECT COALESCE(jsonb_agg(to_jsonb(d.*) ORDER BY d.updated_at), '[]'::jsonb)
  INTO v_deliveries
  FROM dp_deliveries d
  WHERE d.date = p_date
    AND COALESCE(d.deleted, false) = false;

  -- Today's payments (excluding soft-deleted).
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.updated_at), '[]'::jsonb)
  INTO v_payments
  FROM dp_payments p
  WHERE p.date = p_date
    AND COALESCE(p.deleted, false) = false;

  -- Customer balances (active customers only, with current computed balance).
  IF has_balances_view THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'urdu_name', c.urdu_name,
        'phone', c.phone,
        'rider_id', c.rider_id,
        'opening_balance', COALESCE(c.opening_balance, 0),
        'current_balance', COALESCE(b.balance, c.opening_balance, 0)
      ) ORDER BY c.name
    ), '[]'::jsonb)
    INTO v_balances
    FROM dp_customers c
    LEFT JOIN dp_customer_balances b ON b.customer_id = c.id
    WHERE COALESCE(c.deleted, false) = false
      AND COALESCE(c.active, true) = true;
  ELSE
    -- Fallback: compute live from deliveries + payments.
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'urdu_name', c.urdu_name,
        'phone', c.phone,
        'rider_id', c.rider_id,
        'opening_balance', COALESCE(c.opening_balance, 0),
        'current_balance', COALESCE(c.opening_balance, 0)
                          + COALESCE(d_sum.total, 0)
                          - COALESCE(p_sum.total, 0)
      ) ORDER BY c.name
    ), '[]'::jsonb)
    INTO v_balances
    FROM dp_customers c
    LEFT JOIN (
      SELECT customer_id, SUM(total_amount) AS total
      FROM dp_deliveries
      WHERE COALESCE(deleted, false) = false
      GROUP BY customer_id
    ) d_sum ON d_sum.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id, SUM(amount) AS total
      FROM dp_payments
      WHERE COALESCE(deleted, false) = false
      GROUP BY customer_id
    ) p_sum ON p_sum.customer_id = c.id
    WHERE COALESCE(c.deleted, false) = false
      AND COALESCE(c.active, true) = true;
  END IF;

  -- Headline numbers for the email summary.
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(liters), 0)
  INTO v_delivery_count, v_total_liters
  FROM dp_deliveries
  WHERE date = p_date AND COALESCE(deleted, false) = false;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_cash_collected
  FROM dp_payments
  WHERE date = p_date AND COALESCE(deleted, false) = false;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expenses
  FROM dp_expenses
  WHERE date = p_date AND COALESCE(deleted, false) = false;

  SELECT COUNT(*)::int
  INTO v_active_customers
  FROM dp_customers
  WHERE COALESCE(deleted, false) = false
    AND COALESCE(active, true) = true;

  SELECT COALESCE(SUM((entry->>'current_balance')::numeric), 0)
  INTO v_outstanding
  FROM jsonb_array_elements(v_balances) AS entry;

  v_summary := jsonb_build_object(
    'date', p_date,
    'delivery_count', v_delivery_count,
    'total_liters', v_total_liters,
    'cash_collected', v_cash_collected,
    'total_expenses', v_total_expenses,
    'active_customers', v_active_customers,
    'outstanding_receivables', v_outstanding,
    'generated_at', now()
  );

  RETURN jsonb_build_object(
    'summary', v_summary,
    'deliveries', v_deliveries,
    'payments', v_payments,
    'customer_balances', v_balances
  );
END;
$$;

-- Lock down: only service_role (used by trusted automation) may execute.
REVOKE ALL ON FUNCTION export_daily_backup(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION export_daily_backup(date) FROM anon;
REVOKE ALL ON FUNCTION export_daily_backup(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION export_daily_backup(date) TO service_role;

-- Refresh PostgREST schema cache so the new RPC is callable immediately.
NOTIFY pgrst, 'reload schema';
