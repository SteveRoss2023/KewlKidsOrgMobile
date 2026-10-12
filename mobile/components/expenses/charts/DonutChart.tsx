import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export type DonutSlice = {
  key: string;
  amount: number;
  color: string;
  label: string;
};

type DonutChartProps = {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  textColor: string;
  mutedColor: string;
  trackColor: string;
};

export default function DonutChart({
  slices,
  size = 160,
  strokeWidth = 22,
  centerLabel,
  centerSubLabel,
  textColor,
  mutedColor,
  trackColor,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const { arcs, total } = useMemo(() => {
    const positive = slices.filter((s) => s.amount > 0);
    const sum = positive.reduce((acc, s) => acc + s.amount, 0);
    if (sum <= 0) {
      return { arcs: [] as { key: string; color: string; dash: string; offset: number }[], total: 0 };
    }
    let cursor = 0;
    const built = positive.map((s) => {
      const len = (s.amount / sum) * circumference;
      const offset = -cursor;
      cursor += len;
      return {
        key: s.key,
        color: s.color,
        dash: `${len} ${circumference - len}`,
        offset,
      };
    });
    return { arcs: built, total: sum };
  }, [slices, circumference]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          {arcs.map((arc) => (
            <Circle
              key={arc.key}
              cx={cx}
              cy={cy}
              r={radius}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={arc.dash}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {centerLabel ? (
          <Text style={[styles.centerLabel, { color: textColor }]} numberOfLines={1}>
            {centerLabel}
          </Text>
        ) : null}
        {centerSubLabel ? (
          <Text style={[styles.centerSub, { color: mutedColor }]} numberOfLines={1}>
            {centerSubLabel}
          </Text>
        ) : total <= 0 ? (
          <Text style={[styles.centerSub, { color: mutedColor }]}>No data</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  centerLabel: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  centerSub: { fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});
