# Phase 6 — Period Lock (non-destructive replacement for Close Month)

**Date:** 2026-05-10
**Status:** built, awaiting your SQL run + deploy.

## What this changes

The old "Close Month" snapshotted a month into a JSON archive blob and then **soft-deleted every transaction up to month-end** so the live ledger would forget them. That worked, but it (a) hid the detail of historical deliveries from the customer screens forever and (b) depended on every device being perfectly in sync at the moment of close — the same fragility that produced your Rs. 1.06 lakh drift incident on 2026-05-09.

Phase 6 replaces it with the pattern QuickBooks, Xero, Tally, and Khata Book all use:

- The ledger keeps growing forever — **every delivery, every payment, every expense stays visible in the customer ledger and reports.**
- After you reconcile a month with your bank/cash and send statements, you set a **lock date**. A database trigger then refuses any further insert / update / delete on rows dated on or before that lock — except via Owner Adjustments (which are tagged in the audit log).
- The lock is **reversible**. You can advance it forward each month. Emergency-unlock all periods is a single owner-typed-confirmation away.
- **Nothing is ever deleted, archived into a blob, or hidden from screens.**

## What you do

### Step 0 — Backup as usual

This phase only adds a new table, three RPCs, and triggers — no data is touched. But always back up before SQL changes. Supabase Backups → *Backup now* + a CSV export folder named `backup_2026-05-10_phase6`.

### Step 1 — Run the SQL migration

In Supabase SQL Editor, paste the contents of [`supabase/migrations/20260510_period_lock.sql`](../supabase/migrations/20260510_period_lock.sql) and Run. Then verify:

```sql
-- Should return one row with lock_date = 1970-01-01 (i.e. nothing locked yet).
SELECT * FROM dp_period_lock;

-- Should return JSON with lock_date 1970-01-01.
SELECT get_period_lock();
```

If both work, the migration is live.

### Step 2 — Deploy `dist/` and hard-refresh devices

The Owner now has a new tile in the More menu: **Lock Period** (lock icon). Riders don't see it.

### Step 3 — Use it once you're ready

The first time you've finished reconciling a past month with your bank and sent customer statements:

1. Open *More → Lock Period*.
2. The date picker defaults to the last day of last month — usually the right target.
3. Optional: write a note like *"April reconciled with bank, statements sent"*.
4. Tap **Lock through [date]**, confirm.

After that, you (or any rider) cannot accidentally edit a delivery from before that date. To correct a balance from a locked period, use **Owner Adjustments** — they record a new transaction in the current period tagged in the audit log, leaving the locked history intact. This is exactly how QuickBooks handles prior-period corrections.

### Step 4 — Going forward

- Once a month (after reconciling): open Lock Period → advance the lock to last month's end.
- The screen always shows the current lock date, who set it, and when.
- If you ever need to roll back: red **Unlock all periods** button at the bottom requires typing *"UNLOCK EVERYTHING"* and is audit-logged.

## What about the old Close Month?

- The old `close_month_transactional` RPC is still in the database but was REVOKE'd from anon by Codex's May-09 work, so it is unreachable from the React app.
- The old `ArchiveManager` UI is unmounted.
- Any monthly archive rows already in `dp_archives` from past closes are left alone — they remain visible in the Reports / Ledger screens for historical reference.

You don't need to do anything about them. They're harmless history.

## What this does NOT do

- It does not produce a per-customer monthly statement PDF (your existing Ledger / BillingTracker / Daily Log screens already do that — open a customer, pick the date range).
- It does not auto-lock at month-end. Locking is always a deliberate Owner action.
- It does not unlock automatically. Once locked, only Owner Adjustments or the emergency unlock can change locked-period rows.

## If something goes wrong

- **SQL error on Step 1** → don't deploy the build. Send me the exact error.
- **App says "Lock FAILED"** → the message will include the underlying reason. Most likely either the migration didn't run, or someone tried to lock a date earlier than the current lock (use Unlock All instead).
- **Rider tries to save a delivery and gets "PERIOD_LOCKED"** → either you accidentally locked too far forward, or the rider is back-dating to a closed period. Check the lock date in *Lock Period*; advance only forward, never backward.
- **You need to fix one customer's balance in a locked period** → record an **Owner Adjustment** for that customer (DEBIT or CREDIT). It is dated TODAY but applies to that customer's balance. Audit-logged. The locked detail rows stay untouched.
