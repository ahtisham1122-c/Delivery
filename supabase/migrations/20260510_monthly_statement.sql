-- Phase 7 (2026-05-10): Per-customer monthly statement RPC.
--
-- WHY THIS EXISTS
-- The Phase 6 Period Lock leaves every transaction in the live ledger
-- forever (no destructive close). The Owner still needs a clean
-- one-screen "April statement for Customer X" or "April statements
-- for every customer of Rider Y" that they can print or send via
-- WhatsApp. This function returns exactly that, computed server-side
-- (not from the device's date-windowed cache, so it works for any
-- month going back to the dawn of the ledger).
--
-- INPUTS
--   p_year   integer  -- e.g. 2026
--   p_month  integer  -- 0-indexed (Jan = 0, Dec = 11) — matches the
--                        JS Date convention used everywhere else in
--                        the app.
--   p_rider_id text   -- optional. NULL or '' = all riders.
--   p_customer_id text -- optional. NULL or '' = every customer in scope.
--
-- OUTPUT  jsonb array, one element per customer in scope:
--   {
--     id, name, urdu_name, phone, payment_cycle, rider_id, rider_name,
--     opening_balance,        -- balance at start of month (server)
--     closing_balance,        -- balance at end of month (server)
--     total_deliveries_amt,
--     total_payments_amt,
--     deliveries: [ { date, liters, price_at_time, total_amount,
--                     is_adjustment, adjustment_note } ... ],
--     payments:   [ { date, amount, mode, is_adjustment, note,
--                     adjustment_note } ... ]
--   }
--
-- Customers with zero activity AND zero opening balance are omitted
-- to keep the report focused. Set p_include_zero=true to keep them.

DROP FUNCTION IF EXISTS customer_monthly_statement(integer, integer, text, text, boolean);

CREATE OR REPLACE FUNCTION customer_monthly_statement(
    p_year         integer,
    p_month        integer,                       -- 0-indexed
    p_rider_id     text    DEFAULT NULL,
    p_customer_id  text    DEFAULT NULL,
    p_include_zero boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_start         date;
    v_end           date;
    v_next          date;
    v_rider_filter  text;
    v_cust_filter   text;
    v_rows          jsonb;
BEGIN
    v_start := make_date(p_year, p_month + 1, 1);
    v_next  := (v_start + INTERVAL '1 month')::date;
    v_end   := (v_next - INTERVAL '1 day')::date;

    v_rider_filter := NULLIF(TRIM(COALESCE(p_rider_id,    '')), '');
    v_cust_filter  := NULLIF(TRIM(COALESCE(p_customer_id, '')), '');

    WITH
    -- Pre-aggregate deliveries and payments BEFORE the month for opening balance
    pre_d AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM dp_deliveries
        WHERE deleted = false AND date < v_start
        GROUP BY customer_id
    ),
    pre_p AS (
        SELECT customer_id, SUM(amount) AS total
        FROM dp_payments
        WHERE deleted = false AND date < v_start
        GROUP BY customer_id
    ),
    -- Pre-aggregate THROUGH the month for closing balance
    thru_d AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM dp_deliveries
        WHERE deleted = false AND date <= v_end
        GROUP BY customer_id
    ),
    thru_p AS (
        SELECT customer_id, SUM(amount) AS total
        FROM dp_payments
        WHERE deleted = false AND date <= v_end
        GROUP BY customer_id
    ),
    -- Customer scope
    cust AS (
        SELECT
            c.id, c.name, c.urdu_name, c.phone, c.payment_cycle, c.rider_id,
            r.name AS rider_name,
            ROUND(
                c.opening_balance
                  + COALESCE(pre_d.total, 0)
                  - COALESCE(pre_p.total, 0),
                2
            ) AS opening_balance,
            ROUND(
                c.opening_balance
                  + COALESCE(thru_d.total, 0)
                  - COALESCE(thru_p.total, 0),
                2
            ) AS closing_balance
        FROM dp_customers c
        LEFT JOIN dp_riders   r      ON r.id = c.rider_id
        LEFT JOIN pre_d              ON pre_d.customer_id = c.id
        LEFT JOIN pre_p              ON pre_p.customer_id = c.id
        LEFT JOIN thru_d             ON thru_d.customer_id = c.id
        LEFT JOIN thru_p             ON thru_p.customer_id = c.id
        WHERE c.deleted = false
          AND (v_rider_filter IS NULL OR c.rider_id = v_rider_filter)
          AND (v_cust_filter  IS NULL OR c.id       = v_cust_filter)
    ),
    -- Per-customer month deliveries
    month_d AS (
        SELECT
            d.customer_id,
            jsonb_agg(
                jsonb_build_object(
                    'id',               d.id,
                    'date',             d.date,
                    'liters',           d.liters,
                    'price_at_time',    d.price_at_time,
                    'total_amount',     d.total_amount,
                    'is_adjustment',    COALESCE(d.is_adjustment, false),
                    'adjustment_note',  d.adjustment_note,
                    'rider_id',         d.rider_id
                )
                ORDER BY d.date, d.id
            ) AS items,
            SUM(d.total_amount) AS total
        FROM dp_deliveries d
        WHERE d.deleted = false
          AND d.date >= v_start
          AND d.date <= v_end
        GROUP BY d.customer_id
    ),
    -- Per-customer month payments
    month_p AS (
        SELECT
            p.customer_id,
            jsonb_agg(
                jsonb_build_object(
                    'id',               p.id,
                    'date',             p.date,
                    'amount',           p.amount,
                    'mode',             p.mode,
                    'note',             p.note,
                    'is_adjustment',    COALESCE(p.is_adjustment, false),
                    'adjustment_note',  p.adjustment_note
                )
                ORDER BY p.date, p.id
            ) AS items,
            SUM(p.amount) AS total
        FROM dp_payments p
        WHERE p.deleted = false
          AND p.date >= v_start
          AND p.date <= v_end
        GROUP BY p.customer_id
    )
    SELECT COALESCE(jsonb_agg(row_to_json(out)::jsonb ORDER BY out.name), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT
            c.id,
            c.name,
            c.urdu_name,
            c.phone,
            c.payment_cycle,
            c.rider_id,
            c.rider_name,
            c.opening_balance,
            c.closing_balance,
            ROUND(COALESCE(month_d.total, 0), 2) AS total_deliveries_amt,
            ROUND(COALESCE(month_p.total, 0), 2) AS total_payments_amt,
            COALESCE(month_d.items, '[]'::jsonb) AS deliveries,
            COALESCE(month_p.items, '[]'::jsonb) AS payments
        FROM cust c
        LEFT JOIN month_d ON month_d.customer_id = c.id
        LEFT JOIN month_p ON month_p.customer_id = c.id
        WHERE p_include_zero
           OR COALESCE(month_d.total, 0) <> 0
           OR COALESCE(month_p.total, 0) <> 0
           OR ABS(c.opening_balance)   > 0.01
           OR ABS(c.closing_balance)   > 0.01
    ) AS out;

    RETURN jsonb_build_object(
        'year',       p_year,
        'month',      p_month,
        'start_date', v_start,
        'end_date',   v_end,
        'count',      jsonb_array_length(v_rows),
        'customers',  v_rows
    );
END;
$$;

GRANT EXECUTE ON FUNCTION customer_monthly_statement(integer, integer, text, text, boolean) TO anon;

NOTIFY pgrst, 'reload schema';
