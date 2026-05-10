-- Split FOR ALL write policies so SELECT has only one permissive policy per
-- table. This keeps the app-session model intact and reduces RLS overhead.

DROP POLICY IF EXISTS dp_riders_owner_write ON dp_riders;
CREATE POLICY dp_riders_owner_insert ON dp_riders FOR INSERT TO anon WITH CHECK (app_is_owner());
CREATE POLICY dp_riders_owner_update ON dp_riders FOR UPDATE TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY dp_riders_owner_delete ON dp_riders FOR DELETE TO anon USING (app_is_owner());

DROP POLICY IF EXISTS dp_customers_owner_write ON dp_customers;
CREATE POLICY dp_customers_owner_insert ON dp_customers FOR INSERT TO anon WITH CHECK (app_is_owner());
CREATE POLICY dp_customers_owner_update ON dp_customers FOR UPDATE TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY dp_customers_owner_delete ON dp_customers FOR DELETE TO anon USING (app_is_owner());

DROP POLICY IF EXISTS dp_deliveries_write_app ON dp_deliveries;
CREATE POLICY dp_deliveries_insert_app ON dp_deliveries
FOR INSERT TO anon WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_deliveries_update_app ON dp_deliveries
FOR UPDATE TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_deliveries_delete_app ON dp_deliveries
FOR DELETE TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());

DROP POLICY IF EXISTS dp_payments_write_app ON dp_payments;
CREATE POLICY dp_payments_insert_app ON dp_payments
FOR INSERT TO anon WITH CHECK (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
);
CREATE POLICY dp_payments_update_app ON dp_payments
FOR UPDATE TO anon
USING (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
)
WITH CHECK (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
);
CREATE POLICY dp_payments_delete_app ON dp_payments
FOR DELETE TO anon USING (
  app_is_owner() OR EXISTS (
    SELECT 1 FROM dp_customers c
    WHERE c.id = dp_payments.customer_id
      AND c.rider_id = app_session_rider_id()
  )
);

DROP POLICY IF EXISTS dp_expenses_write_app ON dp_expenses;
CREATE POLICY dp_expenses_insert_app ON dp_expenses
FOR INSERT TO anon WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_expenses_update_app ON dp_expenses
FOR UPDATE TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_expenses_delete_app ON dp_expenses
FOR DELETE TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());

DROP POLICY IF EXISTS dp_rider_loads_write_app ON dp_rider_loads;
CREATE POLICY dp_rider_loads_insert_app ON dp_rider_loads
FOR INSERT TO anon WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_rider_loads_update_app ON dp_rider_loads
FOR UPDATE TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_rider_loads_delete_app ON dp_rider_loads
FOR DELETE TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());

DROP POLICY IF EXISTS dp_closing_records_write_app ON dp_closing_records;
CREATE POLICY dp_closing_records_insert_app ON dp_closing_records
FOR INSERT TO anon WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_closing_records_update_app ON dp_closing_records
FOR UPDATE TO anon
USING (app_is_owner() OR rider_id = app_session_rider_id())
WITH CHECK (app_is_owner() OR rider_id = app_session_rider_id());
CREATE POLICY dp_closing_records_delete_app ON dp_closing_records
FOR DELETE TO anon USING (app_is_owner() OR rider_id = app_session_rider_id());

DROP POLICY IF EXISTS dp_prices_owner_write ON dp_prices;
CREATE POLICY dp_prices_owner_insert ON dp_prices FOR INSERT TO anon WITH CHECK (app_is_owner());
CREATE POLICY dp_prices_owner_update ON dp_prices FOR UPDATE TO anon USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY dp_prices_owner_delete ON dp_prices FOR DELETE TO anon USING (app_is_owner());

NOTIFY pgrst, 'reload schema';
