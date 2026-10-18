---
name: Target board redesign
overview: Add a TargetDashboard board (Overview + Rates) with demo year-start balances, wire it as a side-by-side Money tab, keep the old Target until you approve removal.
todos:
  - id: target-dashboard
    content: Build TargetDashboard (Overview + Rates, demo, self-load)
    status: completed
  - id: hub-target-board
    content: Wire target-board tab + refreshKey in money.tsx
    status: completed
  - id: web-build-target
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Target board redesign

## Approach
Same cutover pattern as Accounts/Income: new board first, old Target stays until you say remove.

Target is read-only what-if (no forms). Logic already lives in [`mobile/utils/moneyReturns.ts`](mobile/utils/moneyReturns.ts) (`buildYearReturnRows`, `portfolioTargetAtRate`, `yearEndTarget`) with demo via `withDemoBalance`.

## New: `TargetDashboard`
Create [`mobile/components/money/TargetDashboard.tsx`](mobile/components/money/TargetDashboard.tsx).

**Data**
- Self-load `getAccounts` + `getSnapshots` for selected family (same isolation/refresh pattern as AccountsDashboard).
- Read demo pref; pass into `buildYearReturnRows(..., demoEnabled)`.
- Year chips from snapshot years (+ current year).
- Rates: `[1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10]` (move out of hub).

**Sub-tabs: Overview | Rates**

**Overview**
- Year chips.
- Hero: year-start total; at a selected spotlight rate (default `5%`): Invest / Cash / Portfolio year-end + growth.
- Tappable growth bars across all rates (selecting a bar updates the hero rate). Small local chart component or inline SVG bars — same visual language as MonthIncomeBars, not a full new chart lib.
- Empty state: point to Accounts if no year-start balances.

**Rates**
- Same functionality as current `renderTarget`: rate rows (Return, Invest, Cash, Portfolio, Growth), expand for per-account start → target + growth.
- Visual polish aligned with Accounts: surface cards, invest vs cash color, compact expanded rows, dark-theme-friendly accents.
- Drop the awkward nested horizontal ScrollView if a vertical card/list layout fits; keep columns readable on narrow web.

## Wire in Money hub
In [`mobile/app/(tabs)/money.tsx`](mobile/app/(tabs)/money.tsx):

- Add `MoneyTab` `'target-board'`.
- `targetBoardRefreshKey` bumped from existing `load()` (with YTD/Income/Accounts keys).
- Tab bar: **Target board** before **Target**.
- Render `<TargetDashboard refreshKey={...} />` — no CRUD callbacks.
- Deeplink: `tab=target-board` → board; leave `returns`/`forecast` → YTD as today.

Leave `renderTarget` and hub Target state until cutover.

## Dist
`npm run build` in `mobile/`.

## Out of scope
- Removing old Target (next step when you OK).
- Changing return math or demo rules.