import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type BarChartTooltipLine = {
  label: string;
  value: string;
  color?: string;
};

type BarChartTooltipProps = {
  title: string;
  lines: BarChartTooltipLine[];
  /** Left offset within the plot area (slot center). */
  x: number;
  plotWidth: number;
};

/**
 * Floating value tooltip for bar charts (web hover / touch highlight).
 */
export default function BarChartTooltip({ title, lines, x, plotWidth }: BarChartTooltipProps) {
  const approxW = 140;
  const left = Math.max(4, Math.min(x - approxW / 2, plotWidth - approxW - 4));

  return (
    <View style={[styles.bubble, { left }]} pointerEvents="none">
      <Text style={styles.title}>{title}</Text>
      {lines.map((line) => (
        <View key={line.label} style={styles.row}>
          {line.color ? <View style={[styles.dot, { backgroundColor: line.color }]} /> : null}
          <Text style={styles.label}>{line.label}</Text>
          <Text style={styles.value}>{line.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    top: 4,
    zIndex: 20,
    minWidth: 120,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(28, 28, 30, 0.94)',
    gap: 4,
  },
  title: {
    color: '#f5f5f5',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 2 },
  label: { color: '#c7c7cc', fontSize: 11, fontWeight: '600', flex: 1 },
  value: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
});
