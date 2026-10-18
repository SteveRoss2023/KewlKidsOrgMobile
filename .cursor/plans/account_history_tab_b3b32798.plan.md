---
name: Account history tab
overview: Add a Money History tab that charts each account’s balance snapshots for the selected year, with the portfolio total as the lead chart and a year navigator.
todos:
  - id: line-chart
    content: Add SVG balance line chart with full-currency point label
    status: pending
  - id: history-tab
    content: "Add History dashboard: portfolio chart with year nav, then one chart per account"
    status: pending
  - id: wire-tab
    content: Register the History tab in money.tsx and refresh it after balance saves
    status: pending
isProject: false
---

# Account history tab

Add a **History** tab on Money, after Accounts. It reads the same account snapshots already loaded for Accounts and YTD. No API changes.

## Layout

- Lead card: **Portfolio** line chart for the selected year, with the Income-style year control (previous, year, next, and This year). Next year stops at the current calendar year.
- Under that, one line chart per active account, grouped by institution the same way as Accounts. Each account uses its own scale so a cash balance is not flattened against a large investment account.
- The year on the portfolio card filters every chart on the tab.
- Empty year: short message, no chart. A single snapshot draws as a point with the amount beside it.

## How a point is calculated

- Account line: that account’s snapshots whose `as_of_date` falls in the selected year, in date order.
- Portfolio line: every snapshot date in that year. At each date, sum each active account’s latest snapshot on or before that date (carry the prior balance forward, including a snapshot from before the year). Accounts with no snapshot yet contribute nothing.
- Amounts use `withDemoBalance` when the demo portfolio overlay is on, matching Accounts. Headlines and the selected-point label use full currency via `displayMoney` (hidden amounts stay masked). Y-axis ticks use the existing compact axis labels so the scale fits.

## Chart

New SVG line chart in [mobile/components/money/charts/BalanceLineChart.tsx](mobile/components/money/charts/BalanceLineChart.tsx), using `react-native-svg` and the axis helpers in [mobile/components/charts/barChartUtils.ts](mobile/components/charts/barChartUtils.ts). Tapping or hovering a point shows the date and full amount. Width follows the card, including the phone layout.

## Wiring

- New [mobile/components/money/HistoryDashboard.tsx](mobile/components/money/HistoryDashboard.tsx), seeded like [mobile/components/money/AccountsDashboard.tsx](mobile/components/money/AccountsDashboard.tsx) with `initialAccounts`, `initialSnapshots`, and `refreshKey` so a balance save refreshes this tab too.
- In [mobile/app/(tabs)/money.tsx](mobile/app/(tabs)/money.tsx), extend `MoneyTab` with `'history'`, add the tab button, render the dashboard, and accept `?tab=history`.
