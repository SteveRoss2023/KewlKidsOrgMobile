---
name: Paste recipe text
overview: Add a Paste button beside Import/Create that accepts title plus pasted ingredients and instructions, parses them into recipe line arrays (normalizing quantities where possible), then opens the existing Create form prefilled so you can review and save.
todos:
  - id: parse-api
    content: Add parse_recipe_from_text + POST /recipes/parse-text/ endpoint
    status: pending
  - id: paste-form
    content: Build PasteRecipeForm modal (title + two text areas)
    status: pending
  - id: wire-ui
    content: Add Paste button, mealsService.parseRecipeText, RecipeForm initialDraft
    status: pending
  - id: verify
    content: Smoke-check paste → prefill → create with sample messy text
    status: pending
isProject: false
---

# Paste recipe from text

## Goal
When you do not have a recipe URL, paste ingredients and instructions as text. The app splits them into proper recipe lines (and normalizes quantity/unit on ingredients where it can), then lets you review and save through the normal create flow.

## How it fits today
- Recipes store `ingredients` and `instructions` as `string[]` (e.g. `"2 cups flour"`, `"Bring water to a boil."`) — not separate qty/unit fields.
- Qty/unit decoding already exists for shopping lists in [`backend/meals/importers.py`](backend/meals/importers.py) (`_parse_ingredient_quantity_and_unit`).
- UI entry: Import (URL) and Create on [`RecipesTab.tsx`](mobile/components/meals/RecipesTab.tsx).

```mermaid
flowchart LR
  PasteBtn[Paste button] --> Modal[PasteRecipeForm]
  Modal --> API["POST /recipes/parse-text/"]
  API --> Prefill[Open RecipeForm prefilled]
  Prefill --> Save["POST /recipes/ create"]
```

## UX
1. Add a **Paste** button next to Import / Create on the recipes header.
2. New modal [`PasteRecipeForm.tsx`](mobile/components/meals/PasteRecipeForm.tsx):
   - Title (required)
   - Ingredients multiline paste
   - Instructions multiline paste
   - Short hint: one ingredient/step per line, or numbered/bulleted lists OK
3. On submit: call parse API → close modal → open existing [`RecipeForm`](mobile/components/meals/RecipeForm.tsx) in create mode with parsed arrays prefilled (title + ingredients + instructions). User can fix rows, then Save as usual.

## Parsing (server)
New endpoint `POST /api/recipes/parse-text/` (auth required), body `{ title, ingredients_text, instructions_text }`, returns `{ title, ingredients: string[], instructions: string[] }`.

Implement in [`backend/meals/importers.py`](backend/meals/importers.py) (e.g. `parse_recipe_from_text`) and wire from [`backend/api/views.py`](backend/api/views.py) + [`backend/api/urls.py`](backend/api/urls.py):

**Ingredients**
- Split on newlines; drop blanks and section headers like `Ingredients:`
- Strip leading bullets/numbers (`-`, `•`, `1.`, `1)`)
- Normalize unicode fractions via existing helpers
- Run `_parse_ingredient_quantity_and_unit`; if qty found, store as `"{qty} {name}"` (clean line); otherwise keep cleaned line

**Instructions**
- Split on newlines; also split runs of `1. / 2. / Step N` style prefixes when pasted as one blob
- Strip step number prefixes; drop blanks and headers like `Instructions:` / `Directions:`

Do not auto-create the recipe on paste — prefill Create so bad paste can be fixed.

## Mobile wiring
- [`mealsService.ts`](mobile/services/mealsService.ts): `parseRecipeText({ title, ingredients_text, instructions_text })`
- [`RecipesTab.tsx`](mobile/components/meals/RecipesTab.tsx): Paste button + state to open `PasteRecipeForm`; on parse success set draft props and open `RecipeForm`
- [`RecipeForm.tsx`](mobile/components/meals/RecipeForm.tsx): accept optional `initialDraft` (`title`, `ingredients`, `instructions`) for create mode when opened from paste

## Out of scope
- Changing stored recipe shape to structured qty objects
- LLM parsing
- Changing URL Import behavior