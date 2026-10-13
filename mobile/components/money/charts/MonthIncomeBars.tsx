import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export type MonthIncomeBarPoint = {
  monthIndex: number;
  label: string;
  income: number;
};

type MonthIncomeBarsProps = {
  points: MonthIncomeBarPoint[];
  selectedMonthIndex: number;
  onSelectMonth: (monthIndex: number) => void;
  incomeColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  selectedBorderColor: string;
};

const CHART_H = 120;
const LABEL_H = 18;
const MIN_CHART_W = 280;

export default function MonthIncomeBars({
  points,
  selectedMonthIndex,
  onSelectMonth,
  incomeColor,
  trackColor,
  textColor,
  mutedColor,
  selectedBorderColor,
}: MonthIncomeBarsProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  // Fit the parent column; never size from window width (clips in 2-col layouts).
  const chartWidth = containerWidth > 0 ? containerWidth : MIN_CHART_W;

  const maxVal = useMemo(() => {
    let m = 1;
    for (const p of points) m = Math.max(m, p.income);
    return m;
  }, [points]);

  const slotW = chartWidth / 12;
  const barW = Math.max(6, Math.min(14, slotW * 0.45));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) setContainerWidth(w);
  };

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: incomeColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Income</Text>
        </View>
      </View>

      {containerWidth > 0 ? (
        <View style={{ width: chartWidth }}>
          <Svg width={chartWidth} height={CHART_H}>
            {points.map((p) => {
              const xCenter = p.monthIndex * slotW + slotW / 2;
              const incomeH = Math.max(0, (p.income / maxVal) * (CHART_H - 4));
              const selected = p.monthIndex === selectedMonthIndex;
              return (
                <Rect
                  key={p.monthIndex}
                  x={xCenter - barW / 2}
                  y={CHART_H - incomeH}
                  width={barW}
                  height={incomeH || 1}
                  rx={2}
                  fill={incomeColor}
                  opacity={p.income > 0 ? (selected ? 1 : 0.75) : 0.25}
                />
              );
            })}
          </Svg>

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
                  accessibilityLabel={`${p.label} income`}
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

          <View style={[styles.hitOverlay, { height: CHART_H }]} pointerEvents="box-none">
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
      ) : null}

      <View style={[styles.trackHint, { backgroundColor: trackColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch', width: '100%' },
  legend: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600' },
  labelRow: { flexDirection: 'row', marginTop: 6 },
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
