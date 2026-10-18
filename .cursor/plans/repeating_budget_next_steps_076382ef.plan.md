---
name: Repeating budget next steps
overview: The data extract is done. Next is an app change so saving a repeating budget updates the matching bill and unpaid rows. You enter Telus, vehicle insurance, and Starlink in the app after that ships.
todos:
  - id: reconcile-on-save
    content: On repeating-budget save or delete, create or update the linked seasonal bill and remove unpaid rows that are no longer on the schedule
    status: pending
  - id: leave-other-bills
    content: Leave Rogers, Shaw, propane, and Solitude unchanged; do not raise a repeating budget for a second bill in the same month
    status: pending
  - id: user-enters-after
    content: After the app change ships, user deletes the Utilities April–September $275 budget and adds Telus, vehicle insurance, and Starlink winter repeating budgets in the app
    status: pending
isProject: false
---

# Next steps

The extract is already saved at [backend/backups/expense-extract-20261018-185940.json](backend/backups/expense-extract-20261018-185940.json). Do not add seasonal bills or new repeating budgets until the app change below is in place. Today a repeating budget only changes the limit, so unpaid would stay at the old bill amount.

## 1. Build the app change

Saving or deleting a repeating budget in Expenses → Budgets reconciles that category’s bill. This is part of the app, not a one-time script.

- One seasonal bill is linked to the repeating budget. Create it if missing, otherwise update its amount, months, and start date.
- If the category has one year-round monthly bill, that bill keeps the months the repeating budget does not cover, and it stops creating unpaid rows in the covered months.
- Other seasonal bills and yearly bills stay as they are: Rogers, Shaw, propane, Solitude.
- Unpaid rows on or after the new start that are no longer on the schedule are removed, including rows after an end date. Paid rows and earlier unpaid rows stay.
- Deleting the repeating budget retires its seasonal bill. Deleting the last one restores the year-round bill.
- A repeating budget still does not rise for a second bill due in the same month. That is why April–September stays on the open budget when another bill shares those months.

## 2. You use the app after that ships

- Utilities: keep the October–March repeating budget at $50 (that becomes EPCOR). Delete the April–September repeating budget of $275 so those months stay EPCOR plus propane.
- Phone: add an October–March repeating budget at the lower Telus amount. April–September stays the open budget at $118.46.
- Insurance: add an October–March repeating budget at the lower vehicle amount. April–September stays the open budget so May still rises for Solitude. Solitude stays yearly.
- TV/Internet: the $10 is the Starlink bill for October–March, not the whole category budget. Rogers and Shaw stay. April–September Starlink stays $132.30. The category limit for a month remains the sum of the bills still due.
