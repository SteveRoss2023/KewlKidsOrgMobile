import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';
import expenseService from '../../services/expenseService';
import {
  Budget,
  ExpenseCategory,
  RecurringExpense,
  CreateRecurringExpenseData,
  UpdateRecurringExpenseData,
} from '../../types/expenses';
import { forFamily } from '../../utils/familyScope';
import RecurringExpenseRow from './RecurringExpenseRow';
import RecurringExpenseForm from './RecurringExpenseForm';
import DonutChart from './charts/DonutChart';
import AlertModal from '../AlertModal';

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

type BillView = 'status' | 'category' | 'frequency' | 'seasonal';

const BILL_VIEWS: { id: BillView; label: string }[] = [
  { id: 'status', label: 'Active / Inactive' },
  { id: 'category', label: 'Category' },
  { id: 'frequency', label: 'Monthly / Yearly' },
  { id: 'seasonal', label: 'Seasonal' },
];

const GROUP_COLORS: Record<string, string> = {
  Active: '#10b981',
  Inactive: '#ef4444',
  Monthly: '#3b82f6',
  Yearly: '#8b5cf6',
  Other: '#64748b',
  Seasonal: '#0ea5e9',
  'Not seasonal': '#f59e0b',
};

function compareBills(a: RecurringExpense, b: RecurringExpense): number {
  return a.description.localeCompare(b.description);
}

function groupBills(
  bills: RecurringExpense[],
  view: BillView
): { title: string; bills: RecurringExpense[]; categoryId?: number }[] {
  if (view === 'status') {
    return [
      { title: 'Active', bills: bills.filter((b) => b.is_active).sort(compareBills) },
      { title: 'Inactive', bills: bills.filter((b) => !b.is_active).sort(compareBills) },
    ];
  }
  if (view === 'frequency') {
    const other = bills
      .filter((b) => b.frequency !== 'monthly' && b.frequency !== 'yearly')
      .sort(compareBills);
    const groups = [
      { title: 'Monthly', bills: bills.filter((b) => b.frequency === 'monthly').sort(compareBills) },
      { title: 'Yearly', bills: bills.filter((b) => b.frequency === 'yearly').sort(compareBills) },
    ];
    if (other.length > 0) groups.push({ title: 'Other', bills: other });
    return groups;
  }
  if (view === 'seasonal') {
    return [
      { title: 'Seasonal', bills: bills.filter((b) => b.is_seasonal).sort(compareBills) },
      { title: 'Not seasonal', bills: bills.filter((b) => !b.is_seasonal).sort(compareBills) },
    ];
  }
  const map = new Map<string, { title: string; bills: RecurringExpense[]; categoryId?: number }>();
  for (const bill of bills) {
    const name = (bill.category_name || '').trim() || 'Uncategorized';
    const existing = map.get(name);
    if (existing) existing.bills.push(bill);
    else map.set(name, { title: name, bills: [bill], categoryId: bill.category });
  }
  return [...map.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((group) => ({ ...group, bills: group.bills.sort(compareBills) }));
}

type BillsBoardCache = {
  bills: RecurringExpense[];
  budgets: Budget[];
  categories: ExpenseCategory[];
};

/** Survive Bills tab remounts (Overview ↔ Bills). */
const billsBoardCache = new Map<number, BillsBoardCache>();

/** Drop cached Bills boards after expense/bill mutations. */
export function invalidateBillsBoardCache(familyId?: number | null) {
  if (familyId == null) {
    billsBoardCache.clear();
    return;
  }
  billsBoardCache.delete(familyId);
}

interface BillsDashboardProps {
  onPlanApplied?: () => void;
  refreshKey?: number;
  initialCategories?: ExpenseCategory[];
}

export default function BillsDashboard({
  onPlanApplied,
  refreshKey = 0,
  initialCategories,
}: BillsDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const initialCache =
    selectedFamily != null ? billsBoardCache.get(selectedFamily.id) : undefined;

  const [loading, setLoading] = useState(!initialCache);
  const [bills, setBills] = useState<RecurringExpense[]>(() => initialCache?.bills ?? []);
  const [budgets, setBudgets] = useState<Budget[]>(() => initialCache?.budgets ?? []);
  const [categories, setCategories] = useState<ExpenseCategory[]>(
    () => initialCache?.categories ?? []
  );
  const [error, setError] = useState('');
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    initialCache && selectedFamily ? selectedFamily.id : null
  );

  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringExpense | null>(null);
  const [saving, setSaving] = useState(false);
  const [billPendingDelete, setBillPendingDelete] = useState<RecurringExpense | null>(null);
  const [keepBudgetPrompt, setKeepBudgetPrompt] = useState<{
    budgetId: number;
    categoryName: string;
    amount: number;
  } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [billView, setBillView] = useState<BillView>('status');

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;

  const activeColor = colors.success || '#10b981';
  const inactiveColor = '#94a3b8';

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setBills([]);
    setBudgets([]);
    setCategories([]);
    setError('');
    setDataFamilyId(null);
    setShowBillForm(false);
    setEditingBill(null);
    setBillPendingDelete(null);
    setKeepBudgetPrompt(null);
    setLoading(true);
  }, []);

  const writeCache = useCallback(
    (
      familyId: number,
      nextBills: RecurringExpense[],
      nextBudgets: Budget[],
      nextCats: ExpenseCategory[]
    ) => {
      billsBoardCache.set(familyId, {
        bills: nextBills,
        budgets: nextBudgets,
        categories: nextCats,
      });
    },
    []
  );

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selectedFamily) {
        clearState();
        setLoading(false);
        return;
      }
      const soft = !!opts?.soft;
      const familyId = selectedFamily.id;
      const generation = ++fetchGenerationRef.current;
      const cached = billsBoardCache.get(familyId);
      if (cached) {
        setBills(cached.bills);
        setBudgets(cached.budgets);
        setCategories(cached.categories);
        setDataFamilyId(familyId);
        setLoading(false);
        if (soft) return;
      } else if (!soft) {
        setLoading(true);
      }
      setError('');
      try {
        const reuseCats =
          initialCategories &&
          initialCategories.length > 0 &&
          initialCategories.every((c) => c.family === familyId);
        const [billsData, budgetsData, cats] = await Promise.all([
          expenseService.getRecurringExpenses(familyId),
          expenseService.getBudgets(familyId, true),
          reuseCats
            ? Promise.resolve(initialCategories!)
            : expenseService.getCategories(familyId),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        const nextBills = forFamily(billsData, familyId);
        const nextBudgets = forFamily(budgetsData, familyId);
        const nextCats = forFamily(cats, familyId);
        setBills(nextBills);
        setBudgets(nextBudgets);
        setCategories(nextCats);
        setDataFamilyId(familyId);
        writeCache(familyId, nextBills, nextBudgets, nextCats);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load bills');
        setBills([]);
        setBudgets([]);
        setCategories([]);
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
    [selectedFamily, clearState, initialCategories, writeCache]
  );

  useEffect(() => {
    clearState();
    if (selectedFamily) {
      const cached = billsBoardCache.get(selectedFamily.id);
      if (cached) {
        setBills(cached.bills);
        setBudgets(cached.budgets);
        setCategories(cached.categories);
        setDataFamilyId(selectedFamily.id);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      const cacheHit = billsBoardCache.has(selectedFamily.id);
      const soft = cacheHit || dataFamilyId === selectedFamily.id;
      void load({ soft });
    }, [selectedFamily?.id, load, dataFamilyId])
  );

  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (!selectedFamily) return;
    if (refreshKey === lastRefreshKeyRef.current) return;
    lastRefreshKeyRef.current = refreshKey;
    void load({ soft: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const activeBills = useMemo(
    () =>
      [...bills.filter((b) => b.is_active)].sort((a, b) =>
        a.description.localeCompare(b.description)
      ),
    [bills]
  );
  const inactiveBills = useMemo(
    () =>
      [...bills.filter((b) => !b.is_active)].sort((a, b) =>
        a.description.localeCompare(b.description)
      ),
    [bills]
  );

  const thisMonthBudgetTotal = useMemo(
    () => budgets.reduce((sum, b) => sum + toAmt(b.amount), 0),
    [budgets]
  );

  const activeAmount = useMemo(
    () => activeBills.reduce((sum, b) => sum + toAmt(b.amount), 0),
    [activeBills]
  );
  const inactiveAmount = useMemo(
    () => inactiveBills.reduce((sum, b) => sum + toAmt(b.amount), 0),
    [inactiveBills]
  );

  const donutSlices = useMemo(() => {
    if (activeAmount <= 0 && inactiveAmount <= 0) {
      if (activeBills.length === 0 && inactiveBills.length === 0) {
        return [] as { key: string; label: string; amount: number; color: string }[];
      }
      return [
        { key: 'active', label: 'Active', amount: activeBills.length, color: activeColor },
        {
          key: 'inactive',
          label: 'Inactive',
          amount: inactiveBills.length,
          color: inactiveColor,
        },
      ].filter((s) => s.amount > 0);
    }
    return [
      { key: 'active', label: 'Active', amount: activeAmount, color: activeColor },
      { key: 'inactive', label: 'Inactive', amount: inactiveAmount, color: inactiveColor },
    ].filter((s) => s.amount > 0);
  }, [
    activeAmount,
    inactiveAmount,
    activeBills.length,
    inactiveBills.length,
    activeColor,
    inactiveColor,
  ]);

  const usingCounts =
    activeAmount <= 0 &&
    inactiveAmount <= 0 &&
    (activeBills.length > 0 || inactiveBills.length > 0);

  const handleSaveBill = async (
    data: CreateRecurringExpenseData | UpdateRecurringExpenseData
  ) => {
    if (!selectedFamily) return;
    setSaving(true);
    setError('');
    try {
      if (editingBill) {
        await expenseService.updateRecurringExpense(
          editingBill.id,
          data as UpdateRecurringExpenseData
        );
      } else {
        await expenseService.createRecurringExpense(data as CreateRecurringExpenseData);
      }
      setShowBillForm(false);
      setEditingBill(null);
      invalidateBillsBoardCache(selectedFamily.id);
      await load({ soft: true });
      onPlanApplied?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const bill = billPendingDelete;
    setBillPendingDelete(null);
    if (!bill) return;
    setError('');
    const activeSameCat = bills.filter(
      (b) => b.is_active && b.category === bill.category && b.id !== bill.id
    );
    const isLastInCategory = activeSameCat.length === 0;
    const catBudget = budgets.find(
      (b) => b.is_active && b.category === bill.category
    );
    const isBillsOrigin = !catBudget?.origin || catBudget.origin === 'bills';
    const standing =
      catBudget?.base_amount != null
        ? Number(catBudget.base_amount)
        : Number(catBudget?.amount || 0);

    try {
      await expenseService.deleteRecurringExpense(bill.id);
      if (selectedFamily) invalidateBillsBoardCache(selectedFamily.id);
      await load({ soft: true });
      onPlanApplied?.();
      if (isLastInCategory && catBudget && isBillsOrigin) {
        setKeepBudgetPrompt({
          budgetId: catBudget.id,
          categoryName: catBudget.category_name || 'this category',
          amount: standing,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete bill');
    }
  };

  const keepBudgetAsManual = async () => {
    const prompt = keepBudgetPrompt;
    setKeepBudgetPrompt(null);
    if (!prompt) return;
    try {
      await expenseService.updateBudget(prompt.budgetId, {
        origin: 'manual',
        is_active: true,
        amount: prompt.amount > 0 ? prompt.amount : undefined,
      });
      if (selectedFamily) invalidateBillsBoardCache(selectedFamily.id);
      await load({ soft: true });
      onPlanApplied?.();
    } catch (err: any) {
      setError(err.message || 'Failed to keep budget as Manual');
    }
  };

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family to manage bills.</Text>
      </View>
    );
  }

  const hero = (
    <View
      style={[
        styles.heroCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
        Bills drive the plan
      </Text>
      <View style={styles.heroGrid}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Active bills
          </Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>
            {activeBills.length}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Category budgets
          </Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>
            {budgets.length}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            This month limits
          </Text>
          <Text style={[styles.heroValue, { color: colors.primary }]}>
            {displayMoney(thisMonthBudgetTotal)}
          </Text>
        </View>
      </View>
    </View>
  );

  const donut = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Active vs inactive</Text>
      {donutSlices.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No bills to chart yet
        </Text>
      ) : (
        <View style={styles.donutBlock}>
          <DonutChart
            slices={donutSlices}
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            trackColor={colors.border}
            centerLabel={
              usingCounts
                ? String(activeBills.length + inactiveBills.length)
                : displayMoney(activeAmount + inactiveAmount)
            }
            centerSubLabel={usingCounts ? 'Bills' : 'Total'}
          />
          <View style={styles.donutLegend}>
            {donutSlices.map((s) => (
              <View key={s.key} style={styles.donutLegendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                <Text style={[styles.donutLegendLabel, { color: colors.text }]}>
                  {s.label}
                </Text>
                <Text
                  style={[styles.donutLegendAmt, { color: colors.textSecondary }]}
                >
                  {usingCounts ? String(s.amount) : displayMoney(s.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const actionButtons = (
    <View style={styles.actionRow}>
      <TouchableOpacity
        style={[styles.primaryAction, { backgroundColor: colors.primary }]}
        onPress={() => {
          setEditingBill(null);
          setShowBillForm(true);
        }}
        accessibilityLabel="Add bill"
      >
        <FontAwesome name="plus" size={14} color="#fff" />
        <Text style={styles.primaryActionText}>Add bill</Text>
      </TouchableOpacity>
    </View>
  );

  const billGroups = useMemo(() => {
    const groups = groupBills(bills, billView);
    if (billView === 'category') return groups.filter((g) => g.bills.length > 0);
    return groups.filter((g) => g.bills.length > 0 || bills.length > 0);
  }, [bills, billView]);

  const openBill = (bill: RecurringExpense) => {
    setEditingBill(bill);
    setShowBillForm(true);
  };

  const billsBrowser = (
    <View style={styles.billBrowser}>
      <View style={styles.viewToggles}>
        {BILL_VIEWS.map((view) => {
          const selected = billView === view.id;
          return (
            <TouchableOpacity
              key={view.id}
              style={[
                styles.viewToggle,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setBillView(view.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.viewToggleText,
                  { color: selected ? '#fff' : colors.text },
                ]}
              >
                {view.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : bills.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No bills yet. Add rent, utilities, and subscriptions.
          </Text>
        ) : (
          billGroups.map((group) => {
            const groupColor =
              billView === 'category'
                ? categories.find((c) => c.id === group.categoryId)?.color || colors.primary
                : GROUP_COLORS[group.title] || colors.primary;
            const tint =
              /^#[0-9a-fA-F]{6}$/.test(groupColor) ? `${groupColor}22` : groupColor;
            return (
            <View
              key={group.title}
              style={[
                styles.billGroup,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: groupColor,
                  backgroundColor: tint,
                  borderRadius: 8,
                  paddingLeft: 8,
                  paddingRight: 4,
                  marginTop: 8,
                },
              ]}
            >
              <View style={styles.groupHeader}>
                <View style={[styles.categorySwatch, { backgroundColor: groupColor }]} />
                <Text style={[styles.groupTitle, { color: groupColor }]}>{group.title}</Text>
                <Text style={[styles.groupCount, { color: groupColor }]}>
                  {group.bills.length}
                </Text>
              </View>
              {group.bills.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>None</Text>
              ) : (
                group.bills.map((bill) => (
                  <RecurringExpenseRow
                    key={bill.id}
                    recurring={bill}
                    badge={
                      !bill.is_active && billView !== 'status'
                        ? { label: 'Inactive', color: inactiveColor }
                        : null
                    }
                    onPress={() => openBill(bill)}
                    onDelete={() => setBillPendingDelete(bill)}
                  />
                ))
              )}
            </View>
            );
          })
        )}
      </View>
    </View>
  );

  const help = (
    <>
      <TouchableOpacity
        style={[
          styles.helpHeader,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => setHelpOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <FontAwesome
          name={helpOpen ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={colors.textSecondary}
        />
        <Text style={[styles.helpTitle, { color: colors.text }]}>How this works</Text>
      </TouchableOpacity>
      {helpOpen ? (
        <View
          style={[
            styles.helpBody,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            1. Saving a bill updates that bill’s unpaid expenses and refreshes a
            From-bills category limit. Paid expenses stay as-is.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            2. Manual envelopes on Budgets are never overwritten by bill sync. Use Add
            budget there for limits without a bill (for example Food).
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            3. Deleting the last bill in a category turns off its From-bills limit unless
            you choose to keep it as Manual.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            4. Opening another year may offer to add missing unpaid bill rows for that
            year. That does not change budgets.
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <View style={styles.flex}>
        {error ? (
          <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
        ) : null}

        {loading && dataFamilyId !== selectedFamily.id ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isWide ? (
              <View style={styles.wideRow}>
                <View style={styles.wideCol}>
                  {hero}
                  {donut}
                  {help}
                </View>
                <View style={styles.wideCol}>
                  {actionButtons}
                  {billsBrowser}
                </View>
              </View>
            ) : (
              <>
                {hero}
                {donut}
                {actionButtons}
                {billsBrowser}
                {help}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <RecurringExpenseForm
        visible={showBillForm}
        recurringExpense={editingBill}
        categories={categories}
        familyId={selectedFamily.id}
        onSubmit={handleSaveBill}
        onCancel={() => {
          setShowBillForm(false);
          setEditingBill(null);
        }}
        loading={saving}
      />

      <AlertModal
        visible={!!billPendingDelete}
        title="Delete bill?"
        message={
          billPendingDelete
            ? `Delete “${billPendingDelete.description}” (${displayMoney(billPendingDelete.amount)})? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onClose={() => setBillPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />

      <AlertModal
        visible={!!keepBudgetPrompt}
        title="Keep category budget?"
        message={
          keepBudgetPrompt
            ? `That was the last bill in ${keepBudgetPrompt.categoryName}. Keep Standing ${displayMoney(
                keepBudgetPrompt.amount
              )} as a Manual budget? Otherwise the From-bills limit stays off.`
            : ''
        }
        type="info"
        showCancel
        cancelText="Leave off"
        confirmText="Keep as Manual"
        onClose={() => setKeepBudgetPrompt(null)}
        onConfirm={() => {
          void keepBudgetAsManual();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40, gap: 14 },
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
  heroCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroCell: { flexGrow: 1, flexBasis: '28%', minWidth: 88, gap: 2 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 16, fontWeight: '800' },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  donutBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  donutLegend: { flexShrink: 1, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  donutLegendLabel: { fontSize: 13, fontWeight: '600' },
  donutLegendAmt: { fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '800' },
  empty: { fontSize: 13, paddingVertical: 12 },
  billBrowser: { gap: 10 },
  viewToggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  viewToggle: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewToggleText: { fontSize: 13, fontWeight: '700' },
  billGroup: { gap: 2, paddingTop: 4 },
  categorySwatch: { width: 10, height: 10, borderRadius: 5 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
  },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  groupCount: { fontSize: 12, fontWeight: '700' },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  helpTitle: { fontSize: 14, fontWeight: '700' },
  helpBody: {
    marginTop: -6,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  helpText: { fontSize: 13, lineHeight: 18 },
});
