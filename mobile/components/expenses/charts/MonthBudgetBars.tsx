import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export type MonthBudgetBarPoint = {
  monthIndex: number;
  label: string;
  budgeted: number;
  spent: number;
  percentageUsed: number;
};

type MonthBudgetBarsProps = {
  points: MonthBudgetBarPoint[];
  selectedMonthIndex: number;
  onSelectMonth: (monthIndex: number) => void;
  budgetColor: string;
  spentColor: string;
  overColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  selectedBorderColor: string;
};

const CHART_H = 120;
const LABEL_H = 18;
const STATUS_H = 10;

export default function MonthBudgetBars({
  points,
  selectedMonthIndex,
  onSelectMonth,
  budgetColor,
  spentColor,
  overColor,
  trackColor,
  textColor,
  mutedColor,
  selectedBorderColor,
}: MonthBudgetBarsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(280, Math.min(windowWidth - 48, 900));

  const maxVal = useMemo(() => {
    let m = 1;
    for (const p of points) {
      m = Math.max(m, p.budgeted, p.spent);
    }
    return m;
  }, [points]);

  const slotW = chartWidth / 12;
  const barW = Math.max(4, Math.min(10, slotW * 0.28));
  const gap = 2;

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: budgetColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Budget</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: spentColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Spent</Text>
        </View>
      </View>

      <View style={{ width: chartWidth }}>
        <Svg width={chartWidth} height={CHART_H}>
          {points.map((p) => {
            const xCenter = p.monthIndex * slotW + slotW / 2;
            const budgetH = Math.max(0, (p.budgeted / maxVal) * (CHART_H - 4));
            const spentH = Math.max(0, (p.spent / maxVal) * (CHART_H - 4));
            const budgetX = xCenter - barW - gap / 2;
            const spentX = xCenter + gap / 2;
            const over = p.budgeted > 0 && p.spent > p.budgeted;
            return (
              <React.Fragment key={p.monthIndex}>
                <Rect
                  x={budgetX}
                  y={CHART_H - budgetH}
                  width={barW}
                  height={budgetH || 1}
                  rx={2}
                  fill={budgetColor}
                  opacity={p.budgeted > 0 ? 1 : 0.25}
                />
                <Rect
                  x={spentX}
                  y={CHART_H - spentH}
                  width={barW}
                  height={spentH || 1}
                  rx={2}
                  fill={over ? overColor : spentColor}
                  opacity={p.spent > 0 ? 1 : 0.25}
                />
              </React.Fragment>
            );
          })}
        </Svg>

        <View style={[styles.statusRow, { height: STATUS_H }]}>
          {points.map((p) => {
            const over = p.budgeted > 0 && p.spent > p.budgeted;
            const empty = p.budgeted <= 0 && p.spent <= 0;
            return (
              <View key={`st-${p.monthIndex}`} style={[styles.statusSlot, { width: slotW }]}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: over ? overColor : spentColor,
                      opacity: empty ? 0.2 : p.percentageUsed >= 80 || over ? 0.95 : 0.45,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>

        <View style={[styles.labelRow, { height: LABEL_H }]}>
          {points.map((p) => {
            const selected = p.monthIndex === selectedMonthIndex;
            return (
              <TouchableOpacity
                key={`lbl-${p.monthIndex}`}
                style={[
                  styles.labelSlot,
                  { width: slotW },
                  selected && {
                    borderBottomWidth: 2,
                    borderBottomColor: selectedBorderColor,
                  },
                ]}
                onPress={() => onSelectMonth(p.monthIndex)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label} budgets`}
              >
                <Text
                  style={[
                    styles.labelText,
                    { color: selected ? textColor : mutedColor },
                    selected && styles.labelTextSelected,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.hitOverlay, { height: CHART_H + STATUS_H }]} pointerEvents="box-none">
          {points.map((p) => (
            <TouchableOpacity
              key={`hit-${p.monthIndex}`}
              style={[styles.hitSlot, { width: slotW }]}
              onPress={() => onSelectMonth(p.monthIndex)}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ))}
        </View>
      </View>

      <View style={[styles.trackHint, { backgroundColor: trackColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignItems: 'center', alignSelf: 'stretch' },
  legend: { flexDirection: 'row', gap: 14, alignItems: 'center', alignSelf: 'stretch' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600' },
  statusRow: { flexDirection: 'row', marginTop: 4 },
  statusSlot: { alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  labelRow: { flexDirection: 'row', marginTop: 2 },
  labelSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  labelText: { fontSize: 10, fontWeight: '600' },
  labelTextSelected: { fontWeight: '800' },
  hitOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
  },
  hitSlot: { height: '100%' },
  trackHint: {
    height: StyleSheet.hairlineWidth,
    marginTop: 4,
    opacity: 0.6,
    alignSelf: 'stretch',
  },
});
