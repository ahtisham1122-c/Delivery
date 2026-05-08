-- Phase 1 ledger-stability fix (2026-05-09)
-- ROOT CAUSE: The original RPC declared `customer_id uuid` but
-- `dp_customers.id` is `text`. PostgREST silently rejected every call,
-- so `serverBalances` arrived empty and each device fell back to its
-- own client-side aggregation -> different opening balances on every
-- device -> different totals shown to Owner vs Rider.
--
-- This script:
--   1. Drops the broken function (return-type change forbids OR REPLACE).
--   2. Recreates it with `customer_id text` matching the real schema.
--   3. Adds an explicit deleted-row filter on customers as a belt-and-braces.
--
-- It is safe to run on a live database. It only redefines a function;
-- no data is read, written, or deleted.

DROP FUNCTION IF EXISTS get_start_of_month_balances(timestamp);
DROP FUNCTION IF EXISTS get_start_of_month_balances(date);

CREATE OR REPLACE FUNCTION get_start_of_month_balances(target_date date)
RETURNS TABLE (customer_id text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    GROUP BY c.id, c.opening_balance;
END;
$$;

-- Tell PostgREST to refresh its schema cache so the new signature is
-- visible to the React app immediately.
NOTIFY pgrst, 'reload schema';
