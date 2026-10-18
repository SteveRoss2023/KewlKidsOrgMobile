---
name: Demo YTD returns
overview: "Fix demo-mode YTD so Amount and Return match the boosted portfolio: keep the real return %, scale $ gain and displayed latest from the boosted year-start (display-only)."
todos:
  - id: demo-ytd-math
    content: Scale demo YTD latest/delta from real return % on boosted start
    status: completed
  - id: rebuild
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Demo-consistent YTD Amount / Return

## Problem

[`withDemoBalance`](mobile/utils/moneyDemoPortfolio.ts) adds a flat boost to both year-start and latest. Then:

- `$` delta stays the **real** (small) gain
- `%` return shrinks because the denominator is huge

Account lines look “demo-sized,” but the YTD hero Amount / Return still look like the real portfolio.

## Approach (display-only)

In [`buildYearReturnRows`](mobile/utils/moneyReturns.ts), when `demoEnabled`:

1. Compute **real** start/latest (no boost) and **real** `returnPct` / `delta`.
2. `displayStart = withDemoBalance(realStart, …)`.
3. `displayLatest = displayStart × (1 + realReturnPct/100)` so the same return % applies to the fake size.
4. `displayDelta = displayLatest − displayStart`.
5. Expose `returnPct = realReturnPct` (same % as with demo off).

When demo is off, keep current behavior (raw start/latest/delta/%).

Hero totals already come from `sumReturnRows(yearReturnRows)`, so Amount / Return / Year start / Latest stay consistent. Per-account YTD rows use the same fields — still display-only, nothing written to the server.

Target tab already grows from boosted start × rate; leave it as-is.

## Files

- [`mobile/utils/moneyReturns.ts`](mobile/utils/moneyReturns.ts) — demo-aware display math in `buildYearReturnRows`
- Rebuild mobile web