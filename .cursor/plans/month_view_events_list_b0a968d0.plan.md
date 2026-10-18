---
name: Month view events list
overview: The month grid shows event dots for many days, but the panel below intentionally lists only the **selected** day (`currentDate` updated by day tap or month navigation). Change the month-view list to show every event whose **local date** falls on a **cell visible in the current month grid** (including dimmed March/May spillover), grouped by date—reusing the same `agendaItems` / date-string logic as the Agenda view.
todos:
  - id: grid-range-helper
    content: Add visible 42-day grid range from currentDate + firstDay (Sunday default)
    status: completed
  - id: month-list-filter
    content: "useMemo: date keys in range with events from agendaItems"
    status: completed
  - id: month-list-ui
    content: Replace single-day list with grouped-by-date UI + title + empty state
    status: completed
isProject: false
---

# Month view: list events for all visible grid days (not only selected day)

## Current behavior (why it looks “wrong”)

In `[mobile/app/(tabs)/calendar.tsx](c:\dev\kewlkids\mobile\app\(tabs)`\calendar.tsx):

- `currentDate` drives both the focused month and **which day is selected** on the `Calendar` (`selectedDateStr`, lines 689–690, 840–846).
- The block under the month grid (lines 895–924) uses `**getEventsForDate(currentDate)`** and a title **"Events for {currentDate.toLocaleDateString()}"** — so it only ever shows **one calendar day**, e.g. April 1.
- Dots come from `**getMarkedDates()`** over **all** `events`, so many days show indicators while the list stays single-day.

This is consistent with a “pick a day, see that day’s list” pattern, but it does **not** match the expectation that the list should reflect **everything visible** on the month widget.

## Recommended product behavior

**List all events whose start date (local) falls on any day shown in the current month grid**, including leading/trailing days from the previous/next month (the dimmed cells). That matches your question (“all days visible”) and aligns the list with the dots on screen.

**Do not** switch the list to “entire month of April only” if that would **exclude** March 31 / May 1–2 while those cells still show dots—unless you explicitly want that stricter rule later.

## Implementation approach

1. **Compute the visible grid date range** from `currentDate`’s year/month, aligned to the same week start as `react-native-calendars` (default **Sunday** = `firstDay` 0 unless you pass something else—verify no `firstDay` prop on the month `Calendar`; if absent, use Sunday).
  - First day of month: `new Date(y, m, 1)`.
  - Offset back to week start: `(dayOfWeek - firstDay + 7) % 7` days before the 1st.
  - Grid length: **42 days** (6 rows × 7 columns), standard for this library’s month view.
2. **Derive a sorted list of date keys** (YYYY-MM-DD) in that inclusive range that have events:
  - Reuse existing `[agendaItems](c:\dev\kewlkids\mobile\app\(tabs)`\calendar.tsx) (lines 572–582) and `[getLocalDateString](c:\dev\kewlkids\mobile\app\(tabs)`\calendar.tsx) so timezone handling stays consistent.
  - `useMemo`: filter `Object.keys(agendaItems)` (or iterate sorted keys) to those `>= gridStartStr` and `<= gridEndStr`.
3. **Replace the month-only list UI** (lines 895–924):
  - **Title**: e.g. **"Events in this month view"** or a short range line **"Mar 29 – May 9, 2026"** derived from `gridStart` / `gridEnd` (clearer than “April only”).
  - **Body**: For each date in the filtered list (sorted), render a **date header** + the same event rows you use in Agenda (reuse structure from lines 775–812: title, location, time)—or extract a tiny shared fragment if you want to avoid duplication.
4. **Empty state**: If no events fall in the visible range, show a single message like **"No events in this month view"** (not “this day”).
5. **Selection unchanged**: Keep `currentDate` / blue circle / `handleDayPress` as today—optional future enhancement: scrolling the list to the selected day (out of scope unless you want it).

## Files to touch

- `[mobile/app/(tabs)/calendar.tsx](c:\dev\kewlkids\mobile\app\(tabs)`\calendar.tsx) only: helper for grid bounds + `useMemo` for visible-date keys + replace month `eventsListContainer` block.

## Verification

- Month = April 2026: events on Mar 31, Apr 3, May 1 (if in grid) all appear under grouped headers; Apr 1 selection still highlighted on grid.
- Navigate months: list range updates to new grid.
- No change to week/day/agenda views.

