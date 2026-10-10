import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import YearBudgetOverview from '../../components/expenses/YearBudgetOverview';

/** Legacy route — year overview also lives under Bills → Year Budget tab. */
export default function ManageBudgetsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <FontAwesome name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Year Budget</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/bills-budgets')}
          style={styles.backButton}
          accessibilityLabel="Bills & Budgets"
        >
          <FontAwesome name="repeat" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <YearBudgetOverview
        onUpdatePlan={() => router.push('/(tabs)/bills-budgets')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
});
