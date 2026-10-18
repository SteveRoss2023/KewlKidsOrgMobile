---
name: Auto-generate expenses on recurring expense creation
overview: Modify the recurring expense creation flow to automatically generate expenses from start_date to end of current year (or end_date if provided) when a new recurring expense is created. Keep the manual "Generate Expenses" button for existing recurring expenses.
todos:
  - id: extract_helper
    content: Extract expense generation logic into reusable helper function `_generate_expenses_for_recurring()` in RecurringExpenseViewSet
    status: completed
  - id: auto_generate_create
    content: Modify `perform_create()` to automatically call the helper function after creating recurring expense
    status: completed
    dependencies:
      - extract_helper
  - id: update_manual_generate
    content: Update `generate_expenses()` action to use the new helper function
    status: completed
    dependencies:
      - extract_helper
  - id: test_auto_generation
    content: Test auto-generation on create with various scenarios (no end_date, with end_date, future start_date)
    status: completed
    dependencies:
      - auto_generate_create
      - update_manual_generate
---

