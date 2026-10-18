---
name: Today View with Voice Summary
overview: Add a "Today" icon next to the logo in the navbar that navigates to a new Today page. The page displays all events, todos, and meals for today (with tabs for Today and Week views), and includes a voice button that speaks a summary of the day's activities.
todos:
  - id: add-today-icon
    content: Add Today icon button next to logo in navbar (App.jsx) that sets activeView to 'today'
    status: completed
  - id: create-today-component
    content: Create Today.jsx component with state management and data fetching hooks
    status: completed
  - id: fetch-today-events
    content: Fetch and filter calendar events for today from /events/ API
    status: completed
  - id: fetch-today-todos
    content: Fetch todo lists and filter items by due_date matching today
    status: completed
  - id: fetch-today-meals
    content: Fetch meal plans and extract meals for today's day name
    status: completed
  - id: create-voice-summary
    content: Create generateDaySummary() function that builds natural language summary text
    status: completed
  - id: add-voice-button
    content: Add voice button component that calls speak() with the summary
    status: completed
  - id: style-today-page
    content: Create Today.css with responsive layout, sections, and dark mode support
    status: completed
  - id: register-today-view
    content: Add Today component route handler in App.jsx main content area
    status: completed
  - id: test-integration
    content: "Test the complete flow: icon click → page load → data display → voice summary"
    status: completed
---

# Today View with Voice Summary

## Overview

Add a "Today" icon beside the logo in the navbar that navigates to a new Today page. The page will display:

- Calendar events for today
- Todo list items due today (from lists with `list_type='todo'`)
- Meals planned for today (from meal plans)
- A voice button that speaks a summary of all activities

## Implementation Steps

### 1. Add Today Icon to Navbar

**File: `frontend/react/src/App.jsx`**

- Add a button/icon next to the Logo component (around line 580-586)
- Use a calendar/clock icon (SVG) to represent "Today"
- On click, set `activeView` to `'today'`
- Style it consistently with other nav elements

### 2. Create Today Component

**File: `frontend/react/src/components/Today.jsx`** (new file)

- Component structure:
- Add tab state: `'today'` or `'week'` view
- Tab navigation UI (Today / Week tabs)
- Fetch events, todos, and meals based on selected tab
- **Today Tab**:
- Fetch today's events from `/events/` API (filter by `starts_at` for today)
- Fetch all lists with `list_type='todo'` from `/lists/` API
- Fetch all list items and filter by `due_date <= today` (includes overdue)
- Fetch meal plans and extract meals for today's day name
- **Week Tab**:
- Fetch week's events from `/events/` API (filter by `starts_at` within current week)
- Fetch all lists with `list_type='todo'` from `/lists/` API
- Fetch all list items and filter by `due_date` within current week
- Fetch meal plans and extract meals for all days in current week
- Display sections for: Events, Todos, Meals
- Add a voice button that speaks the summary (context-aware for selected tab)

### 3. Data Fetching Logic

- **Events**: 
- **Today View**: Filter events where `starts_at` date matches today (compare date components, ignore time)
- **Week View**: Filter events where `starts_at` date is within the current week (Sunday to Saturday)
- **Todos**: 
- Fetch all todo lists for selected family
- Fetch list items for each todo list
- **Today View**: Filter items where `due_date <= today` (includes today and overdue) and `completed=false`
- **Week View**: Filter items where `due_date` is within the current week (Sunday to Saturday) and `completed=false`
- **Meals**: 
- Fetch meal plans for selected family
- Find meal plan for current week (week_start_date calculation)
- **Today View**: Extract meals for today's day name (e.g., "Monday", "Tuesday") from `meals` object
- **Week View**: Extract meals for all days in the current week
- Structure: `meals[dayName][mealType]` contains array of recipe IDs or free-form strings

### 4. Voice Summary Implementation

- Create functions `generateTodaySummary()` and `generateWeekSummary()`:
- **Today Summary**:
- "Today you have X events: [list events with times]"
- "You have X todos: [list todo items, highlight overdue ones]"
- "For meals today: Breakfast: [items], Lunch: [items], Dinner: [items]"
- **Week Summary**:
- "This week you have X events: [list events by day]"
- "You have X todos this week: [list todo items by day]"
- "For meals this week: [list meals by day and meal type]"
- Use the existing `speak()` function from `../utils/voiceFeedback`
- Add a voice button component (similar to VoiceButton used elsewhere)
- Button should be prominent and accessible
- Summary should be context-aware based on selected tab

### 5. Styling

**File: `frontend/react/src/components/Today.css`** (new file)

- Create responsive layout with sections for each category
- Use consistent styling with existing components (dark mode support)
- Make voice button prominent and accessible
- Show empty states when no items exist

### 6. Register Today View in App.jsx

**File: `frontend/react/src/App.jsx`**

- Import Today component
- Add route handler: `{activeView === 'today' && <Today selectedFamily={selectedFamily} />}`
- Pass `selectedFamily` prop

### 7. Helper Functions

- Date comparison utility to check if event/date is today
- Function to get today's day name (e.g., "Monday")
- Function to format time for events
- Function to resolve recipe names from IDs (for meal display)

## Key Implementation Details

### Date Filtering

- Use `new Date()` to get today's date
- Compare date components (year, month, day) ignoring time
- For meal plans: Calculate week start (Sunday) and determine which day of week today is

### Meal Plan Structure

- Meal plans have `week_start_date` (DateField)
- `meals` is a JSON object: `{dayName: {mealType: [recipe_ids or strings]}}`
- Day names are: "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
- Meal types are: "Breakfast", "Lunch", "Dinner"

### Voice Summary Format

- **Today Summary**:
- Start with greeting: "Here's your summary for today"
- List events with times: "At [time], you have [event title]"
- List todos: "You have [X] todos: [item names]. [Highlight overdue: 'Note that [X] items are overdue']"
- List meals by type: "For breakfast, [items]. For lunch, [items]. For dinner, [items]"
- End with: "That's everything for today"
- **Week Summary**:
- Start with greeting: "Here's your summary for this week"
- List events by day: "On [day], at [time], you have [event title]"
- List todos by day: "On [day], you have [X] todos: [item names]"
- List meals by day: "On [day], for breakfast: [items], lunch: [items], dinner: [items]"
- End with: "That's everything for this week"

## Files to Create/Modify

1. `frontend/react/src/components/Today.jsx` - New component
2. `frontend/react/src/components/Today.css` - New stylesheet
3. `frontend/react/src/App.jsx` - Add icon and route
4. `frontend/react/src/App.css` - Style for today icon (if needed)