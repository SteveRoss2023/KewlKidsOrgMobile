---
name: Income streams accordion
overview: Restructure Money → Income so all streams stay visible as accordion headers, payments nest under each stream, and Calendar becomes an Income sub-tab (not a top-level Money tab).
todos:
  - id: nest-calendar
    content: Move Calendar under Income as Streams|Calendar sub-tabs; remove top-level Calendar Money tab
    status: completed
  - id: streams-accordion
    content: Always-visible stream headers; collapse only payment rows (all items per stream)
    status: completed
  - id: edit-parity
    content: Keep stream edit/delete + item edit (actual) / delete from Streams and Calendar
    status: completed
  - id: rebuild
    content: Rebuild mobile web dist
    status: completed
isProject: false
---

# Income: streams overview + nested payments + Calendar sub-tab

Yes — this makes sense. The earlier build put Calendar as a top-level Money tab and over-emphasized month filtering; you want a **stream directory first**, with payments nested under each stream, and calendar as a second view *inside* Income.

## Recommendation: accordion cards + dense item rows (not a full table)

**Use stream accordion cards with table-like item rows inside.**

| | Why |
|---|---|
| **Stream headers always visible** | Easy to scan every stream (name, type/freq, default estimate) without expanding anything |
| **Collapse only the payments** | Overview stays clean; open one stream to work its pay items |
| **Dense rows for items** | Date / est / actual / status / edit-delete fit more pays than separate mini-cards |
| **Avoid a spreadsheet table for streams** | Multi-line meta (freq, date range) and edit actions are awkward in a true table on mobile/web |

So: **cards (or bordered sections) for streams; table-style rows for items.**

## Target UX

```mermaid
flowchart TB
  MoneyTabs[Money tabs: YTD Income Accounts Target]
  Income[Income tab]
  Sub[Income sub-tabs: Streams | Calendar]
  Streams[All stream headers visible]
  Accordion[Expand stream]
  Items[Payment rows: edit actual / delete]
  Cal[Month calendar: tap day to edit]
  MoneyTabs --> Income --> Sub
  Sub --> Streams --> Accordion --> Items
  Sub --> Cal
```

### Streams sub-tab
- List **every** stream at once (no outer “Income streams” collapse that hides them).
- Each stream row: chevron, color bar, name, type · frequency, default estimate, **Edit stream** / **Delete stream**.
- Expand → all payments for that stream (from loaded occurrences), sorted by `due_date`, as dense rows:
  - due date, estimate, actual (or —), status badge, **Edit** (opens existing Payment modal for actual received) / **Delete**.
- Month navigator moves off this sub-tab (Calendar owns month browsing).
- Keep **Add** stream in the Streams header.

### Calendar sub-tab (inside Income)
- Same month grid + “This month” list as today.
- Tap day or row → existing Payment modal (estimate / actual / status).
- Edit/delete on list rows stay available.

### Top-level Money tabs
- Remove standalone **Calendar** from the Money tab bar.
- Tabs become: **YTD | Income | Accounts | Target**.
- Deep link `?tab=calendar` maps to Income + Calendar sub-tab.

## Implementation (main file)

Primarily [`mobile/app/(tabs)/money.tsx`](mobile/app/(tabs)/money.tsx):

1. Drop `'calendar'` from `MoneyTab`; add `incomeSubTab: 'streams' | 'calendar'`.
2. When `tab === 'income'`, render a compact sub-tab strip (Streams | Calendar), then either streams accordion or calendar.
3. Streams list: map all `streams`; `expandedStreamIds` toggles payment body only.
4. Items under a stream: `occurrences.filter(o => o.stream === s.id)` (all for that stream, not only current month).
5. Reuse existing `openEditStream` / `openOcc` / `pendingDeleteStream` / `pendingDeleteOcc` / `moneyService.deleteOccurrence`.
6. `ensureYearSchedule` when Income is active (either sub-tab) and when calendar month/year changes.
7. Rebuild web dist after UI changes.

No backend changes required (ModelViewSet already supports occurrence PATCH/DELETE).