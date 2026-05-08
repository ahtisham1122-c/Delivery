
-- Gujjar Milk Shop - Unique Constraints Migration
-- Date: 2026-03-13
-- Description: Adds unique constraints to prevent duplicate entries for the same entity on the same date.

-- STEP 10: Check for existing duplicates before adding constraints
-- These queries will identify any rows that would violate the new constraints.
-- If these return any rows, they must be resolved manually before applying the ALTER TABLE commands.

/*
-- 1. Check for duplicates in dp_deliveries (non-adjustments)
SELECT customer_id, date, rider_id, count(*) 
FROM dp_deliveries 
WHERE is_adjustment = false AND deleted = false
GROUP BY customer_id, date, rider_id 
HAVING count(*) > 1;

-- 2. Check for duplicates in dp_closing_records
SELECT rider_id, date, count(*) 
FROM dp_closing_records 
WHERE deleted = false
GROUP BY rider_id, date 
HAVING count(*) > 1;

-- 3. Check for duplicates in dp_rider_loads
SELECT rider_id, date, count(*) 
FROM dp_rider_loads 
WHERE deleted = false
GROUP BY rider_id, date 
HAVING count(*) > 1;
*/

-- Add unique constraints

-- dp_deliveries: UNIQUE (customer_id, date, rider_id) WHERE is_adjustment = false
-- This prevents double-billing for the same customer on the same day by the same rider.
-- Legitimate adjustments are excluded.
ALTER TABLE dp_deliveries 
ADD CONSTRAINT unique_delivery_per_day 
UNIQUE (customer_id, date, rider_id) 
WHERE (is_adjustment = false AND deleted = false);

-- dp_closing_records: UNIQUE (rider_id, date)
-- Prevents a rider from submitting two closing reports for the same day.
ALTER TABLE dp_closing_records 
ADD CONSTRAINT unique_closing_per_day 
UNIQUE (rider_id, date)
WHERE (deleted = false);

-- dp_rider_loads: UNIQUE (rider_id, date)
-- Prevents duplicate morning load entries for the same rider on the same day.
ALTER TABLE dp_rider_loads 
ADD CONSTRAINT unique_load_per_day 
UNIQUE (rider_id, date)
WHERE (deleted = false);
