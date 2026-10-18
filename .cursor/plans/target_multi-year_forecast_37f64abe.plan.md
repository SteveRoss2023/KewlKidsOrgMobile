---
name: Target multi-year forecast
overview: Rework Target Overview to project from latest balances at a selected return (default 2.5%), with a 1–10 year forecast labeled by calendar years from the current year; keep Rates as the single-year rate comparison.
todos:
  - id: forecast-math
    content: Add projectPortfolioAtYears helper (latest base, compound invest, cash flat)
    status: completed
  - id: overview-forecast-ui
    content: "Rework Overview: rate chips, hero, calendar-year bars (currentYear+1..+10); default rate 2.5%"
    status: completed
  - id: web-build-forecast
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Target multi-year forecast

## Decision
- Year 0 (base) = **latest account balances** (forward from now), demo via `withDemoBalance`.
- Horizon axis uses the **current calendar year**: bars for `currentYear+1` … `currentYear+10` (e.g. in 2026 → 2027…2036). Each step is one full year of compounding from now.
- Cash stays flat; investments compound annually.
- No separate calendar-year picker on Overview (current year is implicit).
- **Actual / YoY performance stays on YTD only** — Target Overview is forward forecast only.

## Overview layout (replace current spotlight + Growth by rate)
In [`mobile/components/money/TargetDashboard.tsx`](mobile/components/money/TargetDashboard.tsx):

1. **Rate chips** first (`1…10%`, default **2.5%**) — drives hero + chart.
2. **Hero** for selected horizon (default **currentYear+10**, or tapped bar):
   - Now (latest): invest / cash / portfolio
   - At calendar year Y: invest / cash / portfolio / growth vs now
3. **Forecast chart** (“Portfolio by year”) — 10 bars at the selected rate, labels = calendar years. Tap a year to update the hero. Adapt [`RateGrowthBars`](mobile/components/money/charts/RateGrowthBars.tsx) or a thin `YearForecastBars` sibling.

Empty state if no latest balances.

## Math
For years ahead `n = 1…10`, calendar label `currentYear + n`:

- `invest_n = invest_0 × (1 + r/100)^n`
- `cash_n = cash_0`
- `portfolio_n = invest_n + cash_n`
- `growth_n = portfolio_n - portfolio_0`

Helper in [`mobile/utils/moneyReturns.ts`](mobile/utils/moneyReturns.ts) (e.g. `projectPortfolioAtYears(accounts, ratePct, yearsAhead, demoEnabled)`). Use `MoneyAccount.latest_balance` + type.

## Rates tab
Unchanged: single calendar-year rate table (year-start base) with its own year chips. Independent of Overview’s current-year forward axis.

## Wire / dist
No hub tab changes (still `target-board`). Soft-refresh via existing `refreshKey`. Rebuild `mobile` dist after.

## Out of scope
- Removing old Target tab; changing Rates tab into multi-year.
- Actual / YoY performance on Target Overview — **keep on YTD only**.