-- Phase 3 hotfix (2026-05-09)
-- The previous live_reconcile() failed at runtime with:
--   "column reference 'customer_id' is ambiguous"
-- because RETURNS TABLE (customer_id text, ...) creates OUT parameters
-- that are in scope inside the function body and collide with the
-- `customer_id` columns on dp_deliveries / dp_payments / dp_customers.
-- The fix: rename the OUT parameters to non-colliding names and
-- explicitly qualify every column reference.

DROP FUNCTION IF EXISTS live_reconcile(jsonb);

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
AS $$
BEGIN
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

NOTIFY pgrst, 'reload schema';
