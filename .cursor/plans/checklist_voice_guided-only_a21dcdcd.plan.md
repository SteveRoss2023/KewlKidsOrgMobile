---
name: Checklist voice guided-only
overview: Remove checklist idle “one-shot” voice parsing so the only entry is tap mic → add/delete/update → section/item → existing step-by-step phases. Stop listening when the checklist voice session returns to idle to avoid dead air and stray transcripts.
todos:
  - id: remove-idle-block
    content: Remove checklist idle one-shot block (~1755–2058); keep non-checklist add path
    status: completed
  - id: gate-delete-update
    content: Skip parseDeleteItem/parseUpdateItem checklist branches when phase is idle
    status: completed
  - id: remove-choose-phases
    content: Delete delete_choose_kind / update_choose_kind handlers and union variants
    status: completed
  - id: stop-on-idle
    content: stop() when clearChecklistVoice / returning checklist voice to idle
    status: completed
  - id: fallback-help
    content: Short checklist fallback TTS + simplify AlertModal/tooltip copy
    status: completed
  - id: imports-lint
    content: Prune unused voiceCommands imports; fix lints
    status: completed
isProject: false
---

# Checklist voice: guided flow only (remove one-shot idle parsing)

## What exists today

- **Guided entry** (`[handleVoiceClick](mobile/app/(tabs)`/lists/[id].tsx)): checklist starts in `guided_action`, then `guided_target`, then branches into the same phases as before (`section_title`, `add_section_or_item`, `pick_section`, `delete_section_pick`, `delete_confirm_section`, etc.).
- **Second path**: When `checklistVoicePhase === 'idle'` and the mic is still on (continuous web / native), a **large block** (~1755–2058) parses one-shot phrases: `parseAddSectionCommand`, `parseAddItem`, `parseDeleteSectionCommand` (with optional query), bare delete/update, `parseChecklistDeleteItemBareIntent`, `parseUpdateSectionCommand`, etc.
- **Below that**, `**parseDeleteItem`** and `**parseUpdateItem**` run for **all** list types; the checklist branch (~2089–2131 and the update path) supports **delete [name]** / **update old to new** without going through guided steps.
- **Fallback TTS** when nothing matches (~2216–2218): long “Try: add item, add section…” string for checklists.

That dual path is exactly the “extra logic” you want gone for checklists.

## Target behavior

- **Checklist**: Voice only does **mic tap → add / delete / update → section or item → subsequent prompts**. No interpreting full sentences while `idle`.
- **Other list types**: Unchanged (still use `parseAddItem` / `parseDeleteItem` / `parseUpdateItem` in the `else` and shared branches as today).

## Implementation (single file focus: `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)`/lists/[id].tsx))

1. **Delete the checklist idle parser block** — Remove the entire `if (isChecklistList) { const addSec = parseAddSectionCommand... through parseChecklistUpdateItemBareIntent }` block (currently ~1755–2058). Keep the following `} else { parseAddItem... }` for **non-checklist** only (structure stays: `if (isChecklistList) { /* nothing here for idle */ } else { ... }` or flatten to `if (!isChecklistList) { parseAddItem... }`).
2. **Gate shared delete/update parsers for checklist when idle** — For `parseDeleteItem` and `parseUpdateItem`:
  - If `isChecklistList && checklistVoicePhase === 'idle'`, **do not** run the checklist-specific delete/update-by-name flows; let the transcript fall through to the new idle message (step 4). If phase is non-idle (e.g. user is in `delete_section_or_item` and the utterance accidentally matches `parseDeleteItem`, be careful: typically phased flows use different wording; if needed, only skip when `idle`).
3. **Replace checklist fallback copy** — Change the final `if (isChecklistList) speak('Try: add item...')` to a **short** line such as *“Tap the mic and say add, delete, or update.”* (no command laundry list).
4. **Remove obsolete phases and handlers** — `delete_choose_kind` and `update_choose_kind` are **only** entered from bare `delete` / `update` idle intents (~1929, ~2030). After removing those parsers:
  - Remove the two `if (checklistVoicePhase === 'delete_choose_kind')` / `update_choose_kind` handler blocks (~911+).
  - Drop those literals from the `checklistVoicePhase` union type.
5. **Stop the mic when checklist voice is done** — Call `**stop()`** inside `[clearChecklistVoice](mobile/app/(tabs)`/lists/[id].tsx) (or immediately after every path that calls it and returns to idle) so continuous recognition does not keep running and picking up noise while `idle`. **Avoid double-stop** on paths that already call `stop()` before `clearChecklistVoice` (e.g. cancel): either remove redundant `stop()` or make `clearChecklistVoice` idempotent-safe (calling `stop()` twice should be OK per hook).
6. **Imports cleanup** — Remove from `[[id].tsx](mobile/app/(tabs)`/lists/[id].tsx) any `voiceCommands` imports that become unused (likely: `parseAddSectionCommand`, `parseDeleteSectionCommand`, `parseUpdateSectionCommand`, bare checklist intents, `parseChecklistDeleteFollowupChoice`, `parseChecklistUpdateFollowupChoice`, and possibly others only referenced by the deleted block). Re-run TypeScript / linter on the file.
7. **Help UI** — Update the checklist Voice commands `AlertModal` and info-button tooltip to **only** describe the guided flow (no “full phrases when idle” or delete-item essay). Aligns with your earlier simplify-help intent.

## Optional / follow-up (not required for correctness)

- Dead exports in `[mobile/utils/voiceCommands.ts](mobile/utils/voiceCommands.ts)` that are **only** used by the removed block could stay (harmless) or be removed in a later cleanup pass if nothing else imports them.

## Risk / product note

Power users lose **one-shot** checklist commands (e.g. “delete section Kitchen”, “update batteries to AAs” without tapping through the wizard). That is intentional per your request.