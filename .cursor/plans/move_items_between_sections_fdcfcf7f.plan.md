---
name: Move items between sections
overview: Items belong to a section via `ListItem.section`. You can already change section when editing an item (checklist Section picker in AddItemForm). The best additional options are a dedicated “Move to section” action for speed, then cross-section drag on web; nested items need a clear rule (move subtree vs strip parent).
todos:
  - id: nesting-policy
    content: "Decide: move item+descendants’ section vs strip parent vs block if has children"
    status: pending
  - id: option-b-modal
    content: Add Move to section row action + PATCH section (+ order); subtree updates if needed
    status: pending
  - id: option-a-hint
    content: "Optional: hint in checklist edit UI that Section field moves the item"
    status: pending
  - id: option-c-web-dnd
    content: "Optional later: web drop on section header/body to call same PATCH logic"
    status: pending
isProject: false
---

# Moving checklist items between sections — options

## How it works today (data + UI)

- Each row is a `[ListItem](c:\dev\kewlkids\backend\lists\models.py)` with `**section` → `ListSection**` (and optional `**parent**` for nesting).
- The checklist screen builds `**checklistItemsBySection**` by grouping on `item.section` (`[[id].tsx](c:\dev\kewlkids\mobile\app\(tabs)`\listsid].tsx) ~916–925).
- API: `[ListItemSerializer](c:\dev\kewlkids\backend\lists\serializers.py)` includes `section`, so `**PATCH /list-items/{id}/**` can change section (same as other fields).
- **Already supported path:** open **Edit item** on a checklist row — `[AddItemForm](c:\dev\kewlkids\mobile\components\lists\AddItemForm.tsx)` includes a **Section** picker when `isChecklistList && sections.length > 0` and submits `data.section` on update (~83–85, 91–94). So moving is possible today without new backend, if users discover it.

**Nesting caveat:** If you only PATCH **one** item’s `section` and it has **children**, children still have their old `section` in the DB. They would show under the wrong accordion (grouping is by each item’s `section`). Any serious “move” feature should define:

- **Move subtree:** when moving an item, also PATCH `section` (and maybe `order`) for all descendants; or
- **Move leaf only / strip parent:** clear `parent` (and adjust `indent_level`) when moving out; or
- **Restrict:** disallow moving items that have children unless moving the whole tree.

---

## Option A — Rely on Edit item (zero new code)

- **Pros:** Already works; no API change.
- **Cons:** Heavy UX (full edit sheet); easy to miss.
- **Small improvement:** Tooltip / subtitle on checklist edit: “Change section in the Section field below.”

---

## Option B — Dedicated “Move to section” (recommended first addition)

- **UX:** Row overflow / long-press menu → **Move to section…** → modal with `[ThemeAwarePicker](c:\dev\kewlkids\mobile\components\lists\ThemeAwarePicker.tsx)` (or list of buttons) → **Confirm**.
- **Implementation:** `PATCH` item with `{ section: targetId, order: … }` (`order` = end of target section or `max+1` to avoid clashes). Apply **subtree rule** above for nested items.
- **Pros:** Fast, obvious, works **web + native** consistently.
- **Cons:** One extra modal; need ordering + nesting policy.

---

## Option C — Drag-and-drop across sections (web)

- You already have **web-only** drag for **reorder within a section** (`[DraggableChecklistItemRow](c:\dev\kewlkids\mobile\app\(tabs)`\listsid].tsx) ~205+).
- **Extension:** allow dropping an item (or row) onto a **section header** or **section body** drop zone → compute target `section` + `order`, then `PATCH` (and subtree rule).
- **Pros:** Very fast for power users on desktop/tablet web.
- **Cons:** Web-only unless you invest heavily in native; accessibility and hit-testing need care; same nesting rules as B.

---

## Option D — Native: drag between sections

- Today **native** sections use `[DraggableFlatList](c:\dev\kewlkids\mobile\app\(tabs)`\listsid].tsx) on **sections**, not one flat list of all items — cross-section item DnD is **non-trivial** (multiple lists or rebuild to a single virtualized list with section headers).
- **Pros:** Polished when done.
- **Cons:** Highest effort; prefer **B** for mobile first.

---

## Suggested priority

1. **Document / lightly surface** existing Edit → Section (Option A tweak).
2. **Implement Option B** with explicit **subtree** behavior and deterministic `**order`** in the target section.
3. **Option C** only if web-first power users matter and B is already shipped.

No backend endpoint is strictly required if PATCH + optional bulk PATCH for descendants is enough; a single `**POST /list-items/{id}/move-section/`** is optional sugar (atomic subtree move + ordering).