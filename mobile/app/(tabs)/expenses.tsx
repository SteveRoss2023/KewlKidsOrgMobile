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
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import expenseService from '../../services/expenseService';
import { Expense, ExpenseCategory, Budget, RecurringExpense, ExpenseTag, PaymentMethod, CreateExpenseData, CreateExpenseCategoryData, CreateBudgetData, UpdateBudgetData, CreateRecurringExpenseData, UpdateRecurringExpenseData, CreateExpenseTagData, UpdateExpenseTagData } from '../../types/expenses';
import AlertModal from '../../components/AlertModal';
import ExpenseForm from '../../components/expenses/ExpenseForm';
import CategoryForm from '../../components/expenses/CategoryForm';
import BudgetForm from '../../components/expenses/BudgetForm';
import RecurringExpenseForm from '../../components/expenses/RecurringExpenseForm';
import TagForm from '../../components/expenses/TagForm';
import ExpenseCard from '../../components/expenses/ExpenseCard';
import BudgetCard from '../../components/expenses/BudgetCard';
import ThemeAwarePicker from '../../components/lists/ThemeAwarePicker';

type ActiveTab = 'expenses' | 'categories' | 'budgets' | 'recurring' | 'reports';

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
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [editingTag, setEditingTag] = useState<ExpenseTag | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<PaymentMethod | null>(null);
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [filterRecurring, setFilterRecurring] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showCombinedView, setShowCombinedView] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'day' | 'week' | 'month' | 'year'>('none');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRecurringGroups, setExpandedRecurringGroups] = useState<Set<string>>(new Set());

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

  const handleCreateExpense = async (data: CreateExpenseData) => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      const newExpense = await expenseService.createExpense(data);
      // Keep form open if user might want to upload receipt
      // User can close manually or we can add a "Done" button
      setEditingExpense(newExpense);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create expense');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateExpense = async (data: any) => {
    if (!editingExpense) return;

    setCreating(true);
    try {
      await expenseService.updateExpense(editingExpense.id, data);
      setShowExpenseForm(false);
      setEditingExpense(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update expense');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!selectedFamily) return;

    try {
      await expenseService.deleteExpense(expenseId);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete expense');
    }
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
      const result = await expenseService.generateExpenses(selectedFamily.id);
      console.log('Generate expenses result:', result);
      const message = result.generated_count > 0
        ? `Generated ${result.generated_count} expenses from recurring templates`
        : `No new expenses generated. ${result.errors ? result.errors.join('; ') : 'All expenses may already exist.'}`;
      setError(message);
      // Refresh all data to show newly generated expenses
      await fetchData();
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

    // Group expenses
    const groupExpenses = (expenses: Expense[]) => {
      if (groupBy === 'none') {
        return { 'All Expenses': expenses };
      }

      const grouped: Record<string, Expense[]> = {};

      // Parse date without timezone conversion to avoid day shifts
      // expense.expense_date comes as "YYYY-MM-DD" from the API
      const parseDate = (dateString: string): Date => {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day); // month is 0-indexed
      };

      expenses.forEach((expense) => {
        const date = parseDate(expense.expense_date);
        let groupKey: string;

        if (groupBy === 'day') {
          groupKey = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        } else if (groupBy === 'week') {
          // Get the start of the week (Sunday)
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          groupKey = `Week of ${weekStart.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}`;
        } else if (groupBy === 'month') {
          groupKey = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
          });
        } else if (groupBy === 'year') {
          groupKey = date.toLocaleDateString('en-US', {
            year: 'numeric',
          });
        } else {
          groupKey = 'All Expenses';
        }

        if (!grouped[groupKey]) {
          grouped[groupKey] = [];
        }
        grouped[groupKey].push(expense);
      });

      return grouped;
    };

    const groupedExpenses = groupExpenses(filteredExpenses);
    const sortedGroupKeys = Object.keys(groupedExpenses).sort((a, b) => {
      if (groupBy === 'none') return 0;
      // Sort groups by date (newest first)
      try {
        const dateA = new Date(a.includes('Week of') ? a.replace('Week of ', '') : a);
        const dateB = new Date(b.includes('Week of') ? b.replace('Week of ', '') : b);
        return dateB.getTime() - dateA.getTime();
      } catch {
        return 0;
      }
    });

    return (
      <View style={styles.content}>
        {/* Search and Filter Bar */}
        <View style={[styles.searchFilterBar, { backgroundColor: colors.card }]}>
          <View style={[styles.searchInputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <FontAwesome name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search expenses..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <FontAwesome name="times" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TooltipButton
            tooltip="Combined View"
            style={[styles.viewToggleButton, { backgroundColor: showCombinedView ? colors.primary : colors.border }]}
            onPress={() => setShowCombinedView(!showCombinedView)}
          >
            <FontAwesome name="list" size={16} color={showCombinedView ? '#fff' : colors.text} />
          </TooltipButton>
          <TooltipButton
            tooltip="Filters"
            style={[styles.filterButton, { backgroundColor: showFilters ? colors.primary : colors.border }]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <FontAwesome name="filter" size={16} color={showFilters ? '#fff' : colors.text} />
          </TooltipButton>
        </View>

        {/* Group By Selector - Always Visible */}
        <View style={[styles.groupByContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.groupByLabel, { color: colors.text }]}>Group By:</Text>
          <ThemeAwarePicker
            selectedValue={groupBy}
            onValueChange={(value) => {
              setGroupBy(value as 'none' | 'day' | 'week' | 'month' | 'year');
              // Reset expanded groups when changing group by
              setExpandedGroups(new Set());
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

        {/* Filter Panel */}
        {showFilters && (
          <View style={[styles.filterPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Category:</Text>
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
              <Text style={[styles.filterLabel, { color: colors.text }]}>Payment Method:</Text>
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
              <Text style={[styles.filterLabel, { color: colors.text }]}>Tag:</Text>
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
              <Text style={[styles.filterLabel, { color: colors.text }]}>Recurring:</Text>
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
              <Text style={[styles.filterLabel, { color: colors.text }]}>Sort By:</Text>
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
                  size={14}
                  color={colors.text}
                />
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
              }}
            >
              <Text style={[styles.clearFiltersText, { color: colors.text }]}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Expand/Collapse All Button */}
        {groupBy !== 'none' && filteredExpenses.length > 0 && (
          <View style={[styles.expandCollapseContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.expandCollapseButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => {
                if (sortedGroupKeys.every(key => expandedGroups.has(key))) {
                  setExpandedGroups(new Set());
                } else {
                  setExpandedGroups(new Set(sortedGroupKeys));
                }
              }}
            >
              <FontAwesome
                name={sortedGroupKeys.every(key => expandedGroups.has(key)) ? 'compress' : 'expand'}
                size={12}
                color={colors.text}
              />
              <Text style={[styles.expandCollapseText, { color: colors.text }]}>
                {sortedGroupKeys.every(key => expandedGroups.has(key)) ? 'Collapse All' : 'Expand All'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Expenses List */}
        <ScrollView style={styles.expensesList}>
          {filteredExpenses.length === 0 ? (
            <View style={styles.centerContainer}>
              <FontAwesome name="file-text-o" size={64} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {searchQuery || filterCategory || filterPaymentMethod || filterTag || filterRecurring
                  ? 'No expenses match your filters'
                  : 'No expenses yet'}
              </Text>
            </View>
          ) : groupBy !== 'none' ? (
            // Grouped view with accordions
            sortedGroupKeys.map((groupKey) => {
              const groupExpensesList = groupedExpenses[groupKey];
              const groupTotal = groupExpensesList.reduce((sum, exp) => sum + exp.amount, 0);
              const isExpanded = expandedGroups.has(groupKey);

              return (
                <View key={groupKey} style={styles.groupContainer}>
                  <TouchableOpacity
                    style={[styles.groupHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
                    onPress={() => {
                      const newExpanded = new Set(expandedGroups);
                      if (isExpanded) {
                        newExpanded.delete(groupKey);
                      } else {
                        newExpanded.add(groupKey);
                      }
                      setExpandedGroups(newExpanded);
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
                        {groupExpensesList.length} {groupExpensesList.length === 1 ? 'expense' : 'expenses'}
                      </Text>
                      <Text style={[styles.groupTotal, { color: colors.primary }]}>
                        ${groupTotal.toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.groupContent}>
                      {groupExpensesList.map((expense) => (
                        <ExpenseCard
                          key={expense.id}
                          expense={expense}
                          onEdit={() => {
                            setEditingExpense(expense);
                            setShowExpenseForm(true);
                          }}
                          onDelete={() => handleDeleteExpense(expense.id)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          ) : showCombinedView ? (
            <>
              {/* Upcoming Recurring Expenses */}
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
                  const isUpcoming = nextDate >= today;

                  if (!isUpcoming) return null;

                  return (
                    <TouchableOpacity
                      key={`recurring-${recurring.id}`}
                      style={[styles.combinedCard, { backgroundColor: colors.card, borderLeftColor: colors.primary, borderLeftWidth: 4 }]}
                      onPress={() => {
                        setEditingRecurring(recurring);
                        setShowRecurringForm(true);
                      }}
                    >
                      <View style={styles.combinedCardHeader}>
                        <View style={styles.combinedCardInfo}>
                          <Text style={[styles.combinedCardDescription, { color: colors.text }]}>
                            {recurring.description}
                          </Text>
                          <View style={[styles.recurringBadge, { backgroundColor: colors.primary }]}>
                            <FontAwesome name="repeat" size={10} color="#fff" />
                            <Text style={styles.recurringBadgeText}>Upcoming</Text>
                          </View>
                        </View>
                        <Text style={[styles.combinedCardAmount, { color: colors.primary }]}>
                          ${recurring.amount.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.combinedCardDetails}>
                        <View style={styles.combinedDetailRow}>
                          <FontAwesome name="folder-o" size={14} color={colors.textSecondary} />
                          <Text style={[styles.combinedDetailText, { color: colors.textSecondary }]}>
                            {recurring.category_name}
                          </Text>
                        </View>
                        <View style={styles.combinedDetailRow}>
                          <FontAwesome name="calendar" size={14} color={colors.textSecondary} />
                          <Text style={[styles.combinedDetailText, { color: colors.textSecondary }]}>
                            Due: {nextDate.toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.combinedDetailRow}>
                          <FontAwesome name="repeat" size={14} color={colors.textSecondary} />
                          <Text style={[styles.combinedDetailText, { color: colors.textSecondary }]}>
                            {recurring.frequency.charAt(0).toUpperCase() + recurring.frequency.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}

              {/* Actual Expenses */}
              {filteredExpenses.length > 0 && (
                <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Expenses</Text>
                </View>
              )}
              {filteredExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  onEdit={() => {
                    setEditingExpense(expense);
                    setShowExpenseForm(true);
                  }}
                  onDelete={() => handleDeleteExpense(expense.id)}
                />
              ))}
            </>
          ) : (
            filteredExpenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                onEdit={() => {
                  setEditingExpense(expense);
                  setShowExpenseForm(true);
                }}
                onDelete={() => handleDeleteExpense(expense.id)}
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
      if (groupBy === 'none') {
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

          if (groupBy === 'day') {
            groupKey = occurrenceDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          } else if (groupBy === 'week') {
            // Get the start of the week (Sunday)
            const weekStart = new Date(occurrenceDate);
            weekStart.setDate(occurrenceDate.getDate() - occurrenceDate.getDay());
            groupKey = `Week of ${weekStart.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}`;
          } else if (groupBy === 'month') {
            groupKey = occurrenceDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
            });
          } else if (groupBy === 'year') {
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
      if (groupBy === 'none') return 0;
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
      if (groupBy === 'day') {
        return start.getTime() === occurrence.getTime();
      } else if (groupBy === 'week') {
        // Check if both dates are in the same week
        const startWeek = new Date(start);
        startWeek.setDate(start.getDate() - start.getDay());
        const occurrenceWeek = new Date(occurrence);
        occurrenceWeek.setDate(occurrence.getDate() - occurrence.getDay());
        return startWeek.getTime() === occurrenceWeek.getTime();
      } else if (groupBy === 'month') {
        return start.getFullYear() === occurrence.getFullYear() && start.getMonth() === occurrence.getMonth();
      } else if (groupBy === 'year') {
        return start.getFullYear() === occurrence.getFullYear();
      }
      return true;
    };

    return (
      <ScrollView style={styles.content}>
        <View style={styles.generateButtonContainer}>
          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.primary }]}
            onPress={handleGenerateExpenses}
            disabled={creating}
          >
            <FontAwesome name="magic" size={18} color="#fff" />
            <Text style={styles.generateButtonText}>
              {creating ? 'Generating...' : 'Generate Expenses'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Group By Selector */}
        <View style={[styles.groupByContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.groupByLabel, { color: colors.text }]}>Group By:</Text>
          <ThemeAwarePicker
            selectedValue={groupBy}
            onValueChange={(value) => {
              setGroupBy(value as 'none' | 'day' | 'week' | 'month' | 'year');
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
        {groupBy !== 'none' && recurringExpenses.length > 0 && (
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

        {groupBy !== 'none' ? (
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
                      ${groupTotal.toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.groupContent}>
                    {groupRecurringList.map((item, index) => {
                      const { recurring, occurrenceDate } = item;
                      const isTemplate = isTemplateOccurrence(recurring, occurrenceDate);
                      return (
                        <TouchableOpacity
                          key={`${recurring.id}-${occurrenceDate?.getTime() || index}`}
                          style={[styles.recurringCard, { backgroundColor: colors.card }]}
                          onPress={() => {
                            setEditingRecurring(recurring);
                            setShowRecurringForm(true);
                          }}
                        >
                          <View style={styles.recurringHeader}>
                            <View style={styles.recurringInfo}>
                              <View style={styles.recurringDescriptionContainer}>
                                <Text style={[styles.recurringDescription, { color: colors.text }]}>
                                  {recurring.description}
                                </Text>
                                {isTemplate ? (
                                  <View style={[styles.templateBadge, { backgroundColor: '#8b5cf6' }]}>
                                    <FontAwesome name="file-text-o" size={10} color="#fff" />
                                    <Text style={styles.templateBadgeText}>Template</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.templateBadge, { backgroundColor: '#10b981' }]}>
                                    <FontAwesome name="magic" size={10} color="#fff" />
                                    <Text style={styles.templateBadgeText}>Generated</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.recurringAmount, { color: colors.primary }]}>
                                ${recurring.amount.toFixed(2)}
                              </Text>
                            </View>
                            <View style={[styles.recurringStatus, { backgroundColor: recurring.is_active ? '#10b981' : '#6b7280' }]}>
                              <Text style={styles.recurringStatusText}>
                                {recurring.is_active ? 'Active' : 'Inactive'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.recurringDetails}>
                            <View style={styles.recurringDetailRow}>
                              <FontAwesome name="folder-o" size={14} color={colors.textSecondary} />
                              <Text style={[styles.recurringDetailText, { color: colors.textSecondary }]}>
                                {recurring.category_name}
                              </Text>
                            </View>
                            <View style={styles.recurringDetailRow}>
                              <FontAwesome name="repeat" size={14} color={colors.textSecondary} />
                              <Text style={[styles.recurringDetailText, { color: colors.textSecondary }]}>
                                {recurring.frequency.charAt(0).toUpperCase() + recurring.frequency.slice(1)}
                              </Text>
                            </View>
                            <View style={styles.recurringDetailRow}>
                              <FontAwesome name="calendar" size={14} color={colors.textSecondary} />
                              <Text style={[styles.recurringDetailText, { color: colors.textSecondary }]}>
                                {occurrenceDate ? occurrenceDate.toLocaleDateString() : `Next: ${new Date(recurring.next_due_date).toLocaleDateString()}`}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.recurringActions}>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                setEditingRecurring(recurring);
                                setShowRecurringForm(true);
                              }}
                              style={styles.recurringActionButton}
                            >
                              <FontAwesome name="pencil" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteRecurringExpense(recurring.id);
                              }}
                              style={styles.recurringActionButton}
                            >
                              <FontAwesome name="trash" size={18} color="#ef4444" />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          // Non-grouped view - show only the template (start month)
          recurringExpenses.map((recurring) => {
            return (
              <TouchableOpacity
                key={recurring.id}
                style={[styles.recurringCard, { backgroundColor: colors.card }]}
                onPress={() => {
                  setEditingRecurring(recurring);
                  setShowRecurringForm(true);
                }}
              >
                <View style={styles.recurringHeader}>
                  <View style={styles.recurringInfo}>
                    <View style={styles.recurringDescriptionContainer}>
                      <Text style={[styles.recurringDescription, { color: colors.text }]}>
                        {recurring.description}
                      </Text>
                      <View style={[styles.templateBadge, { backgroundColor: '#8b5cf6' }]}>
                        <FontAwesome name="file-text-o" size={10} color="#fff" />
                        <Text style={styles.templateBadgeText}>Template</Text>
                      </View>
                    </View>
                    <Text style={[styles.recurringAmount, { color: colors.primary }]}>
                      ${recurring.amount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.recurringStatus, { backgroundColor: recurring.is_active ? '#10b981' : '#6b7280' }]}>
                    <Text style={styles.recurringStatusText}>
                      {recurring.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
                <View style={styles.recurringDetails}>
                  <View style={styles.recurringDetailRow}>
                    <FontAwesome name="folder-o" size={14} color={colors.textSecondary} />
                    <Text style={[styles.recurringDetailText, { color: colors.textSecondary }]}>
                      {recurring.category_name}
                    </Text>
                  </View>
                  <View style={styles.recurringDetailRow}>
                    <FontAwesome name="repeat" size={14} color={colors.textSecondary} />
                    <Text style={[styles.recurringDetailText, { color: colors.textSecondary }]}>
                      {recurring.frequency.charAt(0).toUpperCase() + recurring.frequency.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.recurringDetailRow}>
                    <FontAwesome name="calendar" size={14} color={colors.textSecondary} />
                    <Text style={[styles.recurringDetailText, { color: colors.textSecondary }]}>
                      Next: {new Date(recurring.next_due_date).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.recurringActions}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setEditingRecurring(recurring);
                      setShowRecurringForm(true);
                    }}
                    style={styles.recurringActionButton}
                  >
                    <FontAwesome name="pencil" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteRecurringExpense(recurring.id);
                    }}
                    style={styles.recurringActionButton}
                  >
                    <FontAwesome name="trash" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
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

      {/* Floating Action Button */}
      {selectedFamily && (activeTab === 'expenses' || activeTab === 'categories' || activeTab === 'budgets' || activeTab === 'recurring') && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (activeTab === 'expenses') {
              setEditingExpense(null);
              setShowExpenseForm(true);
            } else if (activeTab === 'categories') {
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
        </TouchableOpacity>
      )}

      {/* Expense Form */}
      {selectedFamily && showExpenseForm && (
        <ExpenseForm
          key={editingExpense?.id || 'new'}
          visible={showExpenseForm}
          expense={editingExpense}
          categories={categories}
          tags={tags}
          familyId={selectedFamily.id}
          onSubmit={editingExpense ? handleUpdateExpense : handleCreateExpense}
          onCancel={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
          loading={creating}
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
        visible={!!error}
        title="Error"
        message={error}
        onClose={() => setError('')}
      />
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
  recurringCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  recurringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recurringInfo: {
    flex: 1,
  },
  recurringDescriptionContainer: {
    flex: 1,
    marginBottom: 4,
  },
  recurringDescription: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  templateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  templateBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  recurringAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  recurringStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recurringStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  recurringDetails: {
    marginTop: 8,
  },
  recurringDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  recurringDetailText: {
    fontSize: 14,
    marginLeft: 8,
  },
  recurringActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  recurringActionButton: {
    padding: 8,
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
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
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
    padding: 16,
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
    marginBottom: 12,
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 100,
  },
  sortOrderButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  clearFiltersButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  clearFiltersText: {
    fontSize: 14,
    fontWeight: '600',
  },
  expensesList: {
    flex: 1,
  },
  combinedCard: {
    borderRadius: 8,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  combinedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  combinedCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  combinedCardDescription: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  combinedCardAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  combinedCardDetails: {
    marginTop: 8,
  },
  combinedDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  combinedDetailText: {
    fontSize: 14,
    marginLeft: 8,
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  recurringBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  groupContainer: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 2,
    marginBottom: 8,
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
  generatedExpensesContainer: {
    marginLeft: 16,
    marginTop: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
  },
});
