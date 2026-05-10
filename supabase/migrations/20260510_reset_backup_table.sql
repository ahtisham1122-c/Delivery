-- Durable server-side backups for destructive ledger resets.

CREATE TABLE IF NOT EXISTS dp_reset_backups (
  id text PRIMARY KEY,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dp_reset_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_reset_backups_owner_select ON dp_reset_backups;
CREATE POLICY dp_reset_backups_owner_select ON dp_reset_backups
FOR SELECT TO anon USING (app_is_owner());

NOTIFY pgrst, 'reload schema';
