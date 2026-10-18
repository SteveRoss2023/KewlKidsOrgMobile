---
name: Mobile money layout
overview: The phone layout currently forces every figure onto one row and shrinks type as small as 4px so million-scale amounts do not wrap. That is why the Overview month card is hard to read and still clips. Desktop can stay as it is. Pick a phone layout below.
todos:
  - id: pick-layout
    content: "Choose phone layout: two-across, table, waterfall, one-per-row, or headline plus pairs"
    status: pending
  - id: apply-phone-layout
    content: Replace shrink-to-fit rows in phoneMoneyLayout and the Overview, Budgets, and Money summary cards
    status: pending
isProject: false
---

# Mobile figure layout

On a phone, Overview’s month card puts 4 figures in one row ([CashflowDashboard.tsx](mobile/components/expenses/CashflowDashboard.tsx)). The same one-row shrink is in [phoneMoneyLayout.ts](mobile/components/expenses/phoneMoneyLayout.ts) and is reused by Budgets, Income, Accounts, Year-to-date, and Target.

A full amount like `$1,234,567.89` needs about 110px at 13px type. A quarter of a phone row is about 70px, so the current fitter drops toward 4–7px, and notes such as `Income − Paid − Unpaid` still clip. Guessing character width is why a later pass still truncates.

Desktop (520px and wider) stays on the current rows in every option.

## Option A — Two across, readable type (recommended)

Under 520px, summary figures sit two per row at a normal size (about 13–16px). A 4-figure month row becomes two rows of two. Labels stay above the amount. Notes that still do not fit wrap onto a second line inside that cell, or use the shorter wording already introduced (`With bill dues`).

Year-to-date keeps Invest start, Growth, and Invest now as three labeled cells that wrap to two rows. The `+` and `=` stay on wider screens only, because the labels already say what each number is.

This is taller than today and much easier to read. Full currency strings stay intact, including Demo Income.

## Option B — One figure per row

Each metric is its own row: label on the left, full amount on the right, at the normal size. Nothing shrinks and nothing is cut off. The month card becomes a short list (Income, Projected, Planned net, and so on).

Clearest of the options, and the tallest. Formula rows (Year-to-date, Target) read as a list instead of `start + growth = now`.

## Option E — Table

Same information as option B, laid out as a real table so the amounts line up and you can scan down the numbers. On a phone there is one amount column. A second full currency column (`$1,234,567.89` next to another `$1,234,567.89`) is too wide for a phone, so Year and This month stay as two separate tables, not two amount columns.

Overview month card, one row per figure:

- Label on the left. A short note sits under the label (`Paid + Unpaid`, `Income − Budget`), so it does not take space away from the number.
- Amount on the right, normal size, full cents, right-aligned, tabular figures.
- A hairline between rows.
- Rows that already open a drill (Projected, Paid, Unpaid) stay tappable, with the same selected border.

Year hero on Overview and Budgets uses the same table. Income, Accounts, and Target do too. Year-to-date becomes rows (Invest start, Growth, Invest now, then Cash and Portfolio) instead of `start + growth = now`. The `+` and `=` stay on wider screens.

This is about as tall as option B. It is easier to scan because every amount shares one column. Type stays at the normal size, so Demo Income does not shrink or clip. Desktop keeps the current side-by-side heroes.

## Option F — Waterfall

A waterfall draws one bridge: a starting total, then each step up or down, then the result. The amount stays at normal size beside the bar, so it does not shrink or clip. Sample figures below are only to show the shape.

Overview month, actual bridge:

- Income, full bar
- Paid, step down
- Unpaid, step down
- Actual net, full bar (Income − Paid − Unpaid)

Budget bridge on the same card:

- Budget, full bar
- Paid, step down
- Unpaid, step down
- Under or Over, full bar (Budget − Paid − Unpaid)

Year-to-date:

- Invest start, full bar
- Growth, step up or down
- Invest now, full bar
- Cash, step up
- Portfolio, full bar

Budgets can use the budget bridge only, since that screen has no income.

This is a good fit when the steps are a similar size to the total, which is true for Budget versus Paid and Unpaid, and usually true for investment growth. It is a weak fit for Overview when Demo Income is on: a `$3,100` paid step disappears next to a `$2,450,000` income bar. Those two bridges would need separate scales, or income stays out of the spending waterfall.

A waterfall does not list every figure the cards show today (Planned net, item counts, With bill dues). Those would sit as a short table under the chart, or the chart replaces only the formula rows. Tapping Paid or Unpaid can still open the existing drill.

Desktop keeps the current heroes. The waterfall is the phone summary.

## Option C — One large number, the rest two across

The month card leads with one primary amount (Actual net, or Projected) at a large size. The other figures sit two across underneath at a normal size. Same idea on the year hero and the Money summaries: one headline, then pairs.

Shorter than option B, and it shows what matters first. You would want to say which number is the headline on Overview and on Budgets.

## Option D — Keep one row, abbreviate large amounts

The only way to keep today’s single row and still use readable type is to shorten the string on small screens, for example `$1.23M`. You already asked for the full cents amount, so this fights that. It is listed only because it is the alternative to adding height.

## After you pick

Apply that pattern in [phoneMoneyLayout.ts](mobile/components/expenses/phoneMoneyLayout.ts), then use it on the Overview month card first, then the year heroes on Overview and Budgets, then Income, Accounts, Year-to-date, and Target. Remove the shrink-to-4px fitter for those rows so type no longer depends on a character-width guess.
