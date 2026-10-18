---
name: Month bar colors
overview: Fix month-card progress bars so spend vs budget uses green / yellow / red instead of the default primary blue when under the alert threshold.
todos:
  - id: fix-progress-colors
    content: Update progressColor in MonthBudgetCards to green/yellow/red by spend %
    status: completed
  - id: rebuild-web
    content: Run mobile web build after the color fix
    status: completed
isProject: false
---

# Month card progress bar colors

## Problem
In [`mobile/components/expenses/MonthBudgetCards.tsx`](mobile/components/expenses/MonthBudgetCards.tsx), `progressColor` already handles over (red) and near-limit (yellow), but **under the 80% threshold it returns `colors.primary`**, which is why the bar looks blue for most months:

```51:59:mobile/components/expenses/MonthBudgetCards.tsx
function progressColor(
  percentageUsed: number,
  alertThreshold: number,
  primary: string
): string {
  if (percentageUsed > 100) return '#ef4444';
  if (percentageUsed >= 100) return '#10b981';
  if (percentageUsed >= alertThreshold) return '#f59e0b';
  return primary;
}
```

## Change
Update `progressColor` to match the requested rules (same hex values already used on [`BudgetCard`](mobile/components/expenses/BudgetCard.tsx)):

- **Green** `#10b981` — under / on track (`percentageUsed < 80`)
- **Yellow** `#f59e0b` — close (`80`–`100` inclusive)
- **Red** `#ef4444` — over (`> 100`)

Drop the unused `primary` argument. Keep the existing call site wiring (`statusColor` → progress fill). Leave the spent/limit amount text as-is (primary blue) unless you want that tinted later.

## Verify
Rebuild mobile web (`npm run build` in `mobile`) so `dist` picks up the change.