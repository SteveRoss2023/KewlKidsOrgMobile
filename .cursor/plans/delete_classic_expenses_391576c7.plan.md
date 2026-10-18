---
name: Delete classic expenses
overview: Bring the new expenses hub to parity on high-impact classic features (period filters, receipt scan, Update plan refresh, search/filters/sort, category-tag delete, full edit fetch). Classic stays until a later pass. Medium items are listed for a follow-up.
todos:
  - id: hub-period-filters
    content: Port day/week/month/year period nav + filter control into expenses-hub Expenses tab
    status: completed
  - id: hub-receipt-scan
    content: Wire ReceiptScanWizard into expenses-hub Expenses tab (camera action)
    status: completed
  - id: hub-update-plan
    content: Ensure Update plan works in hub Bills and refreshes Budgets/Expenses after apply
    status: completed
  - id: hub-search-filter-sort
    content: Add search, filter panel (category/payment/tag/recurring), and sort to hub Expenses tab
    status: completed
  - id: hub-cat-tag-delete
    content: Add category and tag delete on hub Categories tab
    status: completed
  - id: hub-full-expense-edit
    content: Fetch full expense (line items) before opening edit form in hub
    status: completed
  - id: verify-build
    content: Rebuild mobile web and smoke-check hub Expenses + Bills + Categories
    status: completed
  - id: defer-classic-delete
    content: "Later: retarget Home, remove Classic button, delete classic routes"
    status: completed
  - id: defer-medium-items
    content: "Later: Today jump, All period, upcoming bills view, year budget delete/help, stay-open create, soft refresh"
    status: completed
isProject: false
---

# Hub parity first (classic stays)

## Goal
Ship high-impact missing hub features so you can validate the new layout **with classic still available**. Classic removal and medium items are follow-ups.

## This pass — high impact

### 1. Period filters on Expenses tab
[`expenses-hub.tsx`](mobile/app/(tabs)/expenses-hub.tsx) today only navigates by **month**.

- Extract classic period helpers into [`mobile/utils/expensePeriods.ts`](mobile/utils/expensePeriods.ts).
- Period-aware prev/next + label; **filter** control for **Day / Week / Month / Year** (default Month).
- Load expenses/budgets for the selected range (year → yearly budgets like classic).
- Empty copy: “this period”.

### 2. Receipt scan
Wire [`ReceiptScanWizard`](mobile/components/expenses/ReceiptScanWizard.tsx) into the Expenses toolbar (camera next to Add). Reload current period on success.

### 3. Update plan refresh
[`BillsBudgetsHub`](mobile/components/expenses/BillsBudgetsHub.tsx) already shows **Update plan** when embedded. Fix post-apply sync:

- Add `onPlanApplied?: () => void`.
- Call from `UpdatePlanWizard` `onApplied`.
- In hub: bump `budgetsRefreshKey` + reload expenses.

### 4. Search, filters, and sort (Expenses tab)
Port classic list power tools into the hub Expenses tab (same behavior as classic toolbar/panel):

- **Search** across description, category name, notes, tags.
- **Filter** panel: category, payment method, tag, recurring vs one-time.
- **Sort**: date / amount / category, ascending or descending.
- Apply client-side on the loaded period list (same pattern as classic); keep category card grouping after filter/sort.

### 5. Category and tag delete
On hub Categories tab: trash actions with confirm, calling existing `expenseService` delete APIs (mirror classic handlers).

### 6. Full expense fetch on edit
Before opening `ExpenseForm` for edit, `getExpense(id)` so line items and full fields load (classic `openExpenseEditor` pattern). Use on Expenses tab and any BudgetCard drill-down edit paths in the hub.

### 7. Verify
- Keep Classic ↔ New layout navigation.
- `npm run build` in `mobile`.

## Later — medium / nice-to-have (keep for reference)
Do **not** implement in this pass; revisit after high-impact validation:

- **Today** jump on period nav
- **All** period mode (no date filter)
- Combined **upcoming recurring + expenses** view
- Budget **delete / help** from year UI (`YearBudgetOverview` affordances vs `MonthBudgetCards`)
- Create-and-**stay-open** for multi-entry
- Soft refresh / stale-request guard

## Later — classic removal (not now)
After you confirm the hub:

- Point Home → `expenses-hub`
- Remove “Classic layout” button
- Delete `expenses.tsx`, legacy create/manage-budgets, unused orphans
- Clean `_layout` screens

## Out of scope
- Generate-expenses-from-recurring dry-run (Update plan supersedes)
- Reports (placeholder in both layouts)
