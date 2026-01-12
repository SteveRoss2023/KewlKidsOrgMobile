import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Budget } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';

interface BudgetCardProps {
  budget: Budget;
}

export default function BudgetCard({ budget }: BudgetCardProps) {
  const { colors } = useTheme();

  const percentage = Math.min(budget.percentage_used, 100);
  const isExceeded = budget.percentage_used >= 100;
  const isWarning = budget.percentage_used >= budget.alert_threshold;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text style={[styles.category, { color: colors.text }]}>{budget.category_name}</Text>
        <Text style={[styles.amount, { color: colors.text }]}>
          ${budget.spent_amount.toFixed(2)} / ${budget.amount.toFixed(2)}
        </Text>
      </View>
      <View style={[styles.progressContainer, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${percentage}%`,
              backgroundColor: isExceeded ? '#ef4444' : isWarning ? '#f59e0b' : colors.primary,
            },
          ]}
        />
      </View>
      <View style={styles.footer}>
        <Text style={[styles.percentage, { color: colors.textSecondary }]}>
          {budget.percentage_used.toFixed(1)}% used
        </Text>
        <Text style={[styles.remaining, { color: colors.textSecondary }]}>
          ${budget.remaining_amount.toFixed(2)} remaining
        </Text>
      </View>
      {isExceeded && (
        <View style={styles.alert}>
          <Text style={[styles.alertText, { color: '#ef4444' }]}>Budget exceeded!</Text>
        </View>
      )}
      {isWarning && !isExceeded && (
        <View style={styles.alert}>
          <Text style={[styles.alertText, { color: '#f59e0b' }]}>
            Approaching budget limit ({budget.alert_threshold}%)
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  category: {
    fontSize: 16,
    fontWeight: '600',
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentage: {
    fontSize: 12,
  },
  remaining: {
    fontSize: 12,
  },
  alert: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  alertText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
