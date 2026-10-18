---
name: Budget Board Help Copy
overview: Rewrite Budget board “How this works” to explain how budgets are built, that single-bill save already syncs that bill, and that Update plan is the deliberate full-plan refresh with preview—not the only sync path.
todos:
  - id: help-copy
    content: Rewrite Budget board How this works help text (auto per-bill vs Update plan)
    status: completed
  - id: web-build-help
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Budget Board Help Copy

## Context
Budget board ([`BudgetDashboard.tsx`](mobile/components/expenses/BudgetDashboard.tsx)) does not create budgets. Creating/updating a bill already auto-generates that bill’s unpaid expenses and syncs that category’s budget ([`perform_create` / reconcile in expenses views](backend/expenses/views.py)). **Update plan** (`syncPlan`) is a separate bulk action: all active bills, dry-run preview, then apply.

## Product answer (for the copy)
We keep Update plan as a button because it is a **family-wide rewrite with preview**, not because nothing syncs without it. Per-bill save covers the common path; Update plan covers first-time setup, catch-up after many bill edits, and reviewing what will change before applying.

## Change
Replace the help bullets in `BudgetDashboard` (~lines 559–568) with:

1. **What you see** — Monthly category limits for the selected year/month. Spent counts paid expenses only.
2. **Where budgets come from** — Limits are driven by active bills on the Bills tab. Budget board does not create them; use pencil/trash here to edit or delete a limit.
3. **Automatic sync** — When you add or change a bill, the app generates that bill’s unpaid expenses and refreshes that category’s budget for you.
4. **Why Update plan** — Use **Update plan** on Bills when you want a full refresh across all bills (first setup, many changes at once) or to preview creates/updates before applying. Yearly/other dues only affect months they fall due. Manual edits on Budget board can be overwritten the next time that category is synced from bills.

Keep the same collapsible UI; text only.

## Out of scope
- Making sync fully automatic / removing the Update plan button (product change; not this help-only task)

## Deliverable
- Update help strings in [`BudgetDashboard.tsx`](mobile/components/expenses/BudgetDashboard.tsx)
- Rebuild web `dist`
