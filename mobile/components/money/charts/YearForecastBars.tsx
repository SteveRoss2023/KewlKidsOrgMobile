import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export type YearForecastBarPoint = {
  yearsAhead: number;
  label: string;
  portfolio: number;
};

type YearForecastBarsProps = {
  points: YearForecastBarPoint[];
  selectedYearsAhead: number;
  onSelectYearsAhead: (yearsAhead: number) => void;
  barColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  selectedBorderColor: string;
};

const CHART_H = 120;
const LABEL_H = 20;

export default function YearForecastBars({
  points,
  selectedYearsAhead,
  onSelectYearsAhead,
  barColor,
  trackColor,
  textColor,
  mutedColor,
  selectedBorderColor,
}: YearForecastBarsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(280, Math.min(windowWidth - 48, 720));
  const n = Math.max(1, points.length);

  const maxVal = useMemo(() => {
    let m = 1;
    for (const p of points) m = Math.max(m, p.portfolio);
    return m;
  }, [points]);

  const slotW = chartWidth / n;
  const barW = Math.max(6, Math.min(16, slotW * 0.5));

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: barColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Portfolio</Text>
        </View>
      </View>

      <View style={{ width: chartWidth }}>
        <Svg width={chartWidth} height={CHART_H}>
          {points.map((p, i) => {
            const xCenter = i * slotW + slotW / 2;
            const h = Math.max(0, (p.portfolio / maxVal) * (CHART_H - 4));
            const selected = p.yearsAhead === selectedYearsAhead;
            return (
              <Rect
                key={p.yearsAhead}
                x={xCenter - barW / 2}
                y={CHART_H - h}
                width={barW}
                height={h || 1}
                rx={2}
                fill={barColor}
                opacity={p.portfolio > 0 ? (selected ? 1 : 0.7) : 0.25}
              />
            );
          })}
        </Svg>

        <View style={[styles.labelRow, { height: LABEL_H }]}>
          {points.map((p) => {
            const selected = p.yearsAhead === selectedYearsAhead;
            return (
              <TouchableOpacity
                key={`lbl-${p.yearsAhead}`}
                style={[
                  styles.labelSlot,
                  { width: slotW },
                  selected && {
                    borderBottomWidth: 2,
                    borderBottomColor: selectedBorderColor,
                  },
                ]}
                onPress={() => onSelectYearsAhead(p.yearsAhead)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label} portfolio`}
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
              key={`hit-${p.yearsAhead}`}
              style={[styles.hitSlot, { width: slotW }]}
              onPress={() => onSelectYearsAhead(p.yearsAhead)}
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
  wrap: { gap: 8 },
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
  labelText: { fontSize: 9, fontWeight: '600' },
  labelTextSelected: { fontWeight: '800' },
  hitOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
  },
  hitSlot: { height: '100%' },
  trackHint: { height: StyleSheet.hairlineWidth, marginTop: 4, opacity: 0.6 },
});
