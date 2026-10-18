---
name: Money Income Board
overview: "Same money_income_board plan, lightly adjusted: keep old Income, add Income board with YTD/Expense chrome, and bake in demo income using the Overview/YTD atomic-pref pattern."
todos:
  - id: income-dashboard
    content: "Build IncomeDashboard: year nav, hero, stream donut, months/streams accordions, ensureYearSchedule, atomic demo income"
    status: completed
  - id: hub-income-board
    content: Wire Income board tab before Income with form callbacks + refreshKey
    status: completed
  - id: web-build-income
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Money Income Board (adjusted)

Using the existing [money_income_board](file:///C:/Users/steve_80f2z1j/.cursor/plans/money_income_board_43e72ebb.plan.md) plan — not starting over. Adjustments fold in Overview/YTD demo work and the Income UI explore.

## Unchanged from original
- Keep old **Income** (Year + Streams) intact — separate tab, not a flag inside Income
- New tab **Income board** (`income-board`) immediately before Income
- New file: [`mobile/components/money/IncomeDashboard.tsx`](mobile/components/money/IncomeDashboard.tsx)
- Layout: year nav → hero KPIs → stream donut → Add stream → Months accordion → Streams accordion
- Parent [`money.tsx`](mobile/app/(tabs)/money.tsx) keeps stream/occurrence modals; board gets callbacks + `refreshKey`
- Same generate rules and Year-view totals math as today’s Income (include `actual ?? estimated`; do not switch to cashflow’s skipped-excluding helper)
- Out of scope: removing old Income, changing boost amounts, Accounts/Target redesign, new chart components

Tab order: YTD · **Income board** · Income · Accounts · Target

## Layout detail
1. Year chrome — ◀ ▶ + This year (Cashflow-style)
2. Hero — eyebrow “Income”; Year total · Received · Estimated
3. Donut — by stream for the year; reuse [`DonutChart`](mobile/components/expenses/charts/DonutChart.tsx) + move/share `STREAM_COLORS` / `streamColor` from money.tsx
4. Action — **Add stream**
5. Months — collapsed accordion; expand → payment rows (color, name, date, est/act, edit/delete)
6. Streams — collapsed accordion; stream rows (type · freq · count); edit/trash

## Adjustments (demo + load)
1. Demo income on day one — `withDemoIncome` on hero, donut, months, stream estimates, payment rows
2. Atomic pref + data — `readDemoPortfolioPref()` → set with streams/occurrences together
3. Focus reload — `useFocusEffect` (soft when same family has data)
4. Boost before aggregate — Cashflow-style `displayOccurrences` map, then rollups
5. Year-scoped load — `getStreams` → `ensureYearSchedule` → `getOccurrences({ start_date, end_date })` for viewed year
6. Family guards — `fetchGenerationRef`, `selectedFamilyIdRef`, `clearState` on family change; `refreshKey` soft reload

## Hub wiring
- Extend `MoneyTab` with `income-board`
- Props: `refreshKey`, `onAddStream`, `onEditStream`, `onEditOccurrence`, `onDeleteStream`, `onDeleteOccurrence`
- Bump `incomeBoardRefreshKey` in parent `load()` beside `ytdBoardRefreshKey`
- Leave `renderIncome` / Year / Streams as-is; `?tab=income` still lands on old Income

## Deliverable
Income board tab live beside old Income; employment pays show +$15k when demo is on; dist rebuilt.
