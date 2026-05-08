# Phase 2 — Atomic Month-Close + Wholesale Crash Fix (2026-05-09)

Phase 1 stopped balances from drifting between devices. Phase 2 fixes the **biggest single risk to your books**: the *Close Month* button.

## What was wrong

Pressing *Close Month* used to do **8 separate writes** from your phone:
1. Insert archive row
2. Update every customer's opening balance
3. Soft-delete deliveries
4. Soft-delete payments
5. Soft-delete expenses
6. Soft-delete rider loads
7. Soft-delete closing records
8. Insert audit log

If any one of those failed (network drop, OCC trigger rejection, browser tab closed, rider's phone uploading a delivery at the same moment), the close would be **half done**. Some customers have new opening balances, others don't. Some deliveries archived, others still active and being double-counted. Once you got into that state, no recovery was possible.

## What's fixed now

The whole operation is now a **single Postgres transaction** that runs server-side. Either the whole close succeeds, or **nothing changes at all**. The new flow:

1. App calls `preview_month_close(year, month)` — read-only, returns counts and the **top 5 customer balance changes** so you can sanity check before committing.
2. You see a summary in a popup. You click OK.
3. App asks you to **type a confirmation phrase** (e.g. `CLOSE APRIL`) — last line of defence against accidental clicks.
4. App calls `close_month_transactional(year, month, performed_by)` which runs everything atomically in the database.
5. App re-fetches the cloud state so every device shows identical numbers.

If the month is already closed, the system **refuses** instead of double-archiving (the audit predicted that gap too).

Also fixed in this phase:
- `dp_customer_balances` server view now filters `deleted=false` — it was previously summing soft-deleted rows, occasionally producing a number different from what the app showed. Now they match.
- The wholesale delete crash (`addToQueue is not defined`) is resolved — offline deletes now refuse cleanly instead of throwing a `ReferenceError`.

---

## What you do (15 min total)

### Step 0 — Back up again

Same as Phase 1. Take a fresh Supabase backup + CSV export of `dp_customers`, `dp_deliveries`, `dp_payments`, `dp_archives` before running anything. Save in a folder named `backup_2026-05-09_phase2`.

This phase touches **functions and one view**, not data. But always back up.

### Step 1 — Run the SQL migration

1. Supabase Dashboard → **SQL Editor** → *New query*.
2. Open [`supabase/migrations/20260509_phase2_atomic_close.sql`](../supabase/migrations/20260509_phase2_atomic_close.sql) on your PC.
3. Copy entire contents → paste → **Run** (Ctrl+Enter).
4. Should say *"Success. No rows returned."*
5. Verify the preview function works **without changing anything**:
   ```sql
   -- 0-indexed month: April 2026 = (2026, 3); May 2026 = (2026, 4)
   SELECT preview_month_close(2026, 3);
   ```
   You should get back a JSON object with `deliveries_count`, `payments_count`, `top_changes`, etc. **Do not call `close_month_transactional` from the SQL editor** — that's the real action and should only be triggered from the app where the typed confirmation lives.

### Step 2 — Deploy the new app build

The build in `dist/` is fresh (verified). Deploy it the same way you did Phase 1. **Hard-refresh every Owner and Rider device** so they pick up the new bundle.

### Step 3 — Test the new month-close flow on a SAFE month

Do not test on the real current month. Instead:

- Pick the **oldest** unclosed month if any, or the current month if it's the only one. Either way, the *preview* step is non-destructive — it shows you what would happen without doing anything. Run it first and read the numbers.
- If the preview numbers look wrong (counts way off, balance changes much larger than expected), **click Cancel**. Send me the screenshot and we'll debug before closing.
- Only if everything looks right, type the confirmation phrase and let it close.

Because the operation is now atomic, even if the network drops mid-close, your data is safe — the transaction will roll back automatically.

### Step 4 — Verify

After a successful close:

- Both Owner and Rider devices should show **zero deliveries / payments** for the just-closed month and earlier.
- Customer opening balances should match what the preview showed in `top_changes`.
- The Archives screen should list the new archive row.
- Run this in Supabase SQL Editor to confirm one row was archived:
  ```sql
  SELECT id, year, month, updated_at
  FROM dp_archives
  WHERE deleted = false
  ORDER BY year DESC, month DESC
  LIMIT 3;
  ```

---

## Still **NOT** fixed (deliberately, for Phase 3)

- OCC triggers still missing on `dp_prices`, `dp_archives`, `dp_audit_logs`, `dp_rider_loads`, `dp_closing_records` (transactional close handles month-end safely, but ad-hoc edits to these tables can still race).
- All wholesale tables still have **wide-open RLS** for the anon key.
- Money still in JS floats (small drift possible on totals over Rs. 10 crore).
- Rider PINs still plaintext.
- No automatic daily backup / no service worker / no PWA install.

---

## If something goes wrong

- **SQL editor errors when running Step 1** → don't deploy the app. Send me the error text.
- **Preview returns numbers that look wrong** → cancel, screenshot, send to me. The preview is read-only so nothing is at risk.
- **The new app build won't load** → revert to your previous `dist/` deploy. Database is unchanged from before Step 1 anyway (the only DB change is creating two functions and replacing one view — all reversible).
- **Real close completes but other devices still show old data** → make them hard-refresh. Realtime should handle it but the cache can be stubborn on iOS.
