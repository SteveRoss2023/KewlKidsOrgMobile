import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type CategoryBarRow = {
  key: string;
  label: string;
  amount: number;
};

type CategoryHBarsProps = {
  rows: CategoryBarRow[];
  emptyText: string;
  barColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  formatAmount: (n: number) => string;
  maxRows?: number;
};

export default function CategoryHBars({
  rows,
  emptyText,
  barColor,
  trackColor,
  textColor,
  mutedColor,
  formatAmount,
  maxRows = 6,
}: CategoryHBarsProps) {
  const visible = useMemo(() => rows.slice(0, maxRows), [rows, maxRows]);
  const maxVal = useMemo(() => {
    let m = 1;
    for (const r of visible) m = Math.max(m, r.amount);
    return m;
  }, [visible]);

  if (visible.length === 0) {
    return <Text style={[styles.empty, { color: mutedColor }]}>{emptyText}</Text>;
  }

  return (
    <View style={styles.list}>
      {visible.map((row) => {
        const pct = Math.max(2, Math.min(100, (row.amount / maxVal) * 100));
        return (
          <View key={row.key} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
                {row.label}
              </Text>
              <Text style={[styles.amount, { color: textColor }]}>{formatAmount(row.amount)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: trackColor }]}>
              <View
                style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  empty: { fontSize: 13, paddingVertical: 8 },
  row: { gap: 6 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  amount: { fontSize: 13, fontWeight: '700' },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  fill: { height: '100%', borderRadius: 4 },
});
