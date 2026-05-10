-- Live integrity guardrails to apply in Supabase SQL Editor.
-- This is idempotent and matches the app's current retail ledger assumptions.

CREATE UNIQUE INDEX IF NOT EXISTS unique_delivery_per_day
ON dp_deliveries (customer_id, date, rider_id)
WHERE (is_adjustment = false AND deleted = false);

CREATE UNIQUE INDEX IF NOT EXISTS unique_closing_per_day
ON dp_closing_records (rider_id, date)
WHERE (deleted = false);

CREATE UNIQUE INDEX IF NOT EXISTS unique_load_per_day
ON dp_rider_loads (rider_id, date)
WHERE (deleted = false);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_dp_archives_active_month
ON dp_archives (year, month)
WHERE deleted = false;

NOTIFY pgrst, 'reload schema';
