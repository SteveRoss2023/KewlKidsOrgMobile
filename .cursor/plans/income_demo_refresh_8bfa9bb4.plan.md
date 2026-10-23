---
name: Income demo refresh
overview: When the Income tab already has a saved board, re-read the Profile demo-income setting instead of keeping the flag from the last pay-list load.
todos:
  - id: reread-demo-flag
    content: On Income soft cache hit, re-read the demo-income setting and update the cached flag
    status: completed
isProject: false
---

# Re-read demo income on the Income tab

Demo income is a storage flag. Profile writes it and does not reload Money. The Income board cache in [mobile/components/money/IncomeDashboard.tsx](mobile/components/money/IncomeDashboard.tsx) also stores `demoPortfolio`. A return visit calls `load({ soft: true })`, paints `cached.demoPortfolio`, and returns before `readDemoPortfolioPref()`. A header refresh uses `soft: false`, which is why the new amounts appear only then.

YTD, Accounts, History, and Forecast already re-read the flag on open. Expense Overview does the same on its soft cache hit in [mobile/components/expenses/CashflowDashboard.tsx](mobile/components/expenses/CashflowDashboard.tsx).

## Change

In `IncomeDashboard` `load`, keep the soft return (no new streams or payments request). After painting the cache, read the demo setting and, when it differs, call `setDemoPortfolio` and update `incomeBoardCache` for that family. Match the Overview soft-return check so a family switch that bumps `fetchGenerationRef` does not apply a stale read.

Pay amounts stay the same. `withDemoIncome` already turns the flag into the displayed numbers.
