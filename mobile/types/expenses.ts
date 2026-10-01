/**
 * TypeScript types for Expenses feature
 */

export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'e_transfer' | 'check' | 'other';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface ExpenseCategory {
  id: number;
  family: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseTag {
  id: number;
  family: number;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: number;
  family: number;
  created_by: number | null;
  created_by_username: string | null;
  category: number;
  category_name: string | null;
  amount: number;
  description: string;
  notes: string | null;
  expense_date: string;
  payment_method: PaymentMethod;
  tags: number[];
  tag_names: string[];
  receipt_url: string | null;
  receipt_id?: number | null;
  is_recurring: boolean;
  recurring_expense: number | null;
  line_items?: ExpenseLineItem[];
  created_at: string;
  updated_at: string;
}

export interface ExpenseLineItem {
  id?: number;
  expense?: number;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  order: number;
}

export interface ReceiptParseResult {
  merchant: string | null;
  expense_date: string | null;
  total: number | null;
  line_items?: Array<{
    name: string;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    order?: number;
  }>;
  raw_text: string;
  found: {
    merchant: boolean;
    expense_date: boolean;
    total: boolean;
    total_labeled: boolean;
    line_items?: boolean;
    line_item_count?: number;
  };
  confidence: 'high' | 'medium' | 'low';
  ocr_available: boolean;
  engine?: 'gemini' | 'tesseract' | string;
  error?: string;
}

export interface Budget {
  id: number;
  family: number;
  category: number;
  category_name: string | null;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string | null;
  alert_threshold: number;
  is_active: boolean;
  spent_amount: number;
  remaining_amount: number;
  percentage_used: number;
  created_at: string;
  updated_at: string;
}

export interface RecurringExpense {
  id: number;
  family: number;
  created_by: number | null;
  created_by_username: string | null;
  category: number;
  category_name: string | null;
  amount: number;
  description: string;
  notes: string | null;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  is_active: boolean;
  payment_method: PaymentMethod;
  tags: number[];
  tag_names: string[];
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: number;
  expense: number | null;
  family: number;
  file: string;
  receipt_url: string | null;
  file_size: number;
  mime_type: string | null;
  uploaded_by: number | null;
  uploaded_by_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseData {
  family: number;
  category: number;
  amount: number;
  description: string;
  notes?: string;
  expense_date: string;
  payment_method: PaymentMethod;
  tags?: number[];
  is_recurring?: boolean;
  recurring_expense?: number | null;
  line_items_input?: Array<{
    name: string;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    order?: number;
  }>;
}

export interface UpdateExpenseData {
  category?: number;
  amount?: number;
  description?: string;
  notes?: string;
  expense_date?: string;
  payment_method?: PaymentMethod;
  tags?: number[];
  line_items_input?: Array<{
    name: string;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    order?: number;
  }>;
}

export interface CreateExpenseCategoryData {
  family: number;
  name: string;
  description?: string;
  icon?: string;
  color: string;
  order?: number;
}

export interface UpdateExpenseCategoryData {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  order?: number;
}

export interface CreateBudgetData {
  family: number;
  category: number;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date?: string | null;
  alert_threshold?: number;
}

export interface UpdateBudgetData {
  category?: number;
  amount?: number;
  period?: BudgetPeriod;
  start_date?: string;
  end_date?: string | null;
  alert_threshold?: number;
  is_active?: boolean;
}

export interface CreateRecurringExpenseData {
  family: number;
  category: number;
  amount: number;
  description: string;
  notes?: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  next_due_date?: string; // Optional - calculated automatically from start_date + frequency
  payment_method: PaymentMethod;
  tags?: number[];
}

export interface UpdateRecurringExpenseData {
  category?: number;
  amount?: number;
  description?: string;
  notes?: string;
  frequency?: RecurringFrequency;
  start_date?: string;
  end_date?: string | null;
  next_due_date?: string;
  payment_method?: PaymentMethod;
  tags?: number[];
  is_active?: boolean;
}

export interface CreateExpenseTagData {
  family: number;
  name: string;
  color?: string | null;
}

export interface UpdateExpenseTagData {
  name?: string;
  color?: string | null;
}

export interface ExpenseStats {
  period: string;
  start_date: string;
  end_date: string;
  total_expenses: number;
  total_amount: number;
  average_expense: number;
  by_category: Record<string, { count: number; amount: number }>;
}

export interface ExpenseByCategory {
  category_id: number | null;
  category_name: string;
  count: number;
  total_amount: number;
  expenses: Expense[];
}

export interface ExpenseByPeriod {
  period: string;
  count: number;
  total_amount: number;
}

export interface BudgetAlert {
  budget_id: number;
  category_name: string | null;
  status: 'exceeded' | 'warning';
  percentage: number;
  spent: number;
  limit: number;
}
