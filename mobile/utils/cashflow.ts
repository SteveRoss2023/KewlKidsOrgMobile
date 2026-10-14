import { Expense } from '../types/expenses';
import { IncomeOccurrence } from '../types/money';

export type CashflowBreakdownRow = {
  key: string;
  label: string;
  amount: number;
};

export type CashflowMonthSummary = {
  incomeTotal: number;
  spentTotal: number;
  /** Sum of unpaid expense rows (is_paid === false). Not budget remaining. */
  unpaidTotal: number;
  paidCount: number;
  unpaidCount: number;
  expenseCount: number;
  /** Income − Spent */
  net: number;
  /** Income − Spent − Unpaid */
  netAfterUnpaid: number;
  incomeByStream: CashflowBreakdownRow[];
  spentByCategory: CashflowBreakdownRow[];
  unpaidByCategory: CashflowBreakdownRow[];
};

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

/** Match Expenses hub / BudgetCard: treat missing is_paid as paid. */
export function isExpensePaid(e: Pick<Expense, 'is_paid'>): boolean {
  return e.is_paid !== false;
}

/** Amount counted toward cashflow income for one occurrence. Skipped → null. */
export function occurrenceIncomeAmount(o: IncomeOccurrence): number | null {
  if (o.status === 'skipped') return null;
  if (o.status === 'received') {
    return toAmt(o.actual_amount ?? o.estimated_amount);
  }
  return toAmt(o.estimated_amount);
}

function inRange(dateStr: string, startDate: string, endDate: string): boolean {
  return dateStr >= startDate && dateStr <= endDate;
}

function sortBreakdown(rows: CashflowBreakdownRow[]): CashflowBreakdownRow[] {
  return rows.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

function addToBreakdown(
  map: Map<string, CashflowBreakdownRow>,
  key: string,
  label: string,
  amount: number
) {
  const existing = map.get(key);
  if (existing) existing.amount += amount;
  else map.set(key, { key, label, amount });
}

/**
 * Aggregate income occurrences + expenses for an inclusive date range.
 * Income: received → actual (fallback estimate); estimated → estimate; skipped excluded.
 * Spent: paid expenses (is_paid !== false). Unpaid: is_paid === false only.
 */
export function buildCashflowSummary(
  occurrences: IncomeOccurrence[],
  expenses: Expense[],
  startDate: string,
  endDate: string
): CashflowMonthSummary {
  const incomeByStreamMap = new Map<string, CashflowBreakdownRow>();
  let incomeTotal = 0;

  for (const o of occurrences) {
    if (!inRange(o.due_date, startDate, endDate)) continue;
    const amount = occurrenceIncomeAmount(o);
    if (amount == null) continue;
    incomeTotal += amount;
    const label = (o.stream_name || '').trim() || `Stream ${o.stream}`;
    addToBreakdown(incomeByStreamMap, String(o.stream), label, amount);
  }

  const spentByCategoryMap = new Map<string, CashflowBreakdownRow>();
  const unpaidByCategoryMap = new Map<string, CashflowBreakdownRow>();
  let spentTotal = 0;
  let unpaidTotal = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  for (const e of expenses) {
    if (!inRange(e.expense_date, startDate, endDate)) continue;
    const amount = toAmt(e.amount);
    const label = (e.category_name || '').trim() || `Category ${e.category}`;
    const key = String(e.category);
    if (isExpensePaid(e)) {
      spentTotal += amount;
      paidCount += 1;
      addToBreakdown(spentByCategoryMap, key, label, amount);
    } else {
      unpaidTotal += amount;
      unpaidCount += 1;
      addToBreakdown(unpaidByCategoryMap, key, label, amount);
    }
  }

  const net = incomeTotal - spentTotal;
  return {
    incomeTotal,
    spentTotal,
    unpaidTotal,
    paidCount,
    unpaidCount,
    expenseCount: paidCount + unpaidCount,
    net,
    netAfterUnpaid: net - unpaidTotal,
    incomeByStream: sortBreakdown([...incomeByStreamMap.values()]),
    spentByCategory: sortBreakdown([...spentByCategoryMap.values()]),
    unpaidByCategory: sortBreakdown([...unpaidByCategoryMap.values()]),
  };
}

export type CashflowMonthPoint = CashflowMonthSummary & {
  monthIndex: number;
  year: number;
  startDate: string;
  endDate: string;
  label: string;
};

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Twelve monthly cashflow summaries for a calendar year (0 = Jan … 11 = Dec). */
export function buildMonthlyCashflowSeries(
  occurrences: IncomeOccurrence[],
  expenses: Expense[],
  year: number
): CashflowMonthPoint[] {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const startDate = `${year}-${pad2(monthIndex + 1)}-01`;
    const endDate = `${year}-${pad2(monthIndex + 1)}-${pad2(lastDayOfMonth(year, monthIndex))}`;
    const summary = buildCashflowSummary(occurrences, expenses, startDate, endDate);
    return {
      ...summary,
      monthIndex,
      year,
      startDate,
      endDate,
      label: MONTH_SHORT[monthIndex],
    };
  });
}

/**
 * First month index (0–11) that has income in the year, or -1 if none.
 * Months before this are treated as outside tracking (incomplete / no income entered).
 */
export function cashflowTrackingStartMonthIndex(months: CashflowMonthPoint[]): number {
  return months.findIndex((m) => m.incomeTotal > 0);
}

/** Months from first income month through year-end (empty if no income months). */
export function monthsInCashflowTracking(months: CashflowMonthPoint[]): CashflowMonthPoint[] {
  const start = cashflowTrackingStartMonthIndex(months);
  if (start < 0) return [];
  return months.slice(start);
}

/** Sum monthly points into a year-level summary (breakdowns merged). */
export function rollupCashflowSeries(months: CashflowMonthPoint[]): CashflowMonthSummary {
  const incomeByStreamMap = new Map<string, CashflowBreakdownRow>();
  const spentByCategoryMap = new Map<string, CashflowBreakdownRow>();
  const unpaidByCategoryMap = new Map<string, CashflowBreakdownRow>();
  let incomeTotal = 0;
  let spentTotal = 0;
  let unpaidTotal = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  for (const m of months) {
    incomeTotal += m.incomeTotal;
    spentTotal += m.spentTotal;
    unpaidTotal += m.unpaidTotal;
    paidCount += m.paidCount;
    unpaidCount += m.unpaidCount;
    for (const row of m.incomeByStream) {
      addToBreakdown(incomeByStreamMap, row.key, row.label, row.amount);
    }
    for (const row of m.spentByCategory) {
      addToBreakdown(spentByCategoryMap, row.key, row.label, row.amount);
    }
    for (const row of m.unpaidByCategory) {
      addToBreakdown(unpaidByCategoryMap, row.key, row.label, row.amount);
    }
  }

  const net = incomeTotal - spentTotal;
  return {
    incomeTotal,
    spentTotal,
    unpaidTotal,
    paidCount,
    unpaidCount,
    expenseCount: paidCount + unpaidCount,
    net,
    netAfterUnpaid: net - unpaidTotal,
    incomeByStream: sortBreakdown([...incomeByStreamMap.values()]),
    spentByCategory: sortBreakdown([...spentByCategoryMap.values()]),
    unpaidByCategory: sortBreakdown([...unpaidByCategoryMap.values()]),
  };
}

/** Default month index for dashboard: current month in current year, else latest with activity, else Dec. */
export function defaultDashboardMonthIndex(
  year: number,
  months: CashflowMonthPoint[],
  now = new Date()
): number {
  if (year === now.getFullYear()) return now.getMonth();
  for (let i = 11; i >= 0; i--) {
    const m = months[i];
    if (
      m &&
      (m.incomeTotal > 0 || m.spentTotal > 0 || m.unpaidTotal > 0 || m.expenseCount > 0)
    ) {
      return i;
    }
  }
  return 11;
}
