-- Cache invalidation marker used by clients after destructive resets.

CREATE OR REPLACE FUNCTION get_app_cache_marker()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (
      SELECT id || ':' || extract(epoch from created_at)::bigint::text
      FROM dp_reset_backups
      ORDER BY created_at DESC
      LIMIT 1
    ),
    'no-reset-marker'
  );
$$;

GRANT EXECUTE ON FUNCTION get_app_cache_marker() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
