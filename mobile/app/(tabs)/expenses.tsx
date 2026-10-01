import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Modal,
  Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import expenseService from '../../services/expenseService';
import { Expense, ExpenseCategory, Budget, RecurringExpense, ExpenseTag, PaymentMethod, CreateExpenseData, UpdateExpenseData, CreateExpenseCategoryData, CreateBudgetData, UpdateBudgetData, CreateRecurringExpenseData, UpdateRecurringExpenseData, CreateExpenseTagData, UpdateExpenseTagData, GenerateExpensesResult } from '../../types/expenses';
import AlertModal from '../../components/AlertModal';
import ExpenseForm from '../../components/expenses/ExpenseForm';
import ReceiptScanWizard from '../../components/expenses/ReceiptScanWizard';
import CategoryForm from '../../components/expenses/CategoryForm';
import BudgetForm from '../../components/expenses/BudgetForm';
import RecurringExpenseForm from '../../components/expenses/RecurringExpenseForm';
import TagForm from '../../components/expenses/TagForm';
import ExpenseCard from '../../components/expenses/ExpenseCard';
import RecurringExpenseRow, { formatOccurrenceDate } from '../../components/expenses/RecurringExpenseRow';
import BudgetCard from '../../components/expenses/BudgetCard';
import ThemeAwarePicker from '../../components/lists/ThemeAwarePicker';
import { formatCurrency } from '../../utils/moneyInput';

type ActiveTab = 'expenses' | 'categories' | 'budgets' | 'recurring' | 'reports';
type GroupMode = 'none' | 'day' | 'week' | 'month' | 'year';
type PeriodMode = Exclude<GroupMode, 'none'>;

function startOfPeriod(date: Date, mode: PeriodMode): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (mode === 'day') return d;
  if (mode === 'week') {
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  if (mode === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), 0, 1);
}

function shiftPeriod(date: Date, mode: PeriodMode, delta: number): Date {
  const d = startOfPeriod(date, mode);
  if (mode === 'day') d.setDate(d.getDate() + delta);
  else if (mode === 'week') d.setDate(d.getDate() + delta * 7);
  else if (mode === 'month') d.setMonth(d.getMonth() + delta);
  else d.setFullYear(d.getFullYear() + delta);
  return d;
}

function formatPeriodLabel(date: Date, mode: PeriodMode, short = false): string {
  const d = startOfPeriod(date, mode);
  if (mode === 'day') {
    return d.toLocaleDateString('en-US', short
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (mode === 'week') {
    if (short) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return `Week of ${d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }
  if (mode === 'month') {
    return d.toLocaleDateString('en-US', short
      ? { month: 'short', year: '2-digit' }
      : { year: 'numeric', month: 'long' });
  }
  return d.toLocaleDateString('en-US', { year: 'numeric' });
}

function parseExpenseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function expenseInPeriod(expenseDate: string, viewDate: Date, mode: PeriodMode): boolean {
  const date = parseExpenseDate(expenseDate);
  const start = startOfPeriod(viewDate, mode);
  const end = shiftPeriod(start, mode, 1);
  return date >= start && date < end;
}

function TooltipButton({
  children,
  tooltip,
  ...props
}: {
  children: React.ReactNode;
  tooltip: string;
  [key: string]: any;
}) {
  const buttonRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && tooltip) {
      const setTitle = () => {
        if (buttonRef?.current) {
          const getDOMNode = (node: any): HTMLElement | null => {
            if (!node) return null;
            if (node.nodeType === 1) return node;
            if (node._nativeNode) return node._nativeNode;
            if (node._internalFiberInstanceHandleDEV) {
              const fiber = node._internalFiberInstanceHandleDEV;
              if (fiber && fiber.stateNode) {
                const stateNode = fiber.stateNode;
                if (stateNode.nodeType === 1) return stateNode;
                if (stateNode._nativeNode) return stateNode._nativeNode;
              }
            }
            return null;
          };
          const domNode = getDOMNode(buttonRef.current);
          if (domNode) {
            domNode.setAttribute('title', tooltip);
          }
        }
      };
      // Try immediately and also after a short delay to ensure DOM is ready
      setTitle();
      const timeout = setTimeout(setTitle, 100);
      return () => clearTimeout(timeout);
    }
  }, [tooltip]);

  return (
    <TouchableOpacity
      ref={buttonRef}
      accessibilityLabel={tooltip}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function ExpensesScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showReceiptWizard, setShowReceiptWizard] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const editingExpenseRef = useRef<Expense | null>(null);
  const [expenseFormSessionKey, setExpenseFormSessionKey] = useState('new');
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [editingTag, setEditingTag] = useState<ExpenseTag | null>(null);
  const [creating, setCreating] = useState(false);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<PaymentMethod | null>(null);
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [filterRecurring, setFilterRecurring] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showCombinedView, setShowCombinedView] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupMode>('month');
  const [recurringGroupBy, setRecurringGroupBy] = useState<GroupMode>('month');
  const [viewDate, setViewDate] = useState(() => startOfPeriod(new Date(), 'month'));
  const [periodExpanded, setPeriodExpanded] = useState(true);
  const [expandedRecurringGroups, setExpandedRecurringGroups] = useState<Set<string>>(new Set());
  const [generateDryRun, setGenerateDryRun] = useState(true);
  const [generateResult, setGenerateResult] = useState<GenerateExpensesResult | null>(null);

  const currentGroupKey = useCallback((mode: PeriodMode) => {
    return formatPeriodLabel(new Date(), mode, false);
  }, []);

  useEffect(() => {
    if (recurringGroupBy === 'none') return;
    setExpandedRecurringGroups(new Set([currentGroupKey(recurringGroupBy)]));
  }, [recurringGroupBy, selectedFamily?.id, currentGroupKey]);

  useEffect(() => {
    if (groupBy === 'none') return;
    setViewDate(startOfPeriod(new Date(), groupBy));
    setPeriodExpanded(true);
  }, [groupBy, selectedFamily?.id]);

  useEffect(() => {
    setPeriodExpanded(false);
  }, [viewDate]);

  // Load data when family changes or screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchData();
      } else {
        setExpenses([]);
        setCategories([]);
        setBudgets([]);
      }
    }, [selectedFamily, activeTab])
  );

  const fetchData = async () => {
    if (!selectedFamily) return;

    setLoading(true);
    setError('');

    try {
      // Always fetch categories and tags first to ensure they exist
      const categoriesData = await expenseService.getCategories(selectedFamily.id);
      setCategories(categoriesData);
      const tagsData = await expenseService.getTags(selectedFamily.id);
      setTags(tagsData);

      // Always fetch expenses and recurring expenses since they're used in multiple tabs
      // (expenses tab uses both, recurring tab uses recurring expenses, combined view uses both)
      const expensesData = await expenseService.getExpenses(selectedFamily.id);
      setExpenses(expensesData);

      const recurringData = await expenseService.getRecurringExpenses(selectedFamily.id);
      setRecurringExpenses(recurringData);

      // Fetch budgets only when on budgets tab
      if (activeTab === 'budgets') {
        const budgetsData = await expenseService.getBudgets(selectedFamily.id, true);
        setBudgets(budgetsData);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openNewExpenseForm = () => {
    editingExpenseRef.current = null;
    setEditingExpense(null);
    setExpenseFormSessionKey(`new-${Date.now()}`);
    setShowExpenseForm(true);
  };

  const openExpenseEditor = async (expense: Expense) => {
    setExpenseFormSessionKey(`edit-${expense.id}`);
    setShowExpenseForm(true);
    editingExpenseRef.current = expense;
    setEditingExpense(expense);
    try {
      const full = await expenseService.getExpense(expense.id);
      editingExpenseRef.current = full;
      setEditingExpense(full);
    } catch {
      // List payload is enough to edit; line items may be missing until refresh
    }
  };

  const closeExpenseForm = () => {
    setShowExpenseForm(false);
    editingExpenseRef.current = null;
    setEditingExpense(null);
  };

  const handleCreateExpense = async (
    data: CreateExpenseData,
    options?: { stayOpen?: boolean }
  ): Promise<Expense | void> => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      const created = await expenseService.createExpense(data);
      const full = await expenseService.getExpense(created.id);
      await fetchData();
      if (options?.stayOpen) {
        editingExpenseRef.current = full;
        setEditingExpense(full);
        return full;
      }
      closeExpenseForm();
    } catch (err: any) {
      setError(err.message || 'Failed to create expense');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateExpense = async (data: any) => {
    const current = editingExpenseRef.current;
    if (!current) return;

    setCreating(true);
    try {
      await expenseService.updateExpense(current.id, data);
      closeExpenseForm();
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update expense');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleExpenseFormSubmit = async (
    data: CreateExpenseData | UpdateExpenseData,
    options?: { stayOpen?: boolean }
  ): Promise<Expense | void> => {
    if (editingExpenseRef.current) {
      await handleUpdateExpense(data);
      return;
    }
    return handleCreateExpense(data as CreateExpenseData, options);
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!selectedFamily) return;

    try {
      await expenseService.deleteExpense(expenseId);
      setExpensePendingDelete(null);
      await fetchData();
    } catch (err: any) {
      setExpensePendingDelete(null);
      setError(err.message || 'Failed to delete expense');
    }
  };

  const requestDeleteExpense = (expense: Expense) => {
    setExpensePendingDelete(expense);
  };

  const handleCreateCategory = async (data: CreateExpenseCategoryData) => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      await expenseService.createCategory(data);
      setShowCategoryForm(false);
      setEditingCategory(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateCategory = async (data: any) => {
    if (!editingCategory) return;

    setCreating(true);
    try {
      await expenseService.updateCategory(editingCategory.id, data);
      setShowCategoryForm(false);
      setEditingCategory(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update category');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!selectedFamily) return;

    try {
      await expenseService.deleteCategory(categoryId);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    }
  };

  const handleCreateBudget = async (data: CreateBudgetData) => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      await expenseService.createBudget(data);
      setShowBudgetForm(false);
      setEditingBudget(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create budget');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateBudget = async (data: UpdateBudgetData) => {
    if (!editingBudget) return;

    setCreating(true);
    try {
      await expenseService.updateBudget(editingBudget.id, data);
      setShowBudgetForm(false);
      setEditingBudget(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update budget');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBudget = async (budgetId: number) => {
    if (!selectedFamily) return;

    try {
      await expenseService.deleteBudget(budgetId);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete budget');
    }
  };

  const handleCreateRecurringExpense = async (data: CreateRecurringExpenseData) => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      await expenseService.createRecurringExpense(data);
      setShowRecurringForm(false);
      setEditingRecurring(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create recurring expense');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRecurringExpense = async (data: UpdateRecurringExpenseData) => {
    if (!editingRecurring) return;

    setCreating(true);
    try {
      await expenseService.updateRecurringExpense(editingRecurring.id, data);
      setShowRecurringForm(false);
      setEditingRecurring(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update recurring expense');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRecurringExpense = async (recurringId: number) => {
    if (!selectedFamily) return;

    try {
      await expenseService.deleteRecurringExpense(recurringId);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete recurring expense');
    }
  };

  const handleGenerateExpenses = async () => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      const result = await expenseService.generateExpenses(selectedFamily.id, {
        dryRun: generateDryRun,
      });
      setGenerateResult(result);
      if (!generateDryRun) {
        await fetchData();
      }
    } catch (err: any) {
      console.error('Error generating expenses:', err);
      setError(err.message || 'Failed to generate expenses');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTag = async (data: CreateExpenseTagData) => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      await expenseService.createTag(data);
      setShowTagForm(false);
      setEditingTag(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTag = async (data: UpdateExpenseTagData) => {
    if (!editingTag) return;

    setCreating(true);
    try {
      await expenseService.updateTag(editingTag.id, data);
      setShowTagForm(false);
      setEditingTag(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update tag');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!selectedFamily) return;

    try {
      await expenseService.deleteTag(tagId);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete tag');
    }
  };

  const renderExpensesTab = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (expenses.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <FontAwesome name="file-text-o" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No expenses yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Add your first expense to get started
          </Text>
        </View>
      );
    }

    // Filter and sort expenses
    let filteredExpenses = [...expenses];

    // Apply search filter
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filteredExpenses = filteredExpenses.filter(
        (exp) =>
          exp.description.toLowerCase().includes(queryLower) ||
          (exp.category_name && exp.category_name.toLowerCase().includes(queryLower)) ||
          (exp.notes && exp.notes.toLowerCase().includes(queryLower)) ||
          exp.tag_names.some((tag) => tag.toLowerCase().includes(queryLower))
      );
    }

    // Apply category filter
    if (filterCategory) {
      filteredExpenses = filteredExpenses.filter((exp) => exp.category === filterCategory);
    }

    // Apply payment method filter
    if (filterPaymentMethod) {
      filteredExpenses = filteredExpenses.filter((exp) => exp.payment_method === filterPaymentMethod);
    }

    // Apply tag filter
    if (filterTag) {
      filteredExpenses = filteredExpenses.filter((exp) => exp.tags.includes(filterTag));
    }

    // Apply recurring filter
    if (filterRecurring !== null) {
      if (filterRecurring) {
        // Show only expenses that came from recurring templates
        filteredExpenses = filteredExpenses.filter((exp) => exp.is_recurring && exp.recurring_expense !== null);
      } else {
        // Show only one-time expenses (not from recurring templates)
        filteredExpenses = filteredExpenses.filter((exp) => !exp.is_recurring || exp.recurring_expense === null);
      }
    }

    // Sort expenses
    filteredExpenses.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        // Parse dates without timezone conversion for accurate sorting
        const parseDate = (dateString: string): Date => {
          const [year, month, day] = dateString.split('-').map(Number);
          return new Date(year, month - 1, day); // month is 0-indexed
        };
        const dateA = parseDate(a.expense_date).getTime();
        const dateB = parseDate(b.expense_date).getTime();
        comparison = dateA - dateB;
      } else if (sortBy === 'amount') {
        comparison = a.amount - b.amount;
      } else if (sortBy === 'category') {
        comparison = (a.category_name || '').localeCompare(b.category_name || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const hasActiveFilters = !!(
      filterCategory || filterPaymentMethod || filterTag || filterRecurring !== null
    );

    const periodMode: PeriodMode | null = groupBy === 'none' ? null : groupBy;
    const periodExpenses = periodMode
      ? filteredExpenses.filter((exp) => expenseInPeriod(exp.expense_date, viewDate, periodMode))
      : filteredExpenses;
    const periodTotal = periodExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const todayPeriod = periodMode ? startOfPeriod(new Date(), periodMode) : null;
    const tabDates = periodMode
      ? [shiftPeriod(viewDate, periodMode, -1), startOfPeriod(viewDate, periodMode), shiftPeriod(viewDate, periodMode, 1)]
      : [];

    const groupOptions: { label: string; value: GroupMode }[] = [
      { label: 'Day', value: 'day' },
      { label: 'Week', value: 'week' },
      { label: 'Month', value: 'month' },
      { label: 'Year', value: 'year' },
      { label: 'All', value: 'none' },
    ];

    return (
      <View style={styles.content}>
        {/* Compact search + actions */}
        <View style={[styles.compactBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <FontAwesome name="search" size={13} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <FontAwesome name="times" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TooltipButton
            tooltip="Filters"
            style={[
              styles.compactIconBtn,
              {
                backgroundColor: showFilters || hasActiveFilters ? colors.primary : colors.background,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <FontAwesome
              name="filter"
              size={13}
              color={showFilters || hasActiveFilters ? '#fff' : colors.text}
            />
          </TooltipButton>
          <TooltipButton
            tooltip="Scan receipt"
            style={[styles.compactIconBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setShowReceiptWizard(true)}
          >
            <FontAwesome name="camera" size={13} color={colors.primary} />
          </TooltipButton>
          <TooltipButton
            tooltip="Add expense"
            style={[styles.compactIconBtn, styles.compactIconBtnPrimary, { backgroundColor: colors.primary }]}
            onPress={openNewExpenseForm}
          >
            <FontAwesome name="plus" size={13} color="#fff" />
          </TooltipButton>
        </View>

        {/* Compact group-by chips */}
        <View style={[styles.groupChipRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {groupOptions.map((opt) => {
            const active = groupBy === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.groupChip,
                  {
                    backgroundColor: active ? colors.primary : colors.background,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setGroupBy(opt.value)}
              >
                <Text style={[styles.groupChipText, { color: active ? '#fff' : colors.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Filter Panel */}
        {showFilters && (
          <View style={[styles.filterPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Category</Text>
              <ThemeAwarePicker
                selectedValue={filterCategory?.toString() || ''}
                onValueChange={(value) => setFilterCategory(value ? parseInt(value) : null)}
                options={[
                  { label: 'All', value: '' },
                  ...categories.map((cat) => ({ label: cat.name, value: cat.id.toString() })),
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Payment</Text>
              <ThemeAwarePicker
                selectedValue={filterPaymentMethod || ''}
                onValueChange={(value) => setFilterPaymentMethod(value || null)}
                options={[
                  { label: 'All', value: '' },
                  { label: 'Cash', value: 'cash' },
                  { label: 'Credit Card', value: 'credit_card' },
                  { label: 'Debit Card', value: 'debit_card' },
                  { label: 'Bank Transfer', value: 'bank_transfer' },
                  { label: 'E-Transfer', value: 'e_transfer' },
                  { label: 'Check', value: 'check' },
                  { label: 'Other', value: 'other' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Tag</Text>
              <ThemeAwarePicker
                selectedValue={filterTag?.toString() || ''}
                onValueChange={(value) => setFilterTag(value ? parseInt(value) : null)}
                options={[
                  { label: 'All', value: '' },
                  ...tags.map((tag) => ({ label: tag.name, value: tag.id.toString() })),
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Recurring</Text>
              <ThemeAwarePicker
                selectedValue={filterRecurring === null ? '' : filterRecurring ? 'true' : 'false'}
                onValueChange={(value) => {
                  if (value === '') {
                    setFilterRecurring(null);
                  } else {
                    setFilterRecurring(value === 'true');
                  }
                }}
                options={[
                  { label: 'All', value: '' },
                  { label: 'From Recurring', value: 'true' },
                  { label: 'One-time Only', value: 'false' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Sort</Text>
              <ThemeAwarePicker
                selectedValue={sortBy}
                onValueChange={(value) => setSortBy(value as 'date' | 'amount' | 'category')}
                options={[
                  { label: 'Date', value: 'date' },
                  { label: 'Amount', value: 'amount' },
                  { label: 'Category', value: 'category' },
                ]}
              />
              <TouchableOpacity
                style={[styles.sortOrderButton, { backgroundColor: colors.border }]}
                onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                <FontAwesome
                  name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Combined</Text>
              <TouchableOpacity
                style={[
                  styles.groupChip,
                  {
                    backgroundColor: showCombinedView ? colors.primary : colors.background,
                    borderColor: showCombinedView ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setShowCombinedView(!showCombinedView)}
              >
                <Text style={[styles.groupChipText, { color: showCombinedView ? '#fff' : colors.text }]}>
                  {showCombinedView ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.clearFiltersButton, { backgroundColor: colors.border }]}
              onPress={() => {
                setFilterCategory(null);
                setFilterPaymentMethod(null);
                setFilterTag(null);
                setFilterRecurring(null);
                setSortBy('date');
                setSortOrder('desc');
                setShowCombinedView(false);
              }}
            >
              <Text style={[styles.clearFiltersText, { color: colors.text }]}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Prev / current / next period tabs */}
        {periodMode && (
          <View style={[styles.periodNav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.periodNavArrow}
              onPress={() => setViewDate((d) => shiftPeriod(d, periodMode, -1))}
              accessibilityLabel="Previous period"
            >
              <FontAwesome name="chevron-left" size={14} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.periodTabs}>
              {tabDates.map((tabDate, index) => {
                const selected = startOfPeriod(tabDate, periodMode).getTime() === startOfPeriod(viewDate, periodMode).getTime();
                const isNow = todayPeriod && tabDate.getTime() === todayPeriod.getTime();
                return (
                  <TouchableOpacity
                    key={`${tabDate.toISOString()}-${index}`}
                    style={[
                      styles.periodTab,
                      {
                        backgroundColor: selected ? colors.primary : colors.card,
                        borderColor: isNow && !selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setViewDate(startOfPeriod(tabDate, periodMode))}
                  >
                    <Text
                      style={[styles.periodTabText, { color: selected ? '#fff' : colors.text }]}
                      numberOfLines={1}
                    >
                      {formatPeriodLabel(tabDate, periodMode, true)}
                    </Text>
                    {isNow && (
                      <Text style={[styles.periodTabNow, { color: selected ? '#fff' : colors.primary }]}>
                        Now
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.periodNavArrow}
              onPress={() => setViewDate((d) => shiftPeriod(d, periodMode, 1))}
              accessibilityLabel="Next period"
            >
              <FontAwesome name="chevron-right" size={14} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* Period summary — expand/collapse */}
        {periodMode && (
          <TouchableOpacity
            style={[styles.periodSummaryBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setPeriodExpanded((open) => !open)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ expanded: periodExpanded }}
            accessibilityLabel={`${formatPeriodLabel(viewDate, periodMode)}, ${formatCurrency(periodTotal)}, ${periodExpenses.length} expenses`}
          >
            <View style={styles.periodSummaryLeft}>
              <FontAwesome
                name={periodExpanded ? 'chevron-down' : 'chevron-right'}
                size={12}
                color={colors.textSecondary}
                style={styles.periodSummaryChevron}
              />
              <View style={styles.periodSummaryText}>
                <Text style={[styles.periodSummaryTitle, { color: colors.text }]} numberOfLines={1}>
                  {formatPeriodLabel(viewDate, periodMode)}
                </Text>
                <Text style={[styles.periodSummaryMeta, { color: colors.textSecondary }]}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>{formatCurrency(periodTotal)}</Text>
                  {' · '}
                  {periodExpenses.length} {periodExpenses.length === 1 ? 'expense' : 'expenses'}
                </Text>
              </View>
            </View>
            <Text style={[styles.periodSummaryToggle, { color: colors.primary }]}>
              {periodExpanded ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Expenses List */}
        <ScrollView style={styles.expensesList} contentContainerStyle={styles.expensesListContent}>
          {periodMode && !periodExpanded ? null : (periodMode ? periodExpenses : filteredExpenses).length === 0 ? (
            <View style={styles.centerContainer}>
              <FontAwesome name="file-text-o" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {searchQuery || hasActiveFilters
                  ? 'No expenses match your filters'
                  : periodMode
                    ? 'No expenses in this period'
                    : 'No expenses yet'}
              </Text>
            </View>
          ) : periodMode ? (
            periodExpenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                onPress={() => void openExpenseEditor(expense)}
                onDelete={() => requestDeleteExpense(expense)}
              />
            ))
          ) : showCombinedView ? (
            <>
              {recurringExpenses.filter((re) => re.is_active).length > 0 && (
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Recurring</Text>
                </View>
              )}
              {recurringExpenses
                .filter((re) => re.is_active)
                .map((recurring) => {
                  const nextDate = new Date(recurring.next_due_date);
                  nextDate.setHours(0, 0, 0, 0);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (nextDate < today) return null;

                  return (
                    <RecurringExpenseRow
                      key={`recurring-${recurring.id}`}
                      recurring={recurring}
                      dateLabel={formatOccurrenceDate(nextDate)}
                      badge={{ label: 'Upcoming', color: colors.primary }}
                      onPress={() => {
                        setEditingRecurring(recurring);
                        setShowRecurringForm(true);
                      }}
                    />
                  );
                })}

              {filteredExpenses.length > 0 && (
                <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Expenses</Text>
                </View>
              )}
              {filteredExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  onPress={() => void openExpenseEditor(expense)}
                  onDelete={() => requestDeleteExpense(expense)}
                />
              ))}
            </>
          ) : (
            filteredExpenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                onPress={() => void openExpenseEditor(expense)}
                onDelete={() => requestDeleteExpense(expense)}
              />
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  const renderCategoriesTab = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (categories.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <FontAwesome name="folder-o" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No categories yet
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Categories</Text>
        </View>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[styles.categoryCard, { backgroundColor: colors.card }]}
            onPress={() => {
              setEditingCategory(category);
              setShowCategoryForm(true);
            }}
          >
            <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
              {category.icon && (
                <FontAwesome name={category.icon as any} size={24} color="#fff" />
              )}
            </View>
            <View style={styles.categoryInfo}>
              <Text style={[styles.categoryName, { color: colors.text }]}>{category.name}</Text>
              {category.description && (
                <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
                  {category.description}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteCategory(category.id);
              }}
              style={styles.deleteButton}
            >
              <FontAwesome name="trash" size={18} color="#ef4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tags</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingTag(null);
              setShowTagForm(true);
            }}
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <FontAwesome name="plus" size={14} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {tags.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No tags yet. Create tags to categorize expenses.
            </Text>
          </View>
        ) : (
          tags.map((tag) => (
            <TouchableOpacity
              key={tag.id}
              style={[styles.tagCard, { backgroundColor: colors.card }]}
              onPress={() => {
                setEditingTag(tag);
                setShowTagForm(true);
              }}
            >
              <View style={[styles.tagColorIndicator, { backgroundColor: tag.color || colors.primary }]} />
              <View style={styles.tagInfo}>
                <Text style={[styles.tagName, { color: colors.text }]}>{tag.name}</Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteTag(tag.id);
                }}
                style={styles.deleteButton}
              >
                <FontAwesome name="trash" size={18} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    );
  };

  const renderBudgetsTab = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (budgets.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <FontAwesome name="credit-card" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No budgets set
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create a budget to track your spending
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.content}>
        {budgets.map((budget) => (
          <TouchableOpacity
            key={budget.id}
            onPress={() => {
              setEditingBudget(budget);
              setShowBudgetForm(true);
            }}
          >
            <BudgetCard budget={budget} />
            <View style={styles.budgetActions}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setEditingBudget(budget);
                  setShowBudgetForm(true);
                }}
                style={styles.budgetActionButton}
              >
                <FontAwesome name="pencil" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteBudget(budget.id);
                }}
                style={styles.budgetActionButton}
              >
                <FontAwesome name="trash" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderRecurringTab = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (recurringExpenses.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <FontAwesome name="repeat" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No recurring expenses yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create recurring expense templates for subscriptions and bills
          </Text>
        </View>
      );
    }

    // Group recurring expenses with occurrence date tracking
    const groupRecurringExpenses = (recurringList: RecurringExpense[]) => {
      if (recurringGroupBy === 'none') {
        return { 'All Recurring': recurringList.map(r => ({ recurring: r, occurrenceDate: null })) };
      }

      const grouped: Record<string, Array<{ recurring: RecurringExpense; occurrenceDate: Date | null }>> = {};

      // Parse date string without timezone conversion
      // Dates come as "YYYY-MM-DD" from the API
      const parseDateString = (dateString: string): Date => {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day); // month is 0-indexed
      };

      recurringList.forEach((recurring) => {
        // Parse start_date directly without timezone conversion
        const start = parseDateString(recurring.start_date);

        // Determine end date: use recurring.end_date if provided, otherwise end of current year
        let endDate: Date;
        if (recurring.end_date) {
          endDate = parseDateString(recurring.end_date);
        } else {
          // Default to end of current year (2026)
          endDate = new Date(2026, 11, 31); // December 31, 2026
        }

        // Generate all occurrence dates based on frequency
        const occurrences: Date[] = [];
        let currentDate = new Date(start);

        // Helper to get next date based on frequency
        const getNextDate = (date: Date, frequency: string): Date => {
          const next = new Date(date);
          if (frequency === 'daily') {
            next.setDate(next.getDate() + 1);
          } else if (frequency === 'weekly') {
            next.setDate(next.getDate() + 7);
          } else if (frequency === 'monthly') {
            next.setMonth(next.getMonth() + 1);
          } else if (frequency === 'yearly') {
            next.setFullYear(next.getFullYear() + 1);
          }
          return next;
        };

        // Generate all occurrences from start_date to end_date
        while (currentDate <= endDate) {
          occurrences.push(new Date(currentDate));
          currentDate = getNextDate(currentDate, recurring.frequency);
        }

        // Group each occurrence
        occurrences.forEach((occurrenceDate) => {
          let groupKey: string;

          if (recurringGroupBy === 'day') {
            groupKey = occurrenceDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          } else if (recurringGroupBy === 'week') {
            // Get the start of the week (Sunday)
            const weekStart = new Date(occurrenceDate);
            weekStart.setDate(occurrenceDate.getDate() - occurrenceDate.getDay());
            groupKey = `Week of ${weekStart.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}`;
          } else if (recurringGroupBy === 'month') {
            groupKey = occurrenceDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
            });
          } else if (recurringGroupBy === 'year') {
            groupKey = occurrenceDate.toLocaleDateString('en-US', {
              year: 'numeric',
            });
          } else {
            groupKey = 'All Recurring';
          }

          if (!grouped[groupKey]) {
            grouped[groupKey] = [];
          }
          // Add recurring expense with its occurrence date
          // Use a unique key to avoid duplicates within the same group
          const uniqueKey = `${recurring.id}-${occurrenceDate.getTime()}`;
          if (!grouped[groupKey].some(item => `${item.recurring.id}-${item.occurrenceDate?.getTime()}` === uniqueKey)) {
            grouped[groupKey].push({ recurring, occurrenceDate });
          }
        });
      });

      return grouped;
    };

    const groupedRecurring = groupRecurringExpenses(recurringExpenses);
    const sortedRecurringGroupKeys = Object.keys(groupedRecurring).sort((a, b) => {
      if (recurringGroupBy === 'none') return 0;
      try {
        const dateA = new Date(a.includes('Week of') ? a.replace('Week of ', '') : a);
        const dateB = new Date(b.includes('Week of') ? b.replace('Week of ', '') : b);
        return dateB.getTime() - dateA.getTime();
      } catch {
        return 0;
      }
    });

    // Helper to check if an occurrence date is the template (start_date)
    const isTemplateOccurrence = (recurring: RecurringExpense, occurrenceDate: Date | null): boolean => {
      if (!occurrenceDate) return true; // For non-grouped view, show as template
      const startDate = new Date(recurring.start_date);
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const occurrence = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate());

      // Compare based on grouping type
      if (recurringGroupBy === 'day') {
        return start.getTime() === occurrence.getTime();
      } else if (recurringGroupBy === 'week') {
        // Check if both dates are in the same week
        const startWeek = new Date(start);
        startWeek.setDate(start.getDate() - start.getDay());
        const occurrenceWeek = new Date(occurrence);
        occurrenceWeek.setDate(occurrence.getDate() - occurrence.getDay());
        return startWeek.getTime() === occurrenceWeek.getTime();
      } else if (recurringGroupBy === 'month') {
        return start.getFullYear() === occurrence.getFullYear() && start.getMonth() === occurrence.getMonth();
      } else if (recurringGroupBy === 'year') {
        return start.getFullYear() === occurrence.getFullYear();
      }
      return true;
    };

    const sortedTemplates = [...recurringExpenses].sort((a, b) => {
      const dateA = new Date(a.next_due_date).getTime();
      const dateB = new Date(b.next_due_date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.description.localeCompare(b.description);
    });

    return (
      <ScrollView style={styles.content}>
        <View style={styles.generateButtonContainer}>
          <View style={[styles.dryRunRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dryRunTextWrap}>
              <Text style={[styles.dryRunLabel, { color: colors.text }]}>Dry run</Text>
              <Text style={[styles.dryRunHint, { color: colors.textSecondary }]}>
                Preview only — nothing is created
              </Text>
            </View>
            <Switch
              value={generateDryRun}
              onValueChange={setGenerateDryRun}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity
            style={[
              styles.generateButton,
              { backgroundColor: generateDryRun ? colors.textSecondary : colors.primary },
            ]}
            onPress={handleGenerateExpenses}
            disabled={creating}
          >
            <FontAwesome name={generateDryRun ? 'eye' : 'magic'} size={18} color="#fff" />
            <Text style={styles.generateButtonText}>
              {creating
                ? generateDryRun
                  ? 'Previewing...'
                  : 'Generating...'
                : generateDryRun
                  ? 'Preview generation'
                  : 'Generate Expenses'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Group By Selector */}
        <View style={[styles.groupByContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.groupByLabel, { color: colors.text }]}>Group By:</Text>
          <ThemeAwarePicker
            selectedValue={recurringGroupBy}
            onValueChange={(value) => {
              setRecurringGroupBy(value as 'none' | 'day' | 'week' | 'month' | 'year');
              // Reset expanded groups when changing group by
              setExpandedRecurringGroups(new Set());
            }}
            options={[
              { label: 'None', value: 'none' },
              { label: 'Day', value: 'day' },
              { label: 'Week', value: 'week' },
              { label: 'Month', value: 'month' },
              { label: 'Year', value: 'year' },
            ]}
          />
        </View>

        {/* Expand/Collapse All Button */}
        {recurringGroupBy !== 'none' && recurringExpenses.length > 0 && (
          <View style={[styles.expandCollapseContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.expandCollapseButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => {
                if (sortedRecurringGroupKeys.every(key => expandedRecurringGroups.has(key))) {
                  setExpandedRecurringGroups(new Set());
                } else {
                  setExpandedRecurringGroups(new Set(sortedRecurringGroupKeys));
                }
              }}
            >
              <FontAwesome
                name={sortedRecurringGroupKeys.every(key => expandedRecurringGroups.has(key)) ? 'compress' : 'expand'}
                size={12}
                color={colors.text}
              />
              <Text style={[styles.expandCollapseText, { color: colors.text }]}>
                {sortedRecurringGroupKeys.every(key => expandedRecurringGroups.has(key)) ? 'Collapse All' : 'Expand All'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {recurringGroupBy !== 'none' ? (
          // Grouped view with accordions
          sortedRecurringGroupKeys.map((groupKey) => {
            const groupRecurringList = groupedRecurring[groupKey];
            const groupTotal = groupRecurringList.reduce((sum, item) => sum + item.recurring.amount, 0);
            const isExpanded = expandedRecurringGroups.has(groupKey);

            return (
              <View key={groupKey} style={styles.groupContainer}>
                <TouchableOpacity
                  style={[styles.groupHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
                  onPress={() => {
                    const newExpanded = new Set(expandedRecurringGroups);
                    if (isExpanded) {
                      newExpanded.delete(groupKey);
                    } else {
                      newExpanded.add(groupKey);
                    }
                    setExpandedRecurringGroups(newExpanded);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.groupHeaderContent}>
                    <FontAwesome
                      name={isExpanded ? 'chevron-down' : 'chevron-right'}
                      size={14}
                      color={colors.textSecondary}
                      style={styles.groupChevron}
                    />
                    <Text style={[styles.groupTitle, { color: colors.text }]}>{groupKey}</Text>
                  </View>
                  <View style={styles.groupHeaderRight}>
                    <Text style={[styles.groupCount, { color: colors.textSecondary }]}>
                      {groupRecurringList.length} {groupRecurringList.length === 1 ? 'item' : 'items'}
                    </Text>
                    <Text style={[styles.groupTotal, { color: colors.primary }]}>
                      {formatCurrency(groupTotal)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.groupContent}>
                    {groupRecurringList.map((item, index) => {
                      const { recurring, occurrenceDate } = item;
                      const isTemplate = isTemplateOccurrence(recurring, occurrenceDate);
                      return (
                        <RecurringExpenseRow
                          key={`${recurring.id}-${occurrenceDate?.getTime() || index}`}
                          recurring={recurring}
                          dateLabel={occurrenceDate ? formatOccurrenceDate(occurrenceDate) : undefined}
                          badge={
                            isTemplate
                              ? { label: 'Template', color: '#8b5cf6' }
                              : { label: 'Generated', color: '#10b981' }
                          }
                          onPress={() => {
                            setEditingRecurring(recurring);
                            setShowRecurringForm(true);
                          }}
                          onDelete={() => handleDeleteRecurringExpense(recurring.id)}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          // Non-grouped view - one row per template, sorted by next due date
          sortedTemplates.map((recurring) => {
            return (
              <RecurringExpenseRow
                key={recurring.id}
                recurring={recurring}
                onPress={() => {
                  setEditingRecurring(recurring);
                  setShowRecurringForm(true);
                }}
                onDelete={() => handleDeleteRecurringExpense(recurring.id)}
              />
            );
          })
        )}
      </ScrollView>
    );
  };

  const renderReportsTab = () => {
    return (
      <View style={styles.centerContainer}>
        <FontAwesome name="bar-chart" size={64} color={colors.textSecondary} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Reports coming soon
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'expenses':
        return renderExpensesTab();
      case 'categories':
        return renderCategoriesTab();
      case 'budgets':
        return renderBudgetsTab();
      case 'recurring':
        return renderRecurringTab();
      case 'reports':
        return renderReportsTab();
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar title="Expense Tracker" />
      <View style={[styles.tabContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'expenses' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}
            onPress={() => setActiveTab('expenses')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="file-text-o"
              size={16}
              color={activeTab === 'expenses' ? '#fff' : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'expenses' ? '#fff' : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Expenses
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'categories' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}
            onPress={() => setActiveTab('categories')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="folder-o"
              size={16}
              color={activeTab === 'categories' ? '#fff' : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'categories' ? '#fff' : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Categories
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'budgets' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}
            onPress={() => setActiveTab('budgets')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="credit-card"
              size={16}
              color={activeTab === 'budgets' ? '#fff' : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'budgets' ? '#fff' : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Budgets
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'recurring' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}
            onPress={() => setActiveTab('recurring')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="repeat"
              size={16}
              color={activeTab === 'recurring' ? '#fff' : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'recurring' ? '#fff' : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Recurring
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'reports' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}
            onPress={() => setActiveTab('reports')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="bar-chart"
              size={16}
              color={activeTab === 'reports' ? '#fff' : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'reports' ? '#fff' : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Reports
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      {renderContent()}

      {/* Floating Action Button (non-expenses tabs) */}
      {selectedFamily && (activeTab === 'categories' || activeTab === 'budgets' || activeTab === 'recurring') && (
        <TooltipButton
          tooltip={
            activeTab === 'categories'
              ? 'Add category'
              : activeTab === 'budgets'
                ? 'Add budget'
                : 'Add recurring expense'
          }
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (activeTab === 'categories') {
              setEditingCategory(null);
              setShowCategoryForm(true);
            } else if (activeTab === 'budgets') {
              setEditingBudget(null);
              setShowBudgetForm(true);
            } else if (activeTab === 'recurring') {
              setEditingRecurring(null);
              setShowRecurringForm(true);
            }
          }}
        >
          <FontAwesome name="plus" size={24} color="#fff" />
        </TooltipButton>
      )}

      {/* Expense Form */}
      {selectedFamily && showExpenseForm && (
        <ExpenseForm
          key={expenseFormSessionKey}
          visible={showExpenseForm}
          expense={editingExpense}
          categories={categories}
          tags={tags}
          familyId={selectedFamily.id}
          onSubmit={handleExpenseFormSubmit}
          onCancel={closeExpenseForm}
          loading={creating}
        />
      )}

      {selectedFamily && (
        <ReceiptScanWizard
          visible={showReceiptWizard}
          familyId={selectedFamily.id}
          categories={categories}
          onClose={() => setShowReceiptWizard(false)}
          onSaved={() => {
            void fetchData();
          }}
        />
      )}

      {/* Tag Form */}
      {selectedFamily && (
        <TagForm
          visible={showTagForm}
          tag={editingTag}
          familyId={selectedFamily.id}
          onSubmit={editingTag ? handleUpdateTag : handleCreateTag}
          onCancel={() => {
            setShowTagForm(false);
            setEditingTag(null);
          }}
          loading={creating}
        />
      )}

      {/* Category Form */}
      {selectedFamily && (
        <CategoryForm
          visible={showCategoryForm}
          category={editingCategory}
          familyId={selectedFamily.id}
          onSubmit={editingCategory ? handleUpdateCategory : handleCreateCategory}
          onCancel={() => {
            setShowCategoryForm(false);
            setEditingCategory(null);
          }}
          loading={creating}
        />
      )}

      {/* Budget Form */}
      {selectedFamily && (
        <BudgetForm
          visible={showBudgetForm}
          budget={editingBudget}
          categories={categories}
          familyId={selectedFamily.id}
          onSubmit={editingBudget ? handleUpdateBudget : handleCreateBudget}
          onCancel={() => {
            setShowBudgetForm(false);
            setEditingBudget(null);
          }}
          loading={creating}
        />
      )}

      {/* Recurring Expense Form */}
      {selectedFamily && (
        <RecurringExpenseForm
          visible={showRecurringForm}
          recurringExpense={editingRecurring}
          categories={categories}
          familyId={selectedFamily.id}
          onSubmit={editingRecurring ? handleUpdateRecurringExpense : handleCreateRecurringExpense}
          onCancel={() => {
            setShowRecurringForm(false);
            setEditingRecurring(null);
          }}
          loading={creating}
        />
      )}

      <AlertModal
        visible={!!expensePendingDelete}
        title="Delete expense?"
        message={
          expensePendingDelete
            ? `Delete “${expensePendingDelete.description}” (${formatCurrency(expensePendingDelete.amount)})? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onClose={() => setExpensePendingDelete(null)}
        onConfirm={() => {
          if (expensePendingDelete) {
            void handleDeleteExpense(expensePendingDelete.id);
          }
        }}
      />

      <AlertModal
        visible={!!error}
        title="Error"
        message={error}
        onClose={() => setError('')}
      />

      <Modal
        visible={!!generateResult}
        transparent
        animationType="slide"
        onRequestClose={() => setGenerateResult(null)}
      >
        <View style={styles.generateResultOverlay}>
          <View style={[styles.generateResultSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.generateResultHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.generateResultTitle, { color: colors.text }]}>
                  {generateResult?.dry_run ? 'Generation preview' : 'Generation complete'}
                </Text>
                <Text style={[styles.generateResultSubtitle, { color: colors.textSecondary }]}>
                  {generateResult?.message}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setGenerateResult(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <FontAwesome name="times" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.generateResultSummary, { borderBottomColor: colors.border }]}>
              <Text style={[styles.generateResultStat, { color: colors.text }]}>
                {generateResult?.dry_run ? 'Would create' : 'Created'}:{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {generateResult?.generated_count ?? 0}
                </Text>
              </Text>
              <Text style={[styles.generateResultStat, { color: colors.text }]}>
                Skipped:{' '}
                <Text style={{ fontWeight: '700' }}>{generateResult?.skipped_count ?? 0}</Text>
              </Text>
              <Text style={[styles.generateResultStat, { color: colors.text }]}>
                Templates: <Text style={{ fontWeight: '700' }}>{generateResult?.recurring_count ?? 0}</Text>
              </Text>
            </View>

            <ScrollView style={styles.generateResultList} contentContainerStyle={{ paddingBottom: 24 }}>
              {(generateResult?.errors || []).map((err, idx) => (
                <Text key={`err-${idx}`} style={[styles.generateResultError, { color: '#ef4444' }]}>
                  {err}
                </Text>
              ))}

              {(generateResult?.by_recurring || []).map((group) => (
                <View key={group.recurring_id} style={styles.generateResultGroup}>
                  <Text style={[styles.generateResultGroupTitle, { color: colors.text }]}>
                    {group.description}
                  </Text>
                  <Text style={[styles.generateResultGroupMeta, { color: colors.textSecondary }]}>
                    {group.category_name || 'No category'} · {group.frequency} · {group.generation_start} → {group.generation_end}
                  </Text>
                  <Text style={[styles.generateResultGroupMeta, { color: colors.textSecondary }]}>
                    {generateResult?.dry_run ? 'Would create' : 'Created'} {group.generated_count}
                    {' · '}Skipped {group.skipped_count}
                  </Text>

                  {group.created.map((item, idx) => (
                    <View
                      key={`c-${group.recurring_id}-${item.expense_date}-${idx}`}
                      style={[styles.generateResultRow, { borderBottomColor: colors.border }]}
                    >
                      <FontAwesome
                        name={item.action === 'would_create' ? 'eye' : 'plus-circle'}
                        size={14}
                        color={colors.primary}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.generateResultRowTitle, { color: colors.text }]}>
                          {item.expense_date} · {formatCurrency(item.amount)}
                        </Text>
                        <Text style={[styles.generateResultRowMeta, { color: colors.textSecondary }]}>
                          {item.action === 'would_create' ? 'Would create' : 'Created'}
                          {item.expense_id ? ` #${item.expense_id}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {group.skipped.map((item, idx) => (
                    <View
                      key={`s-${group.recurring_id}-${item.expense_date}-${idx}`}
                      style={[styles.generateResultRow, { borderBottomColor: colors.border }]}
                    >
                      <FontAwesome name="minus-circle" size={14} color={colors.textSecondary} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.generateResultRowTitle, { color: colors.textSecondary }]}>
                          {item.expense_date} · {formatCurrency(item.amount)}
                        </Text>
                        <Text style={[styles.generateResultRowMeta, { color: colors.textSecondary }]}>
                          Skipped — {item.reason || 'already exists'}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {group.generated_count === 0 && group.skipped_count === 0 && (
                    <Text style={[styles.generateResultRowMeta, { color: colors.textSecondary, marginTop: 4 }]}>
                      Nothing to generate in range
                    </Text>
                  )}
                </View>
              ))}

              {(generateResult?.by_recurring || []).length === 0 && (
                <Text style={[styles.generateResultRowMeta, { color: colors.textSecondary, padding: 16 }]}>
                  No active recurring templates.
                </Text>
              )}
            </ScrollView>

            <View style={[styles.generateResultFooter, { borderTopColor: colors.border }]}>
              {generateResult?.dry_run && (generateResult.generated_count ?? 0) > 0 && (
                <TouchableOpacity
                  style={[styles.generateButton, { backgroundColor: colors.primary, flex: 1 }]}
                  onPress={() => {
                    setGenerateResult(null);
                    setGenerateDryRun(false);
                    // Run for real on next tick after closing modal
                    setTimeout(() => {
                      void (async () => {
                        if (!selectedFamily) return;
                        setCreating(true);
                        try {
                          const result = await expenseService.generateExpenses(selectedFamily.id, {
                            dryRun: false,
                          });
                          setGenerateResult(result);
                          await fetchData();
                        } catch (err: any) {
                          setError(err.message || 'Failed to generate expenses');
                        } finally {
                          setCreating(false);
                        }
                      })();
                    }, 100);
                  }}
                  disabled={creating}
                >
                  <FontAwesome name="magic" size={16} color="#fff" />
                  <Text style={styles.generateButtonText}>Run for real</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.generateResultCloseBtn,
                  { backgroundColor: colors.border, flex: generateResult?.dry_run && (generateResult.generated_count ?? 0) > 0 ? 0.6 : 1 },
                ]}
                onPress={() => setGenerateResult(null)}
              >
                <Text style={[styles.generateResultCloseText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    borderBottomWidth: 1,
  },
  tabsScrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 100,
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  expenseCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  expenseDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expenseCategory: {
    fontSize: 14,
  },
  expenseDate: {
    fontSize: 14,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoryDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  budgetCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetCategory: {
    fontSize: 16,
    fontWeight: '600',
  },
  budgetAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  budgetPercentage: {
    fontSize: 12,
  },
  budgetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  budgetActionButton: {
    padding: 8,
  },
  generateButtonContainer: {
    marginBottom: 16,
    gap: 10,
  },
  dryRunRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  dryRunTextWrap: {
    flex: 1,
    gap: 2,
  },
  dryRunLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  dryRunHint: {
    fontSize: 12,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  generateResultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  generateResultSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  generateResultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  generateResultTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  generateResultSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  generateResultSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  generateResultStat: {
    fontSize: 13,
  },
  generateResultList: {
    paddingHorizontal: 16,
  },
  generateResultError: {
    fontSize: 13,
    marginTop: 10,
  },
  generateResultGroup: {
    marginTop: 14,
    marginBottom: 4,
  },
  generateResultGroupTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  generateResultGroupMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  generateResultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  generateResultRowTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  generateResultRowMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  generateResultFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  generateResultCloseBtn: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  generateResultCloseText: {
    fontSize: 15,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  listToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 8,
    minHeight: 44,
  },
  listToolbarLeft: {
    flexShrink: 1,
    minWidth: 0,
  },
  listToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  toolbarIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarIconBtnPrimary: {
    borderWidth: 0,
  },
  expandCollapseContainer: {
    padding: 8,
    borderBottomWidth: 1,
  },
  expandCollapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
    alignSelf: 'flex-start',
  },
  expandCollapseText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptySection: {
    padding: 16,
    alignItems: 'center',
  },
  tagCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tagColorIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
  },
  tagInfo: {
    flex: 1,
  },
  tagName: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchFilterBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIconBtnPrimary: {
    borderWidth: 0,
  },
  groupChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  groupChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  periodNavArrow: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabs: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  periodTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
  },
  periodTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  periodTabNow: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  periodSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  periodSummaryLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
  },
  periodSummaryChevron: {
    marginTop: 1,
  },
  periodSummaryText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  periodSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  periodSummaryMeta: {
    fontSize: 12,
  },
  periodSummaryToggle: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    minHeight: 32,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
  },
  clearButton: {
    padding: 4,
  },
  groupByButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupByPickerPanel: {
    padding: 16,
    borderBottomWidth: 1,
  },
  filterPanel: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  groupByPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  groupByOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupByOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  groupByOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 72,
  },
  sortOrderButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  clearFiltersButton: {
    padding: 8,
    borderRadius: 7,
    alignItems: 'center',
    marginTop: 4,
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: '600',
  },
  expensesList: {
    flex: 1,
  },
  expensesListContent: {
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
  groupContainer: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    marginBottom: 0,
  },
  groupHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupChevron: {
    marginRight: 8,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupCount: {
    fontSize: 12,
  },
  groupTotal: {
    fontSize: 16,
    fontWeight: '700',
  },
  groupContent: {
    marginBottom: 8,
  },
  groupByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  groupByLabel: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 80,
  },
  generatedExpensesContainer: {
    marginLeft: 16,
    marginTop: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
  },
});
