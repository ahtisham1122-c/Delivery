-- Wholesale Module Migration

-- 1. ws_wholesale_customers
CREATE TABLE ws_wholesale_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    address TEXT,
    payment_cycle TEXT DEFAULT 'monthly',
    opening_balance NUMERIC DEFAULT 0,
    active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ws_products
CREATE TABLE ws_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    default_rate NUMERIC DEFAULT 0,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pre-insert default products
INSERT INTO ws_products (name, unit, default_rate) VALUES ('Milk', 'Liter', 0);
INSERT INTO ws_products (name, unit, default_rate) VALUES ('Yogurt', 'Kg', 0);

-- 3. ws_deliveries
CREATE TABLE ws_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES ws_wholesale_customers(id),
    date DATE NOT NULL,
    product_id UUID REFERENCES ws_products(id),
    quantity NUMERIC NOT NULL,
    rate NUMERIC NOT NULL,
    total_amount NUMERIC GENERATED ALWAYS AS (quantity * rate) STORED,
    note TEXT,
    is_adjustment BOOLEAN DEFAULT false,
    adjustment_note TEXT,
    linked_delivery_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ws_payments
CREATE TABLE ws_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES ws_wholesale_customers(id),
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    mode TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ws_metadata
CREATE TABLE ws_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ws_metadata (key, value) VALUES ('last_invoice_number', '0');

-- Enable RLS
ALTER TABLE ws_wholesale_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws_metadata ENABLE ROW LEVEL SECURITY;

-- Create Policies (allow all for anon as requested)
CREATE POLICY "allow_all_ws_customers" ON ws_wholesale_customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ws_products" ON ws_products FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ws_deliveries" ON ws_deliveries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ws_payments" ON ws_payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ws_metadata" ON ws_metadata FOR ALL TO anon USING (true) WITH CHECK (true);
