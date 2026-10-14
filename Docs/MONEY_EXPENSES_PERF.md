# Money & Expenses performance work (Oct 2026)

Reference for testing and for agents. Paste into chat:

> Read `Docs/MONEY_EXPENSES_PERF.md` and treat it as the source of truth for the Money/Expenses soft-load and cache work. Do not undo those patterns without a clear reason.

**Goal:** Faster tab returns and fewer duplicate fetches. **Not** a full rewrite. Cold first-open can still take a few seconds; remounts after a successful load should feel instant when the module cache is warm.

---

## Pasteable agent brief

```
Money/Expenses soft-load (Oct 2026) — see Docs/MONEY_EXPENSES_PERF.md:

1. Hub tabs remount on switch. Boards keep data in module-level Maps so Overview↔child tabs don’t cold-fetch every time.
2. Soft load: paint cache / existing state, skip spinner; hard load only when no cache / family switch.
3. Mutations call invalidate*Cache(familyId) then bump refreshKey. Soft+cache early-returns only when cache still valid — invalidate first so edits refetch.
4. Paid toggles on Expenses/Budgets write the board cache locally; do not full-bump the same board (avoids race / sticky-toggle bugs).
5. Budgets year load uses GET /budgets/year_board/?family=&year= (same rows as 12× monthly asOf). Client: expenseService.getBudgetsYearBoard.
6. refreshKey effects must ignore remount with unchanged key (lastRefreshKeyRef pattern) or remount+invalidate causes random spinners.
7. Never paint another family’s rows: clear/hard load on family switch; cache keys are family-scoped.
8. Force refresh on PWA: Money / Expense Tracker header refresh buttons (RN `RefreshControl` is a no-op on web).
```

---

## Force refresh (PWA)

React Native `RefreshControl` does **not** work on web. Use the **header refresh button** (circular icon), same idea as Home:

| Screen | Control | Effect |
|--------|---------|--------|
| Home | Header refresh | Families + user + chat unread |
| Money | Header refresh next to eye toggle | Bumps all Money board `refreshKey`s (hard board reload) + reloads parent accounts/snapshots |
| Expense Tracker | Header refresh next to eye toggle | `bumpExpenseBoards()` (invalidate caches + hard board reload via `refreshKey`) + hub cats/tags |

Normal tab returns still use warm cache / soft load. Header refresh is the explicit “force network” escape hatch.

---

## What changed (by area)

### Shared pattern

| Idea | Behavior |
|------|----------|
| Soft load | `load({ soft: true })` — keep UI, no full-screen spinner |
| Hard load | Family switch / no cache — spinner OK |
| Module cache | `Map` outside React so unmount doesn’t wipe data |
| Invalidate | Mutations clear cache for that family (or all) |
| `refreshKey` | Hub bumps after edits; boards soft-reload only when key **changes** (`lastRefreshKeyRef`) |

Hubs unmount inactive tabs via `switch (activeTab)`. Cache is what makes return visits fast.

### Money (`mobile/app/(tabs)/money.tsx` + money dashboards)

- Parent soft-loads accounts/snapshots; avoids routine remount wipe.
- Passes accounts/snapshots into YTD / Accounts where possible (less duplicate GETs).
- Income / Accounts / Forecast (Target) / YTD: soft-load + board refresh keys.
- `Promise.all` for generate-occurrences style work where it was sequential.

### Expenses hub (`mobile/app/(tabs)/expenses-hub.tsx`)

- Mounts active board without waiting on cats/tags (except Categories tab).
- Passes `initialCategories` / `initialTags` into Expenses / Bills when hub catalog is ready.
- `bumpExpenseBoards()` invalidates:
  - `invalidateCashflowYearCache`
  - `invalidateBudgetYearCache`
  - `invalidateExpenseBoardCache`
  - `invalidateBillsBoardCache`
  then bumps `budgetsRefreshKey`.
- `clearExpenseState()` clears all of the above caches (full wipe).
- **Paid toggle:** hub `handleTogglePaid` is **API-only** (no bump). Expenses dashboard updates local state, `writeCache`, then invalidates budget + cashflow caches.

### Overview / Cashflow — `CashflowDashboard.tsx`

- Module cache: `cashflowYearCache` key `familyId:year`
- Export: `invalidateCashflowYearCache(familyId?)`
- Soft + cache hit → early return (no network)

### Budgets — `BudgetDashboard.tsx`

- Module cache: `budgetYearCache` key `familyId:year`  
  Stores `budgetsByMonth`, `expensesByMonth`, `selectedMonthIndex`
- Export: `invalidateBudgetYearCache(familyId?)`
- Soft + cache hit → early return
- Paid toggle: update local month expenses + `writeCache` (sticky across tab flips); invalidate cashflow
- **Year load:** one `expenseService.getBudgetsYearBoard(familyId, year)` instead of 12× `getBudgets(asOf)`

### Backend budgets batch API

| | |
|--|--|
| Endpoint | `GET /api/budgets/year_board/` |
| Query | `family`, `year` (YYYY), optional `is_active` |
| Response | `{ "YYYY-01": [budget rows…], …, "YYYY-12": […] }` |
| Semantics | Same effective amounts / spent / filtering as `list` with `as_of=YYYY-MM-01` for each month |
| Implementation | `BudgetViewSet.year_board` in `backend/expenses/views.py` |
| Client | `expenseService.getBudgetsYearBoard` in `mobile/services/expenseService.ts` |

**Note:** `budget_period=year` on the old list API is a different mode (year rollup). Do not replace monthly chart data with that. Use `year_board` for the 12-month board.

### Expenses tab — `ExpenseDashboard.tsx`

- Module cache: `expenseBoardCache` key `familyId:periodMode:start:end` (or `familyId:all`)
- Last viewed period: `expenseBoardLastKey` so remount restores period + data
- Export: `invalidateExpenseBoardCache(familyId?)`
- Soft + cache hit → early return
- Paid toggle: local update + `writeCache` + invalidate budget/cashflow (hub does not bump)

### Bills tab — `BillsDashboard.tsx`

- Module cache: `billsBoardCache` key `familyId`
- Export: `invalidateBillsBoardCache(familyId?)`
- Soft + cache hit → early return
- After bill save/delete: invalidate local bills cache then soft reload, then `onPlanApplied` → hub bump

---

## Files touched (primary)

```
backend/expenses/views.py          # year_board action
mobile/services/expenseService.ts  # getBudgetsYearBoard
mobile/app/(tabs)/money.tsx
mobile/app/(tabs)/expenses-hub.tsx
mobile/components/expenses/CashflowDashboard.tsx
mobile/components/expenses/BudgetDashboard.tsx
mobile/components/expenses/ExpenseDashboard.tsx
mobile/components/expenses/BillsDashboard.tsx
mobile/components/money/*Dashboard.tsx   # soft-load / props from parent
```

After client changes: rebuild web with `npm run build:expo` in `mobile/`.  
After `year_board`: restart Django if the process was already running.

---

## Expected UX when healthy

| Action | Expect |
|--------|--------|
| First open Money or Expenses Overview | May take a few seconds (cold) |
| First open Budgets for a year | One year_board request (not 12 budget GETs) |
| Leave Budgets/Expenses/Bills → return | Instant / no spinner if cache warm |
| Paid toggle on Expenses or Budgets → leave → return | Toggle still correct |
| Create / edit / delete expense or budget | Boards refresh (cache invalidated) |
| Switch family | No previous family’s amounts; hard load |
| Tap header refresh on Money/Expenses | Button spinner; boards refetch (Network tab shows GETs) |

---

## Failure symptoms → likely cause

| Symptom | Likely cause |
|---------|----------------|
| Stale rows after edit | Mutation didn’t call the right `invalidate*Cache` / bump |
| Spinner every tab flip | Cache not written, or soft path not early-returning, or remount treating `refreshKey` as changed |
| Paid toggle flips back on tab return | Cache not updated on toggle, or bump invalidated cache then refetch raced |
| Wrong family’s data flash | Family switch didn’t clear state / cache key missing family id |
| Budgets year slow again (many GETs) | Client fell back to 12× `getBudgets`; or `year_board` 404 (Django not restarted) |
| Random spinner on remount with no edits | Missing `lastRefreshKeyRef` guard on `refreshKey` effect |
| Header refresh does nothing visible | Button disabled, or `refreshKey` / invalidate not wired; check Network for GETs |

---

## Out of scope / still slow by design

- Cold first paint of Expenses Overview (~2–3s) — still parallel GETs; no batch “expense board” API yet
- Keeping all hub tabs mounted (would avoid remounts; not done)
- Redis / persistent cache — in-memory Maps only; full page reload clears them

---

## Safe follow-ups (if testing finds issues)

1. Confirm Network tab: Budgets year = 1× `year_board`; return visit = no board refetch when soft+cache.
2. If stale after a new mutation path: add `invalidateExpenseBoardCache` / `invalidateBillsBoardCache` / budget / cashflow to that path (same as `bumpExpenseBoards`).
3. If cold Expenses open is the next target: profile which of expenses / budgets / recurring / cats / tags dominate, then consider a batch endpoint (same idea as `year_board`).
4. Revert client caches by removing module Maps and soft early-returns; revert API by removing `year_board` + `getBudgetsYearBoard` and restoring 12× `getBudgets` in `BudgetDashboard.loadYear`.
