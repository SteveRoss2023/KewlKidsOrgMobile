import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Budget, ExpenseCategory, BudgetPeriod, CreateBudgetData, UpdateBudgetData } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';
import ThemeAwareDatePicker from '../ThemeAwareDatePicker';
import expenseService from '../../services/expenseService';
import {
  formatMoneyDisplay,
  onMoneyChange,
  parseMoneyDisplay,
} from '../../utils/moneyInput';

interface BudgetFormProps {
  visible: boolean;
  budget?: Budget | null;
  categories: ExpenseCategory[];
  /** Category ids that already have an active monthly budget (create mode). */
  occupiedCategoryIds?: number[];
  familyId: number;
  onSubmit: (data: CreateBudgetData | UpdateBudgetData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const PERIODS: { label: string; value: BudgetPeriod }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

export default function BudgetForm({
  visible,
  budget,
  categories,
  occupiedCategoryIds = [],
  familyId,
  onSubmit,
  onCancel,
  loading = false,
}: BudgetFormProps) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [fetchedOccupied, setFetchedOccupied] = useState<number[]>([]);
  /** Only seed create fields once per open — do not wipe amount while typing. */
  const createInitializedRef = useRef(false);
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const occupiedPropRef = useRef(occupiedCategoryIds);
  occupiedPropRef.current = occupiedCategoryIds;

  useEffect(() => {
    if (!visible) {
      createInitializedRef.current = false;
      setAmount('');
      setCategoryId(null);
      setPeriod('monthly');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setAlertThreshold('80');
      setFetchedOccupied([]);
      return;
    }

    if (budget) {
      // Edit the standing monthly amount (base), not the month-effective display amount
      // (effective can be $0 in off-season when a seasonal bill drives the category).
      const standing =
        budget.base_amount != null && !Number.isNaN(Number(budget.base_amount))
          ? Number(budget.base_amount)
          : Number(budget.amount);
      setAmount(formatMoneyDisplay(standing));
      setCategoryId(budget.category);
      setPeriod(budget.period);
      setStartDate(budget.start_date);
      setEndDate(budget.end_date || '');
      setAlertThreshold(budget.alert_threshold.toString());
      return;
    }

    if (createInitializedRef.current) return;
    createInitializedRef.current = true;

    setAmount('');
    setPeriod('monthly');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setAlertThreshold('80');

    let cancelled = false;
    (async () => {
      let occupied = occupiedPropRef.current;
      try {
        const existing = await expenseService.getBudgets(familyId, true);
        occupied = existing
          .filter((b) => b.period === 'monthly' && b.is_active)
          .map((b) => b.category);
      } catch {
        // Fall back to prop list
      }
      if (cancelled) return;
      setFetchedOccupied(occupied);
      const available = categoriesRef.current.filter((c) => !occupied.includes(c.id));
      // Only set default category — never clear amount after the user starts typing.
      setCategoryId((prev) => {
        if (prev != null && available.some((c) => c.id === prev)) return prev;
        return available.length > 0 ? available[0].id : null;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [budget, familyId, visible]);

  const blockedCategoryIds =
    fetchedOccupied.length > 0 ? fetchedOccupied : occupiedCategoryIds;

  const standing =
    budget && budget.base_amount != null && !Number.isNaN(Number(budget.base_amount))
      ? Number(budget.base_amount)
      : budget
        ? Number(budget.amount)
        : null;
  const thisMonth =
    budget && budget.amount != null && !Number.isNaN(Number(budget.amount))
      ? Number(budget.amount)
      : null;
  const showThisMonthHint =
    budget != null &&
    standing != null &&
    thisMonth != null &&
    Math.abs(standing - thisMonth) >= 0.005;

  const categoryOptions = budget
    ? categories
    : categories.filter((c) => !blockedCategoryIds.includes(c.id));

  const handleSubmit = () => {
    // Validate required fields
    if (!amount.trim()) {
      Alert.alert('Validation Error', 'Please enter an amount');
      return;
    }
    if (!categoryId) {
      Alert.alert('Validation Error', 'Please select a category');
      return;
    }
    if (!startDate) {
      Alert.alert('Validation Error', 'Please select a start date');
      return;
    }

    const amountNum = parseMoneyDisplay(amount);
    if (amountNum == null || amountNum <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than 0');
      return;
    }

    const thresholdNum = parseInt(alertThreshold);
    if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
      Alert.alert('Validation Error', 'Alert threshold must be between 0 and 100');
      return;
    }

    if (budget) {
      onSubmit({
        category: categoryId,
        amount: amountNum,
        period,
        start_date: startDate,
        end_date: endDate.trim() || null,
        alert_threshold: thresholdNum,
      });
    } else {
      onSubmit({
        family: familyId,
        category: categoryId,
        amount: amountNum,
        period,
        origin: 'manual',
        start_date: startDate,
        end_date: endDate.trim() || null,
        alert_threshold: thresholdNum,
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {budget ? 'Edit Budget' : 'Add Budget'}
            </Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <FontAwesome name="times" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
              <ThemeAwarePicker
                selectedValue={categoryId?.toString() || ''}
                onValueChange={(value) => setCategoryId(value ? parseInt(value) : null)}
                options={
                  categoryOptions.length > 0
                    ? categoryOptions.map((cat) => ({
                        label: cat.name,
                        value: cat.id.toString(),
                      }))
                    : []
                }
                placeholder={
                  !budget && categoryOptions.length === 0
                    ? 'All categories already have a budget'
                    : 'Select category'
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Standing monthly limit *
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={amount}
                onChangeText={(t) => setAmount(onMoneyChange(t))}
                placeholder="$0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                editable={!loading}
              />
              {!budget ? (
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                  Saved as a Manual envelope. Bill sync will not overwrite it.
                </Text>
              ) : null}
              {showThisMonthHint && thisMonth != null ? (
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                  This month (from bills): ${thisMonth.toFixed(2)} — due amounts can raise the
                  limit above standing.
                </Text>
              ) : null}
              {budget?.origin === 'bills' ? (
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                  Editing this amount makes it Manual so bill sync will not overwrite it.
                </Text>
              ) : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Period *</Text>
              <ThemeAwarePicker
                selectedValue={period}
                onValueChange={(value) => setPeriod(value as BudgetPeriod)}
                options={PERIODS.map((p) => ({
                  label: p.label,
                  value: p.value,
                }))}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemeAwareDatePicker
                value={startDate}
                onChange={setStartDate}
                label="Start Date *"
                placeholder="Select start date"
                disabled={loading}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemeAwareDatePicker
                value={endDate}
                onChange={setEndDate}
                label="End Date (Optional)"
                placeholder="Select end date"
                minimumDate={new Date(startDate || new Date().toISOString().split('T')[0])}
                disabled={loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Alert Threshold (%)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={alertThreshold}
                onChangeText={setAlertThreshold}
                placeholder="80"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                editable={!loading}
              />
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Alert when this percentage of budget is used (0-100)
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.border }]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  opacity: (loading || !amount.trim() || !categoryId || !startDate) ? 0.5 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || !amount.trim() || !categoryId || !startDate}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Saving...' : budget ? 'Update' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  form: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  helpText: {
    fontSize: 12,
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
