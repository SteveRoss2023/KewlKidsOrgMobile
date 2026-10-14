/** Shared helpers for Money / Expenses SVG bar charts. */

export const Y_AXIS_W = 40;
export const CHART_H = 120;

/** Round max up to a clean axis top (1 / 2 / 5 × 10^n). */
export function niceChartMax(maxVal: number): number {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return 1;
  const exp = Math.floor(Math.log10(maxVal));
  const mag = 10 ** exp;
  const norm = maxVal / mag;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

export type ChartAxisTick = {
  value: number;
  /** 0 at baseline → 1 at chart top */
  ratio: number;
};

/** Even ticks from 0 → nice max (inclusive). */
export function chartAxisTicks(maxVal: number, divisions = 3): ChartAxisTick[] {
  const top = niceChartMax(maxVal);
  const ticks: ChartAxisTick[] = [];
  for (let i = 0; i <= divisions; i++) {
    const value = (top * i) / divisions;
    ticks.push({ value, ratio: top > 0 ? value / top : 0 });
  }
  return ticks;
}

/** Compact y-axis labels: $0, $500, $1.2k, $12k, $1.5M */
export function formatCompactAxisMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}$${v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1000) {
    const v = abs / 1000;
    return `${sign}$${v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (abs >= 100) return `${sign}$${Math.round(abs)}`;
  return `${sign}$${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(0)}`;
}

/**
 * Axis label that respects hide-amounts (`displayMoney` → *****).
 */
export function axisLabelForAmount(
  n: number,
  formatAmount?: (v: number) => string
): string {
  if (formatAmount) {
    const probe = formatAmount(1);
    if (probe === '*****') return '••';
  }
  return formatCompactAxisMoney(n);
}
