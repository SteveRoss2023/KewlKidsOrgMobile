---
name: Money phone figures
overview: On phone, grow the Money hero figures the same way as the Overview month card, and stop Income stream payment rows from truncating by shortening the date and status badge so the full amounts fit.
todos:
  - id: hero-fit
    content: Tighten phone hero gaps and character width on Income, Accounts, YTD, and Target
    status: pending
  - id: stream-pays
    content: "Phone stream payment rows: short date, short badges, full amounts on one line"
    status: pending
  - id: month-pays
    content: Phone month payment line uses the short date so Est and Act stay visible
    status: pending
isProject: false
---

# Money phone figures

Phone only (under 520px). Desktop stays as it is. Full currency stays `$12,345.67` on one line.

## Hero rows

Same idea as the Overview month card: the current fitter assumes each character is wider than it is, so the figures stay smaller than the row can hold. In [IncomeDashboard.tsx](mobile/components/money/IncomeDashboard.tsx), [AccountsDashboard.tsx](mobile/components/money/AccountsDashboard.tsx), [YtdDashboard.tsx](mobile/components/money/YtdDashboard.tsx), and [TargetDashboard.tsx](mobile/components/money/TargetDashboard.tsx), phone hero rows will use a tighter gap and a 0.58 character width so the amounts grow toward their existing sizes (16px on Income and Accounts, 15px on the YTD and Target breakdowns).

Rows:

- Income: Year total, Received, Estimated
- Accounts: Portfolio, Invested, Cash
- YTD: Invest start, growth, Invest now, then Invested, Cash, Total
- Target: start, end, cash, portfolio

List amounts that already shrink to a side slot (account balances, YTD deltas) stay as they are.

## Income stream payments

The truncating row is the Streams table in [IncomeDashboard.tsx](mobile/components/money/IncomeDashboard.tsx): Date, Est, Actual, status badge, edit and delete. On a phone the date column is about 70px and each amount column about 58px. `Oct 16, 2026` and `$10,000.00` do not fit, and `numberOfLines={1}` cuts them off. The status column is a fixed 72px for the words `estimated`, `received`, and `skipped`.

On phone only:

- Date becomes `Oct 16` (month and day). The stream header still shows the year range.
- Badge becomes `Est`, `Rec`, or `Skip`, and that column shrinks so Est and Actual get the width back. Colors stay the same.
- Est and Actual use the same fit as the heroes so `$10,000.00` stays whole.

Desktop keeps `Oct 16, 2026` and the full status words.

The month payment line under the income chart (`Oct 16, 2026 · Est $… · Act $…`) uses the same short date on phone so that line stops cutting off the amounts.

The stream header date range (`Oct 1, 2024 → …`) keeps the year. If it does not fit, that one line may wrap. The year matters there.

Then `npm run build` in `mobile` so a refresh picks up the new bundle.
