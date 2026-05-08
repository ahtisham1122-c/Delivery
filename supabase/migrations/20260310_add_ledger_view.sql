-- Create a view for ledger balances
CREATE OR REPLACE VIEW vw_ledger_balances AS
WITH transaction_totals AS (
    SELECT 
        customer_id,
        SUM(total_amount) as total_deliveries,
        0 as total_payments
    FROM dp_deliveries
    GROUP BY customer_id
    UNION ALL
    SELECT 
        customer_id,
        0 as total_deliveries,
        SUM(amount) as total_payments
    FROM dp_payments
    GROUP BY customer_id
)
SELECT 
    c.id as customer_id,
    c.opening_balance + COALESCE(SUM(t.total_deliveries), 0) - COALESCE(SUM(t.total_payments), 0) as balance
FROM dp_customers c
LEFT JOIN transaction_totals t ON c.id = t.customer_id
GROUP BY c.id, c.opening_balance;
