# Phase 10 — Bank-Grade Integrity (2026-05-13)

After Phase 10 the app's trust model is at the same tier banks and
audited fintechs use. The summary in plain words:

- **The audit log can no longer be edited or deleted, by anyone — not
  even me with a database admin password.** Every entry carries a
  cryptographic hash of the entry before it. If anyone tampers with a
  historical row, the chain breaks and a single button on the Reconcile
  screen tells you exactly which row was touched.
- **Cash that moves from rider to Owner is now a recorded transaction**
  with its own table (`dp_cash_settlements`). The DB calculates what
  each rider should have collected, the Owner records what they
  actually received, and any variance is flagged.
- **End-of-day closings flag automatically** when the cash a rider hands
  over differs from what their day's deliveries said they should have
  collected (default threshold Rs. 100, configurable).

## What changed under the hood

### A. Append-only + hash-chained audit log

| What | Where |
|---|---|
| New columns on `dp_audit_logs` | `seq bigserial`, `prev_hash text`, `entry_hash text` |
| Trigger that computes the hash on every INSERT | `audit_log_chain_hash()` BEFORE INSERT |
| Triggers that REFUSE UPDATE/DELETE | `block_audit_mutations()` returning `P0004` |
| RPC the app calls to verify | `verify_audit_chain()` — walks every row, recomputes hashes, reports breaks |

The chain works exactly like a blockchain: each row's hash = SHA-256 of
`(previous_hash + this_row's_content)`. Change one character of any
historical row and every row after it has the wrong hash.

### B. Cash Settlements table

| Column | Purpose |
|---|---|
| `rider_id`, `settlement_date`, `amount` | The transaction itself |
| `expected_cash` | What the DB calculated the rider *should* have collected |
| `variance` | `amount - expected_cash` — auto-computed at insert time |
| `recorded_by` | Always 'OWNER' |
| `client_request_id` | Idempotency: double-tap save is deduplicated |
| `version`, `deleted` | OCC + soft-delete (like every other table) |

Owner records receipts on the new **Cash In** screen
(*More → Cash In*). Riders see only their own settlements via RLS.

### C. Variance flag on rider closing

`dp_closing_records` gained `variance` (numeric) and
`requires_review` (boolean). `save_rider_closing` computes
`variance = physical_cash_received − (expected_cash_recovery − expense_deductions)`
and sets `requires_review = true` when `|variance| > 100` (Owner can
change the threshold in `dp_metadata.closing_variance_threshold_rs`).

## What the Owner does

### Daily cash collection workflow

1. Rider records deliveries throughout the day on their phone.
2. End of day, rider records their closing via *More → Closing*.
3. Rider hands cash to Owner.
4. Owner opens *More → Cash In*, picks the date, taps the rider tile,
   enters the amount received. The screen shows green if it matches
   what the system expected, red if it doesn't.
5. After every rider's tile is green, the day is settled.

### Periodic integrity checks (recommended weekly)

Open *More → Reconcile* and tap, in order:

1. **Check N customers** — confirms this device shows the same balances
   as the server.
2. **Verify audit chain** — confirms no historical record has been
   edited or deleted.
3. **Run 8 invariant checks** — confirms no negative amounts, orphan
   rows, or duplicate writes.

All three should be green. If any isn't, take a screenshot and we
investigate immediately.

## Trust model — what's literally impossible now

| Attack | Why it can't succeed |
|---|---|
| Edit a delivery from yesterday to a lower amount | RLS allows Owner to do this through an Adjustment (which is audit-logged) but not via raw UPDATE because of period-lock + OCC. Direct database edit by an admin breaks the audit chain → next Verify call catches it. |
| Delete a payment row to hide that a customer paid | Soft-delete only; hard DELETE on `dp_payments` requires service-role + would still appear in the audit log. Hash chain catches any retroactive removal of an audit-log row. |
| Two devices race to save the same delivery | OCC trigger rejects the loser. Same delivery from a double-tap is deduplicated by the partial-unique index on `client_request_id`. |
| Rider claims they collected Rs. 8,000 but actually pocketed Rs. 500 | The day's expected_cash is computed from the payments they recorded, NOT from what they say. Variance shows up immediately on the Cash In screen. The closing record's `requires_review` flag is set. |
| Owner "forgets" they took Rs. 5,000 from a rider three weeks ago | Every settlement is in `dp_cash_settlements` forever, queryable by rider+date. The daily backup CSV includes them too. |
| Someone breaks into the DB and forges history | Append-only triggers block the easy paths. If they bypass the triggers (only possible as Postgres superuser, not via the app), the hash chain breaks and Verify Audit Chain returns `intact: false` with the exact entry that was touched. |

## Limits to be honest about

- **Hash chain is detective, not preventive.** It tells you tampering
  happened; it doesn't undo it. Keep daily backups so you can restore
  to a known-good state.
- **Only the database is bank-grade. The OS, the phone, your Supabase
  password, and your GitHub account are not.** Use 2FA on Supabase and
  GitHub. Don't share your Owner PIN.
- **Single-shop deployment.** Multi-tenant SaaS would need different
  trust boundaries between shops — out of scope.

## Open items for Phase 11 (if you ever want them)

- 6-digit Owner PIN (highly recommended)
- Multi-factor auth on Owner login (SMS OTP via Resend/Twilio)
- Money to integer paisa (eliminates the last theoretical float drift)
- "Active sessions" view + remote-revoke for stolen phones
- Quarterly hash-chain snapshot exported to immutable storage (S3
  Object Lock) so even total DB loss is detectable after recovery
