---
name: Overview Demo Income
overview: Restore Profile demo overlays on the new Expense Overview and Money boards so they match the old tabs (demo income on Overview/Income; demo balances on YTD).
todos:
  - id: overview-demo-income
    content: "CashflowDashboard: load demo pref, boost employment occurrence amounts for series"
    status: completed
  - id: ytd-demo-audit
    content: Audit/fix YtdDashboard demo portfolio reload so it matches old YTD after Profile toggle
    status: completed
  - id: web-build-overview-demo
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Restore Demo Overlays on New Boards

## What used to work
Profile **Demo portfolio** (allowlisted emails) is one switch that drives:

| Overlay | Effect | Old surface | New surface |
|---------|--------|-------------|-------------|
| Demo **balances** | `withDemoBalance` on accounts | Money YTD / Accounts / Target | **YTD** (`YtdDashboard`) — wired; audit/fix |
| Demo **income** | `withDemoIncome` on employment pays | Money Income Year | **Income board** (upcoming plan) + **Expense Overview** |

Expense Overview ([`CashflowDashboard`](mobile/components/expenses/CashflowDashboard.tsx)) never got the income boost after the dashboard redesign — that is the main regression.

## Fix 1 — Expense Overview (required)
1. Load demo pref (`canUseMoneyDemoPortfolio` + `STORAGE_KEYS.MONEY_DEMO_PORTFOLIO`), same as Money / YTD.
2. Keep `streams` in state (already fetched) → `streamTypeById`.
3. Map occurrences with `withDemoIncome` on `estimated_amount` / `actual_amount` before `buildMonthlyCashflowSeries`.
4. Refresh pref on every load/focus so toggling in Profile then returning updates Overview.

Expenses stay real (no balance/income boost on spend).

## Fix 2 — Money YTD board (audit)
[`YtdDashboard`](mobile/components/money/YtdDashboard.tsx) already passes `demoPortfolio` into `ytdPortfolioTotals` / `buildYearReturnRows`. Verify it matches old YTD after Profile toggle (re-read pref on focus; avoid stale `demoPortfolio === false` on first paint after soft load). Fix if numbers diverge from old YTD with demo on.

## Fix 3 — Money Income board (separate plan)
[`money_income_board`](money_income_board_43e72ebb.plan.md) already requires full `withDemoIncome` parity with old Income. Implement with that plan; do not ship Income board without demo income.

## Out of scope
- Changing boost amounts or Profile toggle UI
- Demo balances on Expense Tracker account lists (Money-only)

## Deliverable
- Overview shows boosted employment income when demo is on
- YTD board matches old YTD demo balances
- Rebuild web `dist`
