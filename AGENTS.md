# Gujjar Milk Shop — Project Context

> Auto-generated context primer. Read this first in any new session.
> The original product was scaffolded in **Google AI Studio** (see `README.md`, app id `cd2f64ad-4ea7-45bd-a655-df82fa15fd68`) and has since been hand-extended into a full POS/ledger system.

## What this is

A **dairy delivery & accounting web app** for a Pakistani milk shop ("Gujjar Milk Shop"). It runs as a mobile-first PWA-style React app and is used live by:

- **Owner** — full HQ dashboard, sees all riders/customers, runs month-close, adjustments, analytics, wholesale module.
- **Riders** — restricted view, only their own customers; record daily milk delivery and cash collection.

Login is a **PIN** verified server-side via the Supabase RPC `verify_pin` (Owner PIN stored in `dp_metadata`, rider PINs in `dp_riders.pin`).

`metadata.json` describes the app as: *"A professionally audited, accounting-safe dairy delivery system for Pakistan. Features immutable rider logs, owner-only adjustments, and hard-close monthly archiving."*

## Stack

- **Frontend**: React 18 + TypeScript + Vite 5
- **Styling**: Tailwind 3, lucide-react icons, `motion` (Framer Motion successor) for animations
- **Charts**: recharts
- **Virtualization**: react-window + react-virtualized-auto-sizer
- **Exports**: jspdf, html2canvas, xlsx
- **AI**: `@google/genai` (Gemini) — wired in for AI features (e.g. SessionIntelligence / BusinessInsights)
- **Backend**: Supabase (Postgres + Realtime + RPC). No custom server.
- **State**: React useState in `App.tsx` is the single source of truth; `localStorage` is a cache for small tables; large tables (archives, audit logs, closing records) are server-only.

## Run & build

```
npm install
npm run dev      # vite dev server
npm run build    # production bundle to dist/
npm run preview
npm run lint
```

Required env vars (in `.env.local`, consumed via `vite.config.ts`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY`  (anon key)
- `VITE_OWNER_PIN` — legacy; the live PIN check now uses the server-side `verify_pin` RPC.
- `GEMINI_API_KEY` — for the Gemini-powered features (mentioned in README).

`services/supabaseClient.ts` **throws** at import time if the URL/key are missing.

## Top-level layout

```
App.tsx                      Root: auth, global state, fetch/sync, tab routing, month-close
index.tsx                    React root + ErrorBoundary
index.html                   Inter font, print CSS for thermal 58/80mm + A4 receipts
types.ts                     Core domain types & enums (UserRole, PaymentCycle, PaymentMode, BaseEntity…)
types/wholesale.ts           Wholesale module types (separate `ws_*` tables)

services/
  supabaseClient.ts          Client init, isCloudConnected(), testConnection()
  relationalDataService.ts   fetchAll, persistCollection, OCC-aware upserts, snake/camel mapping
  dataStore.ts               localStorage cache, generateId, formatPKR, findPriceForDate, INITIAL_*
  ledgerUtils.ts             FIFO cycle breakdown (Daily/10/15/Monthly)
  printService.ts            Thermal & A4 print pipelines
  exportService.ts           XLSX/PDF export
  wholesaleDataService.ts    All wholesale CRUD (separate from retail)

components/                  Feature screens — see docs/ARCHITECTURE.md for the full map
  wholesale/                 Wholesale Hub (separate sub-app)
  CustomerManagement/        Split-out: index.tsx, CustomerModal, CustomerRow

supabase/migrations/         All schema + RLS + RPC + OCC trigger SQL
PRODUCTION_AUDIT.md          Known security/integrity issues — read before shipping changes
docs/ARCHITECTURE.md         Deeper dive (sync, ledger math, tabs, RLS)
```

## The mental model (most important section)

1. **All money lives as `Customer.openingBalance` + active deliveries − active payments**, computed in `App.tsx` `balances` memo (also mirrored server-side in the `dp_customer_balances` view and `get_start_of_month_balances` RPC).
2. **Month-close** (`onCloseMonth` in `App.tsx`):
   - Snapshots that month's deliveries/payments/expenses into `dp_archives.payload` (jsonb).
   - Carries forward the closing balance into each customer's new `openingBalance`.
   - **Soft-deletes** every transaction with `date <= endOfMonth` (sets `deleted=true`) so it stops contributing twice.
   - Writes an audit log entry.
3. **Adjustments** (`handleManualAdjustment`) are Owner-only. A DEBIT becomes a `Delivery` with `liters=0, isAdjustment=true`; a CREDIT becomes a `Payment` with `isAdjustment=true`. Always tagged + audit-logged.
4. **Realtime sync**: a single Supabase channel (`db-live-sync`) subscribes to `postgres_changes` on the six core tables and merges into local state.
5. **Concurrency**: every entity extends `BaseEntity { id, updatedAt, version, deleted? }`. The trigger in `20260427_enforce_occ.sql` rejects updates where `NEW.version <= OLD.version`. **Always bump `version` and refresh `updatedAt` when upserting.**
6. **Naming**: JS uses camelCase, Postgres uses snake_case. `relationalDataService.toSnakeCase` / `toCamelCase` bridges them. Always go through these helpers.
7. **Two parallel modules**: retail (`dp_*` tables) and wholesale (`ws_*` tables) — they don't share customers, prices, or ledger math.

## Conventions when editing

- Don't store `archives`, `auditLogs`, or `closingRecords` in localStorage — `saveToStore` short-circuits these keys (quota issues on rider devices).
- All new tables should follow the `BaseEntity` shape (`id text pk, updated_at, version, deleted`) and get an OCC trigger like the others.
- All money is rounded with `Math.round(x * 100) / 100` to fight float drift (see PRODUCTION_AUDIT.md §2 — long-term fix is paisa-as-integer, not done).
- Prices: never hard-code; always go through `findPriceForDate(date, customer, prices)` — it follows the priority `customer.customPrice → customer-specific historical → global historical` and **throws** if no rate is defined.
- Print receipts must live inside `#print-root` (see `index.html` `@media print` rules); thermal classes are `.thermal-58` / `.thermal-80` / `.thermal-A4`.
- Tabs are dispatched via `activeTab` state in `App.tsx renderContent()` — to add a screen, add a `case` and an entry in the More-menu grid.
- Roles: gate Owner-only UI with `currentUser.role === UserRole.OWNER`. Riders are scoped via `globalFilterRiderId` / `effectiveRiderId`.

## Known production risks (from PRODUCTION_AUDIT.md)

The author already identified and partially addressed:

1. **Auth**: PIN check is now server-side (`verify_pin` RPC), but RLS policies still rely on `current_setting('app.user_role')` which the client cannot set over REST → effectively bypassed.
2. **Float math**: still using JS numbers for currency.
3. **OCC**: trigger is in place (`enforce_occ_version`), but the client doesn't yet handle the 409 / `P0001` rejection with a conflict-resolution UI.
4. **Memory**: full-history fetch is now date-limited (`fetchTable` only pulls deliveries/payments/etc. from the previous month onward), and large tables aren't cached locally.

When making changes that touch money, sync, or auth, re-read PRODUCTION_AUDIT.md.

## Where to look when…

| You need to… | Open |
|---|---|
| Change how a balance is calculated | `App.tsx` `balances` memo + `services/ledgerUtils.ts` + `dp_customer_balances` view |
| Add a column to a table | New migration in `supabase/migrations/` + matching field on the type in `types.ts` (camelCase) — `relationalDataService` handles the conversion automatically |
| Add a new screen | `components/<Name>.tsx`, then a `case` in `App.tsx renderContent()` + a tile in the More menu |
| Touch month-close | `App.tsx onCloseMonth` + `components/ArchiveManager.tsx` |
| Change rider/owner permissions | `verify_pin` RPC in `20260427_fix_auth.sql` and the role gates in `App.tsx` |
| Wholesale work | `components/wholesale/*` + `services/wholesaleDataService.ts` + `20260327000000_wholesale_module.sql` |
| Receipts / printing | `services/printService.ts` + `components/Receipts.tsx` + `components/ThermalPrintView.tsx` + print CSS in `index.html` |

See `docs/ARCHITECTURE.md` for the deeper version.
