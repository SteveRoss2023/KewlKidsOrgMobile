import { Budget, Expense } from '../types/expenses';
import { IncomeOccurrence } from '../types/money';
import { isFutureMonth, monthKey } from './budgetSeries';

export type CashflowBreakdownRow = {
  key: string;
  label: string;
  amount: number;
};

export type CashflowOverBudgetRow = {
  key: string;
  label: string;
  budgetAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  /** paid + unpaid */
  actualAmount: number;
  /** actualAmount − budgetAmount (positive when over) */
  overBy: number;
};

export type CashflowUnderBudgetRow = {
  key: string;
  label: string;
  budgetAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  actualAmount: number;
  /** budgetAmount − actualAmount (positive when under) */
  underBy: number;
};

export type CashflowMonthSummary = {
  incomeTotal: number;
  spentTotal: number;
  /**
   * Unpaid expense rows, plus unused category budget when the month has not
   * started. Current and past months are expense rows only.
   */
  unpaidTotal: number;
  /** Sum of category budget limits for the month. */
  budgetTotal: number;
  paidCount: number;
  unpaidCount: number;
  expenseCount: number;
  /** Income − Spent */
  net: number;
  /** Income − Spent − Unpaid */
  netAfterUnpaid: number;
  /** Income − Budget */
  plannedNet: number;
  incomeByStream: CashflowBreakdownRow[];
  spentByCategory: CashflowBreakdownRow[];
  unpaidByCategory: CashflowBreakdownRow[];
  paidExpenses: Expense[];
  unpaidExpenses: Expense[];
  overBudget: CashflowOverBudgetRow[];
  underBudget: CashflowUnderBudgetRow[];
  /** Unused budget folded into unpaidTotal for a month that has not started. */
  plannedUnpaid: CashflowBreakdownRow[];
  unbudgeted: Expense[];
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

function sortExpenses(list: Expense[]): Expense[] {
  return [...list].sort(
    (a, b) =>
      a.expense_date.localeCompare(b.expense_date) ||
      (a.description || '').localeCompare(b.description || '')
  );
}

/**
 * Aggregate income occurrences + expenses for an inclusive date range.
 * Income: received → actual (fallback estimate); estimated → estimate; skipped excluded.
 * Spent: paid expenses (is_paid !== false). Unpaid: is_paid === false only,
 * plus unused budget when countUnusedBudgetAsUnpaid is set (future months).
 * Budget: optional category budgets for the same window.
 */
export function buildCashflowSummary(
  occurrences: IncomeOccurrence[],
  expenses: Expense[],
  startDate: string,
  endDate: string,
  budgets: Budget[] = [],
  options?: { countUnusedBudgetAsUnpaid?: boolean }
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

  const budgetByCategory = new Map<number, Budget>();
  let budgetTotal = 0;
  for (const b of budgets) {
    budgetByCategory.set(b.category, b);
    budgetTotal += toAmt(b.amount);
  }

  const spentByCategoryMap = new Map<string, CashflowBreakdownRow>();
  const unpaidByCategoryMap = new Map<string, CashflowBreakdownRow>();
  const paidByCat = new Map<number, number>();
  const unpaidByCat = new Map<number, number>();
  const paidExpenses: Expense[] = [];
  const unpaidExpenses: Expense[] = [];
  const unbudgeted: Expense[] = [];
  let spentTotal = 0;
  let unpaidTotal = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  for (const e of expenses) {
    if (!inRange(e.expense_date, startDate, endDate)) continue;
    const amount = toAmt(e.amount);
    const label = (e.category_name || '').trim() || `Category ${e.category}`;
    const key = String(e.category);
    const hasBudget = budgetByCategory.has(e.category);

    if (isExpensePaid(e)) {
      spentTotal += amount;
      paidCount += 1;
      paidExpenses.push(e);
      paidByCat.set(e.category, (paidByCat.get(e.category) || 0) + amount);
      addToBreakdown(spentByCategoryMap, key, label, amount);
    } else {
      unpaidTotal += amount;
      unpaidCount += 1;
      unpaidExpenses.push(e);
      unpaidByCat.set(e.category, (unpaidByCat.get(e.category) || 0) + amount);
      addToBreakdown(unpaidByCategoryMap, key, label, amount);
    }

    if (!hasBudget) {
      unbudgeted.push(e);
    }
  }

  const countUnusedBudgetAsUnpaid = !!options?.countUnusedBudgetAsUnpaid;
  const overBudget: CashflowOverBudgetRow[] = [];
  const underBudget: CashflowUnderBudgetRow[] = [];
  const plannedUnpaid: CashflowBreakdownRow[] = [];
  for (const b of budgets) {
    const paidAmount = paidByCat.get(b.category) || 0;
    const unpaidAmount = unpaidByCat.get(b.category) || 0;
    const actualAmount = paidAmount + unpaidAmount;
    const budgetAmount = toAmt(b.amount);
    // Skip empty placeholder rows (no limit and no activity).
    if (budgetAmount <= 0 && actualAmount <= 0) continue;
    const label = (b.category_name || '').trim() || `Category ${b.category}`;
    const key = String(b.category);
    if (actualAmount > budgetAmount + 0.005) {
      overBudget.push({
        key,
        label,
        budgetAmount,
        paidAmount,
        unpaidAmount,
        actualAmount,
        overBy: actualAmount - budgetAmount,
      });
    } else if (budgetAmount > actualAmount + 0.005) {
      const underBy = budgetAmount - actualAmount;
      if (countUnusedBudgetAsUnpaid) {
        unpaidTotal += underBy;
        addToBreakdown(unpaidByCategoryMap, key, label, underBy);
        plannedUnpaid.push({ key, label, amount: underBy });
      } else {
        underBudget.push({
          key,
          label,
          budgetAmount,
          paidAmount,
          unpaidAmount,
          actualAmount,
          underBy,
        });
      }
    }
  }
  overBudget.sort((a, b) => b.overBy - a.overBy || a.label.localeCompare(b.label));
  underBudget.sort((a, b) => b.underBy - a.underBy || a.label.localeCompare(b.label));
  plannedUnpaid.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

  const net = incomeTotal - spentTotal;
  return {
    incomeTotal,
    spentTotal,
    unpaidTotal,
    budgetTotal,
    paidCount,
    unpaidCount,
    expenseCount: paidCount + unpaidCount,
    net,
    netAfterUnpaid: net - unpaidTotal,
    plannedNet: incomeTotal - budgetTotal,
    incomeByStream: sortBreakdown([...incomeByStreamMap.values()]),
    spentByCategory: sortBreakdown([...spentByCategoryMap.values()]),
    unpaidByCategory: sortBreakdown([...unpaidByCategoryMap.values()]),
    paidExpenses: sortExpenses(paidExpenses),
    unpaidExpenses: sortExpenses(unpaidExpenses),
    overBudget,
    underBudget,
    plannedUnpaid,
    unbudgeted: sortExpenses(unbudgeted),
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
  year: number,
  budgetsByMonth: Record<string, Budget[]> = {}
): CashflowMonthPoint[] {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const startDate = `${year}-${pad2(monthIndex + 1)}-01`;
    const endDate = `${year}-${pad2(monthIndex + 1)}-${pad2(lastDayOfMonth(year, monthIndex))}`;
    const budgets = budgetsByMonth[monthKey(year, monthIndex)] || [];
    const summary = buildCashflowSummary(occurrences, expenses, startDate, endDate, budgets, {
      countUnusedBudgetAsUnpaid: isFutureMonth(year, monthIndex),
    });
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
  const overByCat = new Map<string, CashflowOverBudgetRow>();
  const underByCat = new Map<string, CashflowUnderBudgetRow>();
  const plannedUnpaidMap = new Map<string, CashflowBreakdownRow>();
  const paidExpenses: Expense[] = [];
  const unpaidExpenses: Expense[] = [];
  const unbudgeted: Expense[] = [];
  let incomeTotal = 0;
  let spentTotal = 0;
  let unpaidTotal = 0;
  let budgetTotal = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  for (const m of months) {
    incomeTotal += m.incomeTotal;
    spentTotal += m.spentTotal;
    unpaidTotal += m.unpaidTotal;
    budgetTotal += m.budgetTotal;
    paidCount += m.paidCount;
    unpaidCount += m.unpaidCount;
    paidExpenses.push(...m.paidExpenses);
    unpaidExpenses.push(...m.unpaidExpenses);
    unbudgeted.push(...m.unbudgeted);
    for (const row of m.incomeByStream) {
      addToBreakdown(incomeByStreamMap, row.key, row.label, row.amount);
    }
    for (const row of m.spentByCategory) {
      addToBreakdown(spentByCategoryMap, row.key, row.label, row.amount);
    }
    for (const row of m.unpaidByCategory) {
      addToBreakdown(unpaidByCategoryMap, row.key, row.label, row.amount);
    }
    for (const row of m.overBudget) {
      const existing = overByCat.get(row.key);
      if (existing) {
        existing.budgetAmount += row.budgetAmount;
        existing.paidAmount += row.paidAmount;
        existing.unpaidAmount += row.unpaidAmount;
        existing.actualAmount += row.actualAmount;
        existing.overBy += row.overBy;
      } else {
        overByCat.set(row.key, { ...row });
      }
    }
    for (const row of m.plannedUnpaid) {
      addToBreakdown(plannedUnpaidMap, row.key, row.label, row.amount);
    }
    for (const row of m.underBudget) {
      const existing = underByCat.get(row.key);
      if (existing) {
        existing.budgetAmount += row.budgetAmount;
        existing.paidAmount += row.paidAmount;
        existing.unpaidAmount += row.unpaidAmount;
        existing.actualAmount += row.actualAmount;
        existing.underBy += row.underBy;
      } else {
        underByCat.set(row.key, { ...row });
      }
    }
  }

  const net = incomeTotal - spentTotal;
  return {
    incomeTotal,
    spentTotal,
    unpaidTotal,
    budgetTotal,
    paidCount,
    unpaidCount,
    expenseCount: paidCount + unpaidCount,
    net,
    netAfterUnpaid: net - unpaidTotal,
    plannedNet: incomeTotal - budgetTotal,
    incomeByStream: sortBreakdown([...incomeByStreamMap.values()]),
    spentByCategory: sortBreakdown([...spentByCategoryMap.values()]),
    unpaidByCategory: sortBreakdown([...unpaidByCategoryMap.values()]),
    paidExpenses: sortExpenses(paidExpenses),
    unpaidExpenses: sortExpenses(unpaidExpenses),
    overBudget: [...overByCat.values()].sort(
      (a, b) => b.overBy - a.overBy || a.label.localeCompare(b.label)
    ),
    underBudget: [...underByCat.values()].sort(
      (a, b) => b.underBy - a.underBy || a.label.localeCompare(b.label)
    ),
    plannedUnpaid: sortBreakdown([...plannedUnpaidMap.values()]),
    unbudgeted: sortExpenses(unbudgeted),
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
      (m.incomeTotal > 0 ||
        m.spentTotal > 0 ||
        m.unpaidTotal > 0 ||
        m.budgetTotal > 0 ||
        m.expenseCount > 0)
    ) {
      return i;
    }
  }
  return 11;
}
