import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutChangeEvent,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { formatCurrency } from '../../../utils/moneyInput';
import { isPhoneMoneyLayout } from '../../expenses/phoneMoneyLayout';

export type BalanceLinePoint = {
  date: string;
  label: string;
  value: number;
};

type BalanceLineChartProps = {
  points: BalanceLinePoint[];
  lineColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  formatAmount?: (n: number) => string;
  /** Horizontal reference lines, such as the year-start balance and the goal. */
  guides?: { value: number; color: string }[];
};

const PHONE_H = 148;
const DESKTOP_H = 176;

function rangeAxisLabel(n: number, span: number): string {
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const unit = abs >= 1_000_000 || span >= 1_000_000 ? 1_000_000 : abs >= 1000 || span >= 1000 ? 1000 : 1;
  const suffix = unit === 1_000_000 ? 'M' : unit === 1000 ? 'k' : '';
  const scaledSpan = Math.max(span, 0) / unit;
  const decimals = scaledSpan >= 5 ? 0 : scaledSpan >= 0.5 ? 1 : scaledSpan >= 0.05 ? 2 : 3;
  return `${sign}$${(abs / unit).toFixed(decimals)}${suffix}`;
}

function pickLabelIndexes(xs: number[], minDist: number): number[] {
  if (xs.length === 0) return [];
  if (xs.length === 1) return [0];
  const last = xs.length - 1;
  const chosen = [0];
  for (let i = 1; i < last; i++) {
    const prevX = xs[chosen[chosen.length - 1]];
    if (xs[i] - prevX >= minDist && xs[last] - xs[i] >= minDist) chosen.push(i);
  }
  if (xs[last] - xs[chosen[chosen.length - 1]] >= minDist * 0.85) chosen.push(last);
  else if (chosen.length === 1) chosen.push(last);
  else chosen[chosen.length - 1] = last;
  return chosen;
}

export default function BalanceLineChart({
  points,
  lineColor,
  trackColor,
  textColor,
  mutedColor,
  formatAmount = formatCurrency,
  guides = [],
}: BalanceLineChartProps) {
  const { width: windowWidth } = useWindowDimensions();
  const phone = isPhoneMoneyLayout(windowWidth);
  const chartH = phone ? PHONE_H : DESKTOP_H;
  const labelW = phone ? 44 : 52;
  const gradId = `bal${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const [containerWidth, setContainerWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const pointKey = points.map((p) => `${p.date}:${p.value}`).join('|');
  useEffect(() => {
    setHover(null);
  }, [pointKey, points.length]);

  const chartWidth = containerWidth > 0 ? containerWidth : 0;
  const plotH = chartH - 6;

  const { chartMin, chartMax, ticks } = useMemo(() => {
    const values = [
      ...points.map((p) => p.value),
      ...guides.map((g) => g.value),
    ].filter((v) => Number.isFinite(v));
    let min = values.length ? Math.min(...values) : 0;
    let max = values.length ? Math.max(...values) : 1;
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.02, 1);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.22;
      min -= pad;
      max += pad;
    }
    const divisions = phone ? 2 : 3;
    const span = max - min || 1;
    const nextTicks = [];
    for (let i = 0; i <= divisions; i++) {
      const value = min + (span * i) / divisions;
      nextTicks.push({ value, ratio: (value - min) / span });
    }
    return { chartMin: min, chartMax: max, ticks: nextTicks };
  }, [points, guides, phone]);

  const span = chartMax - chartMin || 1;
  const hiddenAmounts = formatAmount(1) === '*****';
  const tickLabels = ticks.map((t) => (hiddenAmounts ? '••' : rangeAxisLabel(t.value, span)));
  const axisW = Math.min(
    84,
    Math.max(phone ? 42 : 48, ...tickLabels.map((label) => label.length * (phone ? 5.4 : 5.8) + 8))
  );
  const plotWidth = Math.max(1, chartWidth - axisW);

  const yFor = (value: number) => {
    const span = chartMax - chartMin || 1;
    const ratio = (value - chartMin) / span;
    return plotH - ratio * (plotH - 8) + 4;
  };

  const coords = useMemo(() => {
    const inset = 8;
    const inner = Math.max(1, plotWidth - inset * 2);
    return points.map((p, i) => {
      const x = points.length <= 1 ? plotWidth / 2 : inset + (i / (points.length - 1)) * inner;
      return { x, y: yFor(p.value) };
    });
  }, [points, plotWidth, plotH, chartMin, chartMax]);

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const baseline = plotH - 2;
  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${baseline} L${coords[0].x.toFixed(1)},${baseline} Z`
      : '';

  const activeIndex = hover;
  const active = activeIndex != null ? points[activeIndex] : null;
  const activeCoord = activeIndex != null ? coords[activeIndex] : null;

  const xLabels = useMemo(() => {
    const indexes = pickLabelIndexes(
      coords.map((c) => c.x),
      labelW + 8
    );
    if (indexes.length === 0) return [];
    if (indexes.length === 1) {
      const x = coords[indexes[0]]?.x ?? 0;
      const left = Math.max(0, Math.min(x - labelW / 2, Math.max(0, plotWidth - labelW)));
      return [{ index: indexes[0], left }];
    }
    const lastLeft = Math.max(labelW + 4, plotWidth - labelW);
    const placed: { index: number; left: number }[] = [{ index: indexes[0], left: 0 }];
    let prevRight = labelW;
    for (const index of indexes.slice(1, -1)) {
      const x = coords[index]?.x ?? 0;
      let left = x - labelW / 2;
      left = Math.max(prevRight + 4, left);
      if (left + labelW > lastLeft - 4) continue;
      placed.push({ index, left });
      prevRight = left + labelW;
    }
    placed.push({ index: indexes[indexes.length - 1], left: lastLeft });
    return placed;
  }, [coords, labelW, plotWidth]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) setContainerWidth(w);
  };

  const slotAt = (i: number) => {
    if (coords.length <= 1) return { left: 0, width: plotWidth };
    const left = i === 0 ? 0 : (coords[i - 1].x + coords[i].x) / 2;
    const right = i === coords.length - 1 ? plotWidth : (coords[i].x + coords[i + 1].x) / 2;
    return { left, width: Math.max(12, right - left) };
  };

  if (points.length === 0) return null;

  const tipText = active ? formatAmount(active.value) : '';
  const tipNeeded = Math.ceil(tipText.length * 8.6) + 22;
  const tipMax = Math.max(72, plotWidth - 8);
  const tipW = Math.min(tipNeeded, tipMax);
  const tipFont = tipNeeded > tipMax ? Math.max(9, (12 * tipMax) / tipNeeded) : 12;
  let tipLeft = 4;
  let tipTop = 4;
  if (activeCoord) {
    tipLeft = activeCoord.x < plotWidth / 2 ? activeCoord.x : activeCoord.x - tipW;
    tipLeft = Math.max(4, Math.min(tipLeft, plotWidth - tipW - 4));
    const above = activeCoord.y - 46;
    tipTop = above >= 2 ? above : Math.min(activeCoord.y + 14, Math.max(2, chartH - 42));
  }

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {chartWidth > 0 ? (
        <View style={{ width: chartWidth, maxWidth: '100%' }}>
          <View style={styles.plotRow}>
            <View style={[styles.yAxis, { height: chartH, width: axisW }]}>
                {ticks.map((t, i) => (
                <Text
                  key={`y-${t.value}`}
                  style={[
                    styles.yLabel,
                    {
                      color: mutedColor,
                      width: axisW - 4,
                      bottom: t.ratio * (plotH - 8) - 2,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {tickLabels[i]}
                </Text>
              ))}
            </View>
            <View style={{ width: plotWidth, height: chartH }}>
              <Svg width={plotWidth} height={chartH}>
                <Defs>
                  <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={lineColor} stopOpacity={0.32} />
                    <Stop offset="1" stopColor={lineColor} stopOpacity={0.02} />
                  </LinearGradient>
                </Defs>
                {ticks.map((t) => {
                  const y = plotH - t.ratio * (plotH - 8) + 4;
                  return (
                    <Line
                      key={`g-${t.value}`}
                      x1={0}
                      y1={y}
                      x2={plotWidth}
                      y2={y}
                      stroke={trackColor}
                      strokeWidth={1}
                    />
                  );
                })}
                {areaPath ? <Path d={areaPath} fill={`url(#${gradId})`} /> : null}
                {guides.map((g, i) => (
                  <Line
                    key={`guide-${i}`}
                    x1={0}
                    y1={yFor(g.value)}
                    x2={plotWidth}
                    y2={yFor(g.value)}
                    stroke={g.color}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                  />
                ))}
                {linePath ? (
                  <Path
                    d={linePath}
                    stroke={lineColor}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {coords.map((c, i) => {
                  const on = i === hover;
                  return (
                    <Circle
                      key={`p-${points[i].date}-${i}`}
                      cx={c.x}
                      cy={c.y}
                      r={on ? 5 : 3.5}
                      fill={on ? lineColor : '#fff'}
                      stroke={lineColor}
                      strokeWidth={on ? 0 : 2}
                    />
                  );
                })}
              </Svg>
              <View
                style={styles.hit}
                {...(Platform.OS === 'web' ? { onMouseLeave: () => setHover(null) } : {})}
              >
                {coords.map((_, i) => {
                  const slot = slotAt(i);
                  return (
                    <View
                      key={`hit-${points[i].date}-${i}`}
                      style={[styles.hitSlot, { left: slot.left, width: slot.width }]}
                    >
                      <Pressable
                        style={styles.hitFill}
                        onPress={() => setHover(i)}
                        onPressIn={() => setHover(i)}
                        {...(Platform.OS === 'web' ? { onMouseEnter: () => setHover(i) } : {})}
                      />
                    </View>
                  );
                })}
                {active && activeCoord ? (
                  <View
                    pointerEvents="none"
                    style={[styles.tip, { left: tipLeft, top: tipTop, width: tipW, borderColor: lineColor }]}
                  >
                    <Text style={styles.tipDate} numberOfLines={1}>
                      {active.label}
                    </Text>
                    <Text style={[styles.tipValue, { fontSize: tipFont }]} numberOfLines={1}>
                      {tipText}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <View style={[styles.xRow, { marginLeft: axisW, width: plotWidth, height: 16 }]}>
            {xLabels.map(({ index, left }) => (
              <Text
                key={`x-${points[index].date}-${index}`}
                style={[
                  styles.xLabel,
                  {
                    color: index === activeIndex ? textColor : mutedColor,
                    left,
                    width: labelW,
                    fontWeight: index === hover ? '800' : '600',
                  },
                ]}
                numberOfLines={1}
              >
                {points[index].label}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%', maxWidth: '100%' },
  plotRow: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: '100%' },
  yAxis: { position: 'relative' },
  yLabel: {
    position: 'absolute',
    right: 2,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'right',
  },
  xRow: { position: 'relative', marginTop: 4 },
  xLabel: { position: 'absolute', fontSize: 10, textAlign: 'center' },
  hit: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  hitSlot: { position: 'absolute', top: 0, bottom: 0 },
  hitFill: { flex: 1 },
  tip: {
    position: 'absolute',
    zIndex: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.94)',
    maxWidth: '100%',
  },
  tipDate: { color: '#c7c7cc', fontSize: 10, fontWeight: '700' },
  tipValue: { color: '#fff', fontSize: 12, fontWeight: '800', flexShrink: 0 },
});
