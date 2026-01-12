import apiClient, { handleAPIError } from './api';
import {
  ExpenseCategory,
  Expense,
  ExpenseTag,
  Budget,
  RecurringExpense,
  Receipt,
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
} from '../types/expenses';

/**
 * Expense Service
 */
class ExpenseService {
  /**
   * Get all expense categories for a family
   */
  async getCategories(familyId: number): Promise<ExpenseCategory[]> {
    try {
      const response = await apiClient.get('/expense-categories/', {
        params: { family: familyId },
      });
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
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

      const response = await apiClient.get('/expenses/', { params });
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
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

      const response = await apiClient.get('/budgets/', { params });
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
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

      const response = await apiClient.get('/recurring-expenses/', { params });
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
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
   * Generate expenses from recurring expense templates
   */
  async generateExpenses(familyId: number): Promise<{ message: string; generated_count: number; errors?: string[] }> {
    try {
      const response = await apiClient.post<{ message: string; generated_count: number; errors?: string[] }>(
        '/recurring-expenses/generate_expenses/',
        { family: familyId }
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
      const response = await apiClient.get('/expense-tags/', {
        params: { family: familyId },
      });
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
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
   * Upload a receipt for an expense
   */
  async uploadReceipt(expenseId: number, fileUri: string, fileName: string, mimeType: string): Promise<Receipt> {
    try {
      const formData = new FormData();
      // Note: In React Native, we need to handle file uploads differently
      // This is a placeholder - actual implementation depends on the file picker library used
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: fileName,
      } as any);
      formData.append('expense', expenseId.toString());

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
