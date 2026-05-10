-- Lock legacy vault table and remove mutable search_path from dormant close RPCs.

ALTER TABLE IF EXISTS dairy_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dairy_vault_owner_all ON dairy_vault;
CREATE POLICY dairy_vault_owner_all ON dairy_vault
FOR ALL TO anon
USING (app_is_owner())
WITH CHECK (app_is_owner());

ALTER FUNCTION close_month_transactional(integer, integer, text)
SET search_path = public, pg_temp;

ALTER FUNCTION preview_month_close(integer, integer)
SET search_path = public, pg_temp;

NOTIFY pgrst, 'reload schema';
