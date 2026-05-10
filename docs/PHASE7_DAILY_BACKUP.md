# Phase 7 — Daily Email Backup

This sets up an automatic email that lands in your inbox every night at
**11:00 PM Pakistan time** containing today's deliveries, payments, and a
snapshot of every customer's balance.

It runs entirely in the cloud (GitHub + Supabase + Resend) — your phone or
laptop does not need to be on.

---

## What you get every night

An email titled e.g. `Gujjar Milk Shop — Backup for 2026-05-10 (47 deliveries · Rs. 38,250 cash)` with:

- A short summary in the body: date, # deliveries, total liters, cash
  collected, expenses, # active customers, total outstanding receivables.
- Three CSV attachments (open in Excel):
  - `deliveries_YYYY-MM-DD.csv`
  - `payments_YYYY-MM-DD.csv`
  - `customer_balances_YYYY-MM-DD.csv`

If something fails, you'll get an automatic email from **GitHub** instead
saying the workflow failed — that's the alarm.

---

## One-time setup (about 10 minutes)

You do these steps once. After that it runs by itself every night.

### Step 1 — Create a Resend account (free)

1. Open <https://resend.com> and sign up. Free tier = 3,000 emails/month, no
   credit card required.
2. Verify your email when Resend sends you a confirmation.
3. In Resend's dashboard go to **API Keys → Create API Key**. Give it a name
   like `gujjar-milk-shop-backup`, choose **Full access** or **Sending access**.
4. Copy the key (it starts with `re_…`). You'll only see it once — paste it
   somewhere safe for now.

> **About the sender address.** The script sends from
> `onboarding@resend.dev`, which is Resend's free shared address. It works
> immediately. Later, if you want emails to come from your own domain
> (e.g. `backup@gujjarmilk.com`), you can verify a domain in Resend and
> change the `from:` line in `scripts/send-daily-backup.mjs`.

### Step 2 — Get your Supabase service role key

1. Open your Supabase project dashboard.
2. Go to **Project Settings → API**.
3. You'll see two keys:
   - `anon` (public) — what the app already uses in the browser.
   - **`service_role`** — copy this one.

> ### IMPORTANT — security warning about the service role key
>
> The `service_role` key **bypasses every Row-Level-Security rule in the
> database**. Anyone holding it can read or modify every row in every table.
>
> - **Never** paste it into a browser address bar, a chat, an email, or a
>   screenshot.
> - **Never** commit it to git.
> - **Only** put it into the GitHub Secrets box described in Step 3.
> - If you ever think it has leaked, go to Supabase → Project Settings → API
>   and click **Roll service_role key** to invalidate it, then update the
>   GitHub secret.

### Step 3 — Add three secrets to GitHub

1. Open the repo on GitHub:
   <https://github.com/ahtisham1122-c/Delivery>
2. Click **Settings** (top of the repo page) → **Secrets and variables** →
   **Actions** → **New repository secret**.
3. Add these three secrets, one at a time. Names must be exact:

   | Secret name                  | Value                                                            |
   | ---------------------------- | ---------------------------------------------------------------- |
   | `SUPABASE_URL`               | Your project URL, e.g. `https://abcd1234.supabase.co`            |
   | `SUPABASE_SERVICE_ROLE_KEY`  | The `service_role` key from Step 2                               |
   | `RESEND_API_KEY`             | The `re_…` key from Step 1                                       |

   Optional fourth secret if you ever want to send to a different address:

   | `BACKUP_EMAIL_TO`            | e.g. `chahtisham11@gmail.com` (default if absent)                |

### Step 4 — Run the SQL migration in Supabase

1. Open Supabase dashboard → **SQL Editor → New query**.
2. Open the file `supabase/migrations/20260510_daily_backup_export.sql` from
   this repo, copy its entire contents, paste into the SQL Editor.
3. Click **Run**. You should see `Success. No rows returned`.

This creates a function called `export_daily_backup` that the nightly job
will call. It is locked to the service-role key, so the browser app cannot
use it.

### Step 5 — Push the new files

The new files are:

- `supabase/migrations/20260510_daily_backup_export.sql`
- `.github/workflows/daily-backup.yml`
- `scripts/send-daily-backup.mjs`
- `docs/PHASE7_DAILY_BACKUP.md` (this doc)

Commit and push them to `main`. Once they're on GitHub, the workflow becomes
visible under the **Actions** tab.

### Step 6 — Trigger a test run

1. Go to <https://github.com/ahtisham1122-c/Delivery/actions>.
2. In the left sidebar, click **Daily backup**.
3. Top right, click **Run workflow → Run workflow**.
4. Wait ~30 seconds. The run should turn green.
5. Check your inbox at chahtisham11@gmail.com. **Look in the Spam / Promotions
   folder if it's not in the main inbox** — first emails from a new sender
   often land there. Mark it "Not spam" and future ones will go to the inbox.

---

## How it runs from then on

- Every day at **18:00 UTC = 23:00 PKT (11 PM Pakistan time)**, GitHub
  triggers the workflow automatically.
- If GitHub itself is down (rare, a few times a year), that night's email is
  skipped. You can manually click **Run workflow** the next morning to
  generate a backup for that day by editing the cron or just letting the next
  day's run cover it.
- You can manually trigger it any time from the Actions tab.

---

## Troubleshooting

### "I never got the first email"

1. Check the Spam / Promotions folder.
2. Open GitHub → Actions → **Daily backup** → click the latest run. If it's
   red, expand the failing step to see the error.
3. Check Resend dashboard → **Emails**. If the email is listed there, it left
   Resend successfully — the problem is on Gmail's side (likely spam).

### "The workflow failed with `Supabase RPC 401`"

The `SUPABASE_SERVICE_ROLE_KEY` secret is wrong or has been rolled. Re-copy
it from Supabase → Project Settings → API and update the GitHub secret.

### "The workflow failed with `Supabase RPC 404` or `function … does not exist`"

You haven't run the SQL migration in Step 4 yet, or it ran against the
wrong project. Re-run it in the Supabase SQL Editor.

### "The workflow failed with `Resend 401` or `403`"

Your `RESEND_API_KEY` is missing, expired, or restricted. Make a new key in
Resend and update the GitHub secret.

### "The workflow failed with `Resend 422 — only verified emails…`"

Resend's free shared sender (`onboarding@resend.dev`) only allows sending to
the email address you verified when signing up. Make sure
`chahtisham11@gmail.com` is the address on your Resend account, or verify
your own domain and change the `from:` field in
`scripts/send-daily-backup.mjs`.

### "I'm getting empty CSVs"

That's normal on a day with zero deliveries. The email still arrives so you
know the system is alive. The summary will show `0 deliveries`.

### "Urdu names look like ?????? in Excel"

The CSV is UTF-8 with a BOM, which Excel on Windows handles correctly via
double-click. If you opened it through Excel's import wizard, choose
encoding **UTF-8**.

---

## Files added in this phase

- `supabase/migrations/20260510_daily_backup_export.sql` — SECURITY DEFINER
  RPC `export_daily_backup(p_date)`, granted only to `service_role`.
- `.github/workflows/daily-backup.yml` — cron + manual trigger.
- `scripts/send-daily-backup.mjs` — Node 20 script (no npm deps).
- `docs/PHASE7_DAILY_BACKUP.md` — this document.

No application source files were modified. No new npm dependencies were
added.
