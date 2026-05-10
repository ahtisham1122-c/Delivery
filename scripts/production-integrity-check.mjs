import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_KEY;
const pin = process.env.PRODUCTION_CHECK_PIN || process.env.OWNER_PIN || process.env.VITE_OWNER_PIN;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY.');
  process.exit(2);
}

if (!pin) {
  console.error('Set PRODUCTION_CHECK_PIN to the live Owner PIN before running this check.');
  process.exit(2);
}

const base = createClient(url, key, { auth: { persistSession: false } });
const login = await base.rpc('verify_pin', { pin: String(pin).trim() });

if (login.error || !login.data?.success || login.data?.role !== 'OWNER' || !login.data?.token) {
  console.error('Owner login failed. PRODUCTION_CHECK_PIN must be the live Owner PIN.');
  if (login.error) console.error(login.error.message);
  process.exit(2);
}

const sessionToken = login.data.token;
const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers || {});
      headers.set('x-app-session', sessionToken);
      return fetch(input, { ...init, headers });
    }
  }
});

const [{ data, error }, { data: wholesaleData, error: wholesaleError }] = await Promise.all([
  supabase.rpc('production_integrity_check'),
  supabase.rpc('production_wholesale_integrity_check')
]);

if (error || wholesaleError) {
  console.error('Production integrity check failed to run.');
  console.error(error?.message || wholesaleError?.message);
  process.exit(2);
}

const rows = [...(data || []), ...(wholesaleData || [])];
const failed = rows.filter(row => !row.ok);

console.table(rows.map(row => ({
  check: row.check_name,
  severity: row.severity,
  value: Number(row.value),
  expected: row.expected,
  ok: row.ok
})));

if (failed.length > 0) {
  console.error(`FAILED: ${failed.length} production integrity check(s) require attention.`);
  process.exit(1);
}

console.log('PASSED: production integrity checks are clean.');
