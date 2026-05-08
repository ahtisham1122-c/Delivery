# Commercial / Production-Readiness Audit
**App:** Gujjar Milk Shop (DairyPro Pakistan Cloud) — React 18 + Vite + Supabase
**Date:** 2026-05-08
**Audit scope:** retail (`dp_*`) + wholesale (`ws_*`) modules, full client + SQL surface
**Companion to:** `PRODUCTION_AUDIT.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`. This audit goes deeper than the original with file:line evidence.

---

## Executive verdict

**Overall production-readiness score: 38 / 100 — Grade: D+**

Functionally rich, visually polished, and architecturally aware (you already have OCC triggers, server-side `verify_pin`, a `dp_customer_balances` view, and an audit log table). But the spine that has to hold up real money — **authentication, authorization, concurrency, deletion safety, and offline integrity — has known and unfixed holes that this audit can demonstrate with grep.** The wholesale module in particular is held together with `allow_all` policies and a function-not-defined bug.

| Recommendation | Verdict |
|---|---|
| Ship to a single-shop pilot you personally control? | **Yes, with caveats** — patch the top-5 blockers below first, then it's safe enough for one trusted operator with daily backups. |
| Ship as multi-tenant SaaS? | **No.** Re-platform auth + tenancy first. Today, anyone with the anon key has full DB access via the wholesale `allow_all` policies and any retail rider PIN. |
| Shop the same code to a second customer with the same Supabase project? | **No.** No tenant key anywhere; both customers would share `dp_customers`. |

---

## A. Security & Auth — **CRITICAL**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| A1 | **Wholesale RLS is `allow_all` for `anon`.** Any holder of the anon key can read/write/delete *every* wholesale customer, delivery, payment, invoice number — bypassing the PIN screen entirely (curl, Postman, another browser tab). | Critical | `supabase/migrations/20260327000000_wholesale_module.sql:78-82` |
| A2 | **Retail RLS is effectively false-deny but unenforced because the app uses anon role.** Policies key off `current_setting('app.user_role')` / `current_setting('app.current_rider_id')`, neither of which the React client ever sets (no `set_config` RPC call exists). The fact that the app reads/writes data at all means RLS is being bypassed — either RLS isn't actually in force on this project, or the app is being run with a key that sidesteps it. The migration *enables* RLS but the policies all evaluate to NULL→false for anon, which would make the app non-functional. **Confirm in Supabase Studio whether `dp_*` RLS is on; if it is, the app cannot be writing through it.** Either way the auth model is broken. | Critical | `supabase/migrations/20260313_enable_rls.sql:7-79`; `App.tsx:644` calls only `verify_pin`, no `set_config`. |
| A3 | **Owner PIN stored as plaintext in `dp_metadata`** and seeded as `'1552'` directly in a migration committed to source. `verify_pin` does a plain `=` comparison (no hash, no constant-time compare → timing attack feasible against the default). | Critical | `supabase/migrations/20260427_fix_auth.sql:3` and `:17`. Example: anyone who fetches `dp_metadata` from the anon endpoint reads the live PIN. RLS is "disabled for metadata to prevent sync blockers" per `20260308_initial_schema.sql:184`. |
| A4 | **`dp_metadata.value BIGINT`, but it stores the PIN as text.** The migration inserts `'1552'` into a `BIGINT` column; works only because Postgres casts. If the owner PIN is ever changed to anything non-numeric (e.g. `'A1B2'`), insert fails. | High | `20260308_initial_schema.sql:171` (`value BIGINT`); `20260427_fix_auth.sql:3,15`. |
| A5 | **Rider PINs are stored plaintext** in `dp_riders.pin` (TEXT). Anyone who reads that table (anon, see A2) gets every rider's login. | Critical | `20260308_initial_schema.sql:11`; `20260427_fix_auth.sql:23-25`. |
| A6 | **No rate-limiting / lockout / audit on failed login.** `handleLogin` retries unbounded; nothing logs failures to `dp_audit_logs`. Brute-forcing 4-digit PINs over `verify_pin` is trivial (10⁴ attempts). | High | `App.tsx:637-670`. |
| A7 | **`VITE_OWNER_PIN=1552` baked into the bundle.** Even though it's no longer the live check, it's still defined into client code by `vite.config.ts:13` and shipped in `dist/`. Plus `.env` (with the same PIN and full anon key) is on disk; gitignored, but lives in the build server. | High | `vite.config.ts:13`; `.env:3`. |
| A8 | **Anon key is committed to repo? No — it's in `.env` and gitignored, but it's also baked into every `dist/` bundle anyway.** Anyone who installs the PWA can pull it from `localStorage` or DevTools. With A1 + A5, that's full DB access. | High | `services/supabaseClient.ts:4-14` (read from `import.meta.env`). |
| A9 | **No CSP / no SRI / no `referrerpolicy`.** `index.html` loads Google Fonts; no `Content-Security-Policy` meta or header configured. | Medium | `index.html` (whole file). |
| A10 | **No XSS via `dangerouslySetInnerHTML`** — confirmed clean (`grep` returned 0 hits). However: customer names are interpolated unescaped into thermal-print HTML via `renderToStaticMarkup` and into WhatsApp `wa.me` links — if a rider names a customer `<script>` it'd render fine in React but in print HTML it's escaped by React, and in WhatsApp the message is URL-encoded. **Low residual XSS risk** but PII (phone) does land in clear-text WhatsApp deeplinks (B/H risk, see H). | Low | `services/printService.ts:30-45`; `components/DailyWhatsAppUpdates.tsx:79`. |
| A11 | **`testConnection()` queries `dp_metadata` with anon key** — if the metadata RLS is later enabled, the app silently appears "offline." | Low | `services/supabaseClient.ts:36`. |

---

## B. Financial integrity — **HIGH**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| B1 | **Float math throughout.** `.reduce` over money runs in 24 files (App.tsx, Dashboard, Ledger, BillingTracker, Analytics, FinancialSummary, ReceivablesView, RiderClosing, BusinessInsights, SessionIntelligence, exportService, ledgerUtils, wholesale\* …). The `Math.round(x*100)/100` guard in `App.tsx:173` and `:273` only saves the *final* aggregate — partial sums during reduce are still drift-prone for ≥10⁵ records. Long-term fix is paisa-as-integer; the codebase doesn't do it anywhere. | High | `App.tsx:160-173, 265-273`; `services/wholesaleDataService.ts:200, 231-233`; `Ledger.tsx:33, 164-165, 189-192`. |
| B2 | **Month-close race condition.** `onCloseMonth` (`App.tsx:248-375`) is not transactional: it (1) writes archive, (2) updates customers, (3) soft-deletes deliveries/payments by date range `1970-01-01 → endOfMonth`, (4) writes audit log. **A rider posting a delivery dated `<= endOfMonth` while step 3 is running can either (a) be soft-deleted before it lands in the archive payload, or (b) land *after* archival but *before* soft-delete and be wiped silently.** Either way: ledger drift, no error. The "closing balances" snapshot is taken from the *client's* current state at the start of the function, not from the DB at the moment of close. | Critical | `App.tsx:255-353`. |
| B3 | **Soft-delete uses `1970-01-01` lower bound** and runs **five separate `update`s** with no transaction. If `dp_payments` succeeds and `dp_expenses` fails, you have a half-closed month with no rollback path. | High | `App.tsx:347-351`. |
| B4 | **`reconcileBalancesWithArchives` overwrites `openingBalance`** with the archive's `closingBalances[customerId]` if it differs by >0.01 — but it does **not** simultaneously soft-delete or otherwise account for active deliveries/payments still in the active ledger from after that archive. Running it twice or on a partially-closed month silently double-counts. No dry-run. | High | `App.tsx:377-432`. |
| B5 | **`get_start_of_month_balances` RETURNS TABLE (customer_id uuid, …) but `dp_customers.id` is TEXT.** Postgres will throw on first call after deploy. Either this RPC has never been exercised, or someone manually patched it on prod. The client expects `row.customer_id` strings, so the fetched balance map will be empty and silently fall back to client-computed openingBalance. | Critical | `supabase/migrations/20260427_start_month_balances.sql:2`; `services/relationalDataService.ts:138`. |
| B6 | **Adjustment audit trail is incomplete.** Only Owner-side `handleManualAdjustment` writes to `dp_audit_logs`. Rider deliveries, rider closings, expense edits, customer edits, price changes, and **all wholesale mutations** never insert into `dp_audit_logs`. So "who deleted/edited X" is unanswerable. | High | `App.tsx:481-493` is the only `dp_audit_logs.upsert` outside of month-close. Wholesale module (`services/wholesaleDataService.ts`) has zero audit logging. |
| B7 | **`findPriceForDate` throws if no price record exists** — caught in `DeliveryEntry.tsx:97` with `try/catch` that sets rate to `-1`, but other callers (`exportService`, `ledgerUtils`?) don't. A missing price for an old date will crash the export or ledger render. | Medium | `services/dataStore.ts:94`. |
| B8 | **`dp_customer_balances` view lacks `WHERE deleted = false` filter.** It sums over **all** deliveries/payments including soft-deleted ones, so post-close it returns wrong numbers. (Compare with `get_start_of_month_balances` which *does* filter.) Currently unused at runtime, but documented as the canonical mirror. | High | `supabase/migrations/20260310_add_ledger_view.sql:5-15`. |
| B9 | **No rounding consistency.** `formatPKR` rounds to 0 dp for display; balances are rounded to 2 dp internally; SQL view returns un-rounded; `get_start_of_month_balances` does `ROUND(...)` (0 dp). Three different rounding behaviors race each other. | Medium | `services/dataStore.ts:24-30`; `supabase/migrations/20260427_start_month_balances.sql:27`. |
| B10 | **Realtime handler does `record as unknown as Delivery`** — Postgres returns numerics as strings in some configs; `Number(d.totalAmount)` silently turns those into NaN-prone aggregations. Already partly defended in `App.tsx:163` with `isNaN(val) ? 0 : val` but a NaN from realtime silently zeros a delivery instead of erroring. | High | `App.tsx:516, 524, 532, 541, 549, 557`. |

---

## C. Concurrency & sync — **HIGH**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| C1 | **OCC trigger covers only 5 tables.** `dp_customers, dp_deliveries, dp_payments, dp_expenses, dp_riders` have it. Missing: `dp_archives, dp_audit_logs, dp_rider_loads, dp_closing_records, dp_prices, dp_milk_inwards`, **and every `ws_*` table**. So concurrent month-close + concurrent rider-load edits = last-write-wins on archives/loads. | Critical | `supabase/migrations/20260427_enforce_occ.sql:20-43` (5 triggers); compare `dp_*` table list at `20260308_initial_schema.sql`. |
| C2 | **Client never handles `P0001` / OCC rejection.** `grep "P0001"` returns one hit (the SQL file). Every component does `await supabase.from(t).upsert(…)` and either `setIntegrityStatus('conflict')` (App.tsx) or `alert('Save failed.')` (DeliveryEntry.tsx:83). User has no way to merge or refetch — they just retry, increment version, and clobber whatever the other device wrote. | High | `App.tsx:223, 591, 619, 629`; `components/DeliveryEntry.tsx:83`. |
| C3 | **Realtime channel has no resubscribe on flap.** When status === `'CLOSED'` or `'CHANNEL_ERROR'` the code only sets `integrityStatus='conflict'` (App.tsx:590-591). No retry, no notification to user, no re-`fetchAll`. The "Sync" button in the header is the only manual recovery. | High | `App.tsx:586-593`. |
| C4 | **Realtime never clears `integrityStatus='conflict'` on a *fetch* failure**, only on a successful resubscribe (`SUBSCRIBED`). So one transient network blip leaves the badge red forever until manual refresh. | Medium | `App.tsx:586-593`. |
| C5 | **`addToQueue` is referenced but never defined or imported.** In `services/wholesaleDataService.ts:94` and `:110`, the offline-fallback path will throw `ReferenceError: addToQueue is not defined` the first time a rider deletes a wholesale delivery while offline. Dead code path, but it's the *fallback*, so the rare case is the broken case. | Critical | `services/wholesaleDataService.ts:94, 110`. |
| C6 | **No offline write queue exists at all** for the retail module. Every component imports `supabase` directly and calls `.upsert()` synchronously inside `handleSave*`. If the device is offline, the upsert promise rejects, the state is set optimistically, and the rider thinks the entry saved. On reload from another device the entry is gone. | Critical | DeliveryEntry.tsx, BillingTracker.tsx, RiderClosing.tsx, etc — they all share this pattern. |
| C7 | **Optimistic updates aren't rolled back on failure.** Adjustments append to local state *before* awaiting the upsert (`App.tsx:463, 478`); if Supabase rejects (e.g. OCC), local state is now ahead of the cloud. Next realtime event will reconcile, but if the realtime channel is in `CLOSED` state (C3) the local + DB diverge until a manual refresh. | High | `App.tsx:434-502`. |
| C8 | **No `onConflict` clause on most upserts.** Most `.upsert(record)` calls let Supabase use the PK only; with the partial unique constraint `unique_delivery_per_day` (`20260313_add_unique_constraints.sql:38-41`), **two riders writing different IDs for the same `(customer, date, rider)` will both succeed because the upsert key is `id` and the partial unique constraint isn't matched** → duplicate active deliveries that the `Map`-by-id dedupe in App.tsx:157 cannot detect. | High | All retail upsert call sites; partial unique constraint at `20260313_add_unique_constraints.sql:35-55`. |
| C9 | **`generateId()` falls back to `Math.random().toString(36)` if `crypto.randomUUID()` is unavailable** — collision risk on old Android WebViews. PK is text, so collisions land as PK conflicts → silent upsert overwrites the older record. | High | `services/dataStore.ts:13-19`. |
| C10 | **Wholesale realtime is a "bump refresh key" pattern** that re-fetches the whole table on every change (per `docs/ARCHITECTURE.md:124`). With ≥10 simultaneous wholesale customers active, this is O(n²) bandwidth. | Medium | `services/wholesaleDataService.ts:fetch*` + `WholesaleHub` (per ARCHITECTURE.md). |

---

## D. Data model — **HIGH**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| D1 | **`dp_archives.payload` is a JSONB blob containing month-deliveries + payments + expenses arrays.** Searching across archives ("when did customer X last receive a price adjustment in 2025?") requires `payload->>'deliveries' @>` JSON queries with no indexes. `BusinessInsights.tsx` reads archives client-side and aggregates with `.reduce` — at 12 months × 500 customers × 30 days that's ~180k JSON-parsed objects per render. | High | `20260308_initial_schema.sql:129-137`; archives never get GIN'd. |
| D2 | **No FK cascade defined** for `dp_customers.id → dp_deliveries.customer_id`. Default is `NO ACTION`. If owner tries to "delete a customer" they have to soft-delete because hard delete is blocked by the FK — but there's no UI showing this, so the failure path is silent. | High | `20260308_initial_schema.sql:51` (no `ON DELETE` clause). |
| D3 | **Soft-delete filtering is inconsistent.** Client filters `!d.deleted` everywhere, but `dp_customer_balances` view does not (B8). `relationalDataService.fetchTable` returns deleted rows; the client `sanitize` filters them at App level — but realtime upserts of `deleted=true` records *do* arrive and are then filtered. Wholesale tables have **no** `deleted` column at all. | High | `services/relationalDataService.ts:43-83`; `App.tsx:185-188`; `20260327000000_wholesale_module.sql` — no `deleted` columns. |
| D4 | **Wholesale: zero versioning, zero soft-delete, hard `.delete()` calls.** Once a wholesale delivery is deleted it's gone — no audit, no recovery. Generated column `total_amount = quantity * rate` is fine for storage but means deleting a row destroys the only persistent record of a sale. | Critical | `services/wholesaleDataService.ts:82-112`; `20260327000000_wholesale_module.sql:33-47`. |
| D5 | **`dp_customers.id` is TEXT** with client-generated UUIDs (or fallback `Math.random().toString(36)`). Wholesale uses `UUID` PK. Inconsistent. | Medium | `20260308_initial_schema.sql:21`; `20260327000000_wholesale_module.sql:5`. |
| D6 | **No `created_at`** on `dp_deliveries`, `dp_payments`, `dp_expenses`, `dp_rider_loads`, `dp_closing_records`. `updated_at` is the only timestamp; you can't tell when a record was first inserted vs last edited. Critical for forensic audit. | High | `20260308_initial_schema.sql` (all transaction tables). |
| D7 | **`dp_milk_inwards`** table exists but is **not rendered or written** by any component (`grep` confirms). Dead table. | Low | `20260308_initial_schema.sql:140-149`; no UI references. |
| D8 | **`dp_metadata` RLS is disabled** ("to prevent sync blockers") meaning anyone with the anon key can read the owner PIN (A3) and write `system_revision` to anything. | Critical | `20260308_initial_schema.sql:184`. |
| D9 | **`dp_archives` PK is TEXT but version/year/month have no unique constraint.** Closing the same month twice creates two archives. Then `BusinessInsights` and `Ledger.relevantArchive = archives.find(…)` returns the first one and silently ignores the rest. | High | `20260308_initial_schema.sql:129-137`; `Ledger.tsx:115-117`. |
| D10 | **`dp_prices` is missing a unique constraint** on `(customer_id, effective_date)` so two prices effective the same day for the same customer is legal — `findPriceForDate` then breaks ties by `updatedAt` (`dataStore.ts:73`), but this is a hidden ordering bug waiting to bite. | Medium | `20260308_initial_schema.sql:39-47`. |

---

## E. Performance & scale — **MEDIUM**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| E1 | **`App.tsx` keeps every entity in `useState` arrays** and recomputes `balances` (O(C × (D + P))) on **any** delivery/payment/customer change. For 500 customers × 60 active days × 1 delivery = 30k records, every keystroke that lands a delivery causes a full re-aggregate. Worst case ~15M ops per render. | High | `App.tsx:143-176`. |
| E2 | **`relationalDataService.fetchAll`** kicks off 8 paginated `fetchTable` calls in `Promise.all`. Each scans up to N records per `range(0,999)`. No backpressure. With a 50 MB result set on a low-end Android device this OOMs. | High | `services/relationalDataService.ts:110-131`. |
| E3 | **No code-splitting / no `manualChunks`.** Bundle includes recharts + @google/genai + xlsx + jspdf + html2canvas + framer-motion + motion (both!) + lucide. Easily a 1.5–2 MB gzipped initial payload. | High | `vite.config.ts` (no `build.rollupOptions.output.manualChunks`). |
| E4 | **No lazy import of WholesaleHub, Analytics, BusinessInsights, FinancialSummary, SessionIntelligence.** Every screen is imported eagerly at the top of App.tsx (`App.tsx:19-41`). | High | `App.tsx:19-41`. |
| E5 | **localStorage cache writes happen on every state change** with a 300ms debounce (`App.tsx:234-246`). Active editing (50 keystrokes / minute) writes 7 keys × ~50 KB each = ~17 MB/min serialization on the main thread. | Medium | `App.tsx:234-246`. |
| E6 | **No service worker; no PWA install** despite `apple-mobile-web-app-capable` (`index.html:7`). Riders have no actual offline mode — going through a tunnel kills the form mid-save. | High | `index.html` (no `<link rel="manifest">`, no `serviceWorker.register`). |
| E7 | **Every component imports `supabase` directly and triggers writes** — no debouncing, no batching. Two riders adding deliveries simultaneously each fire 1 upsert per row (no batching). | Medium | DeliveryEntry, BillingTracker, RiderClosing, etc. |
| E8 | **`react-window` and `react-virtualized-auto-sizer` are deps but unused for the long lists** (`Ledger`, `BillingTracker`, `DailyLog`). All render with plain `.map()`. Verified by grep — only one usage of `react-window` exists. | Medium | `package.json:21-22`; `grep` shows no `FixedSizeList`/`VariableSizeList` imports outside of one wholesale page. |
| E9 | **`saveDrafts` runs on every `localMilk`/`localCash` keystroke** with no debounce (DeliveryEntry.tsx:108-117). On 500 customers with the swipe view, that's a draft persistence per character. | Medium | `components/DeliveryEntry.tsx:105-117`. |

---

## F. Reliability & error handling — **HIGH**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| F1 | **One global `ErrorBoundary` only.** `index.tsx:16` wraps the whole app; no per-tab boundary. A render error in `BusinessInsights` (Gemini-driven, easy to throw on bad JSON) crashes the entire shell and forces full reload. | High | `index.tsx:16`; `components/ErrorBoundary.tsx:31` (`window.location.reload()`). |
| F2 | **All user-facing errors are `alert()`** — `grep` finds **80 occurrences** in 20 files. Mobile-hostile, blocks the JS thread, sometimes broken inside iOS standalone PWAs, and untranslated to Urdu. | High | `grep "alert\("` 80 hits. |
| F3 | **No telemetry / Sentry / crash reporting.** All errors are `console.error`. The owner has no way to know the rider's app crashed in the field. | High | `grep "Sentry\|datadog\|posthog\|mixpanel\|telemetry"` — no hits. |
| F4 | **No tests.** Zero `*.test.*`, no `vitest`, no `jest` in package.json. | High | `package.json:6-11` has no `test` script. |
| F5 | **Network failures during `fetchCloudData` set status to `'conflict'` and stop** (App.tsx:222-225). No retry, no exponential backoff, no banner. User just sees "conflict" badge with no recovery hint. | High | `App.tsx:222-225`. |
| F6 | **Rejections in `onCloseMonth` show `alert("System Error: Failed to close period.")`** with no log to `dp_audit_logs`, no rollback (B3). | Critical | `App.tsx:369-371`. |
| F7 | **Realtime channel's `CLOSED` status is conflated with conflict.** A user closing a tab triggers `CLOSED`, painting the badge red erroneously on the *next* open. | Low | `App.tsx:590`. |
| F8 | **`storageWarningShownThisSession` is a module-level `let`** — state shared across hot-reloads but resets on actual reload. The warning is one-time-per-session even if the user never resolves it. | Medium | `App.tsx:44`. |

---

## G. Code quality / maintainability — **MEDIUM**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| G1 | **No `tsconfig.json` exists.** Vite uses its default TS settings (no strict mode, no `noImplicitAny`, no `strictNullChecks`). Verified by `Glob "**/tsconfig*.json"` returning empty. | High | (none — file absent). |
| G2 | **ESLint disables `@typescript-eslint/no-explicit-any`**, sets `react-hooks/exhaustive-deps` to `warn`, and disables both `react-hooks/preserve-manual-memoization` and `react-hooks/immutability`. So `any` and stale-closure bugs are tolerated. | High | `eslint.config.js:26-31`. |
| G3 | **`PaymentMode` is referenced but not imported in `App.tsx`** — `handleManualAdjustment` uses `mode: PaymentMode.CASH` (`App.tsx:470`) but `PaymentMode` is not in the import list (`App.tsx:11-14`). This is a guaranteed runtime error the moment a credit adjustment is recorded. **Either build is silently failing somewhere or this code path has never been exercised.** | Critical | `App.tsx:470` vs imports at `App.tsx:11-14`. |
| G4 | **Mixed motion / framer-motion imports.** 6 components import `framer-motion` (DailyLog, DispatchHub, RiderClosing, StaffManagement, PetrolLog, PriceManagement) while the rest import `motion/react`. `framer-motion` isn't a top-level dep — only resolves because `motion` hoists it. A future `motion` upgrade can break 6 screens silently. | High | `grep "framer-motion"` 6 component files; `package.json:18` has only `motion`. |
| G5 | **`record as unknown as Delivery`** in 6 realtime handlers (App.tsx:516, 524, 532, 541, 549, 557) is a type-system bypass that hides the numeric-string risk (B10). | High | `App.tsx:507-560`. |
| G6 | **`App.tsx` is 911 lines** doing auth + global state + sync + realtime + month-close + adjustments + reconcile + tab routing. No reducer, no context, no separation of concerns. | High | `App.tsx` (whole file). |
| G7 | **`relationalDataService.toCamelCase`/`toSnakeCase` blindly map every key.** Boolean `is_locked` → `isLocked` is fine, but it also converts library/internal keys like Postgres-returned `_count` weirdly. No allowlist. | Medium | `services/relationalDataService.ts:12-38`. |
| G8 | **Comment "strictly strictly greater than" (typo doubled)** in OCC trigger SQL — minor but indicative of low-review SQL. | Low | `20260427_enforce_occ.sql:8`. |
| G9 | **README is the AI Studio default**, no LICENSE file, no CONTRIBUTING. | Medium | `README.md` (per CLAUDE.md note). |
| G10 | **`metadata.json` has typo "Appp"** — appears in user-facing login text (App.tsx:752 "Official Appp") and metadata.json:2. Trust signal hit. | Low | `metadata.json:2`; `App.tsx:752`. |

---

## H. Compliance / business risk for Pakistan SME — **MEDIUM**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| H1 | **Customer phone + address stored unencrypted.** Acceptable for a single shop pre-PECA enforcement, but if you sell this to a 2nd shop or aggregate to a SaaS, Pakistan's PDPA-style draft + the Telecom CPA require minimum baseline encryption + breach notification. | High | `20260308_initial_schema.sql:23-25`; no encryption helpers. |
| H2 | **WhatsApp updates use `wa.me` deeplinks with PII in the URL.** The customer's name + balance are URL-encoded into the deeplink — these get logged in WhatsApp Business chat history but also any URL referer if the user fat-fingers the sharesheet. | Medium | `components/DailyWhatsAppUpdates.tsx:79`. |
| H3 | **No GST / FBR invoice numbering.** Wholesale invoices are sequential `INV-####` from `ws_metadata.last_invoice_number` (`20260327000000_wholesale_module.sql:68`). FBR Tier-1 retailer regs require POS integration / FBR-issued invoice numbers above the registration threshold. If the shop crosses the threshold, the wholesale receipts won't pass an FBR audit. | Medium | `20260327000000_wholesale_module.sql:62-68`. |
| H4 | **No backup / DR plan documented.** Supabase free tier + no scheduled XLSX export anywhere. Manual export only via `exportService.exportToExcel(...)`. Single Supabase project loss = total data loss. | Critical | `services/exportService.ts` (manual only); no scheduled job in any migration. |
| H5 | **No `LICENSE`** — distribution / resale rights are unclear. | Medium | (file absent). |
| H6 | **WhatsApp PII**: phone + balance + name go to a third-party messaging app the shop doesn't control. Need user consent at customer onboarding. | Medium | `components/DailyWhatsAppUpdates.tsx`. |
| H7 | **Receipt branding is hard-coded.** "Gujjar Milk Shop" is everywhere as a string literal — multi-tenant resale would require a refactor. | Low | `App.tsx:751, 780`; `index.html:10`; `services/printService.ts` styles. |

---

## I. UX gotchas — **HIGH**

| # | Finding | Severity | Evidence |
|---|---|---|---|
| I1 | **Month-close is irreversible and gated only by `window.confirm()`** (App.tsx:250). One tap = ledger destroyed, no undo, no dry-run preview. **Owner must literally type the month name** as a confirmation, but the UI doesn't require it. | Critical | `App.tsx:250-252`. |
| I2 | **Rider PIN reset = manual SQL.** No "I forgot my PIN" flow; owner must edit `dp_riders.pin` from a Supabase Studio session. Real-world Pakistani delivery boys lose phones; this WILL happen. | High | (no UI — confirmed by absence). |
| I3 | **`window.confirm` / `alert` everywhere** breaks in iOS standalone PWAs (after `apple-mobile-web-app-capable`) and looks unprofessional. | High | 80 occurrences (F2). |
| I4 | **`formatPKR` uses `style: 'decimal'`** so amounts show as `1,234` with no "Rs." — every call site must manually prepend `Rs. `. Easy to forget; some screens show bare numbers and look like piaster amounts. | Medium | `services/dataStore.ts:24-30`; verified that callers do `Rs. {formatPKR(...)}` manually in Ledger.tsx, BillingTracker.tsx, etc. — but a future contributor will forget. |
| I5 | **No language toggle** despite Urdu names everywhere. Mixed English-only labels with Urdu sublabels make the rider screen confusing for monolingual Urdu users. | Medium | `App.tsx:751`. |
| I6 | **No accessibility (a11y).** No `aria-label`s on icon buttons, no `<label htmlFor>` pairs, color contrast on `text-slate-300/400 on white` fails WCAG AA. | Medium | various. |
| I7 | **The "More" sheet buries critical operations** (Sign Out, Setup, Audit, Closing). Riders may struggle to find Sign Out — currently it's the only Setup tile. | Low | `App.tsx:891`. |
| I8 | **No empty-state hints** — on first install, every screen shows blank cards with no "Add your first customer" CTA. | Low | various. |
| I9 | **Sync button is a tiny icon in the header** (`App.tsx:786-792`) with no spinner during refetch — riders won't know they triggered it. | Low | `App.tsx:786-792`. |

---

## Top 10 must-fix before any commercial launch

Ordered by ship-blocking severity. Each item has a concrete file:line pointer.

1. **A1 — Replace `allow_all_ws_*` policies on every wholesale table.** Either move to authenticated Supabase Auth (recommended) or write per-rider/per-owner policies. Right now any holder of the anon key can wipe wholesale.
   *File:* `supabase/migrations/20260327000000_wholesale_module.sql:78-82`.
2. **A2/A3 — Migrate auth from PIN-in-table to Supabase Auth (or at minimum hash + bcrypt the PINs and add rate-limit + lockout).** Update `verify_pin` to take a hash, log failures into `dp_audit_logs`, and **enable RLS that actually keys off `auth.uid()`** on all `dp_*` tables.
   *Files:* `supabase/migrations/20260427_fix_auth.sql` (whole file); `supabase/migrations/20260313_enable_rls.sql:7-79`.
3. **B5 — Fix `get_start_of_month_balances` return type.** Change `customer_id uuid` → `customer_id text` to match `dp_customers.id`. Re-test that the RPC actually returns a non-empty result on the live DB.
   *File:* `supabase/migrations/20260427_start_month_balances.sql:2`.
4. **B2/B3/F6 — Make `onCloseMonth` transactional.** Move the entire close into a single `pg_function` invoked via RPC, in a transaction, with the archive payload computed server-side from the *DB* not from client state. Add a dry-run preview UI.
   *File:* `App.tsx:248-375` → new migration `month_close.sql`.
5. **G3 — Import the missing `PaymentMode` in `App.tsx`.** This is a one-line bug that will throw `ReferenceError` the first time an Owner records a CREDIT adjustment.
   *File:* `App.tsx:11-14` (add import); `App.tsx:470` (call site).
6. **C5 — Either implement `addToQueue` or remove the offline fallback** in `wholesaleDataService.deleteDelivery/deletePayment`. As-is, the moment the rider goes offline and deletes a wholesale row, the app throws `ReferenceError`.
   *File:* `services/wholesaleDataService.ts:94, 110`.
7. **C1/C2 — Add OCC triggers to `dp_archives`, `dp_audit_logs`, `dp_rider_loads`, `dp_closing_records`, `dp_prices`, `dp_milk_inwards` and every `ws_*` table; add a client-side `P0001` catcher** that surfaces a "Conflict — please refresh" modal and refetches.
   *Files:* `supabase/migrations/20260427_enforce_occ.sql:20-43`; new client wrapper around all `.upsert()` calls.
8. **D4/B6 — Add `version`, `deleted`, `created_at` columns + audit-log triggers to all wholesale tables.** Replace `.delete()` with soft-delete. Add an `INSERT INTO dp_audit_logs` trigger on every dp_/ws_ mutation so deletes/edits are forensically traceable.
   *Files:* `20260327000000_wholesale_module.sql`; `services/wholesaleDataService.ts:82-112`.
9. **B8 — Patch `dp_customer_balances` view to filter `WHERE deleted = false`** in both UNIONed CTEs. Otherwise the documented "canonical mirror" returns wrong numbers post-close.
   *File:* `supabase/migrations/20260310_add_ledger_view.sql:5-15`.
10. **I1 — Replace `window.confirm` for month-close with a typed-name confirmation modal**, and write the close as an explicit two-phase ("Preview" → "Commit") flow. This is the only operation that destroys ledger data; one stray tap right now is unrecoverable.
    *File:* `App.tsx:250-252`.

---

## What's actually solid

This codebase isn't a hack job. Worth preserving:

- **OCC discipline.** `BaseEntity { version }` is consistently bumped on edits in `App.tsx:306, 407` and components; the trigger is real (just needs broader coverage). The mental model is correct — it's the surface area that's incomplete.
- **Server-side PIN check.** Moving from `VITE_OWNER_PIN`-in-bundle to `verify_pin` RPC is the right direction even if the implementation needs hashing.
- **Soft-delete pattern + the `sanitize` Map-by-id dedupe** (`App.tsx:185-188`) is a real defense against realtime+cache double-counting; rare to see this thought through.
- **`get_start_of_month_balances` RPC** (modulo the type bug) is the right architecture for avoiding client-side full-history aggregation. Once typed correctly + used as the source of truth, this kills B1's float-drift risk for opening balances.
- **Audit log table exists** with the right shape (`oldValue/newValue/conflictReason`). The schema is ahead of how the app uses it — an easy win is to start writing to it.
- **Print pipeline** (`#print-root` + `@media print` + thermal classes) is well-isolated and works for 58/80/A4. Receipt rendering uses `renderToStaticMarkup` into a fresh window — this is *better* than 80% of POS apps.
- **The decision NOT to cache `archives/auditLogs/closingRecords` in localStorage** (`services/dataStore.ts:120-121`) and `cleanLegacyStorage` (`App.tsx:601-610`) shows real awareness of mobile quota limits.
- **`calculateCycleBreakdown` FIFO** logic is genuinely sophisticated — most milk-shop apps just bucket by date and lose the credit-allocation invariant.
- **Bilingual UX intent** (Urdu names, RTL `dir="rtl"`, "دودھ" labels) — culturally appropriate.
- **Realtime channel is correctly scoped** to one channel with multiple table subscriptions, not N channels (would have been the naive approach).

---

## Final verdict

**Don't ship to multi-tenant SaaS.** The auth model, RLS, and wholesale `allow_all` policies all need re-platforming first.

**Single-shop pilot under personal supervision: yes, after fixing the top-10 list.** With the ten fixes landed, plus a daily Supabase database export to S3/Drive, this is acceptable for the owner's own shop with one or two riders. Not acceptable for sale to a third party until A1, A2, A3, A5, A6, B2, B5, C1, C5, D4, F4 are all closed.

**Recommended first sprint (1–2 weeks for a single dev):**
1. Day 1: A1, B5, C5, G3 (these are 1-line / 1-file fixes — close them today, they're embarrassing if a customer finds them).
2. Day 2–3: Re-platform auth (A2, A3, A5, A6) onto Supabase Auth with hashed PINs.
3. Day 4–5: Server-side `month_close` RPC (B2/B3/F6) + dry-run preview (I1).
4. Week 2: Wholesale parity (D4 + audit triggers B6), OCC coverage (C1), conflict UI (C2), telemetry/Sentry (F3), test harness (F4).

After that you have a defensible v1 for one customer.
