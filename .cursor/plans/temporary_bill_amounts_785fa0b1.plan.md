---
name: Temporary bill amounts
overview: Repeating budget amounts are seasonal budget rows (month range every year) with a start so they do not change earlier months. A one-time start and end does not repeat. This works if a month returns only one row per category and bill sync does not merge or raise those rows.
todos:
  - id: allow-multiple
    content: Allow more than one active monthly budget per category when seasons do not overlap. A month returns only the row that covers it.
    status: pending
  - id: seasonal-budget
    content: Add seasonal months plus a start on a budget so the range repeats every year after that start. Start/end alone stays one span and does not repeat.
    status: pending
  - id: month-pick
    content: Month limit is that row's amount only. Do not sum two rows for one category, and do not raise it with max(standing, bill dues).
    status: pending
  - id: sync-safe
    content: Bill sync must not overwrite seasonal rows or clear their dates. The bill charge stays one amount.
    status: pending
isProject: false
---

# Will repeating budget rows work?

Yes, if each repeating amount is a budget row with a month range and a start. After the start, that range repeats every year. A plain start and end (October 2026–March 2027) does not repeat; it stops when the end date passes.

Two rows can cover a category for the whole year after the start, for example April–September and October–March. Months before the start keep the budget you already have.

## What has to change

- Stop rejecting a second active budget for the same category. Reject it only when the month ranges overlap.
- Store seasonal months on the budget, plus the first month they apply. [`Budget`](backend/expenses/models.py) has start and end today. Seasonal months exist only on bills.
- When a month is loaded, return one row per category: the seasonal row that covers that month, otherwise the open-ended row. [`BudgetSerializer._effective_amount`](backend/expenses/serializers.py) must use that row's amount, not `max(standing, bill dues)`.
- [`budget_sync.py`](backend/expenses/budget_sync.py) must leave those rows alone. Today it finds one budget per category and can overwrite the amount and clear the end date.
- The add-budget form must allow the category again for a non-overlapping range. It currently treats the category as taken.

## Overview and Expenses

Both already load budgets for the month you are viewing. Overview uses `year_board` (one result per month). Expenses uses `getBudgets` with that month's date, or the whole year when the year toggle is on. No new screens.

Once a month returns only the matching row and its amount:

- Overview budget, under/over, and future unpaid for that month use that amount. May 2027 Utilities is 100, not 200 and not 300.
- Expenses for that month shows Utilities against 100. The category list keeps one budget per category, which matches one row coming back.

The year toggle on Expenses must add the months up (May–September at 100 plus October–April at 50), not keep only one of the two rows. Overview's year total already adds the twelve months, so it follows the same figures.

## Undo and migrations

The implementer runs migration commands from `backend` with `venv` active (`.\venv\Scripts\python.exe manage.py makemigrations` and `migrate`), and may reverse them.

The schema change is additive: optional season fields on a budget, and more than one active row per category only when the months do not overlap. Bills and expenses are not rewritten.

To return to this point: delete only the extra budget rows this work added, reverse the migration, then remove the code. The old rule is one active budget per category, so the reverse runs after those extra rows are gone. The original open-ended budgets, bills, and paid expenses stay. Deleting those extra rows is allowed.

## Where you set it

Expenses → Budgets → **Add budget**, or the pencil on an existing row. Both open the same Add / Edit Budget form ([`BudgetForm.tsx`](mobile/components/expenses/BudgetForm.tsx)). This is not on the Bills screen.

On that form, a repeating row is the amount, the category (Utilities again is allowed), the months that repeat (May through September), and the first month they apply (May 2027). Leave repeat off and the form stays the start date and optional end date it has now. The October–April amount is a second save from Add budget, same category, the other months.

## Utilities example through 2028

Figures below are the example only. The bill stays one EPCOR charge. These are budget rows.

Keep the current Utilities budget at 200 with no end date. Add two repeating rows that start later:

- May–September, starting May 2027, amount 100
- October–April, starting October 2027, amount 50

What you see when you open a month:

- Now through April 2027, including October 2026–April 2027: 200. The new rows have not started.
- May–September 2027: 100
- October 2027–April 2028: 50
- May–September 2028: 100 again
- October–December 2028: 50 again

April 2027 is still 200. April 2028 is 50, because the October–April row has started and repeats.

## What those four failures mean

They only happen if the second row is added without the safeguards above.

- **Second row cannot be saved.** Utilities already has a budget, so Add budget refuses another one. You never get the 100 or 50 row. Nothing else changes.
- **Both rows counted in one month.** In May 2027 the old 200 row and the new 100 row would both be included. Overview and Budgets would add them and show 300 for Utilities. The fix is to show only the row whose months cover May.
- **Lower amount loses to the bill.** The EPCOR bill is still 200. The month budget currently uses whichever is higher, the budget or the bill. May would keep showing 200 even after you saved a 100 budget. The fix is to use the budget row for that month, not the higher bill amount.
- **Editing the bill wipes the new amount.** Saving EPCOR today finds the Utilities budget and sets it back to the bill amount. That could overwrite the 100 row and clear its months. The fix is to leave the repeating rows alone when a bill is saved.

## Risk

Other categories do not change if the new behavior is limited to repeating rows.

- A category with one budget still uses `max(standing, bill dues)` in [`_effective_amount`](backend/expenses/serializers.py). Insurance's yearly month and propane's in-season months stay raised. Removing that max for every bill category would lower those months, so the plan does not do that.
- Bill save still updates the one open-ended from-bills row. [`_active_monthly_budget`](backend/expenses/budget_sync.py) uses `.first()` ordered by newest start date, so a May 2027 row would be chosen today and could be overwritten or could block the update. Sync must select the open-ended from-bills row only. Repeating rows are left alone. Rent and the other single-row categories still hit the same row they hit now.

## Seasonal budget does not require a seasonal bill

A seasonal bill means the charge only happens in those months. A seasonal budget means the limit for those months is this amount, then repeats. Utilities is the second one: EPCOR stays a normal year-round bill, and the budget rows are separate. Requiring a seasonal bill would block that.

Existing seasonal bills stay as they are. They do not have to be turned into seasonal budgets.

Utilities, TV/Internet, Insurance, and Phone can each have their own repeating rows. One category does not affect the others. Bill save still updates only that category's open-ended row.

Once a repeating row covers a month, that month shows the row's amount. A larger bill in that month does not raise the limit. That matters where a bill is already bigger in some months: Insurance's yearly premium, TV/Internet's seasonal bills, and Utilities' propane. Those charges still exist. The month is over budget when they exceed the repeating amount. Phone has one monthly bill, so a repeating amount is the whole limit for those months.
