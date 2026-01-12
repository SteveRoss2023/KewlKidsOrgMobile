import React, { useState, useEffect } from 'react';
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

interface BudgetFormProps {
  visible: boolean;
  budget?: Budget | null;
  categories: ExpenseCategory[];
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

  useEffect(() => {
    if (!visible) {
      // Reset form when modal closes
      setAmount('');
      setCategoryId(null);
      setPeriod('monthly');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setAlertThreshold('80');
      return;
    }

    if (budget) {
      setAmount(budget.amount.toString());
      setCategoryId(budget.category);
      setPeriod(budget.period);
      setStartDate(budget.start_date);
      setEndDate(budget.end_date || '');
      setAlertThreshold(budget.alert_threshold.toString());
    } else {
      setAmount('');
      setCategoryId(categories.length > 0 ? categories[0].id : null);
      setPeriod('monthly');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setAlertThreshold('80');
    }
  }, [budget, categories, visible]);

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

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
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
                options={categories && categories.length > 0 ? categories.map((cat) => ({
                  label: cat.name,
                  value: cat.id.toString(),
                })) : []}
                placeholder="Select category"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Amount *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                editable={!loading}
              />
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
