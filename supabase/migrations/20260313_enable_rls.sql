
-- Step 2: Enable Row Level Security (RLS)
-- Date: 2026-03-13
-- Description: Secures financial and customer data using session-based identification.

-- 1. Enable RLS on all operational tables
ALTER TABLE dp_riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_rider_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_closing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_prices ENABLE ROW LEVEL SECURITY;

-- 2. Create Policies for dp_riders
CREATE POLICY "Riders can view themselves or Owner can view all" ON dp_riders
FOR SELECT USING (
    id = current_setting('app.current_rider_id', true) OR 
    current_setting('app.user_role', true) = 'Owner'
);

CREATE POLICY "Owner can manage riders" ON dp_riders
FOR ALL USING (current_setting('app.user_role', true) = 'Owner');

-- 3. Create Policies for dp_customers
CREATE POLICY "Riders can view their customers or Owner can view all" ON dp_customers
FOR SELECT USING (
    rider_id = current_setting('app.current_rider_id', true) OR 
    current_setting('app.user_role', true) = 'Owner'
);

CREATE POLICY "Owner can manage customers" ON dp_customers
FOR ALL USING (current_setting('app.user_role', true) = 'Owner');

-- 4. Create Policies for dp_deliveries
CREATE POLICY "Riders can manage their deliveries or Owner can manage all" ON dp_deliveries
FOR ALL USING (
    rider_id = current_setting('app.current_rider_id', true) OR 
    current_setting('app.user_role', true) = 'Owner'
);

-- 5. Create Policies for dp_payments
CREATE POLICY "Riders can manage their payments or Owner can manage all" ON dp_payments
FOR ALL USING (
    customer_id IN (SELECT id FROM dp_customers WHERE rider_id = current_setting('app.current_rider_id', true)) OR 
    current_setting('app.user_role', true) = 'Owner'
);

-- 6. Create Policies for dp_expenses
CREATE POLICY "Riders can manage their expenses or Owner can manage all" ON dp_expenses
FOR ALL USING (
    rider_id = current_setting('app.current_rider_id', true) OR 
    current_setting('app.user_role', true) = 'Owner'
);

-- 7. Create Policies for dp_rider_loads
CREATE POLICY "Riders can view their loads or Owner can manage all" ON dp_rider_loads
FOR ALL USING (
    rider_id = current_setting('app.current_rider_id', true) OR 
    current_setting('app.user_role', true) = 'Owner'
);

-- 8. Create Policies for dp_closing_records
CREATE POLICY "Riders can view their closing or Owner can manage all" ON dp_closing_records
FOR ALL USING (
    rider_id = current_setting('app.current_rider_id', true) OR 
    current_setting('app.user_role', true) = 'Owner'
);

-- 9. Create Policies for dp_prices
CREATE POLICY "Authenticated users can view prices" ON dp_prices
FOR SELECT USING (
    current_setting('app.current_rider_id', true) IS NOT NULL OR 
    current_setting('app.user_role', true) = 'Owner'
);

CREATE POLICY "Owner can manage prices" ON dp_prices
FOR ALL USING (current_setting('app.user_role', true) = 'Owner');
