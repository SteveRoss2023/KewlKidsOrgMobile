---
name: Simplify voice help copy
overview: "Align the checklist Voice commands (info) modal and tooltip with the actual guided mic flow: add / delete / update, then section or item, then follow spoken prompts—drop the long cheat-sheet style blocks."
todos:
  - id: modal-copy
    content: Rewrite checklist AlertModal message + details; remove verbose blocks
    status: pending
  - id: tooltip-hint
    content: Shorten voice help button tooltip (and hint if needed) to match
    status: pending
isProject: false
---

# Simplify checklist voice help (info button)

## Problem

In `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx), the checklist branch of the Voice commands `AlertModal` (~4476–4499) mixes:

- A reasonable **guided** summary (still a bit wordy in bullet 3).
- A **“Full phrases when idle”** block with a long example string.
- A **“Delete item (details)”** block.

That reads like an old “phrase list,” not the **simple wizard** you ship: tap mic → **add, delete, or update** → **section or item** → then whatever TTS asks next.

The modal `message` line still says *“Use these phrases when the mic is listening:”*, which reinforces the wrong mental model for checklists.

## Target copy (checklist only)

1. `**message`** (checklist): Replace with something that matches the wizard, e.g. *“Tap the mic and answer each question out loud.”* (or equivalent—no “list of phrases” framing).
2. `**details*`*: Replace the three current groups with **one** primary section, e.g. label **“Checklist mic”** and **3 short bullets**:
  - First prompt: say **add**, **delete**, or **update** (optional parenthetical: remove / change).
  - Second prompt: say **section** or **item**.
  - After that: **follow the next spoken prompts** (section number or name, item name, yes/no to confirm deletes, etc.)—keep this one line, not a feature dump.
3. **Optional second section** (single bullet): One line only for advanced users: *If you are not already in a voice flow, you can still say a full command in one sentence*—**no** long example list (or at most **one** short example like *delete section [name]*).
4. **Remove** the standalone **“Delete item (details)”** group from the modal so the info button matches “simple then prompted,” not a reference manual.
5. `**tooltip`** on the info button (~3554): Shorten to match the same story (mic → add/delete/update → section/item → follow prompts), without promising “full phrases” unless you keep the one-line optional bullet above.

Non-checklist lists: **leave** the existing simple `details` (add/delete/update item lines) and generic `message` as-is, or only adjust `message` if you want consistency (“answer out loud”) without checklist-specific wizard text.

## Files

- `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx) — `AlertModal` props (`message`, `details` when `isChecklistList`), and the voice help `TooltipButton` / `accessibilityHint` if needed.

No code or voice behavior changes—**copy only**.