---
name: Parse ingredient names from recipe strings
overview: Enhance the ingredient parsing function to extract clean ingredient names (e.g., "linguine" from "3/4 pound linguine") when adding recipe ingredients to grocery lists.
todos:
  - id: create-parser
    content: Create _parse_ingredient_name() helper function with regex patterns for quantities, units, and ingredient names
    status: pending
  - id: update-extract-function
    content: Update extract_ingredients_for_shopping_list() to use the new parser function
    status: pending
    dependencies:
      - create-parser
---

# Parse Ingredient Names from Recipe Strings

## Problem

Currently, when adding recipe ingredients to grocery lists, the full ingredient text (e.g., "3/4 pound linguine") is added. The user wants only the ingredient name (e.g., "linguine") to be extracted.

## Solution

Enhance the `extract_ingredients_for_shopping_list` function in [backend/meals/importers.py](backend/meals/importers.py) to intelligently parse ingredient strings and extract just the ingredient name.

## Implementation

### 1. Create ingredient parser function

Add a new helper function `_parse_ingredient_name()` that:

- Uses regex to match common patterns:
- **Quantities**: Whole numbers, fractions (3/4, 1/2, etc.), decimals, mixed numbers (1 1/2)
- **Units**: Common cooking units (cup, cups, tablespoon, teaspoon, pound, ounce, gram, etc.)
- **Ingredient name**: Everything remaining after quantity and unit
- Handles edge cases:
- Ingredients without quantities/units (just return the string)
- Ingredients with multiple words in the name
- Special characters and punctuation

### 2. Update extract_ingredients_for_shopping_list

Modify the function to:

- Call `_parse_ingredient_name()` for each ingredient string
- Use the parsed ingredient name as the `name` field
- Optionally preserve quantity/unit in a separate field if needed (or discard it as requested)

### 3. Testing considerations

The parser should handle examples like:

- "3/4 pound linguine" → "linguine"
- "2 cups all-purpose flour" → "all-purpose flour" or "flour"
- "1 tablespoon olive oil" → "olive oil"
- "1/2 teaspoon salt" → "salt"
- "salt" (no quantity/unit) → "salt"

## Files to Modify

- [backend/meals/importers.py](backend/meals/importers.py) - Update `extract_ingredients_for_shopping_list` and add `_parse_ingredient_name` helper function