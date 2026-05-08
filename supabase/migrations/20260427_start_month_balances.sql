CREATE OR REPLACE FUNCTION get_start_of_month_balances(target_date timestamp)
RETURNS TABLE (customer_id uuid, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH transaction_totals AS (
        SELECT 
            dp_deliveries.customer_id,
            SUM(total_amount) as total_deliveries,
            0 as total_payments
        FROM dp_deliveries
        WHERE deleted = false AND date < DATE_TRUNC('month', target_date)
        GROUP BY dp_deliveries.customer_id
        UNION ALL
        SELECT 
            dp_payments.customer_id,
            0 as total_deliveries,
            SUM(amount) as total_payments
        FROM dp_payments
        WHERE deleted = false AND date < DATE_TRUNC('month', target_date)
        GROUP BY dp_payments.customer_id
    )
    SELECT 
        c.id,
        ROUND(c.opening_balance + COALESCE(SUM(t.total_deliveries), 0) - COALESCE(SUM(t.total_payments), 0)) as balance
    FROM dp_customers c
    LEFT JOIN transaction_totals t ON c.id = t.customer_id
    WHERE c.deleted = false
    GROUP BY c.id, c.opening_balance;
END;
$$;
