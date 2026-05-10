#!/usr/bin/env node
// Phase 7 — Daily backup emailer.
//
// Calls the Supabase RPC `export_daily_backup` (SECURITY DEFINER, service-role
// only), converts the three arrays to CSV (UTF-8 with BOM so Excel renders
// Urdu names correctly), composes a small HTML summary email, and ships it
// via Resend's HTTP API. No npm dependencies — only built-in Node modules.
//
// Exits non-zero on any error so that GitHub Actions marks the run as failed
// (which in turn emails the repo owner via GitHub's own notification system).

const STARTED_AT = Date.now();

function log(step, extra = {}) {
  const ts = new Date().toISOString();
  const tail = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  console.log(`[${ts}] ${step}${tail}`);
}

function fail(step, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] FAIL ${step}: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) fail('env-check', new Error(`Missing required env: ${name}`));
  return v.trim();
}

const SUPABASE_URL = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = requireEnv('RESEND_API_KEY');
const BACKUP_EMAIL_TO = (process.env.BACKUP_EMAIL_TO || 'chahtisham11@gmail.com').trim();

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

// ---------- CSV helpers ----------

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(rows) {
  // UTF-8 BOM so Excel on Windows interprets Urdu characters correctly.
  const BOM = '﻿';
  if (!Array.isArray(rows) || rows.length === 0) {
    return BOM + '(no rows)\n';
  }
  // Stable header: union of keys, first row's order first.
  const seen = new Set();
  const headers = [];
  for (const row of rows) {
    for (const k of Object.keys(row || {})) {
      if (!seen.has(k)) { seen.add(k); headers.push(k); }
    }
  }
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row?.[h])).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function formatPKR(n) {
  const num = Number(n) || 0;
  return 'Rs. ' + num.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function formatLiters(n) {
  return (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 }) + ' L';
}

// ---------- Step 1: call Supabase RPC ----------

async function callExportRpc() {
  const url = `${SUPABASE_URL}/rest/v1/rpc/export_daily_backup`;
  log('rpc.start', { url, date: TODAY });
  const t0 = Date.now();

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ p_date: TODAY }),
    });
  } catch (err) {
    fail('rpc.fetch', err);
  }

  const text = await res.text();
  const ms = Date.now() - t0;
  log('rpc.response', { status: res.status, durationMs: ms, bytes: text.length });

  if (!res.ok) {
    fail('rpc.http', new Error(`Supabase RPC ${res.status}: ${text.slice(0, 500)}`));
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    fail('rpc.parse', new Error(`Could not parse JSON: ${err.message} body=${text.slice(0, 200)}`));
  }

  // Defensive defaults for empty days.
  payload.summary = payload.summary || {};
  payload.deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];
  payload.payments = Array.isArray(payload.payments) ? payload.payments : [];
  payload.customer_balances = Array.isArray(payload.customer_balances) ? payload.customer_balances : [];

  log('rpc.summary', {
    deliveries: payload.deliveries.length,
    payments: payload.payments.length,
    customers: payload.customer_balances.length,
  });

  return payload;
}

// ---------- Step 2: build CSVs ----------

function buildAttachments(payload) {
  log('csv.build');
  const deliveriesCsv = toCSV(payload.deliveries);
  const paymentsCsv = toCSV(payload.payments);
  const balancesCsv = toCSV(payload.customer_balances);

  const attachments = [
    {
      filename: `deliveries_${TODAY}.csv`,
      content: toBase64(deliveriesCsv),
    },
    {
      filename: `payments_${TODAY}.csv`,
      content: toBase64(paymentsCsv),
    },
    {
      filename: `customer_balances_${TODAY}.csv`,
      content: toBase64(balancesCsv),
    },
  ];
  log('csv.done', {
    deliveriesBytes: deliveriesCsv.length,
    paymentsBytes: paymentsCsv.length,
    balancesBytes: balancesCsv.length,
  });
  return attachments;
}

// ---------- Step 3: build HTML body ----------

function buildHtml(summary) {
  const rows = [
    ['Date', summary.date || TODAY],
    ['Deliveries today', summary.delivery_count ?? 0],
    ['Total liters', formatLiters(summary.total_liters)],
    ['Cash collected', formatPKR(summary.cash_collected)],
    ['Expenses', formatPKR(summary.total_expenses)],
    ['Active customers', summary.active_customers ?? 0],
    ['Outstanding receivables', formatPKR(summary.outstanding_receivables)],
  ];

  const rowsHtml = rows.map(([label, value]) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">${label}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;text-align:right;">${value}</td></tr>`
  ).join('');

  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#222;background:#fafafa;padding:16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;padding:20px;">
      <h2 style="margin:0 0 4px 0;">Gujjar Milk Shop</h2>
      <p style="margin:0 0 16px 0;color:#666;">Daily backup &mdash; ${summary.date || TODAY}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${rowsHtml}</table>
      <p style="margin:16px 0 0 0;color:#888;font-size:12px;">
        Three CSV attachments are included: today's deliveries, today's payments,
        and current customer balances. Open them in Excel.
      </p>
      <p style="margin:8px 0 0 0;color:#aaa;font-size:11px;">
        Generated by GitHub Actions &middot; sent via Resend.
      </p>
    </div>
  </body></html>`;
}

function buildSubject(summary) {
  const cash = formatPKR(summary.cash_collected);
  const count = summary.delivery_count ?? 0;
  return `Gujjar Milk Shop — Backup for ${summary.date || TODAY} (${count} deliveries · ${cash} cash)`;
}

// ---------- Step 4: send via Resend ----------

async function sendEmail(payload) {
  const summary = payload.summary || {};
  const html = buildHtml(summary);
  const subject = buildSubject(summary);
  const attachments = buildAttachments(payload);

  const body = {
    from: 'Gujjar Milk Shop <onboarding@resend.dev>',
    to: [BACKUP_EMAIL_TO],
    subject,
    html,
    attachments,
  };

  log('email.send', { to: BACKUP_EMAIL_TO, subject, attachmentCount: attachments.length });
  const t0 = Date.now();

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    fail('email.fetch', err);
  }

  const text = await res.text();
  const ms = Date.now() - t0;
  log('email.response', { status: res.status, durationMs: ms, bytes: text.length });

  if (!res.ok) {
    fail('email.http', new Error(`Resend ${res.status}: ${text.slice(0, 500)}`));
  }

  let parsed = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  log('email.sent', { id: parsed?.id || null });
}

// ---------- main ----------

(async () => {
  try {
    log('boot', { date: TODAY, recipient: BACKUP_EMAIL_TO });
    const payload = await callExportRpc();
    await sendEmail(payload);
    log('done', { totalMs: Date.now() - STARTED_AT });
  } catch (err) {
    fail('main', err);
  }
})();
