# Architecture Deep Dive

Companion to `CLAUDE.md`. Covers data model, sync, ledger math, tab map, RLS, and the wholesale sub-app.

## 1. Data model (retail — `dp_*` tables)

Every operational table follows the `BaseEntity` shape:

```
id          text primary key
updated_at  timestamptz
version     integer        -- OCC: trigger blocks NEW.version <= OLD.version
deleted     boolean        -- soft delete (used by month-close)
```

Tables (see `supabase/migrations/20260308_initial_schema.sql`):

| Table | Purpose | Notes |
|---|---|---|
| `dp_riders` | Delivery staff | `pin` is the login secret; `salary` for payroll |
| `dp_customers` | End buyers | `payment_cycle` ∈ Daily / 10-Day / 15-Day / Monthly · `custom_price` overrides global price · `opening_balance` is rolled forward at month-close · `delivery_order` for route sorting |
| `dp_prices` | Time-effective rates | If `customer_id` is null, it's a global default; otherwise customer-specific |
| `dp_deliveries` | Daily milk drops | `is_locked=true` once a rider closes the day; `is_adjustment=true` for owner debits |
| `dp_payments` | Cash/bank/wallet receipts | `mode` ∈ Cash / Bank / Wallet; `is_adjustment=true` for owner credits |
| `dp_expenses` | Petrol/repair/baraf/etc | Optional `rider_id` |
| `dp_rider_loads` | Liters issued to rider in the morning | One row per rider per day |
| `dp_closing_records` | End-of-day rider reconciliation | Compares load vs deliveries vs returned vs cash |
| `dp_archives` | Frozen monthly snapshot | `payload jsonb` holds that month's deliveries+payments+expenses+closingBalances |
| `dp_milk_inwards` | Bulk milk procurement | Not currently rendered in UI |
| `dp_audit_logs` | All Owner-side mutations | `action ∈ CREATE/UPDATE/DELETE/SYNC_REJECTED` |
| `dp_metadata` | KV (system_revision, owner_pin) | RLS disabled |

### Domain types

`types.ts` — most fields are obvious. Worth knowing:

- `Customer.urduName` — bilingual receipts
- `Delivery.linkedDeliveryId` / `adjustmentTag` — used for one-time price corrections
- `RiderClosingRecord` — physical_cash vs expected_cash diff is the audit gap
- `MonthlyArchive.closingBalances: Record<customerId, number>` — what `reconcileBalancesWithArchives` reads

## 2. Ledger math

**Live balance** (per-customer, in `App.tsx` `balances` memo):

```
balance = openingBalance
        + Σ(deliveries where !deleted && customerId = c.id)
        − Σ(payments    where !deleted && customerId = c.id)
```

Every record is de-duplicated by id with a Map before summing — paranoid guard against ghosts from realtime + cache merges. Each sum is rounded to 2dp.

**Server mirror**:

- View `dp_customer_balances` (in `20260310_add_ledger_view.sql`) — same formula in SQL.
- RPC `get_start_of_month_balances(target_date)` — used to seed `openingBalance` after a fetch (see `relationalDataService.fetchAll`). It computes balance using only transactions strictly before `DATE_TRUNC('month', target_date)`.

**Cycle breakdown** (`services/ledgerUtils.ts` `calculateCycleBreakdown`):

- FIFO: payments and any negative opening balance form one credit pool; deliveries (oldest first) plus a positive opening balance form the debit list. Credit is consumed against debits in date order.
- Remaining debits are bucketed into cycles (`getCycleBoundaries` for Daily/10/15/Monthly), all *past* cycles are then collapsed into a single "previous cycle" row + the current/future cycles are kept.
- Drives `BillingTracker` and the receipts.

## 3. Sync model

**Initial fetch** (`relationalDataService.fetchAll`, called from `App.tsx` `fetchCloudData`):

1. `dateLimit` = first day of *previous* month → only the last full month + current month of transactional rows are pulled. Customers/Riders/Prices have no date limit.
2. Pagination: `range(from, from+999)` per table.
3. Server balances are loaded via `get_start_of_month_balances(firstDayStr)` and overwrite each customer's `openingBalance` so the client formula stays correct without ancient history.
4. Archives, audit logs, closing records are also fetched (full).
5. State is `sanitize`d (Map by id + filter `!deleted`) before being saved.
6. Small tables → mirrored to localStorage; archives/auditLogs/closingRecords are **never** cached locally (quota).

**Realtime** (`App.tsx` line ~504): one `db-live-sync` channel listens to `postgres_changes` on `dp_deliveries`, `dp_payments`, `dp_customers`, `dp_riders`, `dp_rider_loads`, `dp_expenses`. Each `handleChange` upserts into the matching local array. Deletes are detected via `payload.eventType === 'DELETE'` or `record.deleted`.

**Writes**: every mutating component imports `supabase` directly and calls `.from(table).upsert(toSnakeCase(record))`. The realtime channel then fans the change back to other tabs/devices. There's no central write queue; each component owns its own optimistic update.

**OCC**: `20260427_enforce_occ.sql` adds a `BEFORE UPDATE` trigger that raises `P0001` when `NEW.version <= OLD.version`. The client increments `version` whenever it edits a record. Conflict-handling UI on the React side is **not yet implemented** — currently a stale write surfaces as an alert/console error.

**Soft-delete**: `relationalDataService.softDeleteByDateRange` sets `deleted=true, updated_at=now()` for rows in a date window. Used by month-close.

## 4. Auth & RLS

- **PIN login**: `verify_pin(pin text)` (in `20260427_fix_auth.sql`) returns `{ success, role: 'OWNER' | 'RIDER', id }`. Owner PIN is in `dp_metadata` key `owner_pin`. Rider PINs are in `dp_riders.pin` (also accepts left-padded variants).
- **RLS**: enabled on all `dp_*` operational tables (`20260313_enable_rls.sql`). Policies key off `current_setting('app.user_role')` and `current_setting('app.current_rider_id')`. **Caveat:** the React client doesn't currently set these settings over Supabase REST — see PRODUCTION_AUDIT.md §1. So in practice the anon key plus the lack of session vars means RLS is permissive. Treat the PIN screen as the only real gate today.
- **Wholesale RLS** is fully open (`allow_all_ws_*` policies in `20260327000000_wholesale_module.sql`).

## 5. Tab map (Owner)

Dispatched in `App.tsx renderContent()`. Bottom-nav has `dashboard` + `milk` + a `More` sheet that opens the rest:

| activeTab | Component | What it does |
|---|---|---|
| `dashboard` | `Dashboard.tsx` | KPIs, charts, top-level summary |
| `milk` | `DeliveryEntry.tsx` | Daily entry grid: liters per customer, inline cash collect, route ordering |
| `billing` | `BillingTracker.tsx` | Per-cycle outstanding (uses `calculateCycleBreakdown`) |
| `dispatch` | `DispatchHub.tsx` | Morning rider load issuance (`dp_rider_loads`) |
| `audit` | `RiderClosing.tsx` | End-of-day reconciliation: load vs delivered vs returned vs cash |
| `expenses` | `ExpenseManagement.tsx` | Petrol/baraf/etc |
| `log` | `DailyLog.tsx` | Combined deliveries+payments stream |
| `ledger` | `Ledger.tsx` (re-exported as Reports) | Per-customer ledger; archives sync; manual adjustments |
| `customers` | `CustomerManagement/` | CRUD; route assignment |
| `analytics` | `Analytics.tsx` | Recharts trends |
| `insights` | `BusinessInsights.tsx` | AI/Gemini-driven insights from archives |
| `intelligence` | `SessionIntelligence.tsx` | "Live Pulse" |
| `finance` | `FinancialSummary.tsx` | P&L-ish view |
| `wholesale` | `wholesale/WholesaleHub.tsx` | The wholesale sub-app (separate tables) |
| `notTaken` | `NotTakenToday.tsx` | Customers with no delivery today |
| `dailyUpdates` | `DailyWhatsAppUpdates.tsx` | WhatsApp-ready customer summaries |
| `setup` | inline | StaffManagement + PriceManagement + ArchiveManager + Sign Out |

Riders see only `milk` + a `setup` tile that maps to Sign Out.

## 6. Wholesale sub-app

Lives under `components/wholesale/` and `services/wholesaleDataService.ts`. Different data model:

- UUID PKs (gen_random_uuid), `total_amount` is a generated column (`quantity * rate`) — no manual upkeep.
- No OCC, no `version` column, no soft delete.
- Multi-product: `ws_products` (Milk + Yogurt seeded), payment cycles are loose strings.
- Invoice numbering via RPC `get_next_invoice_number` against `ws_metadata.last_invoice_number`.
- Has its own realtime channel inside `WholesaleHub` that just bumps a `refreshKey`; child screens refetch.

It is a sibling of the retail app, intentionally minimal — don't try to unify the two ledgers.

## 7. Print pipeline

- Anything that needs to print is rendered into `#print-root` (kept `display:none` until `@media print`).
- Three thermal widths: `.thermal-58`, `.thermal-80`, `.thermal-A4` — set via class on the print container.
- `services/printService.ts` orchestrates; `Receipts.tsx` and `ThermalPrintView.tsx` are the templates; `wholesale/WholesalePrintService.ts` is the wholesale equivalent.
- PDF/XLSX exports go through `services/exportService.ts` (jspdf + xlsx).

## 8. Migration history (in order)

```
20260308_initial_schema.sql            All dp_* tables + indexes + metadata seed
20260309_add_revision_indexes.sql      Indexes on (updated_at, version) for delta sync
20260309_performance_upgrade.sql       Misc index tuning
20260310_add_ledger_view.sql           dp_customer_balances view
20260313_add_unique_constraints.sql    Anti-duplicate guards
20260313_enable_rls.sql                RLS policies (see §4)
20260327000000_wholesale_module.sql    All ws_* tables
20260418_add_payment_adjustments.sql   adjustment_tag + linked_delivery_id on dp_payments
20260427_enforce_occ.sql               OCC trigger on all operational tables
20260427_fix_auth.sql                  verify_pin RPC + owner_pin metadata seed
20260427_start_month_balances.sql      get_start_of_month_balances RPC
```

When you add a migration, name it `YYYYMMDD[HHMMSS]_<topic>.sql` to match the existing ordering scheme.
