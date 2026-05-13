# Phase 8 — Clean-Slate Database Rebuild (2026-05-13)

A brand-new Supabase project, built from scratch, encoding every integrity
lesson from Phases 1–7. The previous database is left untouched — your
historical data is still safe there if you ever want to migrate it.

## Connection details for the new database

| Field | Value |
|---|---|
| Project name | **Delivery** |
| Project ref | `tmsvmyvktfatyyzqfmfv` |
| URL | `https://tmsvmyvktfatyyzqfmfv.supabase.co` |
| Region | Singapore (ap-southeast-1) |
| Postgres | 17 |
| Anon (publishable) key | `sb_publishable_6-redyBCEzlCS1Y1rOJteA_2WEOWKjS` |
| Legacy anon JWT (fallback) | available via Supabase Dashboard → Project Settings → API |
| Owner PIN | **1552** (same as before; hashed in DB with bcrypt) |

### Update `.env.local` on every device

```
VITE_SUPABASE_URL=https://tmsvmyvktfatyyzqfmfv.supabase.co
VITE_SUPABASE_KEY=sb_publishable_6-redyBCEzlCS1Y1rOJteA_2WEOWKjS
```

Then rebuild + redeploy + hard-refresh every Owner and Rider device.

### Update GitHub Secrets (so daily auto-email keeps working)

GitHub → repo → Settings → Secrets and variables → Actions. Edit the
existing values:

- `SUPABASE_URL` → `https://tmsvmyvktfatyyzqfmfv.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` → fetch from Supabase Dashboard →
  Project Settings → API → **service_role** key (this one is *not*
  the anon key)
- `RESEND_API_KEY` → unchanged

## What was built

20 tables, 21 RPCs, 14 OCC triggers, 5 period-lock triggers, 28 RLS
policies. All applied as 8 named migrations (m01…m08).

### Tables
**Retail (`dp_*`)** — riders, customers, prices, deliveries, payments,
expenses, rider_loads, closing_records, archives, audit_logs, metadata,
milk_inwards, period_lock, app_sessions, login_attempts.

**Wholesale (`ws_*`)** — wholesale_customers, products, deliveries,
payments, metadata. Two products seeded (Milk, Yogurt).

### Triggers
- **OCC** on every operational table: any UPDATE where `NEW.version <= OLD.version` is rejected with `P0001`.
- **Period Lock** on every dated transactional table: writes targeting `date <= lock_date` are refused with `P0003`, with an Owner-Adjustment carve-out (`is_adjustment = true` rows pass through).

### Auth model
- `verify_pin(p_pin, p_request_ip)` returns a 32-byte session token, valid 14 days. Rate-limited 8/PIN-hash, 12/IP per 10 minutes. Owner PIN stored as bcrypt hash (no plaintext anywhere).
- React app sends the token in the `x-app-session` header on every request.
- RLS helpers `app_session_role()` / `app_session_rider_id()` read that header. Every policy keys off them.
- Riders only see / write their own customers' deliveries and payments. Owner sees everything.

### Atomic write RPCs (no client-side multi-step writes)
- `save_delivery_entry(p_delivery, p_payment)` — delivery + linked cash, idempotent via `client_request_id`.
- `save_standalone_payment(p_payment)` — same idempotency.
- `save_manual_adjustment(p_adj)` — Owner-only debit/credit, bypasses period lock, fully audit-logged.
- `save_rider_closing(p_closing)` — atomic end-of-day, refuses duplicate (rider, date) pairs.

### Read RPCs (server-truth aggregation)
- `app_customer_balances()` — scoped balances filtered by current session role/rider.
- `dp_customer_balances` view — unscoped, full server-side aggregation.
- `get_start_of_month_balances(date)` — type-correct (text customer_id).
- `customer_monthly_statement(year, month, rider?, customer?, include_zero?)` — full per-customer monthly view.
- `live_reconcile(local_balances_jsonb)` — drift detector.

### Period-lock RPCs
- `get_period_lock()`, `set_period_lock(date, by, note)`, `clear_period_lock(by, note)`, `current_period_lock()`.

### Daily auto-email RPC
- `export_daily_backup(date)` — service-role-only, returns three arrays + a summary in one round-trip. GitHub Actions cron at 18:00 UTC (11 PM PKT) calls this.

### Integrity check RPC
- `production_integrity_check()` — current snapshot: outstanding receivables, today's volume + cash, negative-amount counts, orphan rows, duplicate client_request_ids.

## What you do next (~25 minutes)

1. **Update `.env.local` on the PC** with the new URL + key (table above).
2. `npm run build` and deploy the new bundle to your hosting.
3. **Hard-refresh every device** (Owner + every Rider phone). They will see the PIN screen.
4. Sign in with PIN `1552` — Owner.
5. Set up your data again:
   - **Setup → Staff** → add each rider with their PIN.
   - **Setup → Pricing** → add the current milk rate.
   - **Customers** → add each customer with their current outstanding balance as the *Opening Balance*. (This is where you carry the real ledger over from the old DB. Most efficient: export customer + balance from the OLD project, paste into the new one.)
6. **Update GitHub Secrets** with the new `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (above) so the daily auto-email keeps landing.
7. Run the daily backup workflow manually once to confirm the email still arrives.

## What is NOT in the new DB

- Old historical deliveries / payments / archives from the previous project. They're still safe in the old DB, but the new app starts from a fresh ledger. If you ever want to import them, ask and I'll write a one-shot migration script.
- No customers, no riders. The schema is empty and waiting.

## Reference: the 8 named migrations

| # | Name | What it adds |
|---|---|---|
| 1 | m01_core_schema | 20 tables, indexes, FKs, partial-unique idempotency indexes, seed products |
| 2 | m02_occ_and_period_lock | OCC trigger + 14 attachments; period-lock table, trigger, helper RPCs |
| 3 | m03_auth_sessions_rate_limit | dp_app_sessions, dp_login_attempts, verify_pin, RLS on every operational table |
| 4 | m04_balances_views_and_reads | dp_customer_balances view, app_customer_balances, get_start_of_month_balances, live_reconcile, customer_monthly_statement |
| 5 | m05_atomic_write_rpcs | save_delivery_entry / standalone_payment / manual_adjustment / rider_closing |
| 6 | m06_integrity_and_daily_backup | production_integrity_check, export_daily_backup, ws_customer_balances |
| 7 | m07_lock_down_internal_tables | Defence-in-depth RLS on dp_metadata, ws_metadata, period_lock, sessions, login_attempts |
| 8 | m08_verify_pin_ambiguity_fix | Hotfix: parameter shadowing of `pin` column in rider lookup loop |

The full SQL of each is in the Supabase project's
`supabase_migrations.schema_migrations` table, and a stub reference
lives at `supabase/migrations/20260513_phase8_clean_slate_baseline.sql`.
