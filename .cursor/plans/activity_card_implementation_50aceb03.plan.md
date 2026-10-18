---
name: Activity Card Implementation
overview: Replicate the Activity/Today card functionality from the reference web project, including Today/Week tabs, Events, To-Dos, and Meals sections with voice summary support.
todos:
  - id: update-today-screen
    content: Replace placeholder in mobile/app/(tabs)/today.tsx with full Activity/Today implementation including tabs, events, todos, and meals sections
    status: completed
  - id: verify-list-service
    content: Verify and update mobile/services/listService.ts to support getting todo lists and list items with pagination
    status: completed
  - id: verify-meals-service
    content: Verify and update mobile/services/mealsService.ts to support getting meal plans and accessing meal structure
    status: completed
  - id: add-helper-functions
    content: Add date helper functions (isToday, isOverdue, isInCurrentWeek, formatTime, formatDate, getWeekStart/End) to today.tsx
    status: completed
    dependencies:
      - update-today-screen
  - id: implement-data-fetching
    content: Implement fetchEvents, fetchTodos, fetchRecipes, and fetchMeals functions with proper filtering based on activeTab
    status: completed
    dependencies:
      - update-today-screen
      - verify-list-service
      - verify-meals-service
  - id: implement-ui-sections
    content: Create UI sections for Events, To Do's, and Meals with proper styling, empty states, and card components
    status: completed
    dependencies:
      - update-today-screen
      - add-helper-functions
  - id: add-voice-summary
    content: Implement voice summary generation (generateTodaySummary, generateWeekSummary) and integrate with VoiceButton component
    status: completed
    dependencies:
      - update-today-screen
      - implement-data-fetching
  - id: add-navigation
    content: Add navigation handlers for events (to calendar), todos (to list detail), and meals (to meals screen)
    status: completed
    dependencies:
      - implement-ui-sections
---

# Activit

y Card Implementation Plan

## Overview

Replicate the Activity/Today screen functionality from the reference web project (`KewlKidsOrganizer/frontend/react/src/components/Today.jsx`). The screen displays a comprehensive summary of today's or this week's activities including events, to-dos, and meals.

## Reference Implementation Analysis

The reference `Today.jsx` component includes:

- **Two tabs**: "Today" and "Week" views
- **Three main sections**:

1. **Events**: Calendar events filtered by date (today or this week)
2. **To Do's**: Incomplete todo items from todo-type lists, filtered by due date
3. **Meals**: Planned meals from meal plans, organized by day and meal type

- **Voice summary button**: Generates and speaks a summary of all activities
- **Date filtering**: Filters events and todos based on active tab (today vs week)
- **Overdue highlighting**: Shows overdue todos with special styling

## Backend APIs (Already Available)

All required backend APIs are already implemented:

- **Events**: `EventViewSet` at `/api/events/` - supports family filtering
- **Lists**: `ListViewSet` at `/api/lists/` - supports family and list_type filtering
- **List Items**: `ListItemViewSet` at `/api/list-items/` - supports list filtering
- **Meal Plans**: `MealPlanViewSet` at `/api/meal-plans/` - supports family filtering
- **Recipes**: `RecipeViewSet` at `/api/recipes/` - supports family filtering

## Mobile Services (Already Available)

- **CalendarService**: `mobile/services/calendarService.ts` - has `getEvents(familyId)`
- **ListService**: `mobile/services/listService.ts` - needs verification for todo filtering
- **MealsService**: `mobile/services/mealsService.ts` - needs verification for meal plan access

## Implementation Tasks

### 1. Update Today Screen Component (`mobile/app/(tabs)/today.tsx`)

**Replace the placeholder with full implementation:**

- Add state management:
- `activeTab`: 'today' | 'week'
- `events`: Event[]
- `todos`: TodoItem[]
- `meals`: { [dayName: string]: { [mealType: string]: string[] } }
- `recipes`: Recipe[]
- `loading`: boolean
- `error`: string
- Add helper functions:
- `isToday(date)`: Check if date is today
- `isOverdue(date)`: Check if date is overdue
- `isInCurrentWeek(date)`: Check if date is in current week
- `getWeekStart()` / `getWeekEnd()`: Calculate week boundaries
- `formatTime(dateString)`: Format time display
- `formatDate(dateString)`: Format date display
- `getTodayDayName()`: Get current day name
- Add data fetching functions:
- `fetchEvents()`: Load events from CalendarService, filter by activeTab
- `fetchTodos()`: Load todo lists, get items, filter by due date
- `fetchRecipes()`: Load recipes for recipe name lookup
- `fetchMeals()`: Load meal plans, filter by week, extract meals by day
- Add UI sections:
- Tab switcher (Today/Week)
- Events section with event cards (time, title, location, notes, color-coded)
- To Do's section with todo items (name, list name, due date, overdue highlighting)
- Meals section (Breakfast, Lunch, Dinner) for today or week view
- Voice summary button (reuse VoiceButton component)
- Add voice summary generation:
- `generateTodaySummary()`: Create text summary for today
- `generateWeekSummary()`: Create text summary for week
- Use existing `speak()` utility from `mobile/utils/voiceFeedback.ts`

### 2. Verify/Update List Service (`mobile/services/listService.ts`)

**Ensure the service supports:**

- Getting lists filtered by `list_type='todo'`
- Getting list items for a specific list
- Handling pagination for list items

**If missing, add:**

- `getTodoLists(familyId)`: Get all todo-type lists
- `getListItems(listId)`: Get items for a list (with pagination support)

### 3. Verify/Update Meals Service (`mobile/services/mealsService.ts`)

**Ensure the service supports:**

- Getting meal plans filtered by family
- Accessing meal plan structure (week_start_date, meals object)

**If missing, add:**

- `getMealPlans(familyId)`: Get meal plans for family
- Type definitions for MealPlan structure

### 4. Create Event Card Component (Optional)

**Create `mobile/components/activity/EventCard.tsx`:**

- Reusable event card component
- Displays: time, title, location, notes
- Color-coded left border
- Touchable to navigate to event details (or open calendar)

### 5. Create Todo Card Component (Optional)

**Create `mobile/components/activity/TodoCard.tsx`:**

- Reusable todo item card
- Displays: name, list name, due date
- Overdue styling (red border/text)
- Touchable to navigate to list detail

### 6. Create Meal Card Component (Optional)

**Create `mobile/components/activity/MealCard.tsx`:**

- Reusable meal display component
- Shows meal type (Breakfast/Lunch/Dinner)
- Lists recipe names
- Organized by day for week view

### 7. Add Navigation Integration

**Update event/todo/meal card handlers:**

- Events: Navigate to calendar screen with event selected, or open event detail modal
- Todos: Navigate to list detail screen (`/(tabs)/lists/[id]`) with todo item highlighted
- Meals: Navigate to meals screen or show recipe detail

### 8. Styling and Theming

**Apply consistent styling:**

- Use theme colors from `ThemeContext`
- Match existing card styles from Lists and Calendar screens
- Ensure proper spacing and typography
- Support dark mode

## File Changes

### New Files

- `mobile/components/activity/EventCard.tsx` (optional, for reusability)
- `mobile/components/activity/TodoCard.tsx` (optional, for reusability)
- `mobile/components/activity/MealCard.tsx` (optional, for reusability)

### Modified Files

- `mobile/app/(tabs)/today.tsx` - Complete rewrite with full functionality
- `mobile/services/listService.ts` - Add todo-specific methods if missing
- `mobile/services/mealsService.ts` - Add meal plan methods if missing

## Testing Checklist

- [ ] Today tab shows today's events, todos, and meals
- [ ] Week tab shows week's events, todos, and meals
- [ ] Events are sorted by time
- [ ] Overdue todos are highlighted
- [ ] Meals display correctly for today and week
- [ ] Voice summary generates and speaks correctly
- [ ] Pull-to-refresh works
- [ ] Navigation to calendar/lists/meals works
- [ ] Empty states display correctly
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Dark mode styling works

## Dependencies

All required dependencies are already installed:

- `react-native` components (View, Text, ScrollView, TouchableOpacity, etc.)
- `expo-router` for navigation
- `CalendarService` for events
- `ListService` for todos
- `MealsService` for meals
- `useTheme` and `useFamily` hooks