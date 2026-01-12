---
name: Expense Tracker Implementation
overview: Build a comprehensive expense tracker with encrypted data, categories, budgets, recurring expenses, payment methods, receipts, tags, and analytics. Follow existing patterns from lists and documents features.
todos:
  - id: backend-app
    content: Create backend/expenses app with models, serializers, views, urls, admin
    status: pending
  - id: backend-models
    content: "Implement all models: ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt"
    status: pending
    dependencies:
      - backend-app
  - id: backend-serializers
    content: Create serializers for all models with computed fields
    status: pending
    dependencies:
      - backend-models
  - id: backend-views
    content: Implement ViewSets with custom actions (stats, by_category, check_budgets, generate_expenses)
    status: pending
    dependencies:
      - backend-serializers
  - id: backend-urls
    content: Set up URL routing and register in main urls.py
    status: pending
    dependencies:
      - backend-views
  - id: backend-migrations
    content: Activate venv, create and run migrations (makemigrations and migrate), add default categories utility
    status: pending
    dependencies:
      - backend-models
  - id: frontend-types
    content: Create TypeScript types and interfaces in mobile/types/expenses.ts
    status: pending
  - id: frontend-service
    content: Implement expenseService.ts with all API methods
    status: pending
    dependencies:
      - frontend-types
      - backend-urls
  - id: frontend-components
    content: Create ExpenseForm, CategoryManager, BudgetCard, ExpenseCard, ReportsView components
    status: pending
    dependencies:
      - frontend-service
  - id: frontend-screen
    content: Build main expenses.tsx screen with tabs (Expenses, Categories, Budgets, Reports)
    status: pending
    dependencies:
      - frontend-components
  - id: frontend-navigation
    content: Update home screen navigation to route to expenses screen
    status: pending
    dependencies:
      - frontend-screen
  - id: frontend-reports
    content: Implement reports/analytics with charts and export functionality
    status: pending
    dependencies:
      - frontend-screen
---

# Expense Tracker Implementation

## Overview
Build a full-featured expense tracker with encrypted data storage, category management, budgets, recurring expenses, payment methods, receipt attachments, tags, and analytics/reporting.

## Architecture

### Backend Structure
- New Django app: `backend/expenses/`
- Models: ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt
- Follows existing patterns from `lists` and `documents` apps
- Uses encrypted fields for sensitive data (amounts, descriptions, notes)
- Family-scoped with Member tracking

### Frontend Structure
- New screen: `mobile/app/(tabs)/expenses.tsx`
- Service: `mobile/services/expenseService.ts`
- Types: `mobile/types/expenses.ts`
- Components: ExpenseCard, ExpenseForm, CategoryManager, BudgetCard, ReportsView

## Backend Implementation

### 1. Create Expenses App
- Create `backend/expenses/` directory
- Add `apps.py`, `models.py`, `serializers.py`, `views.py`, `urls.py`, `admin.py`
- Register app in `backend/config/settings.py` INSTALLED_APPS

### 2. Models (`backend/expenses/models.py`)

#### ExpenseCategory
- `family` (ForeignKey to Family)
- `name` (CharField, encrypted)
- `description` (TextField, encrypted, optional)
- `icon` (CharField, optional - FontAwesome icon name)
- `color` (CharField, hex color)
- `order` (IntegerField, default=0)
- `is_default` (BooleanField, default=False)
- `created_at`, `updated_at`

#### Expense
- `family` (ForeignKey to Family)
- `created_by` (ForeignKey to Member)
- `category` (ForeignKey to ExpenseCategory)
- `amount` (DecimalField, encrypted)
- `description` (CharField, encrypted)
- `notes` (TextField, encrypted, optional)
- `expense_date` (DateField)
- `payment_method` (CharField, choices: cash, credit_card, debit_card, bank_transfer, check, other)
- `tags` (ManyToMany to ExpenseTag)
- `receipt` (ForeignKey to Receipt, optional)
- `is_recurring` (BooleanField, default=False)
- `recurring_expense` (ForeignKey to RecurringExpense, optional)
- `created_at`, `updated_at`

#### ExpenseTag
- `family` (ForeignKey to Family)
- `name` (CharField, encrypted)
- `color` (CharField, hex color, optional)
- `created_at`, `updated_at`

#### Budget
- `family` (ForeignKey to Family)
- `category` (ForeignKey to ExpenseCategory)
- `amount` (DecimalField)
- `period` (CharField, choices: daily, weekly, monthly, yearly)
- `start_date` (DateField)
- `end_date` (DateField, optional)
- `alert_threshold` (IntegerField, default=80 - percentage)
- `is_active` (BooleanField, default=True)
- `created_at`, `updated_at`

#### RecurringExpense
- `family` (ForeignKey to Family)
- `created_by` (ForeignKey to Member)
- `category` (ForeignKey to ExpenseCategory)
- `amount` (DecimalField, encrypted)
- `description` (CharField, encrypted)
- `notes` (TextField, encrypted, optional)
- `frequency` (CharField, choices: daily, weekly, monthly, yearly)
- `start_date` (DateField)
- `end_date` (DateField, optional)
- `next_due_date` (DateField)
- `is_active` (BooleanField, default=True)
- `payment_method` (CharField)
- `tags` (ManyToMany to ExpenseTag)
- `created_at`, `updated_at`

#### Receipt
- `expense` (OneToOne to Expense, optional)
- `family` (ForeignKey to Family)
- `file` (FileField)
- `file_size` (BigIntegerField)
- `mime_type` (CharField)
- `uploaded_by` (ForeignKey to Member)
- `created_at`, `updated_at`

### 3. Serializers (`backend/expenses/serializers.py`)
- ExpenseCategorySerializer
- ExpenseSerializer (with computed fields: category_name, tag_names, receipt_url, created_by_username)
- ExpenseTagSerializer
- BudgetSerializer (with computed fields: spent_amount, remaining_amount, percentage_used)
- RecurringExpenseSerializer
- ReceiptSerializer

### 4. Views (`backend/expenses/views.py`)
- ExpenseCategoryViewSet (ModelViewSet)
  - Custom action: `reorder` for category ordering
- ExpenseViewSet (ModelViewSet)
  - Custom actions:
    - `stats` - Get spending statistics
    - `by_category` - Group expenses by category
    - `by_period` - Group by time period (day/week/month/year)
    - `search` - Search expenses
- ExpenseTagViewSet (ModelViewSet)
- BudgetViewSet (ModelViewSet)
  - Custom action: `check_budgets` - Check if budgets are exceeded
- RecurringExpenseViewSet (ModelViewSet)
  - Custom action: `generate_expenses` - Create expenses from recurring templates
- ReceiptViewSet (ModelViewSet)
  - Custom action: `download` - Download receipt file

### 5. URLs (`backend/expenses/urls.py`)
- Register all viewsets with DefaultRouter
- Add to `backend/config/urls.py`

### 6. Admin (`backend/expenses/admin.py`)
- Register all models with appropriate list_display and filters

### 7. Migrations
- **IMPORTANT**: Activate virtual environment before running migrations
  - Windows: Run `backend\activate.bat` or `backend\venv\Scripts\activate`
  - Linux/Mac: Run `source backend/venv/bin/activate`
- Create initial migration: `python manage.py makemigrations expenses`
- Run migration: `python manage.py migrate expenses`
- Add default categories utility function (similar to lists app)

## Frontend Implementation

### 1. Types (`mobile/types/expenses.ts`)
- ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt interfaces
- CreateExpenseData, UpdateExpenseData, CreateBudgetData types
- PaymentMethod, BudgetPeriod, RecurringFrequency enums

### 2. Service (`mobile/services/expenseService.ts`)
- Methods following pattern from `listService.ts`:
  - `getCategories(familyId)`
  - `createCategory(data)`
  - `updateCategory(id, data)`
  - `deleteCategory(id)`
  - `reorderCategories(ids)`
  - `getExpenses(familyId, filters)`
  - `createExpense(data)`
  - `updateExpense(id, data)`
  - `deleteExpense(id)`
  - `getExpenseStats(familyId, period)`
  - `getExpensesByCategory(familyId, period)`
  - `getBudgets(familyId)`
  - `createBudget(data)`
  - `updateBudget(id, data)`
  - `deleteBudget(id)`
  - `getRecurringExpenses(familyId)`
  - `createRecurringExpense(data)`
  - `uploadReceipt(expenseId, fileUri, fileName, mimeType)`
  - `downloadReceipt(receiptId)`

### 3. Main Screen (`mobile/app/(tabs)/expenses.tsx`)
- Tab navigation: Expenses, Categories, Budgets, Reports
- Expenses tab:
  - Filter by date range, category, payment method, tags
  - Sort by date, amount, category
  - List/grid view toggle
  - Add expense button
  - Expense cards with category, amount, date, payment method
  - Swipe actions: edit, delete
- Categories tab:
  - List of categories with icons/colors
  - Add/edit/delete categories
  - Reorder categories (drag and drop)
- Budgets tab:
  - List of active budgets
  - Progress bars showing usage
  - Alerts for exceeded budgets
  - Add/edit/delete budgets
- Reports tab:
  - Spending by category (pie chart)
  - Spending over time (line chart)
  - Top expenses
  - Category breakdown table
  - Export options

### 4. Components

#### ExpenseForm (`mobile/components/expenses/ExpenseForm.tsx`)
- Modal/form for creating/editing expenses
- Fields: amount, description, category (picker), date, payment method, tags (multi-select), notes, receipt upload
- Validation

#### CategoryManager (`mobile/components/expenses/CategoryManager.tsx`)
- List of categories
- Add/edit category modal
- Icon picker
- Color picker
- Reorder functionality

#### BudgetCard (`mobile/components/expenses/BudgetCard.tsx`)
- Display budget with progress bar
- Show spent vs. limit
- Alert indicator if exceeded

#### ExpenseCard (`mobile/components/expenses/ExpenseCard.tsx`)
- Display expense with category icon/color
- Amount, description, date
- Payment method icon
- Tags display
- Receipt indicator

#### ReportsView (`mobile/components/expenses/ReportsView.tsx`)
- Charts using react-native-chart-kit or similar
- Date range selector
- Category filters
- Export to CSV/PDF option

### 5. Navigation Integration
- Update `mobile/app/(tabs)/index.tsx` to navigate to expenses screen
- Add route: `case 'finance': router.push('/(tabs)/expenses'); break;`

## Key Features

### Category Management
- Create, edit, delete categories
- Assign icons and colors
- Reorder categories
- Default categories (Food, Transportation, Utilities, Entertainment, etc.)

### Expense Tracking
- Add expenses with amount, description, date
- Assign to categories
- Add tags for additional categorization
- Track payment methods
- Upload receipts
- Mark as recurring

### Budget Management
- Set budgets per category
- Daily/weekly/monthly/yearly periods
- Alert thresholds (e.g., 80% used)
- Visual progress indicators
- Budget vs. actual comparisons

### Recurring Expenses
- Create recurring expense templates
- Auto-generate expenses based on frequency
- Manage subscriptions and bills
- Pause/resume recurring expenses

### Reports & Analytics
- Spending by category (pie chart)
- Spending trends over time (line chart)
- Top expenses
- Category breakdown table
- Date range filtering
- Export functionality

### Receipt Management
- Upload receipt images/files
- Attach to expenses
- View/download receipts
- Delete receipts

## Data Flow

```
User Action → Frontend Service → API Endpoint → ViewSet → Serializer → Model → Database
                                                                    ↓
                                                              Encrypted Fields
```

## Security
- All sensitive fields encrypted using `EncryptedCharField` and `EncryptedTextField`
- Family-scoped access control
- Member tracking for audit trail
- File uploads stored securely

## Testing Considerations
- Model tests for expense calculations
- Budget alert logic
- Recurring expense generation
- Category reordering
- Receipt upload/download

## Migration Strategy
- Create initial migration with models
- Add utility to create default categories
- No data migration needed (new feature)
