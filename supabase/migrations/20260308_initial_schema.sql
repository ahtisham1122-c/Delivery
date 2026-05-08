
-- Gujjar Milk Shop - Relational Migration Schema (v2)
-- Date: 2026-03-08
-- Description: Uses 'dp_' prefix to avoid conflicts with existing tables.

-- 1. Riders Table
CREATE TABLE IF NOT EXISTS dp_riders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    route TEXT,
    pin TEXT NOT NULL,
    role TEXT,
    salary NUMERIC(12, 2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 2. Customers Table
CREATE TABLE IF NOT EXISTS dp_customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    urdu_name TEXT,
    phone TEXT,
    address TEXT,
    payment_cycle TEXT NOT NULL,
    rider_id TEXT REFERENCES dp_riders(id),
    custom_price NUMERIC(12, 2),
    opening_balance NUMERIC(12, 2) DEFAULT 0,
    delivery_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 3. Price Records Table
CREATE TABLE IF NOT EXISTS dp_prices (
    id TEXT PRIMARY KEY,
    price NUMERIC(12, 2) NOT NULL,
    effective_date DATE NOT NULL,
    customer_id TEXT REFERENCES dp_customers(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 4. Deliveries Table
CREATE TABLE IF NOT EXISTS dp_deliveries (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES dp_customers(id),
    date DATE NOT NULL,
    liters NUMERIC(12, 2) NOT NULL,
    price_at_time NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    rider_id TEXT REFERENCES dp_riders(id),
    is_locked BOOLEAN DEFAULT TRUE,
    is_adjustment BOOLEAN DEFAULT FALSE,
    adjustment_note TEXT,
    adjustment_tag TEXT,
    linked_delivery_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 5. Payments Table
CREATE TABLE IF NOT EXISTS dp_payments (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES dp_customers(id),
    date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    mode TEXT NOT NULL,
    note TEXT,
    is_adjustment BOOLEAN DEFAULT FALSE,
    adjustment_note TEXT,
    adjustment_tag TEXT,
    linked_delivery_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 6. Expenses Table
CREATE TABLE IF NOT EXISTS dp_expenses (
    id TEXT PRIMARY KEY,
    rider_id TEXT REFERENCES dp_riders(id),
    date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL,
    note TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 7. Rider Loads & Closing
CREATE TABLE IF NOT EXISTS dp_rider_loads (
    id TEXT PRIMARY KEY,
    rider_id TEXT NOT NULL REFERENCES dp_riders(id),
    date DATE NOT NULL,
    liters NUMERIC(12, 2) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS dp_closing_records (
    id TEXT PRIMARY KEY,
    rider_id TEXT NOT NULL REFERENCES dp_riders(id),
    date DATE NOT NULL,
    morning_load_liters NUMERIC(12, 2),
    app_deliveries_liters NUMERIC(12, 2),
    returned_milk_liters NUMERIC(12, 2),
    wastage_liters NUMERIC(12, 2),
    expected_cash_recovery NUMERIC(12, 2),
    expense_deductions NUMERIC(12, 2),
    physical_cash_received NUMERIC(12, 2),
    audit_remarks TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 8. Archives Table
CREATE TABLE IF NOT EXISTS dp_archives (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 9. Milk Inwards
CREATE TABLE IF NOT EXISTS dp_milk_inwards (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    liters NUMERIC(12, 2) NOT NULL,
    source TEXT,
    cost_per_liter NUMERIC(12, 2),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 10. Audit Logs
CREATE TABLE IF NOT EXISTS dp_audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    performed_by TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    conflict_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE
);

-- 11. Metadata (For System State)
CREATE TABLE IF NOT EXISTS dp_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value BIGINT DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial metadata if not exists
INSERT INTO dp_metadata (key, value) VALUES ('system_revision', 1) ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dp_deliveries_customer_date ON dp_deliveries(customer_id, date);
CREATE INDEX IF NOT EXISTS idx_dp_payments_customer_date ON dp_payments(customer_id, date);
CREATE INDEX IF NOT EXISTS idx_dp_customers_rider ON dp_customers(rider_id);

-- Security (Disable RLS for metadata to prevent sync blockers)
ALTER TABLE dp_metadata DISABLE ROW LEVEL SECURITY;
