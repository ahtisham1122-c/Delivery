-- Cover wholesale foreign keys and common ledger filters.

CREATE INDEX IF NOT EXISTS idx_ws_deliveries_customer_id
ON ws_deliveries(customer_id);

CREATE INDEX IF NOT EXISTS idx_ws_deliveries_product_id
ON ws_deliveries(product_id);

CREATE INDEX IF NOT EXISTS idx_ws_deliveries_customer_date
ON ws_deliveries(customer_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ws_payments_customer_id
ON ws_payments(customer_id);

CREATE INDEX IF NOT EXISTS idx_ws_payments_customer_date
ON ws_payments(customer_id, date DESC);

NOTIFY pgrst, 'reload schema';
