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
