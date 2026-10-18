---
name: Sectioned nested checklist in app
overview: "Add sectioned, nested checklists in the kewlkids Lists feature as list type 'checklist': sections with number or dot bullets and a checkbox that checks all children; items as checkboxes with indent/outdent. Include import/creation of 'Coyote Fall Task List (2025)' from provided data."
todos: []
isProject: false
---

# Sectioned, Nested Checklist in Kewlkids App (Revised)

## Goal

- **Sections**: Top-level bullets—either **numbers** (1, 2, 3) or **dots** (•)—with a **checkbox** that when selected checks all of that section’s items (and nested items). Date/status are not stored; they are just part of the section title when the user types them.
- **Items**: Checkboxes that can be checked one by one, with **indent/outdent** so users can create as many nesting levels as needed.
- **No color styling**: Plain text only; no red/green or other styling.

## How many levels?

- **Sections**: One level (top-level only).
- **Items under a section**: Nesting is **unlimited in the database** (parent_id chain). In the UI, a **sensible cap of 10 levels** is recommended so lists stay readable; the backend can enforce a max depth (e.g. 10) to avoid abuse. So: **1 section level + up to 10 item nesting levels** (configurable).

## 1. Data model (backend)

**New model: `ListSection`** (in [backend/lists/models.py](backend/lists/models.py))

- `list` (FK to List), `order` (integer), `title` (encrypted). No date or status fields—user types everything into the title.
- `bullet_style`: CharField, choices e.g. `'number'` | `'dot'` (numbers vs standard bullet dots).
- Ordered by `order`.

**Extend `ListItem`**

- Nullable `parent` (FK to self) for nesting.
- Nullable `section` (FK to ListSection). Items belong to a section; top-level items have `parent=null`, nested items have `parent` set.
- Ordering: by section order, then by item tree order (e.g. preorder: parent before children, siblings by `order`).

**Migrations**

- Create `ListSection`; add `ListItem.section` and `ListItem.parent`; add optional `max_depth` check in API (e.g. reject create/update if depth > 10).

## 2. API (backend)

- **Sections**: CRUD for list sections (create/read/update/delete, ordered by `order`). Same family/list permissions as lists. Include `bullet_style` and `title` only.
- **List items**: Serializers include `section_id`, `parent_id`. Create/update accept `section` and `parent`. Optionally return flat list with `parent_id` for client to build tree, or return nested `children` for convenience.
- **Section “check all”**: Endpoint or action to mark all items in a section (and all descendants) completed, or uncompleted, when the section checkbox is toggled.
- **Depth limit**: When creating/updating an item with `parent`, compute depth and reject if above max (e.g. 10).

## 3. Mobile app (UI)

- **List detail** ([mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)/lists/[id].tsx)):
  - For each **section**: show a row with bullet (number or dot from `bullet_style`), **checkbox**, and title (plain text). Tapping the section checkbox checks/unchecks all items in that section (and all nested items). Optionally show section as checked when all descendant items are completed.
  - Under each section: render **items in a tree** (using `parent_id`). Each item row: checkbox (checked one by one), title, and **indent/outdent** buttons (or toolbar). Indent = move item under previous sibling (or under section if first); outdent = move item to be sibling of its parent.
- **Types** ([mobile/types/lists.ts](mobile/types/lists.ts)): Add `ListSection` (id, list, order, title, bullet_style). Extend `ListItem` with `section_id`, `parent_id`; optional `children` or build tree client-side from flat list.
- **Components**: Reuse or adapt [ListItemComponent](mobile/components/lists/ListItemComponent.tsx) for item row + checkbox. Add a **SectionRow** (bullet + section checkbox + title). Add **indent/outdent** controls (e.g. per row or in edit mode). Indentation: padding/margin by depth (depth 0 = section, 1..N = item levels).
- **Add/edit**: “Add section” (with bullet type choice: numbers vs dots). Add item under section or under another item; indent/outdent to change level. No date/status fields—only title text.

## 4. Removed from original plan

- **No date/status in DB**: Dates or “Done” are just part of the section or item title when created.
- **No color**: No red, green, or bold styling; plain text only.

## 5. Add "checklist" list type

- Add `**checklist`** to `List.LIST_TYPE_CHOICES` in [backend/lists/models.py](backend/lists/models.py) (and any frontend list-type pickers).
- Sectioned UI (sections + nested items, section checkbox, indent/outdent) is used **only when `list_type === 'checklist'`**. Other list types (shopping, grocery, todo, ideas, other) behave as today.

## 6. Import: Create "Coyote Fall Task List (2025)"

**Data source:** PDF exported from OneNote: [Coyote Fall Task List (2025).pdf](c:\dev\kewlkids\Coyote Fall Task List (2025).pdf) in the project root. Full content below is extracted for the import/seed payload.

**Sections and items** (use for seed file or import API; nesting under “Pack Clothes for Edmonton” is inferred from PDF order—adjust in app with indent/outdent if needed):

**Section 0** (bullet_style: dot)

- Put Shaw Direct on Pause (Sept 29, 2025 - Mar 31, 2026)

**Section 1** (bullet_style: number)

- 1. Truck (Friday/Saturday) - Friday Sept 19/20 - Done
  - Move truck beside shed (Leave room all the way around)
  - Take Batteries Out
  - Take Antena Off - Put in Shed.
  - Put Cover on and secure.

**Section 2** (bullet_style: number)

- 1. Pack Gazebo's - Saturday/Sunday Sept 20/21-
  - Take out trough
  - Pack TV, Store Shaw box in trailer
  - Cover on Blackstone
  - Turn Off Propane
  - Blackstone and Fire Tables
  - Clean Fridges
  - Leave Fridge Doors/covers open.
  - Un-Plug Fridges
  - Move Chairs and Fire Pit in.
  - Pack Cushions
  - Remove IceMaker
  - Put covers on furniture/Tables
  - Move Bin that covers were in into Gazebo
  - Move Speaker into Trailer
  - Put poles in
  - Put Covers on and Lock Down

**Section 3** (bullet_style: number)

- 1. Trailer (Inside) - Saturday Sept 27th
  - Sweep and wash floors
  - Empty & Clean Fridge (Night before leaving so can defrost) - Saturday Sept 27th
  - Put in Baking Soda (Buy New if needed) - Saturday Sept 27th
  - Turn Off Fridge - Saturday Sept 27th
  - Pack Liquids/Kitchen Stuff from Pantry
  - Pack Instapot - Thursday night
  - Pack Ice Maker - Thursday night
  - Pack Booze into cooler (Blue One), leave at back of trailer
  - Pack Liquids from Island (Dish soap/End compartment) - Thursday night
  - Pack Shaw Gear
  - Remove bedding - Take pillow covers/sheets and duvet cover to wash - (Sunday AM)
  - Take Bed Clips to Edmonton - (Sunday AM)
  - Pack Red Comforter, sheets/Pillowcases- Thursday night
  - Pack Pillows for Edmonton (3 or 4)- Thursday night
  - Store Duvet/Pillows in big yellow bin - (Sunday AM)
  - Take Passport, Put in Backpack
  - Pack Clothes for Edmonton - Big Suitcase - Thursday night
    - Only what is needed, leave the rest.
      - Work Shirts/Pull Overs
      - Golf Shirts/Shorts
      - Pants
      - Socks
      - Belt
      - Shoes
      - Sweats
  - Pack Bathroom stuff (Leave minimal for weekend) - Thursday night
  - Clean bathroom, Shower, Toilet - Saturday Sept 27th
  - Spare set of keys
  - Air Fresheners
  - Battery Charger
  - Gloves
  - Drone
  - Pack Computers (Laptop/PC/Monitor) - Backpack - Thursday night (1st Load)
  - Check Starlink position in trailer and ensure is working. - Sunday Sept 28th
  - Pack Golf Clubs - (Speaker/Range Finder, Shoes) - Saturday Sept 27th

**Section 4** (bullet_style: number)

- 1. Get Golf Cart ready - Saturday Sept 27th (After Golf or Early Sunday Morning)
  - Fill Batteries
  - Clean Batteries
  - Fully Charge
  - Plug In
  - Put in Tow Mode
  - Turn Key Off and put in Trailer
  - Turn off USB
  - Take out all liquids take to Edmonton.

**Section 5** (bullet_style: number)

- 1. Trailer (Outside) - Sunday Sept 28th
  - Remove Liquids from Storage compartments
  - Un-hook Propane
  - Winterize (King Kong/Blair/Steve) - Sunday Sept 28th.
  - Turn Water Off
  - Store Water Hose - storage compartment front
  - Put lawn hose away (Back Shed)
  - Take Water Splitter off and store (storage beside panel)
  - Move garbage can to shed.
  - Close Slides
  - Lock Doors.

**Section 6** (bullet_style: number)

- 1. 1st Trip - Thursday September 25th, 2025
  - TV
  - Table for Computer (Big One)
  - Bedding/Pillows (Red Comforter)
  - Shaw Gear
  - Truck Batteries
  - Laundry Bin (Small Blue One)
  - Computers/Monitor/Passport/EPCOR Badge - (BackPack)
  - Big Suit Case
  - Work Clothes (Shoes, Jackets etc) - most all clothes, just need little left for the weekend
  - Big Yellow Bin (Kitchen/Pantry stuff,)
  - Insta-pot, Ice Maker, Chip Clips, Kitchen Liquids, Food, Chip Bag Clips)
  - Dolly
  - EPCOR Badge (In BackPack)
  - Screw Driver (In Tv Box)
  - Bathroom Stuff (Just need to leave min @ Trailer for weekend)
  - Couple bars of Soap, Tums, Small Bin, Ibuprofin's, Shaving Cream
  - Towels, Hand Towels.
  - Bring back big yellow bin to trailer for anything remaining
  - Leave Back Pack at Condo
  - Bring Clock
  - Big Garbage can

**Section 7** (bullet_style: number)

- 1. Final Trip - Sunday September 28th, 2025
  - Tablet and Phone/Tablet Chargers - Back Pack/Black Duffel
  - Coffee Maker - Big Yellow Bin
  - Bedding - take to wash (Leave Pillows), Put in Bag - Big Yellow Bin
  - Golf Clubs - (Speaker/Range Finder, Shoes)
  - Any remaining clothes - Travel Bag (Black Duffel style)
  - bathroom stuff - minimal - backpack
  - Big Garbage can.
  - Clock
  - Multi Plug outlets - need 2
  - Paper Towels from basement
  - Water Glass
  - Water Jug
  - Big Black/Yellow tub
  - liquids (From shed too) -
  - Food, can opener (Optional Check new Condo)
  - bigger garbage can (Optional Check new Condo)

**Implementation:** Use the payload above in a seed script (JSON/YAML) or import API. Section titles in the list include the number (e.g. "1. Truck..."); when creating `ListSection` records, store either the full title or strip the leading "N. " depending on whether the UI renders the number from `order` or from the title. Items under "Pack Clothes for Edmonton" are shown with one level of nesting (Only what is needed → clothing items); the import can create `parent_id` links for that group and leave others flat.

## 7. Scope and compatibility

- **Existing lists**: No sections and no `parent_id` → behave as today. No breaking change.
- **Levels**: 1 section level + up to 10 item nesting levels by default (configurable; backend can enforce max depth).

## Summary


| Area    | Change                                                                                                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend | Add `ListSection` (list, order, title, bullet_style). Add `ListItem.section` and `ListItem.parent`. Section CRUD; item create/update with section/parent; “check all in section”; optional max depth. Optional: import endpoint or seed script for "Coyote Fall Task List (2025)". |
| Mobile  | Section row (number/dot bullet + checkbox that cascades to children). For list_type checklist only: section row and item tree with indent/outdent. Other list types unchanged. Plain text only; no color.                                                                          |
| Levels  | 1 section level + up to 10 item nesting levels (recommended; backend can enforce).                                                                                                                                                                                                 |
| Import  | Create list "Coyote Fall Task List (2025)" as checklist; import sections and nested items via import API or seed file (see §6).                                                                                                                                                    |


This gives you in-app checklists with bullet sections (numbers or dots), a section checkbox that checks all children, and items with checkboxes and indent/outdent for as many levels as you need (capped at 10 by default).