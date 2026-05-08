# Phase 1 — Stop the Bleeding (2026-05-09)

This is the playbook for the three fixes applied today. Follow it in order. Do not skip steps.

---

## Step 0 — Back up everything (5 min)

Before touching anything live, save your current state somewhere you can restore from:

1. **Excel exports from the app** — open the app as Owner and export from at least these screens:
   - Ledger / Reports → all customers
   - Daily Log → at least the last 60 days
   - Customers list
   - Last 2–3 monthly archives
2. **Supabase manual backup** — Supabase Dashboard → your project → **Database → Backups** → click *Backup now*. Wait until it shows a fresh timestamp.
3. **CSV exports of the four critical tables** — Supabase Dashboard → **Table Editor** → for each of `dp_customers`, `dp_deliveries`, `dp_payments`, `dp_archives`, click ⋮ → *Export CSV*. Save them all in one folder named `backup_2026-05-09` on your PC.

Do not proceed until all three are done. If anything goes wrong in steps 1–3 below, these backups are how you recover.

---

## Step 1 — Run the SQL fix in Supabase (2 min)

This is the most important fix. It corrects a broken database function (`get_start_of_month_balances`) that was the **root cause of different devices showing different balances**.

1. Open Supabase Dashboard → your project → **SQL Editor** → *New query*.
2. Open the file [`supabase/migrations/20260509_phase1_rpc_typefix.sql`](../supabase/migrations/20260509_phase1_rpc_typefix.sql) on your PC.
3. Copy its **entire contents** and paste into the SQL Editor.
4. Click **Run** (Ctrl+Enter). It should say "Success. No rows returned."
5. Verify the function works — in the same SQL Editor, run this test:
   ```sql
   SELECT * FROM get_start_of_month_balances(CURRENT_DATE) LIMIT 5;
   ```
   You should see rows of `customer_id` (text) and `balance` (numeric). **If this returns rows, the fix worked.** If it errors, stop and contact me — do not proceed.

What this fixed: previously the function declared `customer_id uuid` but your real column is `text`, so PostgREST silently rejected every call from the app. The app then fell back to client-side balance calculation, which produced different numbers on each device because each device had a different cache. Now every device pulls the same authoritative server number.

---

## Step 2 — Deploy the new app build (3 min)

The code changes are already applied to your `App.tsx`. The build succeeded (verified). What's new in the bundle:

- The Owner "Adjustment" feature no longer crashes (`PaymentMode` was missing from imports — line 11–15 of `App.tsx`).
- Error messages now tell you **why** a save failed instead of just "System Error: Failed". In particular, if two devices clash on the same record, you'll see *"Sync conflict: another device just updated this record. Tap refresh and try again."* instead of silent corruption.

To deploy:

1. The fresh production bundle is already built in `dist/` (vite just produced it).
2. Upload the contents of `dist/` to wherever you currently host the app (Netlify / Vercel / Supabase static hosting / your own server). If you deploy from GitHub, commit the whole repo and push — your hosting provider will rebuild.
3. On every device that uses the app (Owner phone, every Rider phone), do a **hard refresh** so they pick up the new bundle:
   - Android Chrome: open the app, pull-to-refresh, then close all tabs and re-open.
   - iPhone Safari standalone: hold the app icon → *Remove from Home Screen* → re-add from Safari.
   - Desktop: Ctrl+Shift+R (or Cmd+Shift+R).

If you do not hard-refresh on the rider phones, they will keep running the old broken bundle and you will keep seeing the bug.

---

## Step 3 — Verify both devices now agree (5 min)

Pick **one customer** with a complicated history (lots of deliveries + payments) as a test case.

1. On the **Owner device**, open Ledger → that customer → note the balance (e.g. *Rs. 4,250*).
2. On a **Rider device**, log in as that rider → open the same customer's view → note the balance.
3. They should match exactly. If they do, the sync fix is working.
4. If they don't match, check:
   - Did both devices hard-refresh? (Step 2.3 above.)
   - Did Step 1 actually run successfully? (Re-run the test query.)
   - Are both devices currently online? (Look at the sync indicator at the top of the app.)

Repeat for 2–3 more customers to be confident.

---

## What is **NOT** fixed yet

This phase only addresses the worst three bugs. These remain and will need Phase 2:

- Month-close is still non-transactional — do not press *Close Month* until Phase 2.
- OCC triggers are still missing on `dp_prices`, `dp_archives`, `dp_audit_logs`, `dp_rider_loads`, `dp_closing_records`, and **all wholesale tables**.
- Wholesale tables still allow any anon-key holder to read/write/delete everything.
- Currency is still JS floats (small drift possible on very large totals).
- No automatic daily backup yet.

When you're ready, ask for **Phase 2** and we'll tackle those.

---

## If something goes wrong

- **Step 1 SQL errors** → don't run anything else. The function definition was rejected. Send me the error message.
- **App won't load after deploy** → revert the hosting to the previous build. Your data is untouched (backups + Supabase are unchanged).
- **Balances are still different after Step 3** → check the realtime sync indicator on each device. If it shows red/conflict, force a refresh. If it persists, send me a screenshot of the same customer on both devices.

Your data is safe at every step of this plan. The only thing that changed in the database is one function definition (which was non-functional anyway). All your customers, deliveries, payments, and archives are untouched.
