import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import expenseService from '../../services/expenseService';
import TooltipButton from '../../components/TooltipButton';
import {
  Budget,
  Expense,
  ExpenseCategory,
  ExpenseTag,
  CreateExpenseData,
  UpdateExpenseData,
  CreateExpenseCategoryData,
  UpdateExpenseCategoryData,
  CreateBudgetData,
  UpdateBudgetData,
  CreateExpenseTagData,
  UpdateExpenseTagData,
} from '../../types/expenses';
import BudgetDashboard, {
  invalidateBudgetYearCache,
} from '../../components/expenses/BudgetDashboard';
import ExpenseDashboard, {
  invalidateExpenseBoardCache,
} from '../../components/expenses/ExpenseDashboard';
import BillsDashboard, {
  invalidateBillsBoardCache,
} from '../../components/expenses/BillsDashboard';
import ExpenseForm from '../../components/expenses/ExpenseForm';
import BudgetForm from '../../components/expenses/BudgetForm';
import CategoryForm from '../../components/expenses/CategoryForm';
import TagForm from '../../components/expenses/TagForm';
import ReceiptScanWizard from '../../components/expenses/ReceiptScanWizard';
import CashflowDashboard, {
  invalidateCashflowYearCache,
} from '../../components/expenses/CashflowDashboard';
import AlertModal from '../../components/AlertModal';
import { forFamily } from '../../utils/familyScope';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';

type HubTab = 'overview' | 'budgets' | 'expenses' | 'bills' | 'categories';

export default function ExpensesHubScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { showAmounts, setShowAmounts, toggleShowAmounts } = useShowAmounts();
  const isWide = useIsWideLayout();

  const [activeTab, setActiveTab] = useState<HubTab>('overview');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [error, setError] = useState('');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const editingExpenseRef = useRef<Expense | null>(null);
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<ExpenseTag | null>(null);
  const [showReceiptWizard, setShowReceiptWizard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<ExpenseCategory | null>(null);
  const [tagPendingDelete, setTagPendingDelete] = useState<ExpenseTag | null>(null);
  const [budgetsRefreshKey, setBudgetsRefreshKey] = useState(0);
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(null);
  const tabsScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const tabsViewportWidthRef = useRef(0);

  const clearExpenseState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setCategories([]);
    setTags([]);
    setError('');
    setShowExpenseForm(false);
    editingExpenseRef.current = null;
    setEditingExpense(null);
    setShowBudgetForm(false);
    setEditingBudget(null);
    setShowCategoryForm(false);
    setEditingCategory(null);
    setShowTagForm(false);
    setEditingTag(null);
    setShowReceiptWizard(false);
    setCategoryPendingDelete(null);
    setTagPendingDelete(null);
    setDataFamilyId(null);
    setLoading(true);
    invalidateCashflowYearCache();
    invalidateBudgetYearCache();
    invalidateExpenseBoardCache();
    invalidateBillsBoardCache();
    setBudgetsRefreshKey((k) => k + 1);
  }, []);

  const bumpExpenseBoards = useCallback(() => {
    if (selectedFamily) {
      invalidateCashflowYearCache(selectedFamily.id);
      invalidateBudgetYearCache(selectedFamily.id);
      invalidateExpenseBoardCache(selectedFamily.id);
      invalidateBillsBoardCache(selectedFamily.id);
    }
    setBudgetsRefreshKey((k) => k + 1);
  }, [selectedFamily]);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selectedFamily) {
        clearExpenseState();
        setLoading(false);
        return;
      }
      const soft = !!opts?.soft;
      const familyId = selectedFamily.id;
      const generation = ++fetchGenerationRef.current;
      if (!soft) setLoading(true);
      setError('');
      try {
        const [cats, tagList] = await Promise.all([
          expenseService.getCategories(familyId),
          expenseService.getTags(familyId),
        ]);

        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }

        setCategories(forFamily(cats, familyId));
        setTags(forFamily(tagList, familyId));
        setDataFamilyId(familyId);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load');
        setCategories([]);
        setTags([]);
        setDataFamilyId(null);
      } finally {
        if (
          generation === fetchGenerationRef.current &&
          selectedFamilyIdRef.current === familyId
        ) {
          setLoading(false);
        }
      }
    },
    [selectedFamily, clearExpenseState]
  );

  /** PWA-friendly force refresh — header button (pull-to-refresh is a no-op on web). */
  const handleRefresh = useCallback(async () => {
    if (!selectedFamily || refreshing) return;
    setRefreshing(true);
    try {
      bumpExpenseBoards();
      await load({ soft: true });
    } finally {
      setRefreshing(false);
    }
  }, [selectedFamily, refreshing, bumpExpenseBoards, load]);

  useEffect(() => {
    clearExpenseState();
    if (!selectedFamily) setLoading(false);
    // Only reset when the selected family changes — not on period/tab refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  // Hide amounts whenever Expense Tracker is opened (e.g. from Home card).
  useFocusEffect(
    useCallback(() => {
      setShowAmounts(false);
    }, [setShowAmounts])
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      // After a family switch dataFamilyId is null → hard load (no soft paint of prior family).
      const sameFamily = dataFamilyId === selectedFamily.id;
      void load({ soft: sameFamily && categories.length > 0 });
    }, [selectedFamily?.id, activeTab, load, dataFamilyId, categories.length])
  );

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
        bumpExpenseBoards();
        await load({ soft: true });
        return;
      }

      const created = await expenseService.createExpense(data as CreateExpenseData);
      const full = await expenseService.getExpense(created.id);
      bumpExpenseBoards();
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
    try {
      // API only — ExpenseDashboard writes its board cache and invalidates
      // Overview/Budgets so a full bump doesn't race the paid toggle.
      await expenseService.updateExpense(expense.id, { is_paid: nextPaid });
    } catch (err: any) {
      setError(err.message || 'Failed to update paid status');
      throw err;
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    try {
      await expenseService.deleteExpense(expense.id);
      bumpExpenseBoards();
      await load({ soft: true });
    } catch (err: any) {
      setError(err.message || 'Failed to delete expense');
      throw err;
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
      bumpExpenseBoards();
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
      bumpExpenseBoards();
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
    bumpExpenseBoards();
    if (activeTab === 'expenses' || activeTab === 'bills' || activeTab === 'categories') {
      void load({ soft: true });
    }
  }, [activeTab, load]);

  useEffect(() => {
    const layout = tabLayoutsRef.current[activeTab];
    const viewport = tabsViewportWidthRef.current;
    if (!layout || !viewport || !tabsScrollRef.current) return;
    const padding = 12;
    const targetX = Math.max(0, layout.x - padding);
    tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
  }, [activeTab]);

  const renderCategoriesTab = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    const categoriesSection = (
      <>
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
      </>
    );

    const tagsSection = (
      <>
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
      </>
    );

    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 8 }}>
        {isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideCol}>{categoriesSection}</View>
            <View style={styles.wideCol}>{tagsSection}</View>
          </View>
        ) : (
          <>
            {categoriesSection}
            {tagsSection}
          </>
        )}
      </ScrollView>
    );
  };

  const familyKey = selectedFamily?.id ?? 'none';
  const hubCatalogReady =
    !!selectedFamily && dataFamilyId === selectedFamily.id && !loading;

  const renderContent = () => {
    if (!selectedFamily) {
      return (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
        </View>
      );
    }
    // Categories needs hub cats/tags; other boards load their own data and should not wait.
    if (activeTab === 'categories' && !hubCatalogReady) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    switch (activeTab) {
      case 'budgets':
        return (
          <BudgetDashboard
            key={familyKey}
            refreshKey={budgetsRefreshKey}
            onBudgetPress={(budget) => {
              setEditingBudget(budget);
              setShowBudgetForm(true);
            }}
            onAddBudget={() => {
              setEditingBudget(null);
              setShowBudgetForm(true);
            }}
            onBudgetDelete={handleDeleteBudget}
          />
        );
      case 'expenses':
        return (
          <ExpenseDashboard
            key={familyKey}
            refreshKey={budgetsRefreshKey}
            initialCategories={hubCatalogReady ? categories : undefined}
            initialTags={hubCatalogReady ? tags : undefined}
            onAdd={() => {
              editingExpenseRef.current = null;
              setEditingExpense(null);
              setShowExpenseForm(true);
            }}
            onScan={() => setShowReceiptWizard(true)}
            onExpensePress={(exp) => {
              void openExpenseEditor(exp);
            }}
            onExpenseDelete={handleDeleteExpense}
            onTogglePaid={handleTogglePaid}
            onBudgetPress={(budget) => {
              setEditingBudget(budget);
              setShowBudgetForm(true);
            }}
          />
        );
      case 'bills':
        return (
          <BillsDashboard
            key={familyKey}
            refreshKey={budgetsRefreshKey}
            initialCategories={hubCatalogReady ? categories : undefined}
            onPlanApplied={handlePlanApplied}
          />
        );
      case 'overview':
        return (
          <CashflowDashboard key={familyKey} refreshKey={budgetsRefreshKey} />
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
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={[styles.refreshButton, { borderColor: colors.border }]}
            onPress={() => {
              void handleRefresh();
            }}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh expense data"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <FontAwesome name="refresh" size={16} color={colors.text} />
            )}
          </TouchableOpacity>
          <TooltipButton
            tooltip={showAmounts ? 'Hide amounts' : 'Show amounts'}
            style={styles.amountToggle}
            onPress={toggleShowAmounts}
            accessibilityRole="switch"
            accessibilityState={{ checked: showAmounts }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome
              name={showAmounts ? 'eye' : 'eye-slash'}
              size={16}
              color={colors.textSecondary}
            />
            <Text style={[styles.amountToggleText, { color: colors.textSecondary }]}>
              {showAmounts ? 'Hide amounts' : 'Show amounts'}
            </Text>
          </TooltipButton>
        </View>
      </View>

      <View
        style={[
          styles.tabContainer,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <ScrollView
          ref={tabsScrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.tabsScrollView}
          contentContainerStyle={styles.tabsScroll}
          onLayout={(e) => {
            tabsViewportWidthRef.current = e.nativeEvent.layout.width;
          }}
        >
          {(
            [
              { id: 'overview' as const, label: 'Overview', icon: 'tachometer' as const },
              { id: 'expenses' as const, label: 'Expenses', icon: 'th-list' as const },
              { id: 'bills' as const, label: 'Bills', icon: 'repeat' as const },
              { id: 'budgets' as const, label: 'Budgets', icon: 'pie-chart' as const },
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
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  tabLayoutsRef.current[tab.id] = { x, width };
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <FontAwesome
                  name={tab.icon}
                  size={12}
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
              bumpExpenseBoards();
              void load({ soft: true });
            }}
          />
        </>
      )}

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
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
  },
  amountToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  amountToggleText: { fontSize: 12, fontWeight: '600' },
  tabContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsScrollView: {
    flexGrow: 0,
    width: '100%',
  },
  tabsScroll: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  tabText: { fontSize: 12, fontWeight: '700' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  wideRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  wideCol: {
    flex: 1,
    minWidth: 0,
    gap: 14,
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
