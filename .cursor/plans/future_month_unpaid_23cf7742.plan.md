---
name: Future month unpaid
overview: Future months currently label unused envelopes (Food & Dining, Transportation) as Under because they have a budget and no expenses. Unused budget in a month that has not started will count as Unpaid instead. Under stays only for the current month and months already finished.
todos:
  - id: cashflow-future-unpaid
    content: Treat future-month budget headroom as unpaid in cashflow summary and Overview unpaid drill
    status: pending
  - id: budgets-future-unpaid
    content: Same rule on Budgets month/year variance and category rows
    status: pending
  - id: verify-web
    content: Build web and check a future month vs the current month
    status: pending
isProject: false
---

# Future months: unused budget is Unpaid, not Under

Today is mid-October, so November onward is in the future. Food & Dining and Transportation are manual envelopes with no bill rows, so paid and unpaid expenses are $0. Both boards then treat the whole limit as under budget:

```187:206:mobile/utils/cashflow.ts
    if (actualAmount > budgetAmount + 0.005) {
      overBudget.push({ ... });
    } else if (budgetAmount > actualAmount + 0.005) {
      underBudget.push({ ... underBy: budgetAmount - actualAmount });
    }
```

Budgets uses the same idea at month level: `Under` when `Budget − (Paid + Unpaid) > 0` in [BudgetDashboard.tsx](mobile/components/expenses/BudgetDashboard.tsx).

## Rule

A month has started when its calendar month is the current month or earlier. Later months are future.

- **Future:** do not call leftover budget Under. Add that leftover to Unpaid (per category). If bills already exceed the limit, still show Over.
- **Current and past:** keep today’s Under / Over / On budget behavior.

Example, November, Food standing $1,000 and no expenses: Unpaid $1,000, not Under $1,000. October with the same gap still shows Under.

## Changes

- [mobile/utils/cashflow.ts](mobile/utils/cashflow.ts) — in `buildCashflowSummary` / `buildMonthlyCashflowSeries`, when the month starts after today, skip `underBudget` for positive headroom and add that amount to `unpaidTotal` and `unpaidByCategory`. Leave real unpaid expense rows as they are. Over stays when paid + unpaid expenses already beat the limit.
- [mobile/components/expenses/CashflowDashboard.tsx](mobile/components/expenses/CashflowDashboard.tsx) — the month Under KPI and the “Under budget” list follow the summary, so they go to On budget / empty for pure future headroom. In the unpaid drill (“Left to pay”), show those envelope categories (budget not started) so the Unpaid total matches the lines. Real bill rows stay listed as expenses.
- [mobile/utils/budgetSeries.ts](mobile/utils/budgetSeries.ts) — for future months, add each category’s leftover (`max(0, limit − paid − unpaid)`) into that month’s unpaid total before variance is computed.
- [mobile/components/expenses/BudgetDashboard.tsx](mobile/components/expenses/BudgetDashboard.tsx) and [BudgetCategoryRow.tsx](mobile/components/expenses/BudgetCategoryRow.tsx) — future month rows read `Paid $0 · Unpaid {limit}` instead of `$0 unpaid` and `{limit} left`. The month and year Under figures only include months that have started, because future leftovers are already inside Unpaid.
- Help line on Budgets: say future unused budget counts as Unpaid, and Under/Over applies once the month has started.

Year totals on both boards already sum the months, so future envelopes move from Under into Unpaid there as well. Bars that stack unpaid will show that same unpaid amount.

No API or budget-save changes.

## Impacts

This is display math in two helpers. It does not change saved expenses, bills, or budgets.

Pages that do not use those helpers stay as they are: Expenses list, Bills, Categories, and Money. Expenses still counts Unpaid only from expense rows, so a future Food envelope can say Unpaid on Overview and Budgets while the Expenses tab has no Food line for that month.

On Overview and Budgets only, future months and the year rollup that includes them will move: Unpaid and Projected go up by unused envelopes, Under goes down, and Actual net (income minus paid minus unpaid) goes down. Planned net (income minus budget) does not change. October and earlier months keep the current Under behavior. The unpaid drill must list those envelopes so its total still matches the Unpaid figure.

After the code change, run the mobile web build (`npm run build` in `mobile`) and check Overview and Budgets for a future month (Food & Dining / Transportation as Unpaid, no Under) and for October (Under still appears when spend is below the limit).