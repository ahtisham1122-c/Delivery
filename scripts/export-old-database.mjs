#!/usr/bin/env node
//
// Phase 8 (2026-05-13): one-shot export of the OLD Supabase database to a
// single Excel workbook. After this runs the user can safely retire the
// old project and re-bootstrap customers/balances in the new clean-slate
// database.
//
// USAGE (Windows PowerShell):
//   $env:OLD_SUPABASE_URL = "https://OLDREF.supabase.co"
//   $env:OLD_SUPABASE_SERVICE_KEY = "eyJhbGciOi..."   // service_role key
//   node scripts/export-old-database.mjs
//
// Output: ./old-db-export-YYYY-MM-DD.xlsx in the project root.
// Every table goes on its own sheet plus a "summary_current_balances" sheet.
//
// The service_role key bypasses RLS so we capture every row, including
// soft-deleted ones (deleted = true). Treat the resulting file as private
// — it contains every customer's phone and balance.

import * as XLSX from 'xlsx';

const URL = process.env.OLD_SUPABASE_URL;
const KEY = process.env.OLD_SUPABASE_SERVICE_KEY;

if (!URL || !KEY) {
  console.error('\n  Missing env vars.');
  console.error('  Set both BEFORE running:');
  console.error('    PowerShell:');
  console.error('      $env:OLD_SUPABASE_URL = "https://OLDREF.supabase.co"');
  console.error('      $env:OLD_SUPABASE_SERVICE_KEY = "eyJhbGciOi..."');
  console.error('    Bash:');
  console.error('      export OLD_SUPABASE_URL="https://OLDREF.supabase.co"');
  console.error('      export OLD_SUPABASE_SERVICE_KEY="eyJ..."');
  console.error('\n  Then re-run:  node scripts/export-old-database.mjs\n');
  process.exit(1);
}

// Tables to dump. Order matters only for human readability.
const TABLES = [
  // Most important first — these are what you'll re-enter
  'dp_customers',
  'dp_riders',
  'dp_prices',
  // Operational ledger
  'dp_deliveries',
  'dp_payments',
  'dp_expenses',
  'dp_rider_loads',
  'dp_closing_records',
  // Historical
  'dp_archives',
  'dp_audit_logs',
  'dp_milk_inwards',
  // Settings / metadata
  'dp_metadata',
  // Wholesale module
  'ws_wholesale_customers',
  'ws_products',
  'ws_deliveries',
  'ws_payments',
  'ws_metadata',
];

const PAGE = 1000;

async function fetchTable(table) {
  const rows = [];
  let from = 0;
  // Loop until we receive fewer than PAGE rows (= last page).
  // PostgREST's Range header is more reliable than offset for big tables.
  while (true) {
    const res = await fetch(
      `${URL}/rest/v1/${table}?select=*&order=id.asc`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Range-Unit': 'items',
          Range: `${from}-${from + PAGE - 1}`,
          Prefer: 'count=exact',
        },
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} — ${text.slice(0, 300)}`);
    }
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// Flatten jsonb columns to JSON strings so Excel can render them as text.
function flatten(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = '';
    } else if (typeof v === 'object') {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function safeSheetName(name) {
  // Excel sheet names are <= 31 chars and disallow []*?/\:
  return name.replace(/[\[\]\*\?\/\\:]/g, '_').slice(0, 31);
}

console.log(`\n  Exporting from ${URL} ...\n`);

const wb = XLSX.utils.book_new();
const tablesData = {};   // table_name -> rows (kept for summary sheet)
let totalRows = 0;

for (const table of TABLES) {
  process.stdout.write(`  ${table.padEnd(28)} `);
  try {
    const rows = await fetchTable(table);
    tablesData[table] = rows;
    totalRows += rows.length;
    const flat = rows.length
      ? rows.map(flatten)
      : [{ note: '(table is empty)' }];
    const ws = XLSX.utils.json_to_sheet(flat);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(table));
    console.log(`${String(rows.length).padStart(6)} rows`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    const ws = XLSX.utils.aoa_to_sheet([
      ['Export failed for this table.'],
      [e.message],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(table));
  }
}

// =========================================================================
// SUMMARY: current outstanding balance per customer (for re-entry).
// Reads from the live tables — so the numbers match whatever your OLD app
// is showing right now.
// =========================================================================
console.log('');
process.stdout.write('  Computing current_balances ... ');

try {
  const customers   = tablesData['dp_customers'] || [];
  const deliveries  = tablesData['dp_deliveries'] || [];
  const payments    = tablesData['dp_payments'] || [];
  const riders      = tablesData['dp_riders'] || [];
  const ridersById  = Object.fromEntries(riders.map(r => [r.id, r]));

  const dMap = new Map();
  const pMap = new Map();
  for (const d of deliveries) {
    if (d.deleted) continue;
    dMap.set(d.customer_id, (dMap.get(d.customer_id) || 0) + Number(d.total_amount || 0));
  }
  for (const p of payments) {
    if (p.deleted) continue;
    pMap.set(p.customer_id, (pMap.get(p.customer_id) || 0) + Number(p.amount || 0));
  }

  const summary = customers
    .filter(c => !c.deleted)
    .map(c => {
      const open  = Number(c.opening_balance || 0);
      const totD  = dMap.get(c.id) || 0;
      const totP  = pMap.get(c.id) || 0;
      const bal   = Math.round((open + totD - totP) * 100) / 100;
      return {
        id:                  c.id,
        name:                c.name || '',
        urdu_name:           c.urdu_name || '',
        phone:               c.phone || '',
        address:             c.address || '',
        payment_cycle:       c.payment_cycle || '',
        rider_id:            c.rider_id || '',
        rider_name:          ridersById[c.rider_id]?.name || '',
        custom_price:        c.custom_price ?? '',
        delivery_order:      c.delivery_order ?? '',
        active:              !!c.active,
        opening_balance_at_creation: open,
        total_deliveries_amount:     Math.round(totD * 100) / 100,
        total_payments_amount:       Math.round(totP * 100) / 100,
        CURRENT_BALANCE:             bal,
        notes:                       bal > 0 ? 'OWES' : bal < 0 ? 'ADVANCE' : 'CLEAR',
      };
    })
    .sort((a, b) => Math.abs(b.CURRENT_BALANCE) - Math.abs(a.CURRENT_BALANCE));

  const ws = XLSX.utils.json_to_sheet(summary.length ? summary : [{ note: 'no active customers' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'summary_current_balances');
  console.log(`${summary.length} customers, total outstanding: Rs. ${summary.reduce((s, x) => s + x.CURRENT_BALANCE, 0).toFixed(0)}`);
} catch (e) {
  console.log(`FAILED: ${e.message}`);
}

const today = new Date().toISOString().split('T')[0];
const out = `old-db-export-${today}.xlsx`;
XLSX.writeFile(wb, out);

console.log(`\n  Done. Wrote ${out}  (${totalRows} rows across ${TABLES.length + 1} sheets)`);
console.log('  Keep this file private — it contains every customer phone and balance.\n');
