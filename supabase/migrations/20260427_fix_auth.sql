-- PROBLEM 1 & 2: SECURE AUTHENTICATION
-- Insert Owner PIN securely into metadata table
INSERT INTO dp_metadata (key, value) VALUES ('owner_pin', '1552') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION verify_pin(pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    owner_pin text;
    matched_rider_id text;
BEGIN
    -- 1. Check if it's the owner
    SELECT value INTO owner_pin FROM dp_metadata WHERE key = 'owner_pin';
    
    IF pin = owner_pin THEN
        RETURN json_build_object('success', true, 'role', 'OWNER', 'id', NULL);
    END IF;

    -- 2. Check if it's a rider
    -- Left pad the input pin just in case it was stored as 0012 but input is 12
    SELECT id INTO matched_rider_id FROM dp_riders 
    WHERE (dp_riders.pin = pin OR dp_riders.pin = lpad(pin, 4, '0')) AND deleted = false 
    LIMIT 1;

    IF matched_rider_id IS NOT NULL THEN
        RETURN json_build_object('success', true, 'role', 'RIDER', 'id', matched_rider_id);
    END IF;

    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
END;
$$;
