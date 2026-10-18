---
name: Add Keywords Management to Categories
overview: Add keyword storage and management to grocery categories, allowing users to view and edit keywords for both default and custom categories. Keywords will be stored in the database and used for automatic item categorization.
todos:
  - id: add_keywords_field
    content: Add keywords JSONField to GroceryCategory model in backend/lists/models.py
    status: completed
  - id: create_schema_migration
    content: Create database migration to add keywords field to GroceryCategory
    status: completed
  - id: create_data_migration
    content: Create data migration to populate existing default categories with keywords from CATEGORY_KEYWORDS dictionary
    status: completed
  - id: update_default_categories
    content: Update ensure_default_categories() to populate keywords from CATEGORY_KEYWORDS dictionary for new categories
    status: completed
  - id: update_serializer
    content: Add keywords field to GroceryCategorySerializer
    status: completed
  - id: update_categorization_logic
    content: Modify suggest_category_for_item() to use keywords from database instead of hardcoded CATEGORY_KEYWORDS - this affects recipe ingredient addition
    status: completed
  - id: update_grocery_categories_ui
    content: Add keywords management UI to GroceryCategories.jsx component (create/edit form) and update help text
    status: completed
  - id: update_listdetail_ui
    content: Add keywords management UI to ListDetail.jsx category form
    status: completed
  - id: update_meals_ui
    content: Add keywords management UI to Meals.jsx category form
    status: completed
---

# Add Keywords Management to Categories

## Overview

Add keyword storage and editing capabilities to grocery categories. Keywords will be stored in the database for all categories (default and custom), allowing users to customize which keywords trigger automatic categorization for each category. Since users can edit keywords for all categories, the distinction between default and custom categories becomes less relevant - both are fully customizable.

## Impact Analysis

### Recipe Add Ingredients Functionality

**YES, this will impact recipe ingredient addition, but positively:**

- The `recipe_add_to_list` function in `backend/api/urls.py` (line 161) uses `assign_category_to_item()` which calls `suggest_category_for_item()`
- When we update `suggest_category_for_item()` to use database keywords instead of hardcoded `CATEGORY_KEYWORDS`, recipe ingredients will automatically use the new keyword system
- **No breaking changes** - the functionality continues to work the same way, just using customizable keywords from the database
- Users can now customize which keywords trigger categorization for recipe ingredients
- The categorization response data (categorized_items, uncategorized_items) will continue to work as expected

## Backend Changes

### 1. Database Model Update

**File: `backend/lists/models.py`**

- Add `keywords` field to `GroceryCategory` model as `JSONField` (stores array of keyword strings)
- Default to empty list `[]`

### 2. Database Migration

**File: `backend/lists/migrations/XXXX_add_keywords_to_grocery_category.py`** (new file)

- Create migration to add `keywords` JSONField to `GroceryCategory`
- Set default to empty list for existing categories

### 3. Data Migration for Existing Default Categories

**File: `backend/lists/migrations/XXXX_populate_default_category_keywords.py`** (new file)

- Create data migration to populate existing default categories with keywords from `CATEGORY_KEYWORDS` dictionary
- Match categories by name and populate their keywords array
- Only update categories where keywords field is empty/null
- This ensures all existing default categories get their initial keywords populated

### 4. Update Default Category Creation

**File: `backend/lists/utils.py`**

- Modify `ensure_default_categories()` to populate keywords from `CATEGORY_KEYWORDS` dictionary when creating NEW default categories
- Only populate if keywords field is empty (to avoid overwriting user edits)
- Use the same keyword mapping from `CATEGORY_KEYWORDS`

### 5. Update Serializer

**File: `backend/api/serializers.py`**

- Add `keywords` field to `GroceryCategorySerializer` fields list
- Ensure it's writable (not in read_only_fields)

### 6. Update Categorization Logic

**File: `backend/lists/utils.py`**

- Modify `suggest_category_for_item()` to:
- First check custom category name matching (existing logic - keep this)
- Then check keywords from database for ALL categories (replace hardcoded `CATEGORY_KEYWORDS` logic)
- Iterate through all family categories and check if any keyword from their keywords array matches the item name
- This change affects: manual item creation, recipe ingredient addition, and any other code using `assign_category_to_item()`
- Remove dependency on hardcoded `CATEGORY_KEYWORDS` dictionary for categorization (keep it only for initial population)

## Frontend Changes

### 7. Update GroceryCategories Component

**File: `frontend/react/src/components/GroceryCategories.jsx`**

- Add `keywords` to `categoryFormData` state (initialize as empty array `[]`)
- Update `handleEditCategory` to include keywords from category
- Update `handleCategorySubmit` to send keywords in API request
- Add keywords input field in the form:
- Display current keywords as removable tags/chips
- Add input field to add new keywords
- Allow removing individual keywords
- Show help text explaining keywords are used for automatic categorization
- Update help text to note that all categories (default and custom) can be edited

### 8. Update ListDetail Component

**File: `frontend/react/src/components/ListDetail.jsx`**

- Add `keywords` to `categoryFormData` state
- Update category form to include keywords management (similar to GroceryCategories)
- Update `handleCreateCategory` to send keywords

### 9. Update Meals Component

**File: `frontend/react/src/components/Meals.jsx`**

- Add `keywords` to `categoryFormData` state in ListsTab
- Update category form to include keywords management
- Update `handleCreateCategory` to send keywords

### 10. Add Keywords UI Component

**File: `frontend/react/src/components/GroceryCategories.jsx`** (and similar in other files)

- Create inline keywords editor:
- Display keywords as tags with remove buttons
- Text input to add new keywords
- Validate keywords (trim, lowercase, no duplicates)
- Show count of keywords
- Allow adding multiple keywords at once (comma-separated or one per line)

## Implementation Details

### Keywords Storage Format

- Store as JSON array: `["apple", "apples", "banana", "bananas"]`
- All keywords should be lowercase for matching
- Frontend should normalize input (trim, lowercase) before sending

### Data Migration Strategy

- The data migration will:

1. Import `CATEGORY_KEYWORDS` from `lists.utils`
2. For each category name in the dictionary, find matching default categories
3. Update those categories' keywords field with the array from the dictionary
4. Handle cases where category names might have slight variations

### Backward Compatibility

- Existing default categories will be populated with keywords via data migration
- New default categories will get keywords on creation
- Custom categories start with empty keywords array
- Categorization will still work (falls back to category name matching if no keywords)
- Recipe ingredient addition will continue to work, using the new keyword system

### UI/UX Considerations

- Keywords field should be clearly labeled
- Show example: "Keywords: apple, banana, milk"
- Help text: "Items containing these keywords will be automatically assigned to this category"
- Make it easy to add/remove keywords (tag-based UI preferred)
- Note that default categories can now be fully customized (remove the "cannot be edited" restriction in UI text)