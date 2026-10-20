---
name: Find tab load delay
overview: Time the exact first-load request sequence for Overview, Expenses, and Budgets, including the bill preview the Expenses tab waits on. No app or database changes. The result names which call accounts for the 3–6 seconds.
todos:
  - id: time-tab-sequences
    content: Time Overview, Budgets, and Expenses first-load sequences in the read-only script, including ensure_year dry run
    status: completed
  - id: report-cause
    content: Report which call accounts for the wait, and whether the rest is outside Django
    status: completed
isProject: false
---

# Find the tab load delay

The earlier script showed the Overview database work is about 0.27 seconds. That is not the wait on screen. The tabs do not wait on that work alone.

## What each first open actually waits on

- **Overview** ([mobile/components/expenses/CashflowDashboard.tsx](mobile/components/expenses/CashflowDashboard.tsx)): the spinner stays up until four HTTP calls finish (streams, occurrences, full-year expenses, budget board). The dev server runs one request at a time, so those four do not overlap.
- **Budgets** ([mobile/components/expenses/BudgetDashboard.tsx](mobile/components/expenses/BudgetDashboard.tsx)): the spinner waits on the budget board and the full-year expense list. The bill preview is started in the background and does not hold the spinner.
- **Expenses** ([mobile/components/expenses/ExpenseDashboard.tsx](mobile/components/expenses/ExpenseDashboard.tsx)): the spinner stays up through `previewBillExpensesForYear`, which is `POST /recurring-expenses/ensure_year/` with `dry_run: true`, and only then starts categories, tags, expenses, budgets, and repeating expenses. That preview walks every active repeating bill in [backend/expenses/views.py](backend/expenses/views.py) `ensure_year`. The earlier script never timed it.

## Measurement

Extend [backend/scripts/overview_load_check.py](backend/scripts/overview_load_check.py) so one read-only run times those three sequences the way the tabs run them, still inside a rolled-back transaction:

- Overview: the four calls, reported as the slowest and as the sum (because the dev server serializes them).
- Budgets: year board plus full-year expenses, same two numbers.
- Expenses: `ensure_year` dry run first, then the five list calls. Print the preview time on its own and the total the spinner waits for.

Print each call's seconds. Do not change views, serializers, or the mobile app. Do not write expenses, budgets, or keys. Compare row counts before and after.

If every sequence is still well under a second, the remaining seconds are the HTTP trip (localhost versus `organizer-api.kewlkids.ca`), and the script output will say so instead of guessing.

## Result (2026-10-20, family 9, year 2026)

Django work for every first-load sequence is about half a second. Row counts were unchanged after rollback. No view, serializer, or app file was changed.

| Sequence | One at a time | Slowest call |
| --- | --- | --- |
| Overview | 0.520s | full-year expenses 0.279s |
| Budgets | 0.516s | full-year expenses 0.279s |
| Expenses | 0.574s | bill preview 0.394s, then lists 0.180s |

The bill preview would change nothing (0 create, 0 update, 0 remove). The remaining seconds of the 3–6s screen wait are the HTTP trip, not this database work.
