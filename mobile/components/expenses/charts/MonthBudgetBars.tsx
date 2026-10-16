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

export type MonthBudgetBarPoint = {
  monthIndex: number;
  label: string;
  budgeted: number;
  /** Paid expenses */
  spent: number;
  /** Unpaid expenses */
  unpaid: number;
  percentageUsed: number;
};

type MonthBudgetBarsProps = {
  points: MonthBudgetBarPoint[];
  selectedMonthIndex: number;
  onSelectMonth: (monthIndex: number) => void;
  budgetColor: string;
  spentColor: string;
  unpaidColor: string;
  overColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  selectedBorderColor: string;
  formatAmount?: (n: number) => string;
};

const LABEL_H = 18;
const STATUS_H = 10;
const MIN_CHART_W = 280;

export default function MonthBudgetBars({
  points,
  selectedMonthIndex,
  onSelectMonth,
  budgetColor,
  spentColor,
  unpaidColor,
  overColor,
  trackColor,
  textColor,
  mutedColor,
  selectedBorderColor,
  formatAmount = formatCurrency,
}: MonthBudgetBarsProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartWidth = containerWidth > 0 ? containerWidth : MIN_CHART_W;
  const plotWidth = Math.max(1, chartWidth - Y_AXIS_W);

  const rawMax = useMemo(() => {
    let m = 1;
    for (const p of points) {
      m = Math.max(m, p.budgeted, p.spent + p.unpaid);
    }
    return m;
  }, [points]);

  const chartMax = niceChartMax(rawMax);
  const ticks = useMemo(() => chartAxisTicks(rawMax, 3), [rawMax]);

  const slotW = plotWidth / 12;
  const barGap = 2;
  const barW = Math.max(4, Math.min(10, (slotW * 0.7 - barGap) / 2));
  const groupW = barW * 2 + barGap;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) setContainerWidth(w);
  };

  const hoverPoint = hoverIndex != null ? points[hoverIndex] : null;

  const renderEmptyStub = (x: number, key: string) => (
    <Rect
      key={key}
      x={x}
      y={CHART_H - 2}
      width={barW}
      height={2}
      rx={1}
      fill={trackColor}
      opacity={0.4}
    />
  );

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: budgetColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Budget</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: spentColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Paid</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: unpaidColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Unpaid</Text>
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
                  const groupX = p.monthIndex * slotW + slotW / 2 - groupW / 2;
                  const budgetX = groupX;
                  const outflowX = groupX + barW + barGap;
                  const budget = Math.max(0, p.budgeted);
                  const spent = Math.max(0, p.spent);
                  const unpaid = Math.max(0, p.unpaid);
                  const scale = (CHART_H - 4) / chartMax;
                  const empty = budget <= 0 && spent <= 0 && unpaid <= 0;

                  if (empty) {
                    return (
                      <Rect
                        key={p.monthIndex}
                        x={groupX}
                        y={CHART_H - 2}
                        width={groupW}
                        height={2}
                        rx={1}
                        fill={trackColor}
                        opacity={0.5}
                      />
                    );
                  }

                  const budgetH = budget * scale;
                  // Same stack order as Overview: paid (bottom) then unpaid (top).
                  const outflowLayers = [
                    { h: spent * scale, fill: spentColor },
                    { h: unpaid * scale, fill: unpaidColor },
                  ].filter((l) => l.h > 0);

                  let outflowY = CHART_H;
                  return (
                    <React.Fragment key={p.monthIndex}>
                      {budgetH > 0 ? (
                        <Rect
                          x={budgetX}
                          y={CHART_H - Math.max(budgetH, 0.5)}
                          width={barW}
                          height={Math.max(budgetH, 0.5)}
                          rx={2}
                          fill={budgetColor}
                          opacity={0.9}
                        />
                      ) : (
                        renderEmptyStub(budgetX, `${p.monthIndex}-bud`)
                      )}
                      {outflowLayers.length === 0 ? (
                        renderEmptyStub(outflowX, `${p.monthIndex}-out`)
                      ) : (
                        outflowLayers.map((layer, i) => {
                          outflowY -= layer.h;
                          return (
                            <Rect
                              key={`${p.monthIndex}-out-${i}`}
                              x={outflowX}
                              y={outflowY}
                              width={barW}
                              height={Math.max(layer.h, 0.5)}
                              rx={i === outflowLayers.length - 1 ? 2 : 0}
                              fill={layer.fill}
                            />
                          );
                        })
                      )}
                    </React.Fragment>
                  );
                })}
              </Svg>

              {hoverPoint ? (
                <BarChartTooltip
                  title={hoverPoint.label}
                  lines={[
                    {
                      label: 'Budget',
                      value: formatAmount(hoverPoint.budgeted),
                      color: budgetColor,
                    },
                    {
                      label: 'Paid',
                      value: formatAmount(hoverPoint.spent),
                      color: spentColor,
                    },
                    {
                      label: 'Unpaid',
                      value: formatAmount(hoverPoint.unpaid),
                      color: unpaidColor,
                    },
                  ]}
                  x={hoverPoint.monthIndex * slotW + slotW / 2}
                  plotWidth={plotWidth}
                />
              ) : null}

              <View
                style={[styles.hitOverlay, { height: CHART_H + STATUS_H }]}
                pointerEvents="box-none"
              >
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

          <View style={[styles.statusRow, { height: STATUS_H, marginLeft: Y_AXIS_W }]}>
            {points.map((p) => {
              const projected = p.spent + p.unpaid;
              const over = p.budgeted > 0 && projected > p.budgeted;
              const empty = p.budgeted <= 0 && projected <= 0;
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
                  accessibilityLabel={`${p.label} budgets`}
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
  wrap: { width: '100%', gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600' },
  plotRow: { flexDirection: 'row', alignItems: 'flex-end' },
  yAxis: { position: 'relative' },
  yLabel: {
    position: 'absolute',
    left: 0,
    right: 4,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'right',
  },
  hitOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
  },
  hitSlot: { height: '100%' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusSlot: { alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  labelRow: { flexDirection: 'row' },
  labelSlot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  labelText: { fontSize: 10, fontWeight: '600' },
  labelTextSelected: { fontWeight: '800' },
  trackHint: { height: StyleSheet.hairlineWidth, opacity: 0.35, marginTop: 2 },
});
