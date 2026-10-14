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

export type MonthBarPoint = {
  monthIndex: number;
  label: string;
  income: number;
  /** Paid expenses only */
  spent: number;
  /** Unpaid expense rows */
  unpaid: number;
  netAfterUnpaid: number;
};

type MonthCashflowBarsProps = {
  points: MonthBarPoint[];
  selectedMonthIndex: number;
  onSelectMonth: (monthIndex: number) => void;
  incomeColor: string;
  spentColor: string;
  unpaidColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  selectedBorderColor: string;
  formatAmount?: (n: number) => string;
};

const LABEL_H = 18;
const NET_H = 10;
const MIN_CHART_W = 280;

export default function MonthCashflowBars({
  points,
  selectedMonthIndex,
  onSelectMonth,
  incomeColor,
  spentColor,
  unpaidColor,
  trackColor,
  textColor,
  mutedColor,
  selectedBorderColor,
  formatAmount = formatCurrency,
}: MonthCashflowBarsProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartWidth = containerWidth > 0 ? containerWidth : MIN_CHART_W;
  const plotWidth = Math.max(1, chartWidth - Y_AXIS_W);

  const rawMax = useMemo(() => {
    let m = 1;
    for (const p of points) {
      m = Math.max(m, p.income, p.spent + p.unpaid);
    }
    return m;
  }, [points]);

  const chartMax = niceChartMax(rawMax);
  const ticks = useMemo(() => chartAxisTicks(rawMax, 3), [rawMax]);

  const slotW = plotWidth / 12;
  const pairGap = 2;
  const barW = Math.max(5, Math.min(8, (slotW * 0.55 - pairGap) / 2));
  const pairW = barW * 2 + pairGap;

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
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: spentColor }]} />
          <Text style={[styles.legendText, { color: mutedColor }]}>Spent</Text>
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
                  const pairX = p.monthIndex * slotW + slotW / 2 - pairW / 2;
                  const incomeX = pairX;
                  const outflowX = pairX + barW + pairGap;
                  const spent = Math.max(0, p.spent);
                  const unpaid = Math.max(0, p.unpaid);
                  const income = Math.max(0, p.income);
                  const scale = (CHART_H - 4) / chartMax;
                  const empty = spent <= 0 && unpaid <= 0 && income <= 0;

                  if (empty) {
                    return (
                      <Rect
                        key={p.monthIndex}
                        x={pairX}
                        y={CHART_H - 2}
                        width={pairW}
                        height={2}
                        rx={1}
                        fill={trackColor}
                        opacity={0.5}
                      />
                    );
                  }

                  const incomeH = income * scale;
                  const outflowLayers = [
                    { h: spent * scale, fill: spentColor },
                    { h: unpaid * scale, fill: unpaidColor },
                  ].filter((l) => l.h > 0);

                  let outflowY = CHART_H;
                  return (
                    <React.Fragment key={p.monthIndex}>
                      {incomeH > 0 ? (
                        <Rect
                          x={incomeX}
                          y={CHART_H - Math.max(incomeH, 0.5)}
                          width={barW}
                          height={Math.max(incomeH, 0.5)}
                          rx={2}
                          fill={incomeColor}
                          opacity={0.9}
                        />
                      ) : (
                        <Rect
                          x={incomeX}
                          y={CHART_H - 2}
                          width={barW}
                          height={2}
                          rx={1}
                          fill={trackColor}
                          opacity={0.4}
                        />
                      )}
                      {outflowLayers.length === 0 ? (
                        <Rect
                          x={outflowX}
                          y={CHART_H - 2}
                          width={barW}
                          height={2}
                          rx={1}
                          fill={trackColor}
                          opacity={0.4}
                        />
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
                      label: 'Income',
                      value: formatAmount(hoverPoint.income),
                      color: incomeColor,
                    },
                    {
                      label: 'Spent',
                      value: formatAmount(hoverPoint.spent),
                      color: spentColor,
                    },
                    {
                      label: 'Unpaid',
                      value: formatAmount(hoverPoint.unpaid),
                      color: unpaidColor,
                    },
                    {
                      label: 'Net',
                      value: formatAmount(hoverPoint.netAfterUnpaid),
                    },
                  ]}
                  x={hoverPoint.monthIndex * slotW + slotW / 2}
                  plotWidth={plotWidth}
                />
              ) : null}

              <View
                style={[styles.hitOverlay, { height: CHART_H + NET_H }]}
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

          <View style={[styles.netRow, { height: NET_H, marginLeft: Y_AXIS_W }]}>
            {points.map((p) => {
              const empty = p.income === 0 && p.spent === 0 && p.unpaid === 0;
              const positive = p.netAfterUnpaid >= 0;
              const dotColor =
                p.spent <= 0 && p.unpaid > 0
                  ? unpaidColor
                  : positive
                    ? incomeColor
                    : spentColor;
              return (
                <View key={`net-${p.monthIndex}`} style={[styles.netSlot, { width: slotW }]}>
                  <View
                    style={[
                      styles.netDot,
                      {
                        backgroundColor: dotColor,
                        opacity: empty ? 0.2 : 0.9,
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
                  accessibilityLabel={`${p.label} cashflow`}
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
  wrap: { gap: 8, alignItems: 'center', alignSelf: 'stretch', width: '100%' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
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
  netRow: { flexDirection: 'row', marginTop: 4 },
  netSlot: { alignItems: 'center', justifyContent: 'center' },
  netDot: { width: 5, height: 5, borderRadius: 2.5 },
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
