import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import expenseService from '../../services/expenseService';
import {
  Budget,
  Expense,
  ExpenseCategory,
  ExpenseTag,
  PaymentMethod,
  RecurringExpense,
  CreateExpenseData,
  UpdateExpenseData,
  CreateExpenseCategoryData,
  UpdateExpenseCategoryData,
  CreateBudgetData,
  UpdateBudgetData,
  CreateExpenseTagData,
  UpdateExpenseTagData,
} from '../../types/expenses';
import MonthBudgetCards from '../../components/expenses/MonthBudgetCards';
import BillsBudgetsHub from '../../components/expenses/BillsBudgetsHub';
import BudgetCard from '../../components/expenses/BudgetCard';
import ExpenseForm from '../../components/expenses/ExpenseForm';
import BudgetForm from '../../components/expenses/BudgetForm';
import CategoryForm from '../../components/expenses/CategoryForm';
import TagForm from '../../components/expenses/TagForm';
import ReceiptScanWizard from '../../components/expenses/ReceiptScanWizard';
import RecurringExpenseRow, {
  formatOccurrenceDate,
} from '../../components/expenses/RecurringExpenseRow';
import AlertModal from '../../components/AlertModal';
import ThemeAwarePicker from '../../components/lists/ThemeAwarePicker';
import { formatCurrency } from '../../utils/moneyInput';
import {
  PeriodMode,
  PeriodModeOrAll,
  PERIOD_OPTIONS,
  formatPeriodLabel,
  periodDateRange,
  shiftPeriod,
  startOfPeriod,
} from '../../utils/expensePeriods';

type HubTab = 'budgets' | 'expenses' | 'bills' | 'reports' | 'categories';
type SortBy = 'date' | 'amount' | 'category';
type SortOrder = 'asc' | 'desc';

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

function parseExpenseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function ExpensesHubScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { width: windowWidth } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<HubTab>('budgets');
  const [periodMode, setPeriodMode] = useState<PeriodModeOrAll>('month');
  const [viewDate, setViewDate] = useState(() => startOfPeriod(new Date(), 'month'));
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<PaymentMethod | null>(null);
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [filterRecurring, setFilterRecurring] = useState<boolean | null>(null);
  const [showCombinedView, setShowCombinedView] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const editingExpenseRef = useRef<Expense | null>(null);
  const fetchGenerationRef = useRef(0);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<ExpenseTag | null>(null);
  const [showReceiptWizard, setShowReceiptWizard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paidToggleId, setPaidToggleId] = useState<number | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<ExpenseCategory | null>(null);
  const [tagPendingDelete, setTagPendingDelete] = useState<ExpenseTag | null>(null);
  const [budgetsRefreshKey, setBudgetsRefreshKey] = useState(0);

  useEffect(() => {
    if (periodMode === 'all') {
      setShowPeriodPicker(false);
      return;
    }
    setViewDate(startOfPeriod(new Date(), periodMode));
    setShowPeriodPicker(false);
  }, [periodMode]);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selectedFamily) return;
      const soft = !!opts?.soft;
      const generation = ++fetchGenerationRef.current;
      if (!soft) setLoading(true);
      setError('');
      try {
        const range = periodDateRange(viewDate, periodMode);
        const budgetPeriod = periodMode === 'year' ? 'year' : 'month';
        const expenseFilters: { start_date?: string; end_date?: string } = {};
        if (range.start_date) expenseFilters.start_date = range.start_date;
        if (range.end_date) expenseFilters.end_date = range.end_date;

        const [cats, tagList, expList, budgetList, recurringList] = await Promise.all([
          expenseService.getCategories(selectedFamily.id),
          expenseService.getTags(selectedFamily.id),
          expenseService.getExpenses(selectedFamily.id, expenseFilters),
          expenseService.getBudgets(selectedFamily.id, true, {
            asOf: range.asOf,
            budgetPeriod,
          }),
          expenseService.getRecurringExpenses(selectedFamily.id),
        ]);

        if (generation !== fetchGenerationRef.current) return;

        setCategories(cats);
        setTags(tagList);
        setExpenses(expList);
        setBudgets(budgetList);
        setRecurringExpenses(recurringList);
      } catch (err: any) {
        if (generation !== fetchGenerationRef.current) return;
        setError(err.message || 'Failed to load');
      } finally {
        if (generation === fetchGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [selectedFamily, viewDate, periodMode]
  );

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'expenses' || activeTab === 'categories') {
        void load({
          soft: expenses.length > 0 || budgets.length > 0 || categories.length > 0,
        });
      } else if (selectedFamily && (activeTab === 'budgets' || activeTab === 'bills')) {
        void expenseService.getCategories(selectedFamily.id).then(setCategories).catch(() => {});
        void expenseService.getTags(selectedFamily.id).then(setTags).catch(() => {});
      }
    }, [selectedFamily?.id, activeTab, load])
  );

  const activePeriodMode: PeriodMode | null = periodMode === 'all' ? null : periodMode;
  const todayPeriod = activePeriodMode ? startOfPeriod(new Date(), activePeriodMode) : null;
  const onTodayPeriod = !!(
    todayPeriod &&
    activePeriodMode &&
    startOfPeriod(viewDate, activePeriodMode).getTime() === todayPeriod.getTime()
  );
  const periodLabel =
    periodMode === 'all' ? 'All expenses' : formatPeriodLabel(viewDate, periodMode);

  const filteredExpenses = useMemo(() => {
    let list = [...expenses];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (exp) =>
          exp.description.toLowerCase().includes(q) ||
          (exp.category_name && exp.category_name.toLowerCase().includes(q)) ||
          (exp.notes && exp.notes.toLowerCase().includes(q)) ||
          (exp.tag_names || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (filterCategory) {
      list = list.filter((exp) => exp.category === filterCategory);
    }
    if (filterPaymentMethod) {
      list = list.filter((exp) => exp.payment_method === filterPaymentMethod);
    }
    if (filterTag) {
      list = list.filter((exp) => exp.tags.includes(filterTag));
    }
    if (filterRecurring !== null) {
      list = filterRecurring
        ? list.filter((exp) => exp.is_recurring && exp.recurring_expense !== null)
        : list.filter((exp) => !exp.is_recurring || exp.recurring_expense === null);
    }
    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison =
          parseExpenseDate(a.expense_date).getTime() - parseExpenseDate(b.expense_date).getTime();
      } else if (sortBy === 'amount') {
        comparison = toAmt(a.amount) - toAmt(b.amount);
      } else {
        comparison = (a.category_name || '').localeCompare(b.category_name || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [
    expenses,
    searchQuery,
    filterCategory,
    filterPaymentMethod,
    filterTag,
    filterRecurring,
    sortBy,
    sortOrder,
  ]);

  const hasActiveFilters = !!(
    filterCategory ||
    filterPaymentMethod ||
    filterTag ||
    filterRecurring !== null
  );

  const periodPaid = useMemo(
    () => filteredExpenses.reduce((s, e) => s + (e.is_paid !== false ? toAmt(e.amount) : 0), 0),
    [filteredExpenses]
  );
  const periodBudgetTotal = useMemo(
    () => budgets.reduce((s, b) => s + toAmt(b.amount), 0),
    [budgets]
  );

  const expenseColumns = windowWidth < 700 ? 2 : windowWidth < 1100 ? 3 : 4;

  const closeExpenseForm = () => {
    setShowExpenseForm(false);
    editingExpenseRef.current = null;
    setEditingExpense(null);
  };

  const openExpenseEditor = async (expense: Expense) => {
    editingExpenseRef.current = expense;
    setEditingExpense(expense);
    setShowExpenseForm(true);
    try {
      const full = await expenseService.getExpense(expense.id);
      editingExpenseRef.current = full;
      setEditingExpense(full);
    } catch {
      // List payload is enough; line items may be missing
    }
  };

  const handleSaveExpense = async (
    data: CreateExpenseData | UpdateExpenseData,
    options?: { stayOpen?: boolean }
  ): Promise<Expense | void> => {
    if (!selectedFamily) return;
    setSaving(true);
    try {
      const current = editingExpenseRef.current;
      if (current) {
        await expenseService.updateExpense(current.id, data as UpdateExpenseData);
        closeExpenseForm();
        setBudgetsRefreshKey((k) => k + 1);
        await load({ soft: true });
        return;
      }

      const created = await expenseService.createExpense(data as CreateExpenseData);
      const full = await expenseService.getExpense(created.id);
      setBudgetsRefreshKey((k) => k + 1);
      await load({ soft: true });
      if (options?.stayOpen) {
        editingExpenseRef.current = full;
        setEditingExpense(full);
        return full;
      }
      closeExpenseForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save expense');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePaid = async (expense: Expense, nextPaid: boolean) => {
    setPaidToggleId(expense.id);
    try {
      const updated = await expenseService.updateExpense(expense.id, { is_paid: nextPaid });
      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err: any) {
      setError(err.message || 'Failed to update paid status');
    } finally {
      setPaidToggleId(null);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    try {
      await expenseService.deleteExpense(expense.id);
      setExpensePendingDelete(null);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to delete expense');
      setExpensePendingDelete(null);
    }
  };

  const handleSaveBudget = async (data: CreateBudgetData | UpdateBudgetData) => {
    setSaving(true);
    try {
      if (editingBudget) {
        await expenseService.updateBudget(editingBudget.id, data as UpdateBudgetData);
      } else {
        await expenseService.createBudget(data as CreateBudgetData);
      }
      setShowBudgetForm(false);
      setEditingBudget(null);
      setBudgetsRefreshKey((k) => k + 1);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async (budget: Budget) => {
    try {
      await expenseService.deleteBudget(budget.id);
      setBudgetsRefreshKey((k) => k + 1);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to delete budget');
    }
  };

  const handleSaveCategory = async (
    data: CreateExpenseCategoryData | UpdateExpenseCategoryData
  ) => {
    if (!selectedFamily) return;
    setSaving(true);
    try {
      if (editingCategory) {
        await expenseService.updateCategory(editingCategory.id, data as UpdateExpenseCategoryData);
      } else {
        await expenseService.createCategory(data as CreateExpenseCategoryData);
      }
      setShowCategoryForm(false);
      setEditingCategory(null);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTag = async (data: CreateExpenseTagData | UpdateExpenseTagData) => {
    if (!selectedFamily) return;
    setSaving(true);
    try {
      if (editingTag) {
        await expenseService.updateTag(editingTag.id, data as UpdateExpenseTagData);
      } else {
        await expenseService.createTag(data as CreateExpenseTagData);
      }
      setShowTagForm(false);
      setEditingTag(null);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category: ExpenseCategory) => {
    try {
      await expenseService.deleteCategory(category.id);
      setCategoryPendingDelete(null);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
      setCategoryPendingDelete(null);
    }
  };

  const handleDeleteTag = async (tag: ExpenseTag) => {
    try {
      await expenseService.deleteTag(tag.id);
      setTagPendingDelete(null);
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to delete tag');
      setTagPendingDelete(null);
    }
  };

  const handlePlanApplied = useCallback(() => {
    setBudgetsRefreshKey((k) => k + 1);
    if (activeTab === 'expenses' || activeTab === 'categories') {
      void load({ soft: true });
    }
  }, [activeTab, load]);

  const upcomingRecurring = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return recurringExpenses.filter((re) => {
      if (!re.is_active) return false;
      const nextDate = new Date(re.next_due_date);
      nextDate.setHours(0, 0, 0, 0);
      return nextDate >= today;
    });
  }, [recurringExpenses]);

  const renderExpensesTab = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    const groups = new Map<
      number,
      { name: string; expenses: Expense[]; budget: Budget | null }
    >();
    const budgetByCategory = new Map(budgets.map((b) => [b.category, b]));
    for (const expense of filteredExpenses) {
      const categoryId = expense.category ?? 0;
      const existing = groups.get(categoryId);
      if (existing) {
        existing.expenses.push(expense);
      } else {
        groups.set(categoryId, {
          name: expense.category_name || 'Uncategorized',
          expenses: [expense],
          budget: budgetByCategory.get(categoryId) || null,
        });
      }
    }
    // When filters/search active, only show categories that still have matching expenses
    if (!searchQuery.trim() && !hasActiveFilters) {
      for (const budget of budgets) {
        if (!groups.has(budget.category)) {
          groups.set(budget.category, {
            name: budget.category_name || 'Category',
            expenses: [],
            budget,
          });
        }
      }
    }

    const cards = Array.from(groups.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name, undefined, { sensitivity: 'base' })
    );

    const rangeAsOf = periodDateRange(viewDate, periodMode).asOf;

    return (
      <View style={styles.flex}>
        <View style={styles.toolbar}>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome name="search" size={12} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <FontAwesome name="times" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: showFilters || hasActiveFilters ? colors.primary : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowFilters((v) => !v)}
            accessibilityLabel="Filters"
          >
            <FontAwesome
              name="filter"
              size={13}
              color={showFilters || hasActiveFilters ? '#fff' : colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: showPeriodPicker ? colors.primary : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowPeriodPicker((v) => !v)}
            accessibilityLabel="Period"
          >
            <FontAwesome
              name="calendar"
              size={13}
              color={showPeriodPicker ? '#fff' : colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowReceiptWizard(true)}
            accessibilityLabel="Scan receipt"
          >
            <FontAwesome name="camera" size={13} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addExpenseBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setEditingExpense(null);
              setShowExpenseForm(true);
            }}
          >
            <FontAwesome name="plus" size={12} color="#fff" />
            <Text style={styles.addExpenseText}>Add</Text>
          </TouchableOpacity>
        </View>

        {showPeriodPicker ? (
          <View style={[styles.chipRow, { borderBottomColor: colors.border }]}>
            {PERIOD_OPTIONS.map((opt) => {
              const active = periodMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setPeriodMode(opt.value)}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {showFilters ? (
          <View
            style={[
              styles.filterPanel,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Category</Text>
              <ThemeAwarePicker
                selectedValue={filterCategory?.toString() || ''}
                onValueChange={(value) => setFilterCategory(value ? parseInt(value, 10) : null)}
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
                onValueChange={(value) =>
                  setFilterPaymentMethod((value || null) as PaymentMethod | null)
                }
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
                onValueChange={(value) => setFilterTag(value ? parseInt(value, 10) : null)}
                options={[
                  { label: 'All', value: '' },
                  ...tags.map((tag) => ({ label: tag.name, value: tag.id.toString() })),
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Type</Text>
              <ThemeAwarePicker
                selectedValue={
                  filterRecurring === null ? '' : filterRecurring ? 'recurring' : 'one_time'
                }
                onValueChange={(value) => {
                  if (value === 'recurring') setFilterRecurring(true);
                  else if (value === 'one_time') setFilterRecurring(false);
                  else setFilterRecurring(null);
                }}
                options={[
                  { label: 'All', value: '' },
                  { label: 'Recurring', value: 'recurring' },
                  { label: 'One-time', value: 'one_time' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Sort</Text>
              <ThemeAwarePicker
                selectedValue={`${sortBy}_${sortOrder}`}
                onValueChange={(value) => {
                  const [by, order] = String(value ?? 'date_desc').split('_') as [
                    SortBy,
                    SortOrder,
                  ];
                  setSortBy(by);
                  setSortOrder(order);
                }}
                options={[
                  { label: 'Date (newest)', value: 'date_desc' },
                  { label: 'Date (oldest)', value: 'date_asc' },
                  { label: 'Amount (high)', value: 'amount_desc' },
                  { label: 'Amount (low)', value: 'amount_asc' },
                  { label: 'Category A–Z', value: 'category_asc' },
                  { label: 'Category Z–A', value: 'category_desc' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Upcoming bills</Text>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    alignSelf: 'flex-start',
                    backgroundColor: showCombinedView ? colors.primary : colors.background,
                    borderColor: showCombinedView ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setShowCombinedView((v) => !v)}
              >
                <Text style={[styles.chipText, { color: showCombinedView ? '#fff' : colors.text }]}>
                  {showCombinedView ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.clearFiltersBtn, { backgroundColor: colors.border }]}
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
              <Text style={[styles.clearFiltersText, { color: colors.text }]}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {activePeriodMode ? (
          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={() => setViewDate((d) => shiftPeriod(d, activePeriodMode, -1))}
              style={styles.monthNavBtn}
            >
              <FontAwesome name="chevron-left" size={14} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.monthNavLabel, { color: colors.text }]} numberOfLines={1}>
              {periodLabel}
            </Text>
            <TouchableOpacity
              onPress={() => setViewDate((d) => shiftPeriod(d, activePeriodMode, 1))}
              style={styles.monthNavBtn}
            >
              <FontAwesome name="chevron-right" size={14} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.todayBtn,
                {
                  backgroundColor: onTodayPeriod ? colors.card : colors.primary,
                  borderColor: onTodayPeriod ? colors.border : colors.primary,
                },
              ]}
              onPress={() => todayPeriod && setViewDate(todayPeriod)}
              disabled={onTodayPeriod}
              accessibilityLabel="Go to today"
            >
              <Text
                style={[
                  styles.todayBtnText,
                  { color: onTodayPeriod ? colors.textSecondary : '#fff' },
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.monthNav}>
            <Text style={[styles.monthNavLabel, { color: colors.text }]} numberOfLines={1}>
              {periodLabel}
            </Text>
          </View>
        )}
        <Text style={[styles.monthSummary, { color: colors.textSecondary }]}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>
            {formatCurrency(periodPaid)}
          </Text>
          {periodMode !== 'all' ? (
            <>
              {' / '}
              {formatCurrency(periodBudgetTotal)}
            </>
          ) : null}
          {' · '}
          {filteredExpenses.length} expenses
        </Text>
        <ScrollView contentContainerStyle={styles.expenseGrid}>
          {showCombinedView && upcomingRecurring.length > 0 ? (
            <View style={styles.combinedBlock}>
              <Text style={[styles.combinedTitle, { color: colors.text }]}>Upcoming bills</Text>
              {upcomingRecurring.map((recurring) => {
                const nextDate = new Date(recurring.next_due_date);
                nextDate.setHours(0, 0, 0, 0);
                return (
                  <RecurringExpenseRow
                    key={`upcoming-${recurring.id}`}
                    recurring={recurring}
                    dateLabel={formatOccurrenceDate(nextDate)}
                    badge={{ label: 'Upcoming', color: colors.primary }}
                  />
                );
              })}
              <Text style={[styles.combinedTitle, { color: colors.text, marginTop: 12 }]}>
                Expenses
              </Text>
            </View>
          ) : null}
          {cards.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No expenses or budgets this period
            </Text>
          ) : (
            cards.map(([catId, group]) => {
              const budget =
                group.budget ||
                ({
                  id: -catId,
                  family: selectedFamily!.id,
                  category: catId,
                  category_name: group.name,
                  amount: 0,
                  period: periodMode === 'year' ? ('yearly' as const) : ('monthly' as const),
                  start_date: rangeAsOf,
                  end_date: null,
                  alert_threshold: 80,
                  is_active: true,
                  spent_amount: 0,
                  remaining_amount: 0,
                  percentage_used: 0,
                  base_amount: 0,
                  created_at: '',
                  updated_at: '',
                } as Budget);
              return (
                <View
                  key={catId}
                  style={[styles.gridItem, { width: `${100 / expenseColumns}%` as any }]}
                >
                  <BudgetCard
                    budget={budget}
                    items={group.expenses}
                    showBudgetLimit={!!group.budget && periodMode !== 'all'}
                    useItemsForSpent
                    onPress={
                      group.budget
                        ? () => {
                            setEditingBudget(group.budget);
                            setShowBudgetForm(true);
                          }
                        : undefined
                    }
                    onItemPress={(exp) => {
                      void openExpenseEditor(exp);
                    }}
                    onItemDelete={(exp) => setExpensePendingDelete(exp)}
                    onToggleItemPaid={handleTogglePaid}
                    paidToggleExpenseId={paidToggleId}
                  />
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  const renderCategoriesTab = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 8 }}>
        <View style={styles.catHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Categories</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingCategory(null);
              setShowCategoryForm(true);
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Add</Text>
          </TouchableOpacity>
        </View>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setEditingCategory(cat);
              setShowCategoryForm(true);
            }}
          >
            <View style={[styles.catSwatch, { backgroundColor: cat.color || colors.primary }]} />
            <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                setCategoryPendingDelete(cat);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Delete ${cat.name}`}
            >
              <FontAwesome name="trash-o" size={16} color={colors.error || '#ef4444'} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        <View style={[styles.catHeader, { marginTop: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tags</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingTag(null);
              setShowTagForm(true);
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Add</Text>
          </TouchableOpacity>
        </View>
        {tags.map((tag) => (
          <TouchableOpacity
            key={tag.id}
            style={[styles.catRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setEditingTag(tag);
              setShowTagForm(true);
            }}
          >
            <Text style={[styles.catName, { color: colors.text }]}>{tag.name}</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                setTagPendingDelete(tag);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Delete ${tag.name}`}
            >
              <FontAwesome name="trash-o" size={16} color={colors.error || '#ef4444'} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'budgets':
        return (
          <MonthBudgetCards
            refreshKey={budgetsRefreshKey}
            onExpensePress={(exp) => {
              void openExpenseEditor(exp);
            }}
            onBudgetPress={(budget) => {
              setEditingBudget(budget);
              setShowBudgetForm(true);
            }}
            onBudgetDelete={handleDeleteBudget}
          />
        );
      case 'expenses':
        return renderExpensesTab();
      case 'bills':
        return (
          <BillsBudgetsHub
            embedded
            yearTabEnabled={false}
            onPlanApplied={handlePlanApplied}
          />
        );
      case 'reports':
        return (
          <View style={styles.center}>
            <FontAwesome name="bar-chart" size={48} color={colors.textSecondary} />
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Reports coming soon</Text>
          </View>
        );
      case 'categories':
        return renderCategoriesTab();
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.topTitle, { color: colors.text }]}>Expense Tracker</Text>
      </View>

      <View
        style={[
          styles.tabContainer,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
        >
          {(
            [
              { id: 'budgets' as const, label: 'Budgets', icon: 'pie-chart' as const },
              { id: 'expenses' as const, label: 'Expenses', icon: 'file-text-o' as const },
              { id: 'bills' as const, label: 'Bills', icon: 'repeat' as const },
              { id: 'reports' as const, label: 'Reports', icon: 'bar-chart' as const },
              { id: 'categories' as const, label: 'Categories', icon: 'folder-o' as const },
            ] as const
          ).map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  selected && { backgroundColor: colors.primary },
                  { borderColor: colors.border },
                ]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <FontAwesome
                  name={tab.icon}
                  size={14}
                  color={selected ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[styles.tabText, { color: selected ? '#fff' : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
      ) : null}

      {!selectedFamily ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
        </View>
      ) : (
        renderContent()
      )}

      {selectedFamily && (
        <>
          <ExpenseForm
            visible={showExpenseForm}
            expense={editingExpense}
            categories={categories}
            tags={tags}
            familyId={selectedFamily.id}
            onSubmit={handleSaveExpense}
            onCancel={closeExpenseForm}
            loading={saving}
          />
          <BudgetForm
            visible={showBudgetForm}
            budget={editingBudget}
            categories={categories}
            familyId={selectedFamily.id}
            onSubmit={handleSaveBudget}
            onCancel={() => {
              setShowBudgetForm(false);
              setEditingBudget(null);
            }}
            loading={saving}
          />
          <CategoryForm
            visible={showCategoryForm}
            category={editingCategory}
            familyId={selectedFamily.id}
            onSubmit={handleSaveCategory}
            onCancel={() => {
              setShowCategoryForm(false);
              setEditingCategory(null);
            }}
            loading={saving}
          />
          <TagForm
            visible={showTagForm}
            tag={editingTag}
            familyId={selectedFamily.id}
            onSubmit={handleSaveTag}
            onCancel={() => {
              setShowTagForm(false);
              setEditingTag(null);
            }}
            loading={saving}
          />
          <ReceiptScanWizard
            visible={showReceiptWizard}
            familyId={selectedFamily.id}
            categories={categories}
            onClose={() => setShowReceiptWizard(false)}
            onSaved={() => {
              setShowReceiptWizard(false);
              setBudgetsRefreshKey((k) => k + 1);
              void load({ soft: true });
            }}
          />
        </>
      )}

      <AlertModal
        visible={!!expensePendingDelete}
        title="Delete expense?"
        message={
          expensePendingDelete
            ? `Delete "${expensePendingDelete.description}"? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={() => {
          if (expensePendingDelete) void handleDeleteExpense(expensePendingDelete);
        }}
        onClose={() => setExpensePendingDelete(null)}
      />
      <AlertModal
        visible={!!categoryPendingDelete}
        title="Delete category?"
        message={
          categoryPendingDelete
            ? `Delete "${categoryPendingDelete.name}"? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={() => {
          if (categoryPendingDelete) void handleDeleteCategory(categoryPendingDelete);
        }}
        onClose={() => setCategoryPendingDelete(null)}
      />
      <AlertModal
        visible={!!tagPendingDelete}
        title="Delete tag?"
        message={
          tagPendingDelete ? `Delete "${tagPendingDelete.name}"? This cannot be undone.` : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={() => {
          if (tagPendingDelete) void handleDeleteTag(tagPendingDelete);
        }}
        onClose={() => setTagPendingDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  tabContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  tabsScroll: {
    paddingHorizontal: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 6,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  filterPanel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRow: { gap: 4 },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  monthNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthNavLabel: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700' },
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  clearFiltersText: { fontSize: 12, fontWeight: '600' },
  combinedBlock: { width: '100%', paddingHorizontal: 8, paddingTop: 4, gap: 4 },
  combinedTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  addExpenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    height: 36,
  },
  addExpenseText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  monthSummary: { paddingHorizontal: 16, paddingVertical: 6, fontSize: 13 },
  expenseGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, paddingBottom: 40 },
  gridItem: { padding: 4 },
  empty: { fontSize: 14, textAlign: 'center', marginTop: 24 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  catSwatch: { width: 12, height: 12, borderRadius: 6 },
  catName: { flex: 1, fontSize: 14, fontWeight: '600' },
});
