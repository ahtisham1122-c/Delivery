-- Phase 9 finance hardening (2026-05-13) — reference snapshot.
-- Applied to the new Supabase project tmsvmyvktfatyyzqfmfv via MCP as
-- migration `m09_finance_hardening_wholesale_and_locks`.
--
-- 1. Wholesale tables now respect period_lock triggers (was retail-only).
-- 2. Five new atomic + idempotent + audit-logged RPCs for wholesale:
--    save_ws_delivery_batch, save_ws_payment, save_ws_customer,
--    soft_delete_ws_delivery, soft_delete_ws_payment.
--    wholesaleDataService.ts now calls these instead of bare upserts.
-- 3. Brute-force on verify_pin tightened: 5/PIN-hash/10min, 20/24h,
--    30/IP/10min (was 8/12).
-- 4. financial_health_check() — single RPC running eight invariant
--    checks (no negative amounts, no orphan rows, no duplicate
--    request-ids, no free-milk rows, period_lock visible). Owner
--    runs it from the Reconcile screen.

SELECT 'phase9_finance_hardening applied on 2026-05-13' AS status;
