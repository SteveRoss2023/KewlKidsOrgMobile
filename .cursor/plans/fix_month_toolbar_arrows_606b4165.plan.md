---
name: Fix month toolbar arrows
overview: The month grid from `react-native-calendars` does not reliably follow the toolbar prev/next buttons because it treats `current` as initial state and keeps its own month internally. The built-in blue arrows work because they drive that internal state and fire `onMonthChange`. Fix by remounting the month `Calendar` when the visible year-month changes (from toolbar, swipe, or `onMonthChange`), without remounting on every day tap within the same month.
todos:
  - id: calendar-key-month
    content: Add year-month to month Calendar key in calendar.tsx
    status: completed
  - id: today-helper
    content: "Optional: handleNavigate TODAY uses getTodayLocal() for consistency"
    status: completed
isProject: false
---

# Fix month calendar toolbar arrows (sync with blue header arrows)

## Root cause

In `[mobile/app/(tabs)/calendar.tsx](c:\dev\kewlkids\mobile\app\(tabs)`\calendar.tsx):

- The **toolbar** `< >` buttons call `handleNavigate` → `setCurrentDate` (e.g. `setMonth` for month view) — see lines 192–216.
- The **month** `<Calendar>` uses `current={selectedDateStr}` (derived from `currentDate`) and `onMonthChange` to update `currentDate` when the **blue** header arrows are used (lines 869–872).
- The `Calendar` `key` is `calendar-${events.length}-${view}-${calendarKey}` (line 828). Changing **only** `currentDate` does **not** change that key, so React keeps the same `Calendar` instance. `**react-native-calendars` keeps an internal visible month**; updating the `current` prop from the parent often does **not** move that month, while the library’s own arrows update both internal state and `onMonthChange`.

So: blue arrows = in sync; toolbar arrows = parent state moves, grid often stuck.

`[CalendarToolbar.tsx](c:\dev\kewlkids\mobile\components\calendar\CalendarToolbar.tsx)` already wires web chevrons to `onNavigate('PREV'|'NEXT')` (lines 51–61); no toolbar bug — the fix belongs in how the month `Calendar` is keyed / controlled.

## Recommended fix

**Tie the month `Calendar` `key` to the visible calendar month** (year + month), e.g. ``${currentDate.getFullYear()}-${currentDate.getMonth()}``, appended to the existing key parts (`events.length`, `view`, `calendarKey` if you still want remount-on-modal-close behavior).

- When the user uses **toolbar prev/next** or **swipe**, `currentDate`’s month changes → **new key** → `Calendar` **remounts** → `current={selectedDateStr}` is applied as the initial month — same effect as the blue arrows.
- When the user **taps a different day in the same month**, year-month is unchanged → **same key** → **no remount** — avoids flicker and preserves smooth day selection.

Concrete change in `calendar.tsx` for the **month** view `<Calendar>` only (around line 826–828): replace or extend the `key` prop to include `currentDate.getFullYear()` and `currentDate.getMonth()` (0–11).

Optional small consistency fix (same file, line 196): for `action === 'TODAY'`, use the same local “today at midnight” helper as initialization (`getTodayLocal()`) instead of `new Date()`, so “Today” matches the rest of the screen’s date logic.

## Out of scope (unless you want parity later)

- **Agenda** view’s `<Calendar>` (lines 721–757) has no `onMonthChange`; if toolbar month navigation feels wrong there too, add the same month-based `key` and optionally `onMonthChange` — not required for the reported month-view issue.

## Verification

- Web: Month view → use **toolbar** `<` `>` next to Today → grid month should advance like the **blue** header arrows.
- Tap days within the same month → no unnecessary full calendar remount (no flash).
- After fix, run through modal close (`calendarKey` increment) to ensure behavior still acceptable.

