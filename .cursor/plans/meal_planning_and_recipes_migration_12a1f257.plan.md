---
name: Meal Planning and Recipes Migration
overview: Replicate all meal planning and recipes functionality from the reference project into the mobile app, including backend API endpoints, models, serializers, and frontend React Native screens.
todos:
  - id: backend-models
    content: ""
    status: completed
  - id: backend-importers
    content: Create recipe import module backend/meals/importers.py with URL scraping, Schema.org parsing, and ingredient extraction
    status: completed
    dependencies:
      - backend-models
  - id: backend-serializers
    content: Create RecipeSerializer and MealPlanSerializer in backend/api/serializers.py with JSON field handling
    status: completed
    dependencies:
      - backend-models
  - id: backend-views
    content: Create RecipeViewSet, MealPlanViewSet, RecipeImportView, and recipe_add_to_list function in backend/api/views.py
    status: completed
    dependencies:
      - backend-serializers
      - backend-importers
  - id: backend-urls
    content: Register recipe and meal-plan endpoints in backend/api/urls.py
    status: completed
    dependencies:
      - backend-views
  - id: backend-migrations
    content: Create and run Django migrations for meals app (ensure you're in backend/ directory with virtual environment activated)
    status: completed
    dependencies:
      - backend-models
  - id: frontend-service
    content: Create mealsService.ts API service layer in mobile/services/ with all CRUD operations
    status: completed
  - id: frontend-navigation-setup
    content: "Update home screen navigation to route to meals screen and register meals screen in tabs layout with href: null"
    status: pending
  - id: frontend-main-screen
    content: Create main meals screen mobile/app/(tabs)/meals.tsx with internal tab navigation (Recipes, Meal Planning, Grocery Lists)
    status: completed
    dependencies:
      - frontend-service
      - frontend-navigation-setup
  - id: frontend-recipes-tab
    content: Create RecipesTab component with recipe list, search, recipe cards, and recipe detail modal
    status: completed
    dependencies:
      - frontend-main-screen
  - id: frontend-recipe-forms
    content: Create RecipeForm and ImportRecipeForm components for creating and importing recipes
    status: completed
    dependencies:
      - frontend-recipes-tab
  - id: frontend-meal-planning
    content: Create MealPlanningTab component with week view, meal grid, add meal functionality, and week navigation
    status: completed
    dependencies:
      - frontend-main-screen
  - id: frontend-shopping-integration
    content: ""
    status: completed
    dependencies:
      - frontend-recipes-tab
---

# Meal Planning and Recipes Migration Plan

## Overview

This plan replicates all meal planning and recipes functionality from the reference project (`KewlKidsOrganizer`) into the mobile app (`KewlKidsOrganizerMobile`). The implementation includes backend Django models, API endpoints, serializers, and frontend React Native screens.

## Reference Project Location

- **Backend**: `C:\Users\steve_80f2z1j\OneDrive\Documents\Development\Projects\Cursor Projects\KewlKidsOrganizer\backend\meals\`
- **Frontend**: `C:\Users\steve_80f2z1j\OneDrive\Documents\Development\Projects\Cursor Projects\KewlKidsOrganizer\frontend\react\src\components\Meals.jsx`
- **API Views**: `C:\Users\steve_80f2z1j\OneDrive\Documents\Development\Projects\Cursor Projects\KewlKidsOrganizer\backend\api\views.py` (RecipeViewSet, MealPlanViewSet, RecipeImportView, recipe_add_to_list)

## Backend Implementation

### 1. Django Models (`backend/meals/models.py`)

- **Recipe Model**: 
- Encrypted fields: `title`, `notes`, `ingredients` (JSON), `instructions` (JSON), `image_url`, `source_url`
- Public fields: `servings`, `prep_time_minutes`, `cook_time_minutes`
- Relationships: `family` (ForeignKey), `created_by` (Member)
- Properties: `ingredients` (list getter/setter), `instructions` (list getter/setter)

- **MealPlan Model**:
- Encrypted fields: `notes`, `meals` (JSON dictionary)
- Public fields: `week_start_date` (DateField)
- Relationships: `family` (ForeignKey), `created_by` (Member)
- Properties: `meals` (dict getter/setter)
- Unique constraint: `family` + `week_start_date`

### 2. Recipe Import Module (`backend/meals/importers.py`)

- **`import_recipe_from_url(url)`**: Main import function
- Uses `recipe-scrapers` library as primary method
- Falls back to BeautifulSoup + Schema.org parsing
- Extracts: title, ingredients, instructions, servings, prep_time, cook_time, image_url
- Handles multiple extraction methods for title and image
- URL-based title extraction as fallback

- **`extract_ingredients_for_shopping_list(recipe_data)`**: 
- Parses ingredient strings to extract ingredient names
- Removes quantities and units
- Returns list of dicts with `name` and optional `quantity`

- Helper functions:
- `_parse_time()`, `_parse_servings()`, `_parse_iso_duration()`
- `_extract_title_from_soup()`, `_extract_image_from_soup()`, `_extract_title_from_url()`
- `_parse_ingredient_name()` - sophisticated ingredient parsing
- `_parse_recipe_manually()`, `_parse_html_fallback()`

### 3. API Views (`backend/api/views.py`)

- **RecipeViewSet** (ModelViewSet):
- `get_queryset()`: Filter by family membership
- `perform_create()`: Set `created_by` member
- `perform_destroy()`: Permission check for family members
- `@action import_from_url()`: Import recipe from URL (POST /recipes/import_from_url/)
- `@action add_to_list()`: Add recipe ingredients to shopping list (POST /recipes/{id}/add-to-list/)
 - Extracts ingredients using `extract_ingredients_for_shopping_list()`
 - Creates ListItems with notes: `"From recipe: {recipe.title}"`
 - Returns response with added items, skipped items, categorized items, uncategorized items

- **MealPlanViewSet** (ModelViewSet):
- `get_queryset()`: Filter by family membership
- `perform_create()`: Set `created_by` member

- **RecipeImportView** (APIView):
- POST `/recipes/import/`: Standalone import endpoint
- Validates URL format
- Validates recipe data (title, ingredients, instructions required)
- Returns detailed error messages with suggestions

- **recipe_add_to_list** (function view):
- POST `/recipes/{id}/add-to-list/`
- Handles ingredient extraction and categorization
- Integrates with grocery categories
- Returns detailed response with categorized/uncategorized items

### 4. Serializers (`backend/api/serializers.py`)

- **RecipeSerializer**:
- Fields: id, family, created_by, created_by_username, title, notes, ingredients (JSON), instructions (JSON), servings, prep_time_minutes, cook_time_minutes, image_url, source_url, created_at, updated_at
- Custom create/update to handle encrypted JSON fields

- **MealPlanSerializer**:
- Fields: id, family, created_by, created_by_username, notes, week_start_date, meals (JSON), created_at, updated_at
- Custom create/update to handle encrypted JSON field

### 5. URL Configuration

- Register viewsets in `backend/api/urls.py`:
- `router.register(r'recipes', RecipeViewSet, basename='recipe')`
- `router.register(r'meal-plans', MealPlanViewSet, basename='mealplan')`
- Add function views:
- `path('recipes/import/', RecipeImportView.as_view(), name='recipe-import')`
- `path('recipes/<int:pk>/add-to-list/', recipe_add_to_list, name='recipe-add-to-list')`

### 6. Database Migrations

**IMPORTANT**: When running migrations, ensure you are:

1. In the `backend/` directory (project root for Django)
2. Virtual environment is activated
3. Run commands:
   ```bash
   cd backend
   # Activate virtual environment (Windows)
   venv\Scripts\activate
   # Or (Mac/Linux)
   source venv/bin/activate
   
   # Create migrations
   python manage.py makemigrations meals
   
   # Apply migrations
   python manage.py migrate
   ```


## Frontend Implementation (React Native)

### 1. Navigation Setup

- **Home Page Integration**: The "Meal Planning & Recipes" card on the home page (`mobile/app/(tabs)/index.tsx`) should navigate to the meals screen
  - Update `handleCardPress()` function: `case 'meals': router.push('/(tabs)/meals');`

- **Tab Layout Registration**: Register meals screen in `mobile/app/(tabs)/_layout.tsx` with `href: null` to hide from bottom tab bar (accessible only via home card)
  ```typescript
  <Tabs.Screen
    name="meals"
    options={{
      href: null, // Hide from tab bar - accessible via Home card
    }}
  />
  ```


### 2. Main Meals Screen (`mobile/app/(tabs)/meals.tsx`)

- Internal tab navigation: Recipes, Meal Planning, Grocery Lists (using React Native tabs or segmented control)
- State management: recipes, mealPlans, loading, error
- Voice commands support (create recipe, import recipe, add to list)
- Family selection requirement
- Back navigation to home page

### 2. Recipes Tab Component

- **Recipe List View**:
- Grid layout with recipe cards
- Search functionality
- Recipe card shows: image, title, servings, prep/cook time, ingredient count
- "Add to grocery list" dropdown per card
- Delete button on each card
- Click card to view detail

- **Recipe Detail Modal**:
- Full recipe display: image, title, meta (servings, times), source URL link
- Ingredients list
- Instructions list (numbered)
- "Add to grocery list" dropdown
- Delete button
- Notes section (if available)

- **Recipe Form Modal**:
- Create/Edit recipe
- Fields: title*, servings, prep_time, cook_time, ingredients* (dynamic list), instructions* (dynamic list), notes, image_url, source_url
- Add/remove ingredient/instruction rows
- Validation

- **Import Recipe Form**:
- URL input
- Loading state
- Error handling with detailed messages

### 3. Meal Planning Tab Component

- **Week View**:
- Week navigation (previous/next week)
- Grid layout: Days (Sun-Sat) × Meal Types (Breakfast, Lunch, Dinner)
- Each cell shows meals for that day/type
- "+" button to add meal
- Inline add form with toggle: Recipe mode / Free-form meal mode
- Delete button on each meal item

- **Add Meal Functionality**:
- Recipe mode: Select from recipes dropdown (auto-submit on select)
- Free-form mode: Text input for meal name
- Creates/updates MealPlan for the week
- Meals structure: `{day: {mealType: [recipe_ids or strings]}}`

- **Meal Display**:
- Recipe meals: Show recipe title, link to recipe
- Free-form meals: Show text as-is
- Visual distinction between recipe and free-form

### 4. Grocery Lists Tab Component

- Reuses existing ListDetail component
- Filters to show only grocery lists
- Integration with recipe "add to list" functionality

### 5. API Service (`mobile/services/mealsService.ts`)

- `fetchRecipes(familyId)`: GET /recipes/
- `fetchRecipe(id)`: GET /recipes/{id}/
- `createRecipe(data)`: POST /recipes/
- `updateRecipe(id, data)`: PATCH /recipes/{id}/
- `deleteRecipe(id)`: DELETE /recipes/{id}/
- `importRecipe(url, familyId)`: POST /recipes/import/
- `addRecipeToList(recipeId, listId)`: POST /recipes/{id}/add-to-list/
- `fetchMealPlans(familyId)`: GET /meal-plans/
- `fetchMealPlan(id)`: GET /meal-plans/{id}/
- `createMealPlan(data)`: POST /meal-plans/
- `updateMealPlan(id, data)`: PATCH /meal-plans/{id}/
- `deleteMealPlan(id)`: DELETE /meal-plans/{id}/

### 6. Components

- `mobile/components/meals/RecipeCard.tsx`: Recipe card component
- `mobile/components/meals/RecipeDetail.tsx`: Recipe detail modal
- `mobile/components/meals/RecipeForm.tsx`: Create/edit recipe form
- `mobile/components/meals/ImportRecipeForm.tsx`: Import recipe form
- `mobile/components/meals/MealPlanningGrid.tsx`: Week meal planning grid
- `mobile/components/meals/MealSlot.tsx`: Individual meal slot component

## Key Features to Implement

1. **Recipe Management**:

- Create, read, update, delete recipes
- Recipe import from URL (with comprehensive parsing)
- Recipe search/filter
- Recipe images (from URL)
- Source URL tracking

2. **Meal Planning**:

- Weekly meal plan view
- Add recipes to specific days/meals
- Add free-form meals (text)
- Delete meals
- Week navigation
- Auto-create meal plan for week if doesn't exist

3. **Shopping List Integration**:

- Add recipe ingredients to grocery lists
- Automatic ingredient name parsing (remove quantities/units)
- Categorization with grocery categories
- Track which recipes are already in lists
- Show "In {list name}" status on recipe cards

4. **Voice Commands** (if voice support exists):

- "Create recipe {name}"
- "Import recipe {url}"
- "Add {recipe name} to list"

## Dependencies

### Backend

- `recipe-scrapers>=14.0.0` (already in requirements.txt)
- `beautifulsoup4>=4.12.0` (already in requirements.txt)
- `requests>=2.31.0` (already in requirements.txt)

### Frontend

- React Native components (View, Text, TextInput, ScrollView, FlatList, etc.)
- Image component for recipe images
- Modal/Sheet components for forms
- Date handling for meal planning

## Testing Considerations

1. Test recipe import from various recipe sites
2. Test ingredient parsing with different formats
3. Test meal plan week navigation and date handling
4. Test shopping list integration
5. Test encrypted field handling
6. Test family permission checks

## Migration Notes

- Convert HTML/CSS to React Native StyleSheet
- Replace `<div>` with `<View>`, `<input>` with `<TextInput>`, etc.
- Replace CSS classes with StyleSheet styles
- Use React Native navigation (Expo Router) instead of React Router
- Use React Native Image component for recipe images
- Handle date formatting for mobile (use date-fns or similar)
- Implement proper error handling and loading states
- Ensure encrypted fields are properly handled in API calls

## Navigation Architecture

- **Access Pattern**: Meals feature is accessed from the home page card, NOT from bottom tab navigation
- **Home Screen**: `mobile/app/(tabs)/index.tsx` has a "Meal Planning & Recipes" card that navigates to `/(tabs)/meals`
- **Meals Screen**: `mobile/app/(tabs)/meals.tsx` is registered in the tabs layout but hidden from bottom nav (`href: null`)
- **Internal Navigation**: The meals screen uses internal tab/segmented control for switching between Recipes, Meal Planning, and Grocery Lists views
- **Back Navigation**: Users can navigate back to home using the back button or header navigation