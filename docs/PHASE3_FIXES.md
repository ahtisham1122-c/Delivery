# Phase 3 — Defensive Locks + Live Reconcile (2026-05-09)

Phases 1 & 2 fixed the two largest leaks. Phase 3 closes the rest of the integrity gaps that aren't related to month-close, and gives you a tool to **see** drift the moment it happens instead of finding it weeks later in a customer dispute.

## What's in this phase

1. **OCC triggers on every operational table.** Until now only `dp_customers / dp_deliveries / dp_payments / dp_expenses / dp_riders` rejected stale writes. After this migration the same protection covers `dp_prices`, `dp_rider_loads`, `dp_closing_records`, `dp_archives`, and `dp_audit_logs`. If two devices try to edit the same row, the loser is rejected with a clear conflict message instead of silently overwriting.
2. **Unique index on `dp_archives(year, month) WHERE deleted = false`.** The Phase 2 RPC already refuses to double-archive, but this makes the **database itself** enforce it — even if a future code path forgets the check, even if you insert from the Supabase dashboard by mistake.
3. **`live_reconcile()` RPC + new "Reconcile" screen in the app.** A read-only check that compares every balance shown on this device against the authoritative server-side calculation, and lists any customer where they differ. Run it on the Owner phone and on every Rider phone — anywhere it shows drift, that device has a stale cache and you hard-refresh it.

This phase **does not** change any data, schema, or business logic. It only adds protection.

---

## What you do (10 min total)

### Step 0 — Back up

Same routine as Phase 1 / Phase 2. Supabase Backups → *Backup now* → wait for fresh timestamp. CSV-export `dp_customers`, `dp_deliveries`, `dp_payments`, `dp_archives` into a folder named `backup_2026-05-09_phase3`. This phase only adds triggers/indexes/functions, so the risk is minimal — but never run anything against your live DB without a safety net.

### Step 1 — Run the SQL migration

1. Supabase Dashboard → **SQL Editor** → *New query*.
2. Open [`supabase/migrations/20260509_phase3_defensive_locks.sql`](../supabase/migrations/20260509_phase3_defensive_locks.sql).
3. Copy → paste → **Run** (Ctrl+Enter). Should say *"Success. No rows returned."*
4. **Sanity check the new function** — paste this into the SQL Editor:
   ```sql
   -- Pretend everything is correct (server values reused as local).
   -- Should return zero rows. If you get rows, your DB already has drift
   -- that needs investigation.
   SELECT * FROM live_reconcile(
     (SELECT jsonb_object_agg(customer_id, balance) FROM dp_customer_balances)
   );
   ```

### Step 2 — Deploy the new build

Build in `dist/` is fresh (just verified). Deploy and **hard-refresh every device**.

### Step 3 — Run Live Reconcile on every device

This is the part you'll use weekly going forward.

1. On the **Owner phone**, log in → tap *More* (bottom nav) → *Reconcile*.
2. Tap **Check N customers**. Wait a couple of seconds.
3. You should see a green panel: *"All balances match the server"*. If you see a yellow drift table instead, that means **this device is showing wrong numbers** — pull-to-refresh and re-run.
4. Repeat on each **Rider phone**. Owner can't see what the rider's local cache shows; only the rider's own app can. So every rider runs it on their own device.

If after a hard refresh a device still shows drift, capture a screenshot of the table and send it. The server number is always the truth — the row tells you exactly which customer is mis-displayed and by how much.

---

## What this protects against, in plain words

| Symptom | What used to happen | What happens now |
|---|---|---|
| Owner edits a price while Rider is also editing the same price | Rider's stale write silently wiped Owner's | Rider gets *"Sync conflict"* alert; Owner's edit stands |
| Two devices try to close the same month at once | Both run, second one corrupts ledger | Second one rejected by the unique index even before the RPC's check fires |
| A device shows Rs. 4,250 for a customer but server actually says Rs. 4,950 | Nobody noticed until the customer complained | Owner runs Live Reconcile and sees the row immediately |
| Audit log row gets concurrent updates | Last write wins, audit history corrupt | Conflict raised, history preserved |

---

## Still **NOT** fixed (for Phase 4)

These are the remaining items from the audit. None are causing daily ledger drift; they are security & resilience gaps.

- **Wholesale tables still wide-open** to anon-key holders (`allow_all_ws_*` policies). Anyone with the public Supabase URL + anon key can read/write/delete all wholesale data via curl. Recommend Phase 4 lock-down or a switch to real Supabase Auth.
- **Rider/Owner PINs stored as plaintext** in `dp_riders.pin` and `dp_metadata.owner_pin`. If the database is ever exposed, every PIN is. Phase 4 should hash with bcrypt (`pgcrypto`).
- **Money still tracked as JS floats.** Drift becomes visible at very large totals (Rs. 10 crore +). Phase 4 should switch to integer paisa internally.
- **No automatic daily Excel/CSV export.** You're relying on Supabase managed backups. A scheduled app-side export is a cheap belt-and-braces.
- **No service worker / PWA install.** Riders re-download the bundle every cold start.
- **`App.tsx` is 900+ lines.** Doesn't affect users today, but every future change is more risky than it should be. A refactor pass when things calm down.

---

## If something goes wrong

- **Step 1 errors** → don't deploy. Send me the error.
- **An UPDATE somewhere now fails with `Concurrency Conflict: Stale data update blocked on table dp_prices` (or rider_loads / closing_records / archives / audit_logs)** → that means some code path is updating the row without bumping `version`. I reviewed the existing code paths and they all bump correctly, but if a third-party tool or the Supabase dashboard does a manual update, this can fire. Solution: bump `version` in that update. Tell me which screen/action and I'll patch.
- **Live Reconcile shows persistent drift even after hard-refresh** → screenshot, send. The server is the source of truth; the row tells us which customer needs forensics.
