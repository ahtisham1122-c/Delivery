-- Add missing adjustment tracking columns to dp_payments
ALTER TABLE dp_payments 
ADD COLUMN IF NOT EXISTS adjustment_tag TEXT,
ADD COLUMN IF NOT EXISTS linked_delivery_id TEXT;

-- Refresh the PostgREST schema cache to ensure the API recognizes the new columns immediately
NOTIFY pgrst, 'reload schema';
