---
name: Seasonal bills match
overview: A repeating budget owns the expected pay for its months. A dry run against current family data shows which bills and unpaid rows would change, and which paid rows and other seasonal bills would stay.
todos:
  - id: link-bill
    content: Link each repeating budget to one seasonal bill and create or update that bill on save
    status: pending
  - id: clip-year-round
    content: Keep a single year-round bill for months the repeating rows do not cover, and stop it generating unpaid rows in covered months
    status: pending
  - id: unpaid-after-end
    content: Remove unpaid rows that are no longer on a bill schedule, including rows after an end date. Never change paid rows
    status: pending
  - id: delete-restore
    content: Deleting a repeating budget retires its seasonal bill, and deleting the last one restores the year-round bill
    status: pending
  - id: protect-history
    content: Only change unpaid rows on or after the new schedule start. Leave earlier unpaid rows and every paid row
    status: pending
isProject: false
---

# Repeating budgets keep their bills in sync

Yes. A repeating budget should be the source of truth for what you expect to pay in those months. Unpaid comes from bills, so the budget and the bill have to move together. Saving or deleting a repeating budget reconciles bills. This is the ongoing rule, not a one-time cleanup of current Utilities rows. The same rule fixes an existing category the next time one of its repeating budgets is saved.

Paid expenses are never edited or deleted.

## What save does

On create or update of a repeating budget, reconcile that category:

- One seasonal bill is linked to that budget. Create it if it is missing. If it already exists, update its amount, months, and start date in place. Do not add a second bill for the same row.
- That bill is monthly and seasonal, with the same from-month, through-month, amount, and start date as the budget. Its unpaid rows are generated only in those months, from the start date forward.
- Look at the other bills in the category. If there is exactly one year-round monthly bill, it keeps every month before the earliest repeating start, and every later month that no repeating row covers. It must not also create unpaid rows in a month a repeating budget covers.
- Other seasonal bills already in the category are left alone. Propane does not get rewritten because a Utilities budget changed.
- If the category has more than one year-round monthly bill, do not guess which one to split or end. Leave those bills unchanged and do not create an extra seasonal bill that would stack on top of them.

Editing the linked seasonal bill updates the repeating budget, and editing the budget updates the bill. The open-ended from-bills budget sync stays as it is: it still ignores repeating rows, and seasonal bills still do not change its standing amount.

## What delete does

- Delete the repeating budget and retire its linked seasonal bill.
- Remove that bill’s unpaid rows. If the bill has any paid rows, deactivate it instead of deleting the template, because deleting a bill currently deletes its paid expenses too.
- If that was the last repeating budget in the category, and the app was what ended the year-round bill, clear that end date and let the year-round bill generate unpaid rows again.

## Unpaid rows after an end date

Today, setting a bill end date does not remove unpaid rows after that date ([`backend/expenses/views.py`](backend/expenses/views.py), `_reconcile_generated_schedule`). Those rows are why a later month can still show the old amount. Reconcile has to remove unpaid rows that are no longer on the schedule, including rows after the end date. Paid rows stay.

## What this looks like

A category with one year-round bill, then two repeating budgets that together cover the year:

- Months before the first repeating start keep the year-round bill and the open-ended budget.
- Each later month has one seasonal bill whose amount is the repeating budget for that month.
- Unpaid on that row matches the budget. A future month does not fill extra headroom, because the bill already equals the budget.
- Saving either repeating budget runs the same reconcile, so the two rows and the year-round bill stay one schedule.

No separate data fix. The next save of those repeating budgets runs this rule.

## Dry run against current data

Nothing has been changed. This is what the rule would do for family 9 using the bills and budgets stored now, plus the ranges you described. Paid rows are never updated. Unpaid rows before the new start stay. Rogers, Shaw, propane, and the yearly insurance bill are not rewritten.

Future Starlink and EPCOR amounts in the system are the bill templates ($132.30 and $200), not the last paid amounts ($157.50 and $129.24).

Phone winter amount and insurance winter amount are not in the system, so those dollar updates are not included. Utilities already has repeating budgets of $275 (Apr–Sep, start 2027-04-18) and $50 (Oct–Mar, start 2027-10-18). Those starts are 2027, not October 2026.

### TV/Internet — Starlink only

- Update Starlink (bill 19) to seasonal April–September at $132.30. Twelve unpaid rows in Apr–Sep 2027 and 2028 stay $132.30.
- Create one seasonal bill, October–March, $10, first new unpaid row November 2026. Fourteen unpaid rows change from $132.30 to $10: Nov–Dec 2026, Jan–Mar 2027, Oct 2027–Mar 2028, Oct–Dec 2028.
- October 1, 2026 Starlink stays paid at $157.50. September 2026 paid stays. January–August 2026 unpaid stays.
- Rogers and Shaw are not updated and not deleted. Rogers unpaid runs only through April 2027 ($249) and then stops because that bill ends 2027-04-30. Shaw unpaid runs through September 2027 ($144.90) and then stops because that bill ends 2027-10-30.
- Do not set the TV/Internet category budget to $10. That category still includes Rogers or Shaw in some months. A $10 category budget would show those months over budget. The winter category limit is Starlink $10 plus whichever of those bills is still due.

### Phone — Telus Mobility

- Same shape as Starlink: October–March becomes the lower amount, April–September stays $118.46. October 17, 2026 is already paid at $118.46, so the lower amount would start November 2026.
- Fourteen unpaid winter rows would change, twelve summer rows would stay $118.46. The new winter amount is not stored, so no dollar figure yet.
- No other phone bill.

### Utilities — EPCOR and propane

- Propane is already April–September at $150 and has no winter rows. It would not be updated. Eighteen unpaid propane rows stay.
- EPCOR is the year-round $200 bill. With the repeating budgets already saved, winter unpaid becomes $50 from October 2027 (not October 2026): Oct 2027–Mar 2028 and Oct–Dec 2028, nine unpaid rows from $200 to $50.
- April–September 2027 and 2028 are the problem. The saved budget is $275, but the bills in those months are EPCOR $200 plus propane $150 = $350. Putting $275 on EPCOR and leaving propane would make unpaid $425. Putting the whole $275 on the category and leaving both bills would leave unpaid at $350. Those do not match.
- September 2026 EPCOR paid at $129.24 stays. Unpaid EPCOR before the winter start stays $200.
- October 2026 EPCOR is still unpaid. It changes only if the winter start moves from October 2027 to October 2026.

### Insurance

- Vehicle Insurance drops to a lower October–March amount. April–September stays $273.53. It does not become a yearly bill. October 2026 is still unpaid, so an October 2026 start would change that row. The winter amount is not stored yet.
- Solitude stays yearly at $1,455 on May 22. It is not edited and it is not made seasonal.

## Where two bills share a month

A category has one budget for the month. Unpaid is every bill due in that category that month, added together. A repeating budget does not increase when a second bill is also due. That is the overlap.

- Phone has no overlap. Telus is the only bill. A winter repeating budget is the Telus amount.
- Insurance overlaps only in May. April, June, July, August, and September are vehicle insurance alone. October–March is vehicle insurance alone. May is vehicle insurance plus Solitude $1,455. Leave April–September on the open budget so May can still rise for Solitude. Use a repeating budget only for the lower October–March vehicle amount.
- Utilities overlaps only in April–September: EPCOR and propane are both due, $200 + $150 = $350. October–March is EPCOR alone. A repeating winter budget of $50 matches EPCOR alone. The saved April–September repeating budget of $275 does not match $350, and it would block the month from rising for propane. Leave April–September on the open budget. Keep the repeating budget for October–March only.
- TV/Internet overlaps in both seasons. October–March is Starlink plus Rogers ($249) through April 2027. April–September is Starlink plus Shaw ($144.90) through September 2027. A repeating budget of $10 would be the whole category limit, so Rogers would sit on top of a $10 budget. The $10 belongs on the Starlink bill only. The category budget stays the sum of the bills still due that month.

## Do not add the seasonal bills first

Wait until this reconcile exists. Adding them by hand now leaves the old unpaid rows in place, because an end date does not remove unpaid rows after that date. A later save could then create a second bill for the same months. One save should create or update the seasonal bill and remove the unpaid rows that no longer belong.
