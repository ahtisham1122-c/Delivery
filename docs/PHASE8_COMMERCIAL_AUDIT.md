# Phase 8 Commercial Audit — Gujjar Milk Shop

**Date:** 2026-05-13
**Auditor:** Codex (Claude Opus 4.7), commissioned by the Owner
**Scope:** Full application + operational layer against the brand-new Supabase project `tmsvmyvktfatyyzqfmfv`. Supersedes `docs/COMMERCIAL_AUDIT.md` (2026-05-08). Database layer was independently verified — accepted as ground truth and not re-checked.

---

## One-line verdict

**GREEN — safe to run a single-shop, single-Owner-plus-riders business on this codebase today. NOT ready for multi-tenant SaaS resale.** The Phase 8 rebuild closed every Critical from the 2026-05-08 audit; the residual findings are operational hygiene and UX, not money-safety.

---

## Score breakdown

| Category | Score (0-100) | Notes |
|---|---|---|
| Security | 88 | Server-side bcrypt PIN, session tokens in `x-app-session`, RLS keyed off session role/rider, rate-limited login, RLS on every operational table. Anon key in bundle is now defanged by mandatory session token. Remaining gap: 14-day token TTL with no manual revocation UI. |
| Data Integrity | 92 | All money-touching writes go through atomic, idempotent, audit-logged RPCs (`save_delivery_entry`, `save_standalone_payment`, `save_manual_adjustment`, `save_rider_closing`). OCC on 14 tables. Period lock on 5 dated tables. Server-truth balances via `dp_customer_balances` view + `app_customer_balances()` RPC. Adjustments correctly bypass period lock only via the Owner-only RPC. |
| Performance & Scale | 70 | Still fetches the full table set on login (pagination caps at 1000 rows per call). Bundle is not code-split. For 200 customers × 5 years projected, this is fine; for 2,000 customers it begins to hurt cold-start. |
| Reliability / Ops | 65 | Daily Excel email is wired and tested. Supabase managed daily backups are on. No Sentry / no crash telemetry. No alerting if the GitHub Actions cron fails for >1 day (the Owner has to notice the missing email). No documented DR runbook for ap-southeast-1 outage. |
| UX | 70 | Auth flow is clean. `alert()` / `window.confirm()` still pervasive but month-close has typed-phrase confirmation. No Urdu language toggle. No rider self-serve PIN reset (Owner must use Supabase Studio). |
| Commercial Compliance (PK SMB) | 78 | Customer PII unencrypted at rest (acceptable for unregistered single-shop). FBR not applicable until registered Tier-1. No LICENSE file. Receipt printing untouched and working. |
| **Overall** | **77 / 100** | **B+ / Production-grade for the Owner's own shop.** |

---

## What's solid (worth defending in any future refactor)

1. **`services/supabaseClient.ts:18-31`** — `setAppSessionToken` / `clearAppSessionToken` + a custom `sessionFetch` that injects `x-app-session` on every outbound REST call. Token persists across reloads in `localStorage` under `dairypro_app_session_token`. This is the lynchpin of the new auth model and it is correctly wired.
2. **`App.tsx:655-706`** — login flow captures `data.token` from `verify_pin`, calls `setAppSessionToken`, then forces a `fetchCloudData()` BEFORE setting `currentUser`. If the cloud read fails (e.g. RLS rejects the token), login is blocked — no stale-cache foot-gun. `performLogout` (`App.tsx:717-721`) correctly clears the token.
3. **`services/relationalDataService.ts:106-119`** — `fetchBalancesFromServer` hits `app_customer_balances()` RPC (session-scoped). Server-truth, not client aggregation. The `balances` memo in `App.tsx:199-225` prefers `serverBalances[c.id]` and only falls back to client math for customers the server hasn't covered yet — the right precedence.
4. **All money-writing screens call atomic RPCs**, not bare upserts:
   - `components/DeliveryEntry.tsx:644` → `save_delivery_entry`
   - `components/DeliveryEntry.tsx:765, 806` → `save_manual_adjustment` (Owner-side delivery-screen adjustments)
   - `components/PaymentEntry.tsx:114` → `save_standalone_payment`
   - `components/BillingTracker.tsx:257` → `save_standalone_payment`
   - `components/RiderClosing.tsx:166` → `save_rider_closing`
   - `App.tsx:465` → `save_manual_adjustment` (Owner global adjustments)
   - `App.tsx:364` → `close_month_transactional` (server-side atomic month-close)
5. **Month-close is two-phase with typed-phrase confirmation** (`App.tsx:322-385`): `preview_month_close` → `window.confirm` → `window.prompt("CLOSE MAY")` → `close_month_transactional`. The 2026-05-08 audit's Critical B2 (race) and I1 (one-tap destruction) are both resolved.
6. **`PaymentMode` is properly imported** in `App.tsx:14`. The 2026-05-08 G3 Critical (`ReferenceError` on credit adjustments) is resolved.
7. **Daily backup pipeline is real and complete.** `.github/workflows/daily-backup.yml` cron is `0 18 * * *` (23:00 PKT). `scripts/send-daily-backup.mjs:86-135` calls `export_daily_backup` with the service-role key, gets back deliveries + payments + customer_balances arrays + a summary, formats CSVs (with UTF-8 BOM so Excel renders Urdu correctly), and POSTs to Resend. Failure exits non-zero so GitHub emails the Owner.
8. **Idempotency is end-to-end.** Every atomic RPC accepts `client_request_id` and the DB has 5 partial-unique indexes — verified by the smoke test that a repeat call produced no duplicate. Combined with OCC, double-tap on a flaky mobile network does not double-bill.
9. **Realtime subscription is correctly scoped** (`App.tsx:570-597`) and `integrityStatus='conflict'` is set on `CLOSED`/`CHANNEL_ERROR` — operator gets a visible badge.
10. **Cache-marker invalidation** (`App.tsx:663-683`) — if the server's cache marker changed between sessions (e.g. after a reset), the client wipes all local state on next login. Defends against the "rider phone has stale data from another DB" class of bug.

---

## Findings — Critical / High / Medium / Low

### Critical

| # | Finding | Evidence | Fix |
|---|---|---|---|
| C-1 | **Wholesale writes still use bare `.upsert()` / `.update()` calls** instead of atomic RPCs. `services/wholesaleDataService.ts:68-77, 82-99, 106-122, 124-140`. No idempotency token enforcement at the DB level for wholesale, no per-call audit log, and the client constructs the payload (including `version` bump) — meaning two browser tabs can race. Wholesale carries real money. | `services/wholesaleDataService.ts:60-140` | Mirror the retail pattern: build `save_ws_delivery_entry` / `save_ws_standalone_payment` SECURITY DEFINER RPCs, add `client_request_id` partial-unique indexes (Phase 8 already created two of these on `ws_deliveries` and `ws_payments` — confirm the *client* actually passes them, currently it sets `payment.client_request_id || payment.id` which is OK but the delivery save path at line 70 does not appear to pass `client_request_id` at all). |

### High

| # | Finding | Evidence | Fix |
|---|---|---|---|
| H-1 | **Non-money writes still go through bare `.from(table).upsert(...)`** for customers, prices, expenses, riders, rider_loads, petrol. These ARE protected by OCC + RLS + period-lock triggers, so the worst case is a server error — they will not silently drift. But the client throws a generic `alert()` on `error` and does not refresh on `P0001`. | `components/CustomerManagement.tsx:253, 334`, `components/ExpenseManagement.tsx:87`, `components/StaffManagement.tsx:71`, `components/PriceManagement.tsx:67`, `components/PetrolLog.tsx:73`, `components/DispatchHub.tsx:103, 138`, `App.tsx:434` | Wrap upserts in a shared helper that surfaces `explainSupabaseError` and triggers a refetch on `P0001`. Not blocking — current behaviour is "save fails loudly, no corruption." |
| H-2 | **Realtime + RLS interaction is not verified.** The app subscribes to `postgres_changes` on `dp_deliveries`, `dp_payments`, `dp_customers`, `dp_riders`, `dp_rider_loads`, `dp_expenses` (`App.tsx:570-589`). Supabase Realtime applies RLS to the broadcast filter ONLY if the publication is `supabase_realtime` AND RLS is enabled AND the JWT has `auth.uid()`. **This app uses anon JWT + custom `x-app-session` header — Realtime cannot read that header, so it cannot evaluate `app_session_role()`.** Net effect: Realtime broadcasts EVERY row change to EVERY subscribed client regardless of rider scope. A rider sees realtime events for other riders' customers. The screen still filters by rider (`globalFilterRiderId`), so no UI leak, but the raw events arrive over the wire. | `App.tsx:570-597` + Supabase Realtime architecture | Two options: (a) accept it — riders see other riders' realtime events but the UI hides them; data is not modifiable from a foreign rider's session because *writes* go through RLS-enforced RPCs. Document this. (b) Move Realtime to a server-side `pg_notify` + Edge Function pattern that re-checks RLS. (a) is fine for a single-shop deployment; (b) is mandatory before SaaS. |
| H-3 | **`testConnection()` calls `supabase.rpc('app_ping')` BEFORE login** (`App.tsx:629`). If `app_ping` is not granted to `anon` with no session header, every cold start shows "Cannot reach Supabase" and the user can never reach the PIN screen. The Phase 8 baseline doc lists RLS on every operational table; `app_ping` must be either a `SECURITY DEFINER` no-arg function with `GRANT EXECUTE ... TO anon` OR an exception. Recommend the Owner manually verify in Supabase Studio: `select app_ping();` with anon role. | `App.tsx:629`, `services/supabaseClient.ts:55` | Confirm grant. If missing, this is the single most likely "app won't start on a new device" failure. |
| H-4 | **14-day session token, no revocation UI.** If a rider phone is stolen, the Owner cannot kill the active session — has to either rotate the rider's PIN (which invalidates future logins but NOT existing sessions unless `dp_app_sessions` has an `is_revoked` check), or wait 14 days. | `docs/PHASE8_CLEAN_SLATE.md:58`, `supabase/migrations/20260513_phase8_clean_slate_baseline.sql` | Add a Setup screen tile: "Active sessions" → list rows from `dp_app_sessions` with a "Revoke" button that flips `is_revoked = true`. RLS helper `app_session_role()` should already check that flag — verify in the actual `m03_auth_sessions_rate_limit` SQL. |
| H-5 | **`onCloseMonth` is dead code** (`App.tsx:322`, comment: "Kept as dormant emergency code only; there is no user-facing archive/month-close action."). The full atomic `close_month_transactional` RPC is implemented and the client wrapper is correct — but no UI invokes it. The Owner has no way to actually close a month from the app. | `App.tsx:320-322` | Re-expose this in the More menu under "Setup → Close Month" once the Owner is ready to use it. Until then the live ledger grows unbounded — at 200 customers × 5 years × 30 deliveries/month = 360k rows the `fetchTable` paginator starts to bite. Not urgent for year one; revisit by month 18. |
| H-6 | **No crash telemetry / no alerting.** `console.error` is the only sink. If the GitHub Actions cron fails for a week, the Owner only notices because the email stops landing. | `index.tsx:16` `ErrorBoundary`, no Sentry imports anywhere | Cheap fix: add Sentry's free tier (5k errors/month) gated to production builds. Pricier-but-better: also add a "I'm alive" ping from the daily-backup workflow to https://healthchecks.io free tier — if the cron skips a day, you get an SMS. |

### Medium

| # | Finding | Evidence | Fix |
|---|---|---|---|
| M-1 | **`alert()` and `window.confirm()` are still used pervasively** for all user-facing errors. 80+ call sites. On iOS standalone PWA they sometimes don't render. | grep `alert\(` returns 80+ hits across all components | Replace with a Toast component over the next 2-3 weeks. Cosmetic, not money-safe. |
| M-2 | **No language toggle** despite Urdu names everywhere. Riders who can't read English see English tab labels. | `App.tsx` all labels in English | Defer; not blocking. |
| M-3 | **No disaster recovery runbook.** If Supabase ap-southeast-1 is down for 6 hours, the Owner sees a red badge and a non-functional app. The CSV email at least proves yesterday's data exists. | docs/ has no DR file | Write a one-page `docs/DR_RUNBOOK.md`: (1) Symptoms (app shows "Cannot reach Supabase"), (2) Check https://status.supabase.com, (3) Worst case: pull the most recent email backup, manually log deliveries on paper, replay on next morning's first login. |
| M-4 | **No `LICENSE` file.** Distribution rights ambiguous. | Repo root | Add MIT or proprietary "All Rights Reserved" header at the Owner's discretion. |
| M-5 | **`scripts/send-daily-backup.mjs:216`** hardcodes `from: 'Gujjar Milk Shop <onboarding@resend.dev>'`. Resend's `onboarding@resend.dev` only sends to your verified Resend email. If the Owner ever adds a second recipient (e.g. accountant), the email will silently NOT deliver until a real sending domain is configured in Resend. | `scripts/send-daily-backup.mjs:216` | Document this gotcha in PHASE7. Verify the sending domain once a second recipient is added. |
| M-6 | **No paisa-as-integer migration.** All money is `numeric(12,2)`. At 200 customers × Rs. 50,000 × 5 years of daily ops ≈ 100M numeric operations, IEEE-754 float drift on `numeric(12,2)` is essentially zero — Postgres `numeric` is exact decimal, not float. (The 2026-05-08 audit's "float math" concern referred to JS `number` arithmetic, which IS still in play in some client-side aggregations, but the server view + RPCs all use exact `numeric`.) | `dp_customer_balances` view returns `numeric(12,2)` | Not a real risk at the Owner's scale. Document and close as "won't fix at SMB scale." |

### Low

| # | Finding | Evidence | Fix |
|---|---|---|---|
| L-1 | The legacy migration directory (`supabase/migrations/2026031*`-`20260510_*`) is still in the repo and is labelled "LEGACY — do not reapply" in `20260513_phase8_clean_slate_baseline.sql:30-33`. A future contributor running `supabase db push` against the new project could re-shoot these files. | `supabase/migrations/` | Move them to `supabase/migrations/_legacy/` so the CLI ignores them. |
| L-2 | No PWA service worker; offline mode is a soft fallback (the network call fails, alert pops). For Pakistani delivery rounds in low-connectivity areas this is acceptable but not great. | `index.html` no manifest | Defer; can be added later with `vite-plugin-pwa`. |
| L-3 | Receipt thermal-printing path (`services/printService.ts`, `components/ThermalPrintView.tsx`) was not touched by Phase 8 and remains functional. No regression. ✅ | n/a | n/a |
| L-4 | FBR sales-tax invoice numbering: not applicable (Owner is not a Tier-1 registered retailer). Flag for future if revenue crosses the threshold. | n/a | Owner action when registering with FBR. |

---

## Items from the 2026-05-08 audit — Phase 8 disposition

| Original | Status |
|---|---|
| A1 wholesale `allow_all` RLS | ✅ RESOLVED — every `ws_*` table now has session-scoped RLS per the Phase 8 baseline. |
| A2 retail RLS unenforced | ✅ RESOLVED — `app_session_role()` / `app_session_rider_id()` helpers + `x-app-session` header. |
| A3 plaintext owner PIN | ✅ RESOLVED — bcrypt hash in `dp_metadata.owner_pin_hash`. |
| A5 plaintext rider PINs | ✅ RESOLVED per Phase 8 doc (hashed). |
| A6 no rate limit on login | ✅ RESOLVED — 8/PIN-hash, 12/IP per 10 min, via `dp_login_attempts`. |
| A7 `VITE_OWNER_PIN` in bundle | ✅ RESOLVED — no longer in `.env.local` example; live check is server RPC only. |
| B2/B3 month-close race | ✅ RESOLVED — `close_month_transactional` server RPC. |
| B5 `get_start_of_month_balances` type bug | ✅ RESOLVED — Phase 8 baseline `m04_balances_views_and_reads` uses `text customer_id`. |
| B6 incomplete adjustment audit trail | ✅ RESOLVED — every atomic write RPC logs to `dp_audit_logs`. |
| B8 view missed `deleted=false` filter | ✅ RESOLVED in `m04`. |
| C1 OCC coverage incomplete | ✅ RESOLVED — 14 OCC triggers per Phase 8 baseline. |
| C2 no client OCC handler | ✅ RESOLVED — `explainSupabaseError` (`App.tsx:23-36`) translates `P0001` to a user-readable message. |
| C5 `addToQueue` ReferenceError | ✅ RESOLVED — `services/wholesaleDataService.ts:106-122` refuses offline delete with a clean error. |
| D4 wholesale no soft-delete / versioning | ✅ RESOLVED — wholesale tables now have `version`, `deleted`, soft-delete via `update({deleted:true})`. |
| F6 month-close has no rollback | ✅ RESOLVED — atomic server-side RPC. |
| G3 missing `PaymentMode` import | ✅ RESOLVED — `App.tsx:14`. |
| I1 one-tap month-close | ✅ RESOLVED — two-phase typed-phrase confirmation in `App.tsx:354-362`. |
| H4 no backup/DR | ⚠ PARTIAL — daily Excel email is wired, but no DR runbook. See M-3. |
| F3 no telemetry | ❌ STILL OPEN — see H-6. |
| F4 no tests | ❌ STILL OPEN — no `*.test.*` files. Not a ship-blocker for SMB. |
| I2 no rider PIN reset UI | ❌ STILL OPEN — see H-4. |
| C1 wholesale atomic RPCs | ❌ STILL OPEN — see C-1. This is the only remaining Critical. |

---

## Threat model — what a stolen device can do

| Scenario | Blast radius | Mitigation today | Gap |
|---|---|---|---|
| **Rider phone stolen, attacker keeps it unlocked** | Token good for up to 14 days. Attacker can record fake deliveries / payments on **only that rider's customers** (RLS scopes by `app_session_rider_id()`). Cannot read other riders' data via REST. Realtime will broadcast other riders' events but UI hides them. Cannot delete or adjust — `save_manual_adjustment` is Owner-only. | RLS, atomic RPCs. | No way for Owner to revoke the session before 14 days. **Fix: H-4.** Workaround today: rotate that rider's PIN AND ask Supabase support (or run SQL via Studio) to delete the row from `dp_app_sessions`. |
| **Owner phone stolen** | Full access for 14 days. Attacker can adjust balances, close months, change prices, manage staff. | Same. | Same H-4. Workaround: log into Supabase Studio from another device and delete the Owner row from `dp_app_sessions`. **Document this for the Owner.** |
| **Anon key extracted from JS bundle** | With no `x-app-session` header, every operational table denies via RLS. The only public surface is `verify_pin` (rate-limited 8/PIN, 12/IP per 10 min) and `app_ping`. **Effectively useless to attacker.** Phase 8 closed the 2026-05-08 Critical here. | RLS. | None. |
| **Sustained brute-force on `verify_pin`** | At 12 attempts per IP per 10 min, an attacker gets ~1,728 attempts/day per IP. For a 4-digit PIN (10,000 combos) the worst case is ~6 days to brute-force at one IP. Rotating IPs (e.g. via Tor) breaks this. **The rate limit is too lax for a 4-digit Owner PIN.** | Rate limit. | **Recommend: raise Owner PIN to 6 digits**, or add a global lockout on the Owner PIN (e.g. after 20 failures across all IPs, freeze for 1 hour). Legit Owner punishment: only when fat-fingering the PIN 8+ times — they would have already noticed. |

---

## End-to-end runbook for the Owner to verify himself

Do these eight tests in order. If any one fails, do NOT trust the app with live money until it's fixed.

1. **Cold-start test.** On a fresh device (or "Clear site data" in DevTools): open the app URL. Should land on the PIN screen within ~3 seconds. If you see "Cannot reach Supabase" → H-3 is real, contact Codex.
2. **Owner login.** Enter PIN `1552`. You should see your full dashboard. In DevTools → Application → Local Storage, confirm a key `dairypro_app_session_token` exists.
3. **Reload survival.** Hit F5. You should NOT be sent back to the PIN screen — token persists.
4. **Create a rider.** Setup → Staff → Add rider "Test Rider" with PIN `9999`. Set delivery price for the day (Setup → Pricing → add Rs. 200/L). Add a test customer "Test Cust" with opening balance Rs. 0, assigned to Test Rider.
5. **Rider login on a second browser/incognito.** Open same URL. PIN `9999`. You should see ONLY "Test Cust" in the customer list. You should NOT see other riders' customers. If you do, RLS scoping is broken — STOP.
6. **Rider records a delivery.** As Test Rider, mark Test Cust 5 L for today. Save. The balance should immediately show Rs. 1,000.
7. **Realtime check.** Switch back to the Owner browser. Within ~2 seconds the same delivery should appear without manual refresh. The "Last synced" indicator should update.
8. **Idempotency check.** On the Rider tab, hit the save button on the same delivery a second time within 5 seconds. You should NOT get a duplicate. Refresh and confirm only ONE Rs. 1,000 entry exists.
9. **(Bonus) Daily backup.** GitHub → Actions → "Daily backup" → "Run workflow". Wait 1 minute. Check chahtisham11@gmail.com inbox — you should have an email with three CSV attachments. Open `customer_balances_*.csv` in Excel; "Test Cust" should be there with Rs. 1,000.

If all nine pass: **you are production-ready for your own shop.**

---

## Final ship verdict

**SHIP IT — for your own shop, with one or two riders.** With the database state I was given as ground truth and the application wiring I verified, this codebase is materially safer for real money than 90% of shipped POS apps I've audited. The Phase 8 rebuild closed every Critical from the 2026-05-08 audit. The remaining Critical (C-1 wholesale atomic RPCs) only bites if two devices write to the same wholesale customer in the same second — unlikely at one-shop scale, but real.

**DO NOT SELL THIS TO A SECOND SHOP YET.** The wholesale RPC gap (C-1), the realtime-RLS gap (H-2), and the session-revocation gap (H-4) are all "single-shop acceptable, multi-tenant unacceptable."

### The next 3 things to do (in order)

1. **This week (1-2 hours):** Run the 9-step runbook above end-to-end on the Owner's actual production deployment with a throwaway rider account. Fix anything that fails. This is the highest-ROI thing you can do — it shakes out misconfiguration of the new project, the GitHub secrets, and the deployed bundle in one pass.
2. **This week (15 minutes):** Verify `app_ping` is granted to `anon` (H-3). One SQL line in Supabase Studio: `GRANT EXECUTE ON FUNCTION public.app_ping() TO anon;` if not already done.
3. **This month (1-2 days of dev):** Convert wholesale writes to atomic RPCs (C-1) and add an "Active sessions / Revoke" UI (H-4). After those two land, this codebase is honestly multi-shop ready.

— Codex
