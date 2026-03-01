# Optica Handoff (2026-02-22)

## Project Snapshot
- App: local optical store/lab management (`localhost`), French UI, DZD currency.
- Stack: Next.js 15 + Prisma + SQLite + JWT cookie auth.
- Roles: `ADMIN`, `OPTICIEN`, `GESTIONNAIRE_STOCK`, `VENDEUR`.
- Core business constraints: FIFO stock costing, strict RBAC, numbered documents, audit on critical actions, no tax/barcode.

## What Is Implemented
- Auth/session + RBAC guards (`/api/auth/*`, `lib/permissions.ts`).
- Patients + prescriptions (including contact lens fitting).
- Orders workflow + status transitions + payments + print docs (delivery note/invoice/receipt).
- Orders listing UX: date filters (`from`/`to`) + default sort recent-to-old on `/orders`.
- Supplier flow: supplier profile, purchase orders, receptions, supplier invoices, supplier payments, supplier returns, aging.
- Stock flow: products, lots, movement ledger, low-stock alerts.
- Cash shift (seller open/close) + daily cash report.
- Admin accounting module:
  - APIs:
    - `/api/reports/accounting/summary?from&to`
    - `/api/reports/accounting/sales?from&to&groupBy=day|week|month`
    - `/api/reports/accounting/purchases?from&to`
    - `/api/reports/accounting/profit?from&to`
    - `/api/reports/accounting/cashflow?from&to&groupBy=day|week|month`
  - Page: `/reports/accounting` (KPI + period/category/seller/supplier tables).
- Admin payment correction workflow (cancel payment with reason + audit):
  - customer payment cancel: `/api/orders/[id]/payments/[paymentId]/cancel`
  - supplier payment cancel: `/api/supplier-invoices/[id]/payments/[paymentId]/cancel`
  - UI buttons in order/supplier-invoice details pages.
- Backup/restore + scheduling scripts.
- Integration tests (`scripts/integration-tests.js`) cover major workflows.

## Recent Critical Fixes
- Modal rendering fixed globally by portal to `document.body`:
  - `components/modal.tsx`
  - `app/globals.css`
- Modal forms normalized (embedded mode to avoid broken nested cards):
  - `components/product-create-form.tsx`
  - `components/stock-input-form.tsx`
  - `components/supplier-create-form.tsx`
  - `components/purchase-order-create-form.tsx`
  - `components/supplier-invoice-create-form.tsx`
  - `components/*-create-modal.tsx`
- Anti double-click / race fix for payments (server-side atomic guard + UI submit lock):
  - `app/api/supplier-invoices/[id]/payments/route.ts`
  - `components/supplier-invoice-actions.tsx`
  - `app/api/orders/[id]/payments/route.ts`
  - test added in `scripts/integration-tests.js` (`double-click payment guard`).
- Accounting analytics delivered (API + admin UI):
  - `lib/services/accounting-report.ts`
  - `app/api/reports/accounting/*`
  - `app/reports/accounting/page.tsx`
- Payment correction delivered (admin-only cancel payment):
  - `app/api/orders/[id]/payments/[paymentId]/cancel/route.ts`
  - `app/api/supplier-invoices/[id]/payments/[paymentId]/cancel/route.ts`
  - `components/order-payment-cancel-button.tsx`
  - `components/supplier-payment-cancel-button.tsx`
- Orders table filtering/sorting enhancement:
  - `app/orders/page.tsx` (date filter + explicit date column + newest first default)

## Current UI State
- Main shell redesigned with sidebar + command bar (`components/app-shell.tsx`).
- Admin nav includes Accounting entry.
- Creation flows for suppliers/PO/invoices/stock now use modals from page action buttons.
- `/orders/new` and patient workspace already modernized.
- `/orders` now supports date filters and keeps recent-first listing by default.

## Remaining Product Gaps (Highest Value)
- Accounting heavy datasets currently return full-range payloads (no pagination/limit yet).
- No dedicated reversal history report page (audit exists but no focused UI).
- No CSV export endpoints for finance/reporting tables.
- Final acceptance/UAT pass and operational docs refresh still pending.

## Recommended Next Tasks (Priority)
1. Add pagination/range guardrails for accounting endpoints and UI tables.
2. Extend integration tests for accounting math edge cases (mixed statuses, returns, cancelled docs).
3. Add optional export endpoints (CSV) for accounting/supplier aging/daily cash.
4. Add admin-facing reversal/audit timeline page (payment cancels, returns, cancellations).
5. Execute full acceptance checklist + refresh runbooks/handoff with final screenshots.

## Important Business Logic Notes
- Supplier/customer payments are now protected against concurrent overpay races.
- Payment cancellation is admin-only and requires a reason.
- Customer payment cancellation removes linked receipt (if any) before order recompute.
- Supplier payment cancellation recomputes invoice amounts/status atomically.
- Financial fields on confirmed records are immutable except via allowed workflows.
- FIFO is consumed on `OUT` and `RETURN_SUPPLIER` in stock service.
- Seller must never see buy prices/cost/margin/supplier debt pages.

## Validation Commands
- Type check: `npx tsc --noEmit`
- Production build: `npx next build --no-lint`
- Integration tests: `npm run test:integration`

## New Chat Bootstrap Prompt (Copy/Paste)
```txt
Continue the Optica project in c:\Users\HP\optica.

Read first:
- docs/HANDOFF.md
- README.md
- prisma/schema.prisma
- components/app-shell.tsx
- app/reports/accounting/page.tsx
- lib/services/accounting-report.ts
- app/api/orders/[id]/payments/[paymentId]/cancel/route.ts
- app/api/supplier-invoices/[id]/payments/[paymentId]/cancel/route.ts
- scripts/integration-tests.js

Then:
1) Summarize current state in <=10 bullets.
2) Propose exact implementation plan for accounting pagination/export hardening.
3) Start implementation with API hardening first, then tests.
```
