import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { formatCurrency } from '../../../utils/moneyInput';
import BarChartTooltip from '../../charts/BarChartTooltip';
import {
  CHART_H,
  Y_AXIS_W,
  axisLabelForAmount,
  chartAxisTicks,
  niceChartMax,
} from '../../charts/barChartUtils';

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
  formatAmount?: (n: number) => string;
};

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
  formatAmount = formatCurrency,
}: RateGrowthBarsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartWidth = Math.max(280, Math.min(windowWidth - 48, 720));
  const plotWidth = Math.max(1, chartWidth - Y_AXIS_W);
  const n = Math.max(1, points.length);

  const rawMax = useMemo(() => {
    let m = 1;
    for (const p of points) m = Math.max(m, p.growth);
    return m;
  }, [points]);

  const chartMax = niceChartMax(rawMax);
  const ticks = useMemo(() => chartAxisTicks(rawMax, 3), [rawMax]);

  const slotW = plotWidth / n;
  const barW = Math.max(8, Math.min(18, slotW * 0.5));
  const hoverPoint = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: barColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Year-end growth</Text>
        </View>
      </View>

      <View style={{ width: chartWidth }}>
        <View style={styles.plotRow}>
          <View style={[styles.yAxis, { height: CHART_H, width: Y_AXIS_W }]}>
            {ticks.map((t) => (
              <Text
                key={`y-${t.value}`}
                style={[
                  styles.yLabel,
                  {
                    color: mutedColor,
                    bottom: t.ratio * (CHART_H - 4) - 6,
                  },
                ]}
              >
                {axisLabelForAmount(t.value, formatAmount)}
              </Text>
            ))}
          </View>

          <View style={{ width: plotWidth }}>
            <Svg width={plotWidth} height={CHART_H}>
              {ticks.map((t) => {
                const y = CHART_H - t.ratio * (CHART_H - 4);
                return (
                  <Line
                    key={`g-${t.value}`}
                    x1={0}
                    y1={y}
                    x2={plotWidth}
                    y2={y}
                    stroke={trackColor}
                    strokeWidth={StyleSheet.hairlineWidth * 2}
                    opacity={t.value === 0 ? 0.7 : 0.35}
                  />
                );
              })}
              {points.map((p, i) => {
                const xCenter = i * slotW + slotW / 2;
                const h = Math.max(0, (p.growth / chartMax) * (CHART_H - 4));
                const selected = p.rate === selectedRate;
                const hovered = i === hoverIndex;
                return (
                  <Rect
                    key={p.rate}
                    x={xCenter - barW / 2}
                    y={CHART_H - h}
                    width={barW}
                    height={h || 1}
                    rx={2}
                    fill={barColor}
                    opacity={p.growth > 0 ? (selected || hovered ? 1 : 0.7) : 0.25}
                  />
                );
              })}
            </Svg>

            {hoverPoint ? (
              <BarChartTooltip
                title={hoverPoint.label}
                lines={[
                  {
                    label: 'Growth',
                    value: formatAmount(hoverPoint.growth),
                    color: barColor,
                  },
                ]}
                x={(hoverIndex ?? 0) * slotW + slotW / 2}
                plotWidth={plotWidth}
              />
            ) : null}

            <View style={[styles.hitOverlay, { height: CHART_H }]} pointerEvents="box-none">
              {points.map((p, i) => (
                <TouchableOpacity
                  key={`hit-${p.rate}`}
                  style={[styles.hitSlot, { width: slotW }]}
                  onPress={() => onSelectRate(p.rate)}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  {...(Platform.OS === 'web'
                    ? {
                        onMouseEnter: () => setHoverIndex(i),
                        onMouseLeave: () => setHoverIndex(null),
                      }
                    : {
                        onPressIn: () => setHoverIndex(i),
                        onPressOut: () => setHoverIndex(null),
                      })}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.labelRow, { height: LABEL_H, marginLeft: Y_AXIS_W }]}>
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
                accessibilityLabel={`${p.label} growth ${formatAmount(p.growth)}`}
                {...(Platform.OS === 'web'
                  ? {
                      onMouseEnter: () => setHoverIndex(i),
                      onMouseLeave: () => setHoverIndex(null),
                    }
                  : {})}
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
  plotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  yAxis: { position: 'relative' },
  yLabel: {
    position: 'absolute',
    right: 4,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'right',
    width: Y_AXIS_W - 6,
  },
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
