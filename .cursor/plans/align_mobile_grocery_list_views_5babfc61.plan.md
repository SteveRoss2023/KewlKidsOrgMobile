---
name: Align Mobile Grocery List Views
overview: Make the grocery list mobile view in meal planning and recipes match the mobile view from the lists page, and ensure consistent checkbox sizing across all views.
todos: []
---

# Align Mobile Grocery List Views

## Problem

1. The grocery list mobile view on the lists page (ListDetail component) looks perfect
2. The grocery list view in meal planning and recipes (ListsTab component) looks different on mobile
3. Checkbox sizes are inconsistent across views

## Root Cause

- `ListsTab` uses different CSS classes (`list-tab-item` vs `list-item`) and has a different HTML structure
- `list-tab-item-content` uses `flex-direction: column` which creates a different mobile layout
- Mobile-specific styles in `Meals.css` don't match the mobile styles that make `ListDetail` look good
- The checkbox structure differs between the two components

## Solution

### 1. Update ListsTab HTML Structure

Update [`frontend/react/src/components/Meals.jsx`](frontend/react/src/components/Meals.jsx) to match the structure used in `ListDetail.jsx`:

- Move checkbox and item name to be siblings (not nested in item-content div)
- Restructure `list-tab-item-content` to match `item-content` structure from ListDetail
- Ensure the layout matches ListDetail's mobile-friendly structure

### 2. Update CSS for Mobile Consistency

Update [`frontend/react/src/components/Meals.css`](frontend/react/src/components/Meals.css):

- Add mobile-specific styles for `list-tab-item` to match `list-item` mobile behavior
- Ensure `list-tab-item-content` matches `item-content` layout on mobile
- Standardize checkbox sizing (ensure `width: 20px; height: 20px;` is consistently applied)
- Add mobile media query rules to make `list-tab-item` layout match `list-item` on mobile

### 3. Fix Checkbox Sizing

- Ensure all checkbox inputs have consistent sizing: `width: 20px; height: 20px;`
- Add explicit sizing rules if needed to override any browser defaults
- Check for any conflicting styles that might cause size variations

## Files to Modify

1. `frontend/react/src/components/Meals.jsx` - Update ListsTab item rendering structure
2. `frontend/react/src/components/Meals.css` - Add mobile styles to match Lists.css mobile behavior

## Expected Outcome

- ListsTab grocery list view on mobile will match ListDetail mobile view exactly
- All checkboxes will be consistently sized (20px x 20px)
- Mobile layout will be consistent across both views