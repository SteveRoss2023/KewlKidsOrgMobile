import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
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
  /** Prefer `displayMoney` so hide-amounts is respected. */
  formatAmount?: (n: number) => string;
};

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
  formatAmount = formatCurrency,
}: MonthIncomeBarsProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartWidth = containerWidth > 0 ? containerWidth : MIN_CHART_W;
  const plotWidth = Math.max(1, chartWidth - Y_AXIS_W);

  const rawMax = useMemo(() => {
    let m = 1;
    for (const p of points) m = Math.max(m, p.income);
    return m;
  }, [points]);

  const chartMax = niceChartMax(rawMax);
  const ticks = useMemo(() => chartAxisTicks(rawMax, 3), [rawMax]);

  const slotW = plotWidth / 12;
  const barW = Math.max(6, Math.min(14, slotW * 0.45));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) setContainerWidth(w);
  };

  const hoverPoint = hoverIndex != null ? points[hoverIndex] : null;

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
                {points.map((p) => {
                  const xCenter = p.monthIndex * slotW + slotW / 2;
                  const incomeH = Math.max(0, (p.income / chartMax) * (CHART_H - 4));
                  const selected = p.monthIndex === selectedMonthIndex;
                  const hovered = p.monthIndex === hoverIndex;
                  return (
                    <Rect
                      key={p.monthIndex}
                      x={xCenter - barW / 2}
                      y={CHART_H - incomeH}
                      width={barW}
                      height={incomeH || 1}
                      rx={2}
                      fill={incomeColor}
                      opacity={p.income > 0 ? (selected || hovered ? 1 : 0.75) : 0.25}
                    />
                  );
                })}
              </Svg>

              {hoverPoint ? (
                <BarChartTooltip
                  title={hoverPoint.label}
                  lines={[
                    {
                      label: 'Income',
                      value: formatAmount(hoverPoint.income),
                      color: incomeColor,
                    },
                  ]}
                  x={hoverPoint.monthIndex * slotW + slotW / 2}
                  plotWidth={plotWidth}
                />
              ) : null}

              <View style={[styles.hitOverlay, { height: CHART_H }]} pointerEvents="box-none">
                {points.map((p) => (
                  <TouchableOpacity
                    key={`hit-${p.monthIndex}`}
                    style={[styles.hitSlot, { width: slotW }]}
                    onPress={() => onSelectMonth(p.monthIndex)}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    {...(Platform.OS === 'web'
                      ? {
                          onMouseEnter: () => setHoverIndex(p.monthIndex),
                          onMouseLeave: () => setHoverIndex(null),
                        }
                      : {
                          onPressIn: () => setHoverIndex(p.monthIndex),
                          onPressOut: () => setHoverIndex(null),
                        })}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.labelRow, { height: LABEL_H, marginLeft: Y_AXIS_W }]}>
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
                  accessibilityLabel={`${p.label} income ${formatAmount(p.income)}`}
                  {...(Platform.OS === 'web'
                    ? {
                        onMouseEnter: () => setHoverIndex(p.monthIndex),
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
  trackHint: {
    height: StyleSheet.hairlineWidth,
    marginTop: 4,
    opacity: 0.6,
    alignSelf: 'stretch',
  },
});
