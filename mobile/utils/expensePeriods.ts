export type PeriodMode = 'day' | 'week' | 'month' | 'year';
export type PeriodModeOrAll = PeriodMode | 'all';

export function startOfPeriod(date: Date, mode: PeriodMode): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (mode === 'day') return d;
  if (mode === 'week') {
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  if (mode === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), 0, 1);
}

export function shiftPeriod(date: Date, mode: PeriodMode, delta: number): Date {
  const d = startOfPeriod(date, mode);
  if (mode === 'day') d.setDate(d.getDate() + delta);
  else if (mode === 'week') d.setDate(d.getDate() + delta * 7);
  else if (mode === 'month') d.setMonth(d.getMonth() + delta);
  else d.setFullYear(d.getFullYear() + delta);
  return d;
}

export function formatPeriodLabel(date: Date, mode: PeriodMode, short = false): string {
  const d = startOfPeriod(date, mode);
  if (mode === 'day') {
    return d.toLocaleDateString('en-US', short
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (mode === 'week') {
    if (short) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return `Week of ${d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }
  if (mode === 'month') {
    return d.toLocaleDateString('en-US', short
      ? { month: 'short', year: '2-digit' }
      : { year: 'numeric', month: 'long' });
  }
  return d.toLocaleDateString('en-US', { year: 'numeric' });
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Inclusive start/end for API filters.
 * `all` returns no date bounds (load everything).
 */
export function periodDateRange(
  viewDate: Date,
  mode: PeriodModeOrAll
): { start_date?: string; end_date?: string; asOf: string } {
  if (mode === 'all') {
    const asOf = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    return { asOf };
  }
  const start = startOfPeriod(viewDate, mode);
  const endExclusive = shiftPeriod(start, mode, 1);
  const endInclusive = new Date(endExclusive);
  endInclusive.setDate(endInclusive.getDate() - 1);
  const start_date = toDateKey(start);
  return { start_date, end_date: toDateKey(endInclusive), asOf: start_date };
}

export const PERIOD_OPTIONS: { label: string; value: PeriodModeOrAll }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'All', value: 'all' },
];
