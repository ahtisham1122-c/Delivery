# Codex Change Review — 2026-05-10

Reviewer: Claude (Opus 4.7) | Working tree: 24 modified files + 16 new SQL migrations + 1 new script | Base commit: `e326b0c` (Phase 4 + 5).

---

## 1. Executive verdict

**Partial cherry-pick required. Do NOT commit as one blob, and do NOT run the SQL batch in the order they were dropped on disk.**

The work is genuinely ambitious and addresses real audit findings (server-side session model, atomic delivery RPC, OCC coverage, value guards, performance indexes, integrity check). But it also (a) **disables the user-facing month-close path** (Phase 2 RPCs are revoked from anon and `ArchiveManager` is removed), (b) **introduces a brittle hard-block on login** if the cloud fetch fails on first load, and (c) **ships overlapping/superseded SQL migrations** that must be applied in a precise order or the database ends up half-locked. The auth model is also one-foot-on-each-side: the legacy plaintext PIN check in `dp_metadata` is still the credential. Commit the SQL hardening and the atomic delivery RPC; defer or revisit the App.tsx login-block + ArchiveManager removal before pushing live.

---

## 2. What Codex was trying to fix (themed)

Codex was clearly working off `docs/COMMERCIAL_AUDIT.md` Sections A–D. Themes:

| Theme | Migrations / files | Audit item addressed |
|---|---|---|
| **App-session auth + RLS lock-down** | `20260509_app_session_rls.sql`, `20260509_app_session_crypto_schema_fix.sql`, `20260509_split_write_rls_policies.sql`, `20260509_lock_vault_and_dormant_close.sql`, `services/supabaseClient.ts`, `App.tsx` (login flow) | A1 (wholesale `allow_all`), A2 (ineffective `current_setting` RLS), A8 (anon key exposure), D8 (`dp_metadata` open). Replaces every `allow_all_*` policy with `app_is_owner()` / `app_session_rider_id()` checks, gated by an `x-app-session` header issued at login. |
| **Atomic delivery + payment write path** | `20260509_atomic_delivery_entry_rpc.sql`, `components/DeliveryEntry.tsx` | B2/C8 (duplicate active deliveries). One RPC `save_delivery_entry` upserts the delivery and the linked cash payment in one transaction, with a partial unique index on `linked_delivery_id`. |
| **Value & soft-delete guards** | `20260509_future_value_guards.sql`, `20260509_value_guard_soft_delete_fix.sql`, `20260509_production_financial_guardrails.sql` | B7/D3. Forbids negative deliveries, non-positive payments/prices, normalises NULL `deleted` / `is_adjustment` flags to `false NOT NULL`, replaces nullable partial unique indexes with `coalesce(...)` predicates. |
| **OCC coverage + integrity index** | `20260509_production_financial_guardrails.sql`, `20260509_live_integrity_guardrails.sql` | C1 (OCC only on 5 tables). Adds OCC triggers to `dp_prices`, `dp_rider_loads`, `dp_closing_records`, `dp_archives`, `dp_audit_logs`. Adds unique index on `dp_archives(year, month) WHERE deleted=false`. (This duplicates Phase 3's `20260509_phase3_defensive_locks.sql` — see §6.) |
| **Server-balance + RPC NULL guards** | `20260509_guard_remaining_rpcs.sql`, `20260509_rpc_null_guard_fix.sql`, `services/relationalDataService.ts` | A2/B5/B8. Wraps `get_start_of_month_balances`, `live_reconcile`, `get_next_invoice_number` in session checks; adds new `app_customer_balances()` RPC and revokes direct anon SELECT on the `dp_customer_balances` view. |
| **Production integrity check** | `20260509_production_integrity_check_rpc.sql`, `scripts/production-integrity-check.mjs`, `package.json` | New "owner-only" daily diagnostic. Owner-gated RPC + Node CLI. |
| **Cache-marker / reset-backup machinery** | `20260510_app_cache_marker_rpc.sql`, `20260510_reset_backup_table.sql`, `services/dataStore.ts` (`clearBusinessCache`), `App.tsx` login marker check | New: a server-stored marker so that after an admin-side wipe (`dp_reset_backups`) every client clears its localStorage on next login. No client-side reset UI ships in this batch — only the marker plumbing. |
| **Wholesale perf indexes** | `20260509_wholesale_performance_indexes.sql` | C10 (whole-table refetch cost). |
| **Existing-migration patch** | `supabase/migrations/20260313_add_unique_constraints.sql` (modified) | Was `ALTER TABLE ... ADD CONSTRAINT UNIQUE ... WHERE` which is invalid SQL; rewrites to `CREATE UNIQUE INDEX ... WHERE`. **This is a real correctness fix.** |
| **UX / paginated history / breakdown reconciliation** | `services/ledgerUtils.ts`, `components/DeliveryEntry.tsx`, `components/Ledger.tsx`, `components/CustomerManagement.tsx`, `components/Dashboard.tsx`, `index.html` (print rules) | Not from the audit. Codex re-styled Ledger, added per-row paginated history fetch, reconciled `calculateCycleBreakdown` against the authoritative balance, expanded the print-only CSS, removed the `MonthLock` / "Close Period" buttons from Dashboard and Setup. |
| **Disabling the month-close UI** | `App.tsx` (removes `ArchiveManager`), `Dashboard.tsx` (removes Close Month button), `Ledger.tsx` (`archives={[]}`), `lock_vault_and_dormant_close.sql` (revokes RPC EXECUTE) | Not from the audit. Codex appears to have decided the safer path is to **disable the feature** rather than ship it with the Phase 2 typed-confirmation flow. Big policy decision — flag for the owner. |

---

## 3. Per-file risk assessment (modified files)

| File | What changed | Risk |
|---|---|---|
| `App.tsx` | (a) Imports new `setAppSessionToken/clearAppSessionToken` from supabaseClient and `clearBusinessCache` from dataStore. (b) Login now requires `verify_pin` to return a `token` (line 681), persists it for the `x-app-session` header. (c) Login compares server `cache_marker` against `localStorage`; mismatch → wipe all in-memory state arrays + localStorage cache. (d) Login is **blocked** if `fetchCloudData()` returns false (line 700-703). (e) Removes `ArchiveManager` import and the Setup tile that mounted it. (f) `Dashboard` no longer receives `lockedMonths`/`onCloseMonth`. (g) `Reports` is hard-wired with `archives={[]}` and `onSyncArchives` removed. (h) `onCloseMonth` and `reconcileBalancesWithArchives` kept but marked unused. (i) Tiny copy fix "Clients"→"Customers". | **HIGH.** Phase 4 server-balance memo is **preserved** (`balances` memo at line 222 still prefers `serverBalances`). Date filter in `fetchCloudData` is unchanged at this layer. **However**: hard-blocking login on a single failed cloud fetch is a regression for riders who lose connectivity mid-shift; today they could still log in and queue work. Also losing access to all archives in `Reports` (`archives={[]}` line 781) means the Owner can no longer view past months from the Ledger screen. |
| `services/relationalDataService.ts` | `fetchAll` now also fetches **`dp_archives` and `dp_audit_logs` unbounded**, applies the date limit to `dp_expenses/dp_rider_loads/dp_closing_records` too, and resolves the operational date limit as `max(latest archived month + 1, today − 40d)`. `fetchBalancesFromServer` now calls the new owner-aware `app_customer_balances` RPC instead of the view. New helpers `getCacheMarker`, `getOpenLedgerDateLimit`, `unpackArchiveRow`, `fetchCustomerLedgerHistory`. | **MEDIUM-HIGH.** Phase 4 server view fetch is preserved (just routed through an RPC that adds owner/rider scoping — good). But `archives` and `auditLogs` are now pulled unbounded on every `fetchAll`, undoing the rationale in `CLAUDE.md` that those tables are server-only and not for full sync. On a shop with 12+ months of archives this fattens every cold start. The date-limit broadening to expenses/rider_loads/closing_records is fine. |
| `services/supabaseClient.ts` | Adds custom `fetch` that injects `x-app-session` header from localStorage on every Supabase request. `testConnection()` switches from `dp_metadata` SELECT to new `app_ping` RPC. New exports `setAppSessionToken/clearAppSessionToken`. PIN auth flow itself is unchanged — `verify_pin` is still called from `App.tsx`. | **LOW-MEDIUM.** Clean. Note: token lives in `localStorage`, so any XSS exfiltrates a 14-hour-valid session — same effective risk as today's anon access. |
| `services/dataStore.ts` | Adds `BUSINESS_CACHE_KEYS` array and `clearBusinessCache()`. Existing `saveToStore` short-circuit list unchanged. **No paisa migration; money math unchanged.** | **LOW.** |
| `services/ledgerUtils.ts` | `calculateCycleBreakdown` gains optional `authoritativeBalance` and `referenceDate` params. When passed, the breakdown's outstanding total is **forced to match the authoritative balance** (the same-direction cycle absorbs the difference). `referenceDate` lets callers reconstruct breakdowns for the historical entry date instead of "now". | **MEDIUM.** Sound idea (today's UI showed cycle math drifting from displayed balance). The "shove the difference into a cycle" is a UI-only correction; it doesn't touch real ledger numbers. Slight risk: if `authoritativeBalance` itself is stale on a particular device, the rider sees a misleadingly perfect cycle table — the fallback still presents the right number though. |
| `services/wholesaleDataService.ts` | `getNextInvoiceNumber` no longer fabricates a random 4-digit number on RPC failure; returns `null`. | **LOW (positive).** Closes audit C5/H3 partially — no more silent random invoice numbers. Callers must handle `null` (haven't checked all of them but the change is type-safe). |
| `package.json` | Adds `check:production` script. **No new runtime dependencies.** | **LOW.** Heavy-deps situation unchanged. |
| `index.html` | Adds `.print-only` CSS using `body:has(...)` selectors and an inverted visibility trick. **No service worker, no CSP, no manifest.** | **LOW-MEDIUM.** `:has()` is fine on Chrome 105+/Safari 15.4+/Android Chrome — riders on older Android WebViews may not support it. Will degrade gracefully (the print page just prints the whole UI). |
| `.gitignore` | Adds `backups`. | **LOW.** Sensible. |
| `supabase/migrations/20260313_add_unique_constraints.sql` | Real fix: `ALTER TABLE ... ADD CONSTRAINT UNIQUE ... WHERE` → `CREATE UNIQUE INDEX ... WHERE`. The original was Postgres-illegal. | **LOW (positive).** Editing a committed migration is normally bad practice, but this one was broken — anyone running it cleanly in a fresh DB would have errored. Acceptable. |
| `components/Dashboard.tsx` | Removes Close Month button + `MonthLock` import + `lockedMonths`/`onCloseMonth` props. Calls `calculateCycleBreakdown(... balances[id] ?? 0)` so dashboard cycle aggregation matches authoritative balances. | **MEDIUM.** Functional regression — owner can no longer trigger month-close from anywhere in the UI. |
| `components/Ledger.tsx` | Visual redesign of the customer ledger header (FileText icon, large closing balance display, 5-column stat grid including Milk Qty and Entries). Removes `onSyncArchives` prop. Logic unchanged. | **LOW.** Pure UI. |
| `components/CustomerManagement.tsx` | Adds status filter chips (`all/active/due/advance/stopped`), restructures the row (smaller padding, better mobile breakpoints). Crucially: line 253 wraps `dp_customers` upserts in `relationalDataService.toSnakeCase` — **today's code is upserting camelCase keys, which is silently wrong against snake_case columns.** This is a real bug fix. | **LOW-MEDIUM.** UI work + a quiet but important snake_case correctness fix. Worth verifying every other component in this batch isn't ALSO writing camelCase to dp_customers (didn't find others). |
| `components/DeliveryEntry.tsx` | Major: switches single-row save from two `.upsert()` calls to one `save_delivery_entry` RPC. Idempotent (existing same-day delivery is updated). Drafts cleanup made stricter (delete empty refs). New "load older history" pagination on the per-customer history modal. | **MEDIUM.** This is the riskiest component change — the rider write path runs through a new server function. The RPC checks `app_has_session()` so the new auth header MUST be present or every rider save fails. The optimistic-merge logic at line 615+ is now keyed on `linked_delivery_id` which is more correct than today's "amount + 1s window" heuristic. |
| `components/RiderClosing.tsx`, `BillingTracker.tsx`, `PaymentEntry.tsx`, `PetrolLog.tsx`, `PriceManagement.tsx`, `StaffManagement.tsx`, `DispatchHub.tsx`, `CloudSyncCenter.tsx`, `wholesale/WholesaleDeliveryEntry.tsx`, `wholesale/WholesaleLedger.tsx` | Small touch-ups — mostly print-CSS class changes and minor copy. Did not see any money-math changes. | **LOW.** |

---

## 4. Per-SQL-migration risk assessment

All migrations use `CREATE OR REPLACE`, `IF NOT EXISTS`, and `DROP POLICY IF EXISTS` — broadly idempotent. All end with `NOTIFY pgrst, 'reload schema'`.

| Migration | What it does | Idempotent? | Depends on | Risk | Notes |
|---|---|---|---|---|---|
| `20260509_app_session_rls.sql` | Creates `dp_app_sessions`, `dp_login_attempts`, `app_*` helper functions, replaces `verify_pin` to return `{ token }`, **drops every existing permissive policy** (retail + wholesale) and creates session-scoped ones. Revokes anon SELECT on `dp_customer_balances`. | Yes | None — but ALL OTHER MIGRATIONS DEPEND ON THIS. | **HIGH (foundational).** This is the migration that flips the security model. **If applied without the matching React build deployed, every existing tab loses access immediately** (anon has no header → policies all evaluate false). Plan a coordinated cutover. Also: `app_session_role()` here uses `digest(...)` unqualified, which fails because pgcrypto lives in `extensions` schema — that's why `..._crypto_schema_fix.sql` exists. **Must run them as a pair, fix second.** |
| `20260509_app_session_crypto_schema_fix.sql` | Re-issues `app_session_role`, `app_session_rider_id`, `verify_pin` with `extensions.digest(...)` / `extensions.gen_random_bytes(...)`. | Yes | Hard depends on `app_session_rls.sql`. | **HIGH.** Must run **immediately after** the parent or login is broken. |
| `20260509_split_write_rls_policies.sql` | Replaces `FOR ALL` policies with explicit `INSERT/UPDATE/DELETE` policies. PostgREST happiness — selects no longer hit OR-of-permissive-policies. | Yes | `app_session_rls.sql`. | **MEDIUM.** Worth running but make sure the `FOR ALL` policies it drops actually exist (they do — from the prior migration). |
| `20260509_atomic_delivery_entry_rpc.sql` | `save_delivery_entry(jsonb, jsonb)` + partial unique index on `dp_payments(linked_delivery_id) WHERE not deleted, not adjustment`. Validates negative values, rider scope, customer existence. **Bumps `version` on UPDATE.** | Yes | `app_session_rls.sql` (uses `app_has_session/app_is_owner/app_session_rider_id`). | **MEDIUM.** Solid — this is the single biggest correctness win. The `FOR UPDATE` lock + lookup-by-business-key prevents double active deliveries. **However, the existing client code in any non-DeliveryEntry place still uses raw `.upsert()`** — Phase 2 / Phase 3 close paths are not affected; rider-closing and billing screens will still race. |
| `20260509_future_value_guards.sql` | Trigger `reject_negative_financial_values` on INSERT/UPDATE for deliveries, payments, expenses, prices. Backfills nullable `deleted` to `false`, makes `deleted NOT NULL DEFAULT false` on customers/riders/prices. | Yes | None hard, but should run after data is sane (backfill is in-line). | **MEDIUM.** **Will FAIL if the live DB has any active negative delivery row** — and the audit indicated some legacy "correction" rows were negative. The companion `value_guard_soft_delete_fix.sql` patches this by allowing deletes to bypass the guard. Run them as a pair. |
| `20260509_value_guard_soft_delete_fix.sql` | Replaces the trigger so `deleted = true` rows skip the value check. | Yes | `future_value_guards.sql`. | **LOW.** Required follow-up. |
| `20260509_production_financial_guardrails.sql` | The "everything else" migration. Backfills NULL deleted/is_adjustment on every operational table, makes them NOT NULL. **Drops** old indexes (`dp_deliveries_unique_entry`, `unique_delivery_per_day`, `dp_rider_loads_unique_entry`, `unique_load_per_day`, `dp_closing_records_unique_entry`, `unique_closing_per_day`, `uniq_dp_archives_active_month`) and recreates them with `_live` suffix and `coalesce(...)` predicates. Reinstalls `enforce_occ_version` trigger on 10 tables. **Revokes EXECUTE on `close_month_transactional` and `preview_month_close` from anon/authenticated.** | Yes (drops are `IF EXISTS`) | Should run AFTER `live_integrity_guardrails.sql` (or be the only one creating those indexes). | **HIGH.** This is the migration that **disables month-close** at the SQL layer. If you ever want to use Phase 2's typed-confirmation close again, you'll need to GRANT EXECUTE back. Also: the OCC trigger here is **stricter than Phase 3's** — it rejects when `OLD.version IS NULL`, meaning any pre-existing row with NULL version cannot be updated until backfilled. The earlier UPDATEs in this same migration backfill version on rows with NULL deleted, but a row with NULL `version` and non-NULL `deleted` is still vulnerable. Worth a dry-run. |
| `20260509_live_integrity_guardrails.sql` | Just `CREATE UNIQUE INDEX IF NOT EXISTS` for `unique_delivery_per_day`, `unique_closing_per_day`, `unique_load_per_day`, `uniq_dp_archives_active_month` (without the `coalesce` predicate). | Yes | None. | **LOW but redundant.** `production_financial_guardrails.sql` later drops these and recreates them with `_live` suffix and stricter predicates. If you only run `production_financial_guardrails.sql` you don't need this one. |
| `20260509_guard_remaining_rpcs.sql` | Wraps `get_start_of_month_balances`, `live_reconcile`, `get_next_invoice_number` in `app_has_session` / `app_is_owner` checks. REVOKE/GRANT pattern. | Yes | `app_session_rls.sql`. | **MEDIUM.** Note: uses `IF app_has_session() IS NOT TRUE` — this works because `app_has_session()` returns boolean (not null). Good. |
| `20260509_rpc_null_guard_fix.sql` | Re-issues the same three RPCs explaining "IS NOT NULL is NULL not true, use IS NOT TRUE". **Functionally identical to `guard_remaining_rpcs.sql`.** | Yes | `app_session_rls.sql`. | **LOW (redundant).** Looks like Codex wrote this first, then realised it should be folded into `guard_remaining_rpcs.sql` and didn't delete the duplicate. Either run is fine; both are equivalent. |
| `20260509_lock_vault_and_dormant_close.sql` | Enables RLS on legacy `dairy_vault` table (owner-only). **Revokes EXECUTE on `close_month_transactional` and `preview_month_close` again** (also done in `production_financial_guardrails.sql`). Adds `SET search_path` to those two functions. | Yes | `app_session_rls.sql` (uses `app_is_owner`). | **MEDIUM.** Confirms the design intent: month-close is intentionally dormant. If `dairy_vault` doesn't exist on this project, the `ALTER TABLE IF EXISTS` is a no-op. |
| `20260509_production_integrity_check_rpc.sql` | Owner-only `production_integrity_check()` RETURNS TABLE — runs ~10 sanity SUMs (orphan deliveries/payments, duplicate active deliveries, NULL flag counts, server vs client balance mismatches, duplicate linked-payment rows, etc.). | Yes | `app_session_rls.sql`. | **LOW.** Read-only, safe. |
| `20260509_wholesale_performance_indexes.sql` | Five `CREATE INDEX IF NOT EXISTS` for ws_deliveries / ws_payments customer+date. | Yes | None. | **LOW.** Pure perf win. |
| `20260510_app_cache_marker_rpc.sql` | `get_app_cache_marker()` returns `latest_reset_id:epoch` from `dp_reset_backups` or `'no-reset-marker'`. | Yes | `reset_backup_table.sql`. | **LOW.** |
| `20260510_reset_backup_table.sql` | Creates `dp_reset_backups (id text PK, reason, payload jsonb, created_at)`, owner-only SELECT. **No INSERT policy** — the table is read-only via the API; inserts must come from the SQL editor or service role. | Yes | `app_session_rls.sql` (uses `app_is_owner`). | **LOW.** New table; no data movement. |

### App.tsx-side dependency on the new auth model

`App.tsx:681` requires `data.token` from `verify_pin`, then writes it to localStorage and **sends it on every subsequent Supabase fetch via the `x-app-session` header** (`services/supabaseClient.ts:24`). So:

- The React build in this commit **cannot work against the OLD `verify_pin` RPC** (the old one returned no token, so login throws `"Login succeeded without a server session token"`).
- The new RPC **cannot work without the new build** (no other client knows to send the header → RLS rejects everything).

These are coupled — must be deployed together.

---

## 5. Suggested run order in Supabase SQL Editor

Run these as Owner in this order, on a backed-up DB:

1. `20260509_phase1_rpc_typefix.sql` — already done in Phase 1. (Skip.)
2. `20260509_phase2_atomic_close.sql` — already done. (Skip.)
3. `20260509_phase3_defensive_locks.sql` + `20260509_phase3_hotfix_reconcile.sql` — already done. (Skip.)
4. **`20260510_reset_backup_table.sql`** (creates table referenced by RPC).
5. **`20260509_app_session_rls.sql`** (foundational — but DB is now hostile to current clients until step 6).
6. **`20260509_app_session_crypto_schema_fix.sql`** (immediately).
7. **`20260509_split_write_rls_policies.sql`**.
8. **`20260509_production_financial_guardrails.sql`** — most likely to FAIL on legacy bad data; have backups.
9. **`20260509_value_guard_soft_delete_fix.sql`**.
10. **`20260509_future_value_guards.sql`** (after #9 because the trigger from #9 would otherwise be installed by #10 and then immediately replaced).  — *Actually swap: run `20260509_future_value_guards.sql` first then `20260509_value_guard_soft_delete_fix.sql` since the latter overrides the former.* The fix replaces the function from `future_value_guards.sql`, so order is: `future_value_guards` then `value_guard_soft_delete_fix`.
11. **`20260509_atomic_delivery_entry_rpc.sql`**.
12. **`20260509_guard_remaining_rpcs.sql`** (skip `rpc_null_guard_fix.sql` — it's the same).
13. **`20260509_lock_vault_and_dormant_close.sql`**.
14. **`20260509_production_integrity_check_rpc.sql`**.
15. **`20260509_wholesale_performance_indexes.sql`**.
16. **`20260510_app_cache_marker_rpc.sql`**.
17. Skip `20260509_live_integrity_guardrails.sql` (superseded by step 8) and `20260509_rpc_null_guard_fix.sql` (duplicate of step 12).

**Critical:** the new React build must be deployed and every device hard-refreshed in the same maintenance window as steps 5–7. Otherwise riders will see "Sync conflict" / blank screens because their old bundle doesn't send `x-app-session`.

---

## 6. Conflicts with the existing 4 phases

| Phase invariant | Codex respect? | Notes |
|---|---|---|
| **Phase 1 — `get_start_of_month_balances` returns `customer_id text`** | Yes | `20260509_guard_remaining_rpcs.sql` re-issues with `text`. Preserved. |
| **Phase 2 — Atomic `close_month_transactional` RPC** | **Disabled** | `lock_vault_and_dormant_close.sql:11-15` and `production_financial_guardrails.sql:127` both `REVOKE EXECUTE` from anon/authenticated. App.tsx removes `ArchiveManager` and `Dashboard` Close Month button. The RPC still exists but cannot be called from the web app. **This is a deliberate policy choice by Codex. The owner should know.** |
| **Phase 3 — OCC triggers on 10 tables** | **Reinstalled, stricter.** | `production_financial_guardrails.sql:66-83` redefines `enforce_occ_version` to also reject `OLD.version IS NULL`. This is correct only after the backfill in the same migration runs successfully. Phase 3's looser version still rejected `NEW.version <= OLD.version`. Run order matters. |
| **Phase 3 — `live_reconcile(jsonb)` RPC** | Preserved + tightened | Now requires `app_is_owner()`. Good. |
| **Phase 4 — Server-view balances as truth** | **Preserved** | `App.tsx` `balances` memo still prefers `serverBalances`; `relationalDataService.fetchBalancesFromServer` now goes through `app_customer_balances()` RPC instead of the view. View itself is `REVOKE`d from anon (correct given new RLS). **No re-introduction of client-side aggregation as the primary path.** Rs.1.06 lakh drift fix is intact. |
| **Phase 5 — RiderFilterBar / RiderPerformanceGrid** | Preserved | `RiderFilterBar` import still present at App.tsx:65; nothing changed in its surrounding wiring. |

**One concrete conflict to watch:** the "no archives in Reports" change (`App.tsx:781` passes `archives={[]}`) means the Ledger screen can no longer find the `relevantArchive` for past months — `monthly opening balance` calculations on the Ledger are now wrong for any month earlier than the current one. This is silent — no error, just a bad number. (Whether any month-close has ever been performed on this DB is a separate question; if archives are empty anyway, the impact is zero today.)

---

## 7. `scripts/production-integrity-check.mjs`

- 63 lines. Calls `verify_pin` with PIN from env (`PRODUCTION_CHECK_PIN` / `OWNER_PIN` / `VITE_OWNER_PIN`), gets a session token, calls `production_integrity_check()` RPC, prints a `console.table`, exits 1 if any check fails.
- **Required env**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `PRODUCTION_CHECK_PIN`. Loads `dotenv/config`.
- **Side effects**: a real login attempt — inserts a row into `dp_login_attempts` and into `dp_app_sessions` every run. Token expires in 14 hours. Running this hourly would generate a lot of session rows; consider GC.
- **Safety**: read-only RPC, owner-gated. Safe to run against production.
- **Risk**: the PIN ends up in the shell environment / CI logs. Don't expose it publicly. The script doesn't revoke its own session at the end.

---

## 8. Top 5 questions to ask Codex before committing

1. **Why was the user-facing month-close removed?** (`ArchiveManager` deleted, Dashboard button gone, `close_month_transactional` revoked from anon.) What is the planned re-enable path? The owner *needs* a way to close out April/May at some point — does this leave them stuck calling SQL by hand?
2. **The `archives={[]}` hard-wire in `App.tsx:781`** — is that intentional? It means the Ledger screen cannot see any archived month, even ones already closed. Was this meant to be `archives={archives}`?
3. **Login is now blocked when `fetchCloudData` fails** (`App.tsx:700-703`). For a rider with a flaky cellular connection at 6am, this means they cannot open the app and cannot record deliveries. Should the fallback be "let them in with cached data, show a banner" instead?
4. **`scripts/production-integrity-check.mjs` reads the live Owner PIN from env**. How does Codex expect this to be wired in production — cron with the PIN in a service file? A scheduled GitHub Action with a secret? What's the rotation story?
5. **`relationalDataService.fetchAll` now pulls `dp_archives` and `dp_audit_logs` unbounded** every cold start. CLAUDE.md explicitly said these should be "server-only and large." On a 12-month-old DB this is potentially MBs of JSONB on every login. Did Codex measure this or is it accidental?

Bonus: why are there two pairs of duplicate migrations (`live_integrity_guardrails`/`production_financial_guardrails`, `rpc_null_guard_fix`/`guard_remaining_rpcs`)? Did one set get superseded mid-thought?

---

## 9. Suggested commit strategy

**Split into 4 commits, drop 3 files.**

### Commit 1 — "fix: correct invalid SQL in Phase 0 unique constraints migration"
- `supabase/migrations/20260313_add_unique_constraints.sql`

Standalone, low risk, pure correctness.

### Commit 2 — "perf: wholesale FK indexes + delivery RPC null-guard"
- `supabase/migrations/20260509_wholesale_performance_indexes.sql`
- `services/wholesaleDataService.ts`

Pure infra wins. No behaviour change for users.

### Commit 3 — "feat: production integrity check RPC + CLI"
- `supabase/migrations/20260509_production_integrity_check_rpc.sql`
- `scripts/production-integrity-check.mjs`
- `package.json` (script entry)

Owner-tooling only, doesn't touch user paths. Note: this migration depends on `app_is_owner()` from the auth-session migration, so either ship Commit 4 first or stub out the owner check temporarily.

### Commit 4 — "feat: app-session RLS + value/OCC guards + atomic delivery RPC"
This is the big coordinated change. Stage:
- `supabase/migrations/20260510_reset_backup_table.sql`
- `supabase/migrations/20260509_app_session_rls.sql`
- `supabase/migrations/20260509_app_session_crypto_schema_fix.sql`
- `supabase/migrations/20260509_split_write_rls_policies.sql`
- `supabase/migrations/20260509_future_value_guards.sql`
- `supabase/migrations/20260509_value_guard_soft_delete_fix.sql`
- `supabase/migrations/20260509_production_financial_guardrails.sql`
- `supabase/migrations/20260509_atomic_delivery_entry_rpc.sql`
- `supabase/migrations/20260509_guard_remaining_rpcs.sql`
- `supabase/migrations/20260509_lock_vault_and_dormant_close.sql`
- `supabase/migrations/20260510_app_cache_marker_rpc.sql`
- `services/supabaseClient.ts`
- `services/relationalDataService.ts`
- `services/dataStore.ts`
- `services/ledgerUtils.ts`
- `App.tsx` (with the two carve-outs below)
- `components/DeliveryEntry.tsx`
- `components/CustomerManagement.tsx` (the snake_case fix is genuinely needed)
- `components/Dashboard.tsx`
- `components/Ledger.tsx`
- `components/RiderClosing.tsx`, `BillingTracker.tsx`, `PaymentEntry.tsx`, `PetrolLog.tsx`, `PriceManagement.tsx`, `StaffManagement.tsx`, `DispatchHub.tsx`, `CloudSyncCenter.tsx`, `wholesale/*.tsx`
- `index.html`
- `.gitignore`

**Drop / amend before committing:**
- `supabase/migrations/20260509_live_integrity_guardrails.sql` — superseded by `production_financial_guardrails.sql`.
- `supabase/migrations/20260509_rpc_null_guard_fix.sql` — duplicate of `guard_remaining_rpcs.sql`.
- In `App.tsx`: revisit the **hard login block** at line 700-703 (downgrade to a banner) and revert `archives={[]}` at line 781 back to `archives={archives}`. Decide explicitly with the owner whether to keep the `ArchiveManager` removal — if yes, move it to a separate "feat: disable in-app month-close pending UX rework" commit so it can be reverted independently.

Commit 4 must ship **with** the SQL applied in the same maintenance window. Documentation update (a `docs/PHASE5_AUTH_SESSION.md` or similar) recommended before pushing, so the owner has a runbook like Phases 1–4.

---

## Closing note

This is good work in spirit and dangerous in delivery. The audit themes are real, the SQL is mostly competent, and the atomic delivery RPC alone is worth shipping. But the fact that two migration pairs were left as duplicates, the user-facing month-close was silently disabled, and login now hard-blocks on cloud failure tells me Codex didn't run a final review pass. Before this lands on a phone the owner uses to record real money, walk through the 5 questions in §8 and stage as 4 commits in §9.
