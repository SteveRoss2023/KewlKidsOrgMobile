---
name: One request per tab
overview: Cold Overview and Budgets each wait on several HTTP calls that the dev server runs one after another. Replace those with one response built from the existing serializers, and stop the Expenses tab from waiting on a bill preview that changes nothing.
todos:
  - id: overview-year-endpoint
    content: Add overview_year that returns streams, occurrences, unpaged expenses, and the existing year_board
    status: completed
  - id: wire-overview-budgets
    content: Point CashflowDashboard and BudgetDashboard cold loads at that one call
    status: completed
  - id: expenses-preview-background
    content: Stop ExpenseDashboard from awaiting the bill preview before its lists
    status: completed
  - id: browser-check
    content: Cold-load Overview, Budgets, and Expenses in the browser and confirm one request and the same figures
    status: completed
isProject: false
---

# One request for the cold tab load

Django already finishes this work in about half a second. The spinner stays up until the browser’s HTTP calls return. A cold Overview is five trips: streams, occurrences, expense page 1, expense page 2 (117 expenses, page size 100), and the budget board. The dev server runs one request at a time, so those trips stack into the 3–6 seconds.

Do not change how amounts are calculated. Do not add a second budget-board implementation. The new response calls the code that already serves those screens.

## One year payload

Add `GET /api/expenses/overview_year/?family=&year=` on [backend/expenses/views.py](backend/expenses/views.py) `ExpenseViewSet`.

The body is four keys, each produced by the code the tabs already use:

- `streams` and `occurrences`: the same income serializers and filters as `moneyService.getStreams` / `getOccurrences` for that family and `YYYY-01-01`..`YYYY-12-31`.
- `expenses`: `ExpenseSerializer` on the same filtered queryset as the expense list for that date range, with no paging, so both pages come back in this one body.
- `budgets`: the existing `BudgetViewSet.year_board` result, unchanged (`{ "YYYY-01": [rows], ... }`).

[mobile/services/expenseService.ts](mobile/services/expenseService.ts) gets `getOverviewYear(familyId, year)`.

- [mobile/components/expenses/CashflowDashboard.tsx](mobile/components/expenses/CashflowDashboard.tsx) `load`: replace the `Promise.all` of four calls with this one. Leave `ensureYearSchedule` where it is, after `setLoading(false)`, so income auto-fill still does not hold the spinner.
- [mobile/components/expenses/BudgetDashboard.tsx](mobile/components/expenses/BudgetDashboard.tsx) `loadYear`: replace the board-plus-expenses pair with the same call. Keep the bill preview in the background, as it is now.

## Expenses tab

In [mobile/components/expenses/ExpenseDashboard.tsx](mobile/components/expenses/ExpenseDashboard.tsx) `load`, the spinner currently `await`s `previewBillExpensesForYear` before categories, tags, expenses, budgets, and repeating bills. On this data that preview is 0 create, 0 update, 0 remove. Start it in the background the way Budgets already does (`void`, then `setEnsurePreview` only when `ensureYearHasChanges`). The five list calls stay as they are.

## Undo

The old endpoints stay. Nothing is migrated and no stored figures change. If the screen is still slow, revert the client to the four calls, the board-plus-expenses pair, and the awaited bill preview. The new `overview_year` action can stay unused or be deleted with it. One git revert of that commit puts the tabs back.

## Check

No database writes. In the browser, cold-open Overview, Budgets, and Expenses (hard refresh so the module cache is empty). Overview and Budgets should each show one `overview_year` request, and the spinner should drop when that response arrives. Expenses should show the list requests starting without waiting on `ensure_year`. Spot-check one month’s income, spent, and budget remaining against the figures on screen before the change.
