---
name: Grocery Lists Grid Layout
overview: Update the Grocery Lists page so cards display in a grid layout on larger screens (not stacked), take up the full page width, while keeping the mobile stacked layout unchanged.
todos:
  - id: update-layout-large-screens
    content: Update .lists-tab-layout to use full width on larger screens instead of sidebar/main split
    status: completed
  - id: update-sidebar-grid
    content: Change .lists-tab-sidebar to use CSS grid layout on larger screens instead of flex column
    status: completed
  - id: preserve-mobile
    content: Verify mobile styles remain unchanged in existing media query
    status: completed
---

# Grocery Lists Grid Layout Update

## Current State

- The Grocery Lists page uses a sidebar layout (`grid-template-columns: 300px 1fr`) with cards stacked vertically in a flex column
- Cards are displayed in `.lists-tab-sidebar` with `flex-direction: column`
- Mobile view (max-width: 768px) already uses a column layout

## Changes Required

### 1. Update `.lists-tab-layout` for larger screens

**File:** `frontend/react/src/components/Meals.css`

- Change from `grid-template-columns: 300px 1fr` to a single column layout on larger screens
- This removes the sidebar/main area split so cards can take up the full page width

### 2. Update `.lists-tab-sidebar` for larger screens  

**File:** `frontend/react/src/components/Meals.css`

- Change from `flex-direction: column` to a CSS grid layout on larger screens
- Use `display: grid` with responsive columns (e.g., `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`)
- This allows cards to flow horizontally instead of stacking vertically

### 3. Preserve mobile layout

**File:** `frontend/react/src/components/Meals.css`

- Keep existing `@media (max-width: 768px)` styles unchanged
- Ensure mobile view continues to stack cards vertically

## Implementation Details

The changes will be made in `frontend/react/src/components/Meals.css`:

- Modify `.lists-tab-layout` (around line 1138) to use full width on larger screens
- Modify `.lists-tab-sidebar` (around line 1144) to use grid layout on larger screens
- Add a media query for larger screens (min-width: 769px) to apply the grid layout
- Ensure mobile styles remain in the existing `@media (max-width: 768px)` block