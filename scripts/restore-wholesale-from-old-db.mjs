#!/usr/bin/env node
//
// One-shot restore: copy wholesale data (ws_*) from the OLD Supabase
// project into the NEW Supabase project. Bypasses RLS via service_role
// on both sides because this is a trusted bulk import.
//
// USAGE (PowerShell):
//   $env:OLD_SUPABASE_URL          = "https://OLDREF.supabase.co"
//   $env:OLD_SUPABASE_SERVICE_KEY  = "eyJhbGciOiJI..."   # OLD project service_role
//   $env:NEW_SUPABASE_URL          = "https://tmsvmyvktfatyyzqfmfv.supabase.co"
//   $env:NEW_SUPABASE_SERVICE_KEY  = "eyJhbGciOiJI..."   # NEW project service_role
//   node scripts/restore-wholesale-from-old-db.mjs
//
// What it does, in order:
//   1. Reads ws_wholesale_customers, ws_products, ws_deliveries,
//      ws_payments, ws_metadata from the OLD project.
//   2. Upserts each table into the NEW project, keeping the original id
//      so foreign keys (customer_id, product_id) line up.
//   3. Skips rows that already exist in the NEW project (by id) so the
//      script is idempotent — safe to re-run if it dies mid-flight.
//   4. Prints a tally of inserted / skipped / failed per table.
//
// Safety:
//   - Does NOT touch any dp_* (retail) table.
//   - Does NOT modify the OLD database — pure read.
//   - Uses service_role only; never logs the keys.

const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_KEY;

function bail(msg) {
  console.error('\n  ' + msg + '\n');
  process.exit(1);
}

if (!OLD_URL || !OLD_KEY) bail('Set OLD_SUPABASE_URL and OLD_SUPABASE_SERVICE_KEY.');
if (!NEW_URL || !NEW_KEY) bail('Set NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_KEY.');

const PAGE = 1000;

async function readTable(table) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(
      `${OLD_URL}/rest/v1/${table}?select=*&order=id.asc`,
      {
        headers: {
          apikey: OLD_KEY,
          Authorization: `Bearer ${OLD_KEY}`,
          'Range-Unit': 'items',
          Range: `${from}-${from + PAGE - 1}`,
          Prefer: 'count=exact',
        },
      }
    );
    if (!res.ok) {
      throw new Error(`read ${table} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchExistingIds(table) {
  const ids = new Set();
  let from = 0;
  while (true) {
    const res = await fetch(
      `${NEW_URL}/rest/v1/${table}?select=id&order=id.asc`,
      {
        headers: {
          apikey: NEW_KEY,
          Authorization: `Bearer ${NEW_KEY}`,
          'Range-Unit': 'items',
          Range: `${from}-${from + PAGE - 1}`,
        },
      }
    );
    if (!res.ok) {
      throw new Error(`existing-ids ${table} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const chunk = await res.json();
    for (const r of chunk) ids.add(r.id);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

async function insertBatch(table, rows) {
  if (rows.length === 0) return { inserted: 0, error: null };
  const res = await fetch(`${NEW_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: NEW_KEY,
      Authorization: `Bearer ${NEW_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    return { inserted: 0, error: `${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  return { inserted: rows.length, error: null };
}

// ws_metadata uses `key` as the primary key, not `id`.
async function syncMetadata() {
  const oldRows = await readTable('ws_metadata');
  let updated = 0;
  for (const r of oldRows) {
    // upsert by key
    const res = await fetch(`${NEW_URL}/rest/v1/ws_metadata?on_conflict=key`, {
      method: 'POST',
      headers: {
        apikey: NEW_KEY,
        Authorization: `Bearer ${NEW_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(r),
    });
    if (res.ok) updated++;
    else console.warn(`  metadata key=${r.key} failed: ${res.status}`);
  }
  return { inserted: updated, total: oldRows.length };
}

// Generic table sync: read OLD, fetch NEW ids, filter out already-present
// rows, insert the rest in batches.
async function syncTable(table) {
  process.stdout.write(`  ${table.padEnd(28)} `);
  const [oldRows, existingIds] = await Promise.all([
    readTable(table),
    fetchExistingIds(table),
  ]);
  const toInsert = oldRows.filter(r => !existingIds.has(r.id));
  const skipped = oldRows.length - toInsert.length;

  // Insert in batches of 200 to keep payload small.
  const BATCH = 200;
  let inserted = 0;
  const errors = [];
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { inserted: n, error } = await insertBatch(table, batch);
    inserted += n;
    if (error) errors.push(error);
  }

  console.log(
    `read ${String(oldRows.length).padStart(5)} | skip ${String(skipped).padStart(5)} | insert ${String(inserted).padStart(5)}` +
    (errors.length ? ` | errors ${errors.length}` : '')
  );
  if (errors.length) {
    for (const e of errors.slice(0, 3)) console.log(`    - ${e}`);
  }
  return { table, oldCount: oldRows.length, skipped, inserted, errors };
}

console.log(`\n  Restoring wholesale data`);
console.log(`  OLD: ${OLD_URL}`);
console.log(`  NEW: ${NEW_URL}\n`);

const summary = [];

// Order matters: customers + products first (FK targets), then transactions.
for (const t of ['ws_wholesale_customers', 'ws_products', 'ws_deliveries', 'ws_payments']) {
  try {
    summary.push(await syncTable(t));
  } catch (e) {
    console.log(`  ${t.padEnd(28)} FAILED: ${e.message}`);
    summary.push({ table: t, error: e.message });
  }
}

console.log('');
process.stdout.write('  ws_metadata (upsert by key) ');
try {
  const r = await syncMetadata();
  console.log(`${r.inserted}/${r.total} keys synced`);
} catch (e) {
  console.log(`FAILED: ${e.message}`);
}

console.log('\n  Done. Open the app, hard-refresh, and check Wholesale.');
console.log('  Re-running this script is safe — already-present rows are skipped.\n');
