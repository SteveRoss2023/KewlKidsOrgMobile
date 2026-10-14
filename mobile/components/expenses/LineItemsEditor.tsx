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
  /** Printed name before English translation (review only). */
  original_name?: string;
  /** ISO currency of original money fields (review only). */
  original_currency?: string;
  original_unit_price?: number | null;
  original_line_total?: number | null;
};

type Props = {
  lines: DraftLineItem[];
  onChange: (lines: DraftLineItem[]) => void;
  disabled?: boolean;
  hint?: string;
};

function plainMoney(n: number): string {
  return formatMoneyDisplay(n).replace(/^\$/, '');
}

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
    original_name?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    original_unit_price?: number | null;
    original_line_total?: number | null;
  }> | undefined | null,
  opts?: { originalCurrency?: string | null }
): DraftLineItem[] {
  if (!items?.length) return [];
  const currency = opts?.originalCurrency?.trim().toUpperCase() || undefined;
  return items.map((it, idx) => {
    const name = it.name || '';
    const originalName = it.original_name?.trim() || '';
    const showOriginalName =
      originalName && originalName.toLowerCase() !== name.trim().toLowerCase()
        ? originalName
        : undefined;
    return {
      key: `existing-${idx}-${it.name || 'item'}`,
      name,
      quantity: it.quantity != null ? String(it.quantity) : '1',
      unit_price: formatMoneyDisplay(it.unit_price),
      line_total: formatMoneyDisplay(it.line_total),
      original_name: showOriginalName,
      original_currency: currency,
      original_unit_price: it.original_unit_price ?? null,
      original_line_total: it.original_line_total ?? null,
    };
  });
}

export function toLineItemsInput(lines: DraftLineItem[]) {
  return lines
    .filter((ln) => ln.name.trim())
    .map((ln, idx) => {
      const quantity = ln.quantity.trim() === '' ? null : parseFloat(ln.quantity);
      const unit_price = parseMoneyDisplay(ln.unit_price);
      const line_total = parseMoneyDisplay(ln.line_total);
      const name = ln.name.trim();
      const original_name = ln.original_name?.trim() || undefined;
      return {
        name,
        original_name:
          original_name && original_name.toLowerCase() !== name.toLowerCase()
            ? original_name
            : undefined,
        quantity: quantity != null && !Number.isNaN(quantity) ? quantity : null,
        unit_price,
        line_total,
        original_unit_price: ln.original_unit_price ?? undefined,
        original_line_total: ln.original_line_total ?? undefined,
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

      {lines.map((ln, index) => {
        const cur = ln.original_currency;
        const showUnitOrig =
          cur &&
          cur !== 'CAD' &&
          ln.original_unit_price != null &&
          Number.isFinite(ln.original_unit_price);
        const showTotalOrig =
          cur &&
          cur !== 'CAD' &&
          ln.original_line_total != null &&
          Number.isFinite(ln.original_line_total);
        return (
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
            {!!ln.original_name && (
              <Text style={[styles.originalUnder, { color: colors.textSecondary }]} numberOfLines={2}>
                {ln.original_name}
              </Text>
            )}
            <View style={styles.row}>
              <View style={styles.col}>
                <TextInput
                  style={[styles.inputSm, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={ln.quantity}
                  onChangeText={(t) => updateLine(ln.key, { quantity: t })}
                  placeholder="Qty"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textSecondary}
                  editable={!disabled}
                />
              </View>
              <View style={styles.col}>
                <TextInput
                  style={[styles.inputSm, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={ln.unit_price}
                  onChangeText={(t) => updateLine(ln.key, { unit_price: onMoneyChange(t) })}
                  placeholder="$0.00"
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textSecondary}
                  editable={!disabled}
                />
                {showUnitOrig ? (
                  <Text style={[styles.originalUnder, { color: colors.textSecondary }]} numberOfLines={1}>
                    {cur} {plainMoney(ln.original_unit_price!)}
                  </Text>
                ) : null}
              </View>
              <View style={styles.col}>
                <TextInput
                  style={[styles.inputSm, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={ln.line_total}
                  onChangeText={(t) => updateLine(ln.key, { line_total: onMoneyChange(t) })}
                  placeholder="$0.00"
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textSecondary}
                  editable={!disabled}
                />
                {showTotalOrig ? (
                  <Text style={[styles.originalUnder, { color: colors.textSecondary }]} numberOfLines={1}>
                    {cur} {plainMoney(ln.original_line_total!)}
                  </Text>
                ) : null}
              </View>
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
        );
      })}

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
  originalUnder: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: -4,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  col: { flex: 1, gap: 4 },
  inputSm: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
  },
  remove: { padding: 8, marginTop: 4 },
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
