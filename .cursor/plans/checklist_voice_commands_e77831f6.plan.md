---
name: Checklist voice commands
overview: "Today the list detail screen uses the same voice pipeline for every list type: `add [anything]`, `delete [name]`, `update [old] to [new]`. For checklists that is wrong because items need a `section`, and phrases like \"add item\" / \"add section\" are mis-parsed as item names. This plan adds a checklist-only multi-step flow (section then item), an `add section` command, keeps delete/update behavior, and updates the help modal—without changing non-checklist behavior."
todos:
  - id: voice-parsers
    content: Add checklist/add-section parsers and bare-add detection in voiceCommands.ts
    status: completed
  - id: checklist-state-machine
    content: Implement checklist voice phases, section pick + item name/create, add section in [id].tsx
    status: completed
  - id: help-and-reset
    content: Conditional voice help modal; reset state in handleVoiceClick; optional checklist open prompt
    status: completed
isProject: false
---

# Checklist-specific voice commands

## Current behavior (`[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx))

- Parsers live in `[mobile/utils/voiceCommands.ts](mobile/utils/voiceCommands.ts)`: `parseAddItem` (`^add\s+(.+)$`), `parseDeleteItem`, `parseUpdateItem`.
- **Add** always calls `ListService.createListItem({ list, name })` with **no `section`**, which is inappropriate for checklists (items are organized under sections; the UI always assigns a section).
- **Bug:** On a checklist, saying **"add item"** creates an item literally named **"Item"**; **"add section"** creates **"Section"**.
- **Help modal** (same file, `AlertModal` `details`) always shows generic `add [item name]`, `delete …`, `update …`.
- **Mic open** prompt is generic: `What would you like to do` in `handleVoiceClick`.

Non-checklist lists keep the existing single-utterance add/delete/update flow.

### Shared delete/update (checklists and non-checklists)

**Yes — one code path is correct.** Delete and update voice handling should **not** be forked by `list_type`. Today the screen loads all items into `listItems`, matches by spoken name with `findMatchingItems`, then calls `deleteListItem` / `updateListItem` by **item id**. Checklist entries are the same `ListItem` model (they only differ by having a `section`); the REST endpoints do not require a different delete/update flow for checklists. Keeping **identical** delete/update logic for checklists and other lists means:

- Non-checklist behavior stays **unchanged** (no new branches).
- Checklist items **continue** to be edited/deleted by voice the same way they are today, just without the add-item bugs.

Only **add** (and the new **add section** command) need checklist-specific branching so new checklist items get a `section`.

## Target behavior (checklists only)


| Intent                           | Flow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add item**                     | User says **"add item"** (or **"add an item"**, optional plural **"add items"**). If there are **no sections**, TTS: add a section first (optionally mention **"add section"**). If there **are** sections, TTS lists them **by number** (e.g. title + date label if useful—reuse how sections are shown elsewhere, or at least **number + section title**). User answers with **1–n** (reuse the same number-selection pattern as delete/update). Then TTS: **"What should the item be called?"** Next utterance (raw text, with `**isCancelCommand`** to abort) becomes the item name → `createListItem({ list, name, section: chosenSectionId })`, then refresh items. |
| **Add item with name in one go** | User says **"add pack snacks"** (anything after `add` that is **not** the bare add-item phrase and **not** `add section …`). Store the parsed name, run the **same section picker** as above, then create the item **without** a second name prompt.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Add section**                  | `**add section`** with **no title** → TTS asks for the section title; next utterance creates the section with `**section_date`** = today via existing `[formatLocalISODate](mobile/utils/sectionSort.ts)` (same default as `[AddSectionForm](mobile/components/lists/AddSectionForm.tsx)`). `**add section [title]`** in one utterance → create immediately with today’s date and `order: sections.length`, matching `[submitAddSection](mobile/app/(tabs)`/lists/[id].tsx).                                                                                                                                                                                              |
| **Delete / update**              | **Same handler for all list types** (no `isChecklistList` branch): `listItems` + `findMatchingItems` + existing number disambiguation; works for checklist and non-checklist items alike.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Cancel**                       | During any checklist voice step, honor `[isCancelCommand](mobile/utils/voiceCommands.ts)`, clear voice state, TTS short ack.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |


## Implementation outline

1. `**[mobile/utils/voiceCommands.ts](mobile/utils/voiceCommands.ts)`**
  - Add small parsers/helpers, e.g. `parseChecklistBareAddItem(text)`, `parseAddSectionCommand(text)` → `{ title?: string } | null`, and optionally a helper to detect **"add X"** where X is a **proposed item name** vs reserved phrases (`item`, `section`, …).
  - Keep existing `parseAddItem` for **non-checklist** use; checklist branch in the screen will run **before** calling it.
2. `**[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx)**
  - Add React state for the checklist voice wizard, for example:
    - phase: `idle | 'pick_section_for_item' | 'name_for_new_item' | 'title_for_new_section'`
    - `pendingChecklistItemName: string | null` (set when user said `add [name]` before picking section)
    - `pendingSectionsForVoice: ListSection[]` for numbered prompts (or reuse a generalized `pendingAction` + typed pending list).
  - In the **voice `useEffect`**, early ordering:
    - existing **number selection** for delete/update; then **checklist phase** handlers (pick section → either prompt for name or create with pending name; section title step);
    - **if `isChecklistList`**: handle `add section` / bare add item / `add [name]` **before** generic `parseAddItem`;
    - **if not checklist**: keep current `parseAddItem` / delete / update unchanged.
  - `**handleVoiceClick`**: reset new checklist voice state together with existing `awaitingNumberSelection` / `pendingMatches`.
  - Optionally adjust the opening `**speak(...)`** line for checklists to mention **add item**, **add section**, **delete**, **update** (short).
  - `**AlertModal` `details`**: when `isChecklistList`, show checklist-specific lines (add item flow, add section, delete, update); otherwise keep current three lines.
3. **Edge cases**
  - **Web `speak` + `start` timing**: mirror existing delete flow (`ignoreTranscriptsForMs` if the hook supports it, or short delay after TTS) so the prompt is not transcribed as a command.
  - **Empty section list** on add item: clear message + suggest **add section**.
  - **Invalid section number** while picking: reprompt or cancel politely.

## Files touched

- `[mobile/utils/voiceCommands.ts](mobile/utils/voiceCommands.ts)` — new parse helpers.
- `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx) — state machine, reorder handling, help text, optional prompt tweak.

No backend changes required: `[CreateListItemData](mobile/types/lists.ts)` already supports `section`; `[createListSection](mobile/services/listService.ts)` already matches the UI’s create payload.