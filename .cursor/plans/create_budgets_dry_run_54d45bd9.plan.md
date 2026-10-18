---
name: Create Budgets Dry Run
overview: Add create-from-recurring budgets (monthly, dry-run, expense analysis) plus month-to-month navigation so spent reflects recurring-generated and manual expenses for the selected month.
todos:
  - id: api-create-budgets
    content: Add BudgetViewSet.create_from_recurring (always monthly) with dry_run, analyze_expenses, detailed results
    status: completed
  - id: api-budget-as-of
    content: Support as_of / year-month on budget list so spent% is for the selected month (not only today)
    status: pending
  - id: types-service
    content: Add CreateBudgetsResult types + expenseService.createBudgetsFromRecurring + as_of on getBudgets
    status: completed
  - id: budgets-ui
    content: "Budgets tab: dry-run/analyze toggles, create button, results modal, month prev/next nav"
    status: completed
  - id: budget-card-period
    content: Show period label on BudgetCard (Daily/Weekly/Monthly/Yearly)
    status: completed
isProject: false
---

# Create Budgets from Recurring (+ Expense Analysis + Month Nav)

## Decisions (locked)
- **Auto-create always uses `monthly`** — normalize recurring to a monthly budget limit
- Daily / weekly / yearly budgets stay available via manual form and **show** in the list with a period label
- **Existing monthly budget** for same family + category → **update amount**
- Dry run **on by default**; detailed results; **Run for real** from preview
- Optional **Analyze expenses** toggle for missing/higher category budgets
- **Month-to-month navigation** on Budgets tab so you can see spent vs limit for any month

## How month view works
- Budget **limit** = the budget amount (seeded from recurring / analysis; same across months unless updated)
- Budget **spent** for the selected month = sum of **expenses** in that category whose `expense_date` falls in that month (includes generated recurring expenses + one-off expenses)
- Prev/next month control (same idea as Expenses period tabs) sets `viewMonth`
- API list accepts `as_of=YYYY-MM-DD` (first of selected month); spent/remaining/% use that date’s period window instead of `today`

```mermaid
flowchart LR
  viewMonth[Selected month] --> api["GET /budgets/?as_of=YYYY-MM-01"]
  api --> spent[Sum expenses in category for that period]
  spent --> card["Card: spent / limit · % used"]
  recurringGen[Generate Expenses] --> expenses[(Expense rows)]
  manualAdd[Manual / receipt expenses] --> expenses
  expenses --> spent
```

## Create-from-recurring behavior

```mermaid
flowchart TD
  start[User on Budgets tab] --> opts[dry_run + analyze_expenses]
  opts --> run[POST create_from_recurring]
  run --> base[Sum active recurring by category normalized to monthly]
  base --> analyze{analyze_expenses?}
  analyze -->|yes| hist[Avg monthly spend by category last 12 months]
  analyze -->|no| merge[Merge suggestions]
  hist --> merge
  merge --> each[Per category monthly suggestion]
  each --> exists{Monthly budget exists for category?}
  exists -->|no| create[would_create / create]
  exists -->|yes| update[would_update / update amount]
  create --> results[Detailed by_category list]
  update --> results
```

**Recurring → monthly:** daily×30.44, weekly×4.33, monthly×1, yearly÷12

**Expense analysis:** last 12 months; avg monthly; merge with max(recurring, expense_avg); skip ~$0

**Match existing:** active `family` + `category` + `period='monthly'`

## Backend
1. [`backend/expenses/views.py`](backend/expenses/views.py) `BudgetViewSet.create_from_recurring`
   Body: `{ family, dry_run, analyze_expenses }` — period fixed monthly
   Response: counts + `by_category[]` actions (`would_create` / `created` / `would_update` / `updated` / `skipped`)

2. Budget list + serializer spent calc: accept `as_of` query param; use it as the reference date for daily/weekly/monthly/yearly windows in [`BudgetSerializer.get_spent_amount`](backend/expenses/serializers.py) (via serializer context)

## Frontend
[`mobile/app/(tabs)/expenses.tsx`](mobile/app/(tabs)/expenses.tsx) Budgets tab:
- Month prev/next + label (e.g. October 2026); refetch budgets with `as_of` when month changes
- Dry run + Analyze expenses toggles + Create budgets button + results modal
- FAB + form unchanged for manual any-period budgets

[`mobile/components/expenses/BudgetCard.tsx`](mobile/components/expenses/BudgetCard.tsx): period label (`Rent · Monthly`)

[`mobile/services/expenseService.ts`](mobile/services/expenseService.ts) + types: create-from-recurring + `getBudgets(familyId, { isActive, asOf })`

## Out of scope
- Yearly generation window label for Cursor AI (deferred)
- Auto-creating daily/weekly/yearly budgets from this button
- Per-month *different* budget limits (limit stays one amount; only spent changes by month)
