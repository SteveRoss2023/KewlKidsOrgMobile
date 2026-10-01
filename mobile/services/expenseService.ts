import { Platform } from 'react-native';
import apiClient, { handleAPIError } from './api';
import {
  ExpenseCategory,
  Expense,
  ExpenseTag,
  Budget,
  RecurringExpense,
  Receipt,
  ReceiptParseResult,
  CreateExpenseData,
  UpdateExpenseData,
  CreateExpenseCategoryData,
  UpdateExpenseCategoryData,
  CreateBudgetData,
  UpdateBudgetData,
  CreateRecurringExpenseData,
  UpdateRecurringExpenseData,
  CreateExpenseTagData,
  UpdateExpenseTagData,
  ExpenseStats,
  ExpenseByCategory,
  ExpenseByPeriod,
  BudgetAlert,
  GenerateExpensesResult,
} from '../types/expenses';

/** Follow DRF `next` links until all pages are loaded. */
async function fetchAllPages<T>(
  initialPath: string,
  params?: Record<string, any>
): Promise<T[]> {
  const response = await apiClient.get(initialPath, { params });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (!response.data || !Array.isArray(response.data.results)) {
    return [];
  }

  let items: T[] = [...response.data.results];
  let nextUrl: string | null = response.data.next || null;

  while (nextUrl) {
    let path = nextUrl;
    if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) {
      const url = new URL(nextUrl);
      path = url.pathname + url.search;
      if (path.startsWith('/api')) {
        path = path.substring(4);
      }
    } else if (nextUrl.startsWith('/api')) {
      path = nextUrl.substring(4);
    } else if (!nextUrl.startsWith('/')) {
      path = '/' + nextUrl;
    }

    const nextResponse = await apiClient.get(path);
    if (nextResponse.data && Array.isArray(nextResponse.data.results)) {
      items = items.concat(nextResponse.data.results);
      nextUrl = nextResponse.data.next || null;
    } else {
      break;
    }
  }

  return items;
}

/**
 * Expense Service
 */
class ExpenseService {
  /**
   * Get all expense categories for a family
   */
  async getCategories(familyId: number): Promise<ExpenseCategory[]> {
    try {
      return await fetchAllPages<ExpenseCategory>('/expense-categories/', {
        family: familyId,
      });
    } catch (error) {
      console.error('Error fetching expense categories:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new expense category
   */
  async createCategory(data: CreateExpenseCategoryData): Promise<ExpenseCategory> {
    try {
      const response = await apiClient.post<ExpenseCategory>('/expense-categories/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update an expense category
   */
  async updateCategory(categoryId: number, data: UpdateExpenseCategoryData): Promise<ExpenseCategory> {
    try {
      const response = await apiClient.patch<ExpenseCategory>(`/expense-categories/${categoryId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete an expense category
   */
  async deleteCategory(categoryId: number): Promise<void> {
    try {
      await apiClient.delete(`/expense-categories/${categoryId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Reorder expense categories
   */
  async reorderCategories(familyId: number, categoryIds: number[]): Promise<void> {
    try {
      await apiClient.post('/expense-categories/reorder/', {
        family: familyId,
        category_ids: categoryIds,
      });
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get all expenses for a family (with optional filters)
   */
  async getExpenses(
    familyId: number,
    filters?: {
      category?: number;
      start_date?: string;
      end_date?: string;
      payment_method?: string;
    }
  ): Promise<Expense[]> {
    try {
      const params: any = { family: familyId };
      if (filters) {
        if (filters.category) params.category = filters.category;
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
        if (filters.payment_method) params.payment_method = filters.payment_method;
      }

      return await fetchAllPages<Expense>('/expenses/', params);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get a specific expense by ID
   */
  async getExpense(expenseId: number): Promise<Expense> {
    try {
      const response = await apiClient.get<Expense>(`/expenses/${expenseId}/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new expense
   */
  async createExpense(data: CreateExpenseData): Promise<Expense> {
    try {
      const response = await apiClient.post<Expense>('/expenses/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update an expense
   */
  async updateExpense(expenseId: number, data: UpdateExpenseData): Promise<Expense> {
    try {
      const response = await apiClient.patch<Expense>(`/expenses/${expenseId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete an expense
   */
  async deleteExpense(expenseId: number): Promise<void> {
    try {
      await apiClient.delete(`/expenses/${expenseId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get expense statistics
   */
  async getExpenseStats(familyId: number, period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly'): Promise<ExpenseStats> {
    try {
      const response = await apiClient.get<ExpenseStats>('/expenses/stats/', {
        params: { family: familyId, period },
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get expenses grouped by category
   */
  async getExpensesByCategory(
    familyId: number,
    startDate?: string,
    endDate?: string
  ): Promise<ExpenseByCategory[]> {
    try {
      const params: any = { family: familyId };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await apiClient.get<ExpenseByCategory[]>('/expenses/by_category/', { params });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get expenses grouped by time period
   */
  async getExpensesByPeriod(
    familyId: number,
    periodType: 'day' | 'week' | 'month' | 'year' = 'day',
    startDate?: string,
    endDate?: string
  ): Promise<ExpenseByPeriod[]> {
    try {
      const params: any = { family: familyId, period_type: periodType };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await apiClient.get<ExpenseByPeriod[]>('/expenses/by_period/', { params });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Search expenses
   */
  async searchExpenses(familyId: number, query: string): Promise<Expense[]> {
    try {
      const response = await apiClient.get<Expense[]>('/expenses/search/', {
        params: { family: familyId, q: query },
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get all budgets for a family
   */
  async getBudgets(familyId: number, isActive?: boolean): Promise<Budget[]> {
    try {
      const params: any = { family: familyId };
      if (isActive !== undefined) params.is_active = isActive.toString();

      return await fetchAllPages<Budget>('/budgets/', params);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new budget
   */
  async createBudget(data: CreateBudgetData): Promise<Budget> {
    try {
      const response = await apiClient.post<Budget>('/budgets/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a budget
   */
  async updateBudget(budgetId: number, data: UpdateBudgetData): Promise<Budget> {
    try {
      const response = await apiClient.patch<Budget>(`/budgets/${budgetId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a budget
   */
  async deleteBudget(budgetId: number): Promise<void> {
    try {
      await apiClient.delete(`/budgets/${budgetId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Check budgets for alerts (exceeded or approaching threshold)
   */
  async checkBudgets(familyId: number): Promise<{ alerts: BudgetAlert[] }> {
    try {
      const response = await apiClient.get<{ alerts: BudgetAlert[] }>('/budgets/check_budgets/', {
        params: { family: familyId },
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get all recurring expenses for a family
   */
  async getRecurringExpenses(familyId: number, isActive?: boolean): Promise<RecurringExpense[]> {
    try {
      const params: any = { family: familyId };
      if (isActive !== undefined) params.is_active = isActive.toString();

      return await fetchAllPages<RecurringExpense>('/recurring-expenses/', params);
    } catch (error) {
      console.error('Error fetching recurring expenses:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new recurring expense
   */
  async createRecurringExpense(data: CreateRecurringExpenseData): Promise<RecurringExpense> {
    try {
      const response = await apiClient.post<RecurringExpense>('/recurring-expenses/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a recurring expense
   */
  async updateRecurringExpense(recurringId: number, data: UpdateRecurringExpenseData): Promise<RecurringExpense> {
    try {
      const response = await apiClient.patch<RecurringExpense>(`/recurring-expenses/${recurringId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a recurring expense
   */
  async deleteRecurringExpense(recurringId: number): Promise<void> {
    try {
      await apiClient.delete(`/recurring-expenses/${recurringId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Generate expenses from recurring expense templates.
   * Pass dryRun=true to preview without creating anything.
   */
  async generateExpenses(
    familyId: number,
    options?: { dryRun?: boolean }
  ): Promise<GenerateExpensesResult> {
    try {
      const response = await apiClient.post<GenerateExpensesResult>(
        '/recurring-expenses/generate_expenses/',
        { family: familyId, dry_run: !!options?.dryRun }
      );
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get all expense tags for a family
   */
  async getTags(familyId: number): Promise<ExpenseTag[]> {
    try {
      return await fetchAllPages<ExpenseTag>('/expense-tags/', {
        family: familyId,
      });
    } catch (error) {
      console.error('Error fetching expense tags:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new expense tag
   */
  async createTag(data: CreateExpenseTagData): Promise<ExpenseTag> {
    try {
      const response = await apiClient.post<ExpenseTag>('/expense-tags/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update an expense tag
   */
  async updateTag(tagId: number, data: UpdateExpenseTagData): Promise<ExpenseTag> {
    try {
      const response = await apiClient.patch<ExpenseTag>(`/expense-tags/${tagId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete an expense tag
   */
  async deleteTag(tagId: number): Promise<void> {
    try {
      await apiClient.delete(`/expense-tags/${tagId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Upload a receipt (optionally linked to an expense). Family is required.
   */
  async uploadReceipt(params: {
    familyId: number;
    fileUri: string;
    fileName: string;
    mimeType: string;
    expenseId?: number | null;
  }): Promise<Receipt> {
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const res = await fetch(params.fileUri);
        const blob = await res.blob();
        formData.append('file', blob, params.fileName);
      } else {
        formData.append('file', {
          uri: params.fileUri,
          type: params.mimeType,
          name: params.fileName,
        } as any);
      }
      formData.append('family', params.familyId.toString());
      if (params.expenseId) {
        formData.append('expense', params.expenseId.toString());
      }

      const response = await apiClient.post<Receipt>('/receipts/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Run free Tesseract OCR parse on an uploaded receipt.
   */
  async parseReceipt(receiptId: number): Promise<ReceiptParseResult> {
    try {
      const response = await apiClient.post<ReceiptParseResult>(`/receipts/${receiptId}/parse/`);
      return response.data;
    } catch (error: any) {
      // 503 still returns structured OCR failure payload
      if (error?.response?.data && typeof error.response.data === 'object') {
        return error.response.data as ReceiptParseResult;
      }
      throw handleAPIError(error as any);
    }
  }

  /**
   * Attach an existing receipt to an expense.
   */
  async attachReceiptToExpense(receiptId: number, expenseId: number): Promise<Receipt> {
    try {
      const response = await apiClient.patch<Receipt>(`/receipts/${receiptId}/`, {
        expense: expenseId,
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Download a receipt
   */
  async downloadReceipt(receiptId: number): Promise<Blob> {
    try {
      const response = await apiClient.get(`/receipts/${receiptId}/download/`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a receipt
   */
  async deleteReceipt(receiptId: number): Promise<void> {
    try {
      await apiClient.delete(`/receipts/${receiptId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }
}

export default new ExpenseService();
