---
name: Consolidate budgets into settings
overview: Remove the redundant Budgets tab from Expenses. Keep Expenses as the daily paid/budget view, and move create/edit/delete budget management into Settings via a Manage Budgets screen.
todos:
  - id: manage-budgets-screen
    content: Add manage-budgets.tsx with create button, month nav, budget grid CRUD
    status: pending
  - id: settings-link
    content: Add Budgets item in SettingsMenu pointing to manage-budgets
    status: pending
  - id: remove-budgets-tab
    content: Remove Budgets tab and renderBudgetsTab from expenses.tsx; keep budgets data + pencil edit
    status: pending
  - id: fetch-cleanup
    content: Remove budgetViewDate / budgets-tab fetch branches; reorder remaining expense tabs
    status: pending
  - id: build
    content: npm run build in mobile
    status: pending
isProject: false
---

# Consolidate Budgets into Settings

## Goal

Expenses stays the single daily surface (category cards with paid/budget). Budget **setup** (create from recurring, add/edit/delete limits) moves under Settings. Remove the Budgets peer tab.

```mermaid
flowchart LR
  subgraph before [Before]
    ExpTab[Expenses tab]
    BudTab[Budgets tab]
    CreatePage[create-budgets]
    BudTab --> CreatePage
  end
  subgraph after [After]
    ExpOnly[Expenses tab]
    Settings[Settings menu]
    Manage[manage-budgets]
    CreatePage2[create-budgets]
    ExpOnly -->|"pencil on category"| BudgetForm[BudgetForm modal]
    Settings --> Manage
    Manage --> CreatePage2
    Manage --> BudgetForm
  end
```

## 1. Add Manage Budgets screen

Create [`mobile/app/(tabs)/manage-budgets.tsx`](mobile/app/(tabs)/manage-budgets.tsx) by lifting the management pieces from `renderBudgetsTab` in [`mobile/app/(tabs)/expenses.tsx`](mobile/app/(tabs)/expenses.tsx):

- Header + back (same pattern as [`create-budgets.tsx`](mobile/app/(tabs)/create-budgets.tsx))
- **Create budget** button → `router.push('/(tabs)/create-budgets')`
- Month prev/current/next + Today (reuse existing period helpers / styles conceptually)
- Category budget card grid (reuse [`BudgetCard`](mobile/components/expenses/BudgetCard.tsx)) with edit/delete only — **no** paid toggles / item delete on this screen
- FAB or + to open [`BudgetForm`](mobile/components/expenses/BudgetForm.tsx) for add/edit
- Fetch budgets (+ expenses for expandable items if useful) scoped to selected family and `asOf` month

Keep [`create-budgets.tsx`](mobile/app/(tabs)/create-budgets.tsx) as the dry-run / regenerate wizard; only change its entry point (Settings → Manage → Create).

## 2. Wire Settings

In [`mobile/components/SettingsMenu.tsx`](mobile/components/SettingsMenu.tsx), add a menu item:

- Label: **Budgets**
- Icon: `credit-card`
- Route: `/(tabs)/manage-budgets`

Place it near other family/data items (e.g. after Grocery Categories).

## 3. Slim down Expenses screen

In [`mobile/app/(tabs)/expenses.tsx`](mobile/app/(tabs)/expenses.tsx):

- Remove `'budgets'` from `ActiveTab` and from the tab bar array
- Remove `renderBudgetsTab` and budgets-only state (`budgetViewDate`, `budgetDetailsExpanded`, budgets FAB branch)
- Keep loading `budgets` whenever the expenses tab needs them (month/year totals + category cards)
- Keep category-card pencil → `BudgetForm` for quick limit edits from Expenses
- Keep `BudgetForm` modal + create/update/delete handlers (shared with manage screen locally, or duplicate thinly on manage-budgets)

Default landing tab stays **Expenses** (already first meaningful view after removing Budgets from the bar; reorder tabs to `Expenses → Recurring → Reports → Categories`).

## 4. Clean fetch / deps

- Drop `budgetViewDate` / `activeTab === 'budgets'` branches in `fetchData`
- Expenses continue to pass `asOf` / `budget_period` from expenses `viewDate` / `groupBy`
- After create-budgets apply, user returns via back; Manage Budgets and Expenses soft-refresh on focus

## 5. Build

Run `npm run build` in `mobile` after changes.

## Out of scope

- Deleting the create-budgets route
- Changing backend budget APIs
- Moving Categories/Recurring/Reports
