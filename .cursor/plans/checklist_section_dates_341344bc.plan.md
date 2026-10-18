---
name: Checklist section dates
overview: Add a `section_date` field on `ListSection` (Django + API + types), defaulting to today on create, editable in the UI beside the title with a compact format, sort sections by date then `order`, and adjust section drag-reorder so it preserves a sensible order relative to the new date sort.
todos:
  - id: backend-model-migration
    content: Add ListSection.section_date + migration; serializer + ListSectionViewSet order_by
    status: completed
  - id: mobile-types-api
    content: Extend types; createSection with today; client sort after fetch
    status: completed
  - id: section-row-ui
    content: "SectionRow: compact date beside title + edit + onChangeSectionDate prop"
    status: completed
  - id: drag-reorder-dates
    content: Update web/mobile section drag handlers to PATCH section_date + order (rank-preserving)
    status: completed
  - id: seed-optional
    content: "Optional: seed_coyote_checklist section_date values"
    status: completed
isProject: false
---

# Checklist section date field

## Backend

- **Model** — In `[backend/lists/models.py](backend/lists/models.py)`, add `section_date = models.DateField(default=date.today)` (import `date` from `datetime`). Keep existing `order` as tie-breaker.
- **Migration** — Add migration; existing sections get the migration default (typically “today” at migrate time, which is acceptable for legacy rows).
- **Ordering** — In `[backend/lists/views.py](backend/lists/views.py)` `ListSectionViewSet.get_queryset`, change `order_by('list', 'order')` to `order_by('list', 'section_date', 'order')`.
- **Serializer** — In `[backend/lists/serializers.py](backend/lists/serializers.py)` `ListSectionSerializer`, add `section_date` to `fields` (read/write, ISO `YYYY-MM-DD` from DRF).
- **Seed (optional follow-up)** — `[backend/lists/management/commands/seed_coyote_checklist.py](backend/lists/management/commands/seed_coyote_checklist.py)`: pass explicit `section_date` per section if you want seeded lists to have meaningful dates; otherwise default applies.

## Mobile types and API usage

- **Types** — In `[mobile/types/lists.ts](mobile/types/lists.ts)`: add `section_date: string` to `ListSection` (ISO date). Add `section_date?: string` to `CreateListSectionData` / `UpdateListSectionData`.
- **Create section** — In `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx) where `ListService.createListSection` runs, send `section_date` as **today** in `YYYY-MM-DD` (local calendar), same default as backend.

## UI: display + edit (`[mobile/components/lists/SectionRow.tsx](mobile/components/lists/SectionRow.tsx)`)

- **Display** — Beside the title (same row as checkbox / drag / title), show a **compact** date:
  - Use one formatter (e.g. `toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })`) so it stays short on phones; on narrow width consider `numberOfLines={1}` + `flexShrink` on title so the date + actions + chevron stay on one row.
  - Layout: keep title in a `flex: 1` container with `minWidth: 0` so long titles ellipsize; date in a fixed-ish right block before overflow menu / chevron (e.g. `marginLeft: 8`, smaller `fontSize`, secondary color) so accordion and actions are unchanged in behavior.
- **Edit** — Reuse patterns from `[mobile/components/ThemeAwareDatePicker.tsx](mobile/components/ThemeAwareDatePicker.tsx)` (`value` / `onChange` as `YYYY-MM-DD`) **or** a lightweight inline flow:
  - **Web**: small `<input type="date">` or press date text to open picker.
  - **Native**: `DateTimePicker` in `date` mode (same as ThemeAwareDatePicker / AddItemForm).
  - New callback prop e.g. `onChangeSectionDate?: (iso: string) => void` wired from list detail to `ListService.updateListSection(id, { section_date })`, then refresh or optimistic local update.

## Sorting on the client

- After `fetchListSections`, **normalize order** so UI matches API even if something returns unsorted: `sections.sort((a, b) => compare ISO date, then order)`.
- Any local `setSections` after mutations should keep the same rule (or refetch sections).

## Section drag-reorder vs date sort

Today, drag only PATCHes `order` (`[[id].tsx](mobile/app/(tabs)`/lists/[id].tsx) ~1442, ~1462). With `order_by('section_date', 'order')`, a refetch would **ignore** pure `order` changes when dates differ.

**Approach (recommended):** On successful drag (web + mobile handlers), after computing the new section array order:

1. Build `sortedByKey = [...previousSections].sort(by section_date then order)` and `datesSequence = sortedByKey.map(s => s.section_date)`.
2. For the reordered array `newOrder` (length `n`), for each index `i`, PATCH `newOrder[i]` with `{ section_date: datesSequence[i], order: i }` (batch `Promise.all` as today).

This **reassigns the multiset of dates** to sections in the new visual order so the earliest date moves with the top row, etc., and reload order stays consistent.

## Testing checklist

- Create section: date defaults to today; appears next to title.
- Edit date: persists and list re-sorts.
- Drag section: order + dates updated; after refresh, order matches expectation.
- Long section title + date on small web width: single line / ellipsis, no overlap with chevron.

