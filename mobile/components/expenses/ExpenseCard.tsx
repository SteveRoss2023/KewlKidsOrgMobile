import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Expense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';

interface ExpenseCardProps {
  expense: Expense;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ExpenseCard({ expense, onPress, onEdit, onDelete }: ExpenseCardProps) {
  const { colors } = useTheme();

  // Format date without timezone conversion
  // expense.expense_date comes as "YYYY-MM-DD" from the API
  const formatDate = (dateString: string): string => {
    try {
      // Parse the date string directly to avoid timezone conversion
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day); // month is 0-indexed
      return date.toLocaleDateString();
    } catch {
      // Fallback to original method if parsing fails
      return new Date(dateString).toLocaleDateString();
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'credit_card':
        return 'credit-card';
      case 'debit_card':
        return 'credit-card';
      case 'cash':
        return 'money';
      case 'bank_transfer':
        return 'bank';
      case 'e_transfer':
        return 'bank';
      case 'check':
        return 'file-text-o';
      default:
        return 'credit-card';
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardInfo}>
          <View style={styles.cardHeader}>
            <View style={styles.descriptionContainer}>
              <Text style={[styles.description, { color: colors.text }]} numberOfLines={2}>
                {expense.description}
              </Text>
              <View style={styles.badgesContainer}>
                {expense.is_recurring && expense.recurring_expense && (
                  <View style={[styles.badge, { backgroundColor: '#10b981' }]}>
                    <FontAwesome name="magic" size={10} color="#fff" />
                    <Text style={styles.badgeText}>Generated</Text>
                  </View>
                )}
                {!expense.is_recurring || !expense.recurring_expense ? (
                  <View style={[styles.badge, { backgroundColor: '#6366f1' }]}>
                    <FontAwesome name="edit" size={10} color="#fff" />
                    <Text style={styles.badgeText}>Original</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={[styles.amount, { color: colors.primary }]}>
              ${expense.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <FontAwesome name="folder-o" size={14} color={colors.textSecondary} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {expense.category_name}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <FontAwesome
                name={getPaymentMethodIcon(expense.payment_method) as any}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {formatDate(expense.expense_date)}
              </Text>
            </View>
          </View>
          {expense.tag_names && expense.tag_names.length > 0 && (
            <View style={styles.tagsContainer}>
              {expense.tag_names.map((tag, index) => (
                <View key={index} style={[styles.tag, { backgroundColor: colors.border }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {(onEdit || onDelete) && (
          <View style={styles.actions}>
            {onEdit && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="pencil" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="trash" size={18} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  descriptionContainer: {
    flex: 1,
    marginRight: 8,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardDetails: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    marginLeft: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
});
