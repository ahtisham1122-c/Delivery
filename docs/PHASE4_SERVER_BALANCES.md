# Phase 4 — Server Balances As Truth (2026-05-09)

## Why this exists

Phase 1–3 fixed sync mechanics (RPC types, atomic close, OCC, drift detection).
But Live Reconcile still showed Rs. 1.06 lakh of drift across 116 of 147 customers, because the **architecture itself** was wrong: every device tried to compute customer balances locally by summing its cached deliveries and payments. That math is only correct if the device's cache is a perfect, complete copy of the database — which it isn't, because:

- the app only fetches the last ~5 weeks of transactions for performance,
- old un-archived months and pre-Phase-2 partial closes leave active rows the device never sees,
- realtime sync gaps during offline rider sessions can leave the cache further behind.

The audit (PRODUCTION_AUDIT.md §2) flagged exactly this and recommended: **stop computing balances on the client; read them from the server.**

## What changed in this phase

### `App.tsx`
- Added `serverBalances` state, populated from the `dp_customer_balances` Postgres view.
- The `balances` memo now **prefers** the server value for each customer; the old client aggregation is kept only as a fallback for customers the server fetch hasn't covered yet (cold start, offline).
- A debounced `scheduleBalanceRefresh()` fires whenever:
  - any realtime change arrives on `dp_deliveries`, `dp_payments`, or `dp_customers`,
  - any local mutation changes the `customers` / `deliveries` / `payments` arrays.
- This means a rider's delivery on his phone updates the Owner phone's balance within ~1 second — and the number every device shows is the same as `SELECT * FROM dp_customer_balances` returns.

### No SQL migration required
The view (`dp_customer_balances`) was already corrected in Phase 2 to filter `deleted = false`. Nothing to run on the database.

---

## What you do (5 min)

### Step 1 — Deploy the new build

The bundle is fresh in `dist/`. Same deploy + hard-refresh routine as the previous phases. Make sure **every device** picks up the new bundle.

### Step 2 — Re-run Live Reconcile

After hard-refresh, open *More → Reconcile → Check N customers* on each device.

Expected: **green panel "All balances match the server"** on every device.

If a device still shows drift after Phase 4 is deployed, that's a real signal — paste the row to me and we'll trace it.

### Step 3 — Spot-check Waqas Parlour

Open Waqas Parlour in the customer list. Should now show **Rs. 4,210 owing** (matching the SQL truth from your earlier query), not the old Rs. 8,370 advance.

If yes → 116-customer drift is fixed in one shot.
If no → tell me the new number and I'll dig further.

---

## Why this is safer than the old code path

| Risk | Old behaviour | New behaviour |
|---|---|---|
| Old un-archived deliveries on server | Device misses them, undercounts | Server view sums them, device displays the truth |
| Two devices disagree | Both running their own local math | Both display the same `dp_customer_balances` row |
| Realtime gap during offline rider session | Cache stays out of sync until next full fetch | Next realtime tick triggers a fresh balance fetch |
| Float drift across hundreds of `.reduce()` calls | Compounds | Postgres `NUMERIC(12,2)` does the math once on the server |
| User exports an Excel report | Numbers depend on which device exports | Numbers are server-authoritative everywhere |

The client computation is still in the code as a fallback, **but in normal online operation it never runs.** The fallback only activates if the server view fetch fails or doesn't include a particular customer (e.g. a customer created on this device 200ms ago, before the next debounced refresh).

---

## What is still NOT fixed

This patch addresses the displayed-balance drift specifically. Open items from earlier audits:

- Wholesale tables still wide-open to anon key.
- Rider/Owner PINs still plaintext.
- No automatic daily Excel export.
- No service worker / no PWA.

These don't cause ledger drift; they're security and resilience gaps for a future phase.
