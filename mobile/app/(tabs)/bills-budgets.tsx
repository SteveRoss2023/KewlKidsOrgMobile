import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import BillsBudgetsHub from '../../components/expenses/BillsBudgetsHub';

export default function BillsBudgetsScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <Text style={[styles.title, { color: colors.text, borderBottomColor: colors.border }]}>
        Bills & Budgets
      </Text>
      <BillsBudgetsHub />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
