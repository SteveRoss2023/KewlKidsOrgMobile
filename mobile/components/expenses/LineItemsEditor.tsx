import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import {
  formatMoneyDisplay,
  onMoneyChange,
  parseMoneyDisplay,
} from '../../utils/moneyInput';

export type DraftLineItem = {
  key: string;
  name: string;
  quantity: string;
  unit_price: string;
  line_total: string;
};

type Props = {
  lines: DraftLineItem[];
  onChange: (lines: DraftLineItem[]) => void;
  disabled?: boolean;
  hint?: string;
};

export function createEmptyLine(index = 0): DraftLineItem {
  return {
    key: `line-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    quantity: '1',
    unit_price: '',
    line_total: '',
  };
}

export function draftLinesFromExpenseItems(
  items: Array<{
    name?: string;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
  }> | undefined | null
): DraftLineItem[] {
  if (!items?.length) return [];
  return items.map((it, idx) => ({
    key: `existing-${idx}-${it.name || 'item'}`,
    name: it.name || '',
    quantity: it.quantity != null ? String(it.quantity) : '1',
    unit_price: formatMoneyDisplay(it.unit_price),
    line_total: formatMoneyDisplay(it.line_total),
  }));
}

export function toLineItemsInput(lines: DraftLineItem[]) {
  return lines
    .filter((ln) => ln.name.trim())
    .map((ln, idx) => {
      const quantity = ln.quantity.trim() === '' ? null : parseFloat(ln.quantity);
      const unit_price = parseMoneyDisplay(ln.unit_price);
      const line_total = parseMoneyDisplay(ln.line_total);
      return {
        name: ln.name.trim(),
        quantity: quantity != null && !Number.isNaN(quantity) ? quantity : null,
        unit_price,
        line_total,
        order: idx,
      };
    });
}

export default function LineItemsEditor({ lines, onChange, disabled, hint }: Props) {
  const { colors } = useTheme();

  const addLine = () => {
    onChange([...lines, createEmptyLine(lines.length)]);
  };

  const updateLine = (key: string, patch: Partial<DraftLineItem>) => {
    onChange(
      lines.map((ln) => {
        if (ln.key !== key) return ln;
        const next = { ...ln, ...patch };
        if (patch.quantity !== undefined || patch.unit_price !== undefined) {
          const qty = parseFloat(next.quantity);
          const unit = parseMoneyDisplay(next.unit_price);
          if (!Number.isNaN(qty) && unit != null) {
            next.line_total = formatMoneyDisplay(qty * unit);
          }
        }
        return next;
      })
    );
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((ln) => ln.key !== key));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Line items</Text>
        <TouchableOpacity
          onPress={addLine}
          disabled={disabled}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel="Add line item"
        >
          <FontAwesome name="plus" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Add item</Text>
        </TouchableOpacity>
      </View>
      {!!hint && <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>}

      {lines.length === 0 && (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No line items yet. Tap Add item to enter products from the receipt.
        </Text>
      )}

      {lines.map((ln, index) => (
        <View
          key={ln.key}
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}
        >
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Item {index + 1}</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={ln.name}
            onChangeText={(t) => updateLine(ln.key, { name: t })}
            placeholder="Item name"
            placeholderTextColor={colors.textSecondary}
            editable={!disabled}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.inputSm, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={ln.quantity}
              onChangeText={(t) => updateLine(ln.key, { quantity: t })}
              placeholder="Qty"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textSecondary}
              editable={!disabled}
            />
            <TextInput
              style={[styles.inputSm, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={ln.unit_price}
              onChangeText={(t) => updateLine(ln.key, { unit_price: onMoneyChange(t) })}
              placeholder="$0.00"
              keyboardType="number-pad"
              placeholderTextColor={colors.textSecondary}
              editable={!disabled}
            />
            <TextInput
              style={[styles.inputSm, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={ln.line_total}
              onChangeText={(t) => updateLine(ln.key, { line_total: onMoneyChange(t) })}
              placeholder="$0.00"
              keyboardType="number-pad"
              placeholderTextColor={colors.textSecondary}
              editable={!disabled}
            />
            <TouchableOpacity
              onPress={() => removeLine(ln.key)}
              disabled={disabled}
              style={styles.remove}
              accessibilityLabel={`Remove item ${index + 1}`}
            >
              <FontAwesome name="trash" size={16} color={colors.error || '#ef4444'} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {lines.length > 0 && (
        <TouchableOpacity
          onPress={addLine}
          disabled={disabled}
          style={[styles.addBelow, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Add another line item"
        >
          <FontAwesome name="plus" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Add another item</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  hint: { fontSize: 12, marginBottom: 8, lineHeight: 16 },
  empty: { fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  rowLabel: { fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inputSm: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
  },
  remove: { padding: 8 },
  addBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
});
