---
name: Faster expense overview
overview: Before any app change, a read-only script reports whether a one-pass budget board would change any figures, and how long today's Overview server work takes versus the proposed work. The app is not changed in this step.
todos:
  - id: parity-script
    content: Add a read-only script that compares budget-board figures and times every Overview server call (today vs proposed). Do not change views, serializers, or the client.
    status: pending
isProject: false
---

# Faster expense overview

The question for this step is what the Overview page is waiting on, and whether a faster budget board would change any figures. No app code changes until that answer is printed.

## This step only

Do not change [backend/expenses/views.py](backend/expenses/views.py), the serializers, or the mobile app. Do not leave a second code path inside `year_board`.

Add one read-only script, run with the project venv, that:

- Loads the current family's budgets for a given year (argument, default the current year).
- Builds each month with today's logic: `_rows_for_month`, which calls `build_budget_period_caches` twelve times.
- Builds the same months with a one-pass map (paid expenses for the year decrypted once, repeating expenses decrypted once) and the same `BudgetSerializer` and `pick_budgets_for_month`.
- Prints `match` or lists every differing month, category, amount, spent, and remaining.
- Times the four things Overview loads together, on today's path and on the proposed path:
  - income streams
  - income occurrences for the year
  - the full-year expense list, including receipt lines (today) versus a list of date, amount, category, category name, description, and paid flag only (proposed)
  - the twelve-pass budget board (today) versus the one-pass board (proposed)
- Prints each duration and the page's server time, which is the slowest of the four, because the app waits for the slowest call rather than the sum.
- Writes nothing. No expenses, budgets, or keys are updated.

The figure check is only for the budget board. The expense-list timing uses the same amounts the page already shows; it does not recalculate limits or spent. The durations are server time inside Django. They do not include the browser or the network, so they will be lower than the 3–6 seconds you see on screen, and they show which call causes that wait. What to change in the app, if anything, waits on that output.
