import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export type RateGrowthBarPoint = {
  rate: number;
  label: string;
  growth: number;
};

type RateGrowthBarsProps = {
  points: RateGrowthBarPoint[];
  selectedRate: number;
  onSelectRate: (rate: number) => void;
  barColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  selectedBorderColor: string;
};

const CHART_H = 120;
const LABEL_H = 20;

export default function RateGrowthBars({
  points,
  selectedRate,
  onSelectRate,
  barColor,
  trackColor,
  textColor,
  mutedColor,
  selectedBorderColor,
}: RateGrowthBarsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(280, Math.min(windowWidth - 48, 720));
  const n = Math.max(1, points.length);

  const maxVal = useMemo(() => {
    let m = 1;
    for (const p of points) m = Math.max(m, p.growth);
    return m;
  }, [points]);

  const slotW = chartWidth / n;
  const barW = Math.max(8, Math.min(18, slotW * 0.5));

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: barColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Year-end growth</Text>
        </View>
      </View>

      <View style={{ width: chartWidth }}>
        <Svg width={chartWidth} height={CHART_H}>
          {points.map((p, i) => {
            const xCenter = i * slotW + slotW / 2;
            const h = Math.max(0, (p.growth / maxVal) * (CHART_H - 4));
            const selected = p.rate === selectedRate;
            return (
              <Rect
                key={p.rate}
                x={xCenter - barW / 2}
                y={CHART_H - h}
                width={barW}
                height={h || 1}
                rx={2}
                fill={barColor}
                opacity={p.growth > 0 ? (selected ? 1 : 0.7) : 0.25}
              />
            );
          })}
        </Svg>

        <View style={[styles.labelRow, { height: LABEL_H }]}>
          {points.map((p, i) => {
            const selected = p.rate === selectedRate;
            return (
              <TouchableOpacity
                key={`lbl-${p.rate}`}
                style={[
                  styles.labelSlot,
                  { width: slotW },
                  selected && {
                    borderBottomWidth: 2,
                    borderBottomColor: selectedBorderColor,
                  },
                ]}
                onPress={() => onSelectRate(p.rate)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label} growth`}
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
          {points.map((p, i) => (
            <TouchableOpacity
              key={`hit-${p.rate}`}
              style={[styles.hitSlot, { width: slotW }]}
              onPress={() => onSelectRate(p.rate)}
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
  trackHint: { height: StyleSheet.hairlineWidth, marginTop: 4, opacity: 0.6 },
});
