import { Budget, Expense } from '../types/expenses';

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

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function monthRange(year: number, monthIndex: number): { start: string; end: string } {
  const key = monthKey(year, monthIndex);
  const start = `${key}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const end = `${key}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

/** Match BudgetCard: missing is_paid counts as paid. */
export function isExpensePaid(e: Pick<Expense, 'is_paid'>): boolean {
  return e.is_paid !== false;
}

export type BudgetMonthPoint = {
  monthIndex: number;
  year: number;
  label: string;
  key: string;
  budgets: Budget[];
  budgeted: number;
  /** Paid amount in budgeted categories (envelope progress / bars). */
  spent: number;
  remaining: number;
  percentageUsed: number;
  categoryCount: number;
  /** True when spent came from loaded month expenses (paid only). */
  spentFromExpenses: boolean;
  /** All paid expenses in the month (matches Overview paid). */
  paidTotal: number;
  /** All unpaid expenses in the month (matches Overview unpaid). */
  unpaidTotal: number;
  paidCount: number;
  unpaidCount: number;
  /** paidTotal + unpaidTotal — matches Overview Actual. */
  actualTotal: number;
};

function spentForBudgets(
  budgets: Budget[],
  expenses: Expense[] | undefined
): { spent: number; fromExpenses: boolean } {
  if (expenses) {
    let spent = 0;
    const cats = new Set(budgets.map((b) => b.category));
    for (const e of expenses) {
      if (!cats.has(e.category)) continue;
      if (!isExpensePaid(e)) continue;
      spent += toAmt(e.amount);
    }
    return { spent, fromExpenses: true };
  }
  let spent = 0;
  for (const b of budgets) spent += toAmt(b.spent_amount);
  return { spent, fromExpenses: false };
}

function monthExpenseTotals(expenses: Expense[] | undefined): {
  paidTotal: number;
  unpaidTotal: number;
  paidCount: number;
  unpaidCount: number;
  actualTotal: number;
} {
  let paidTotal = 0;
  let unpaidTotal = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  if (expenses) {
    for (const e of expenses) {
      const amount = toAmt(e.amount);
      if (isExpensePaid(e)) {
        paidTotal += amount;
        paidCount += 1;
      } else {
        unpaidTotal += amount;
        unpaidCount += 1;
      }
    }
  }
  return {
    paidTotal,
    unpaidTotal,
    paidCount,
    unpaidCount,
    actualTotal: paidTotal + unpaidTotal,
  };
}

export function buildMonthlyBudgetSeries(
  year: number,
  budgetsByMonth: Record<string, Budget[]>,
  expensesByMonth: Record<string, Expense[]>
): BudgetMonthPoint[] {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const key = monthKey(year, monthIndex);
    const budgets = budgetsByMonth[key] || [];
    const monthExpenses = expensesByMonth[key];
    const budgeted = budgets.reduce((s, b) => s + toAmt(b.amount), 0);
    const { spent, fromExpenses } = spentForBudgets(budgets, monthExpenses);
    const totals = monthExpenseTotals(monthExpenses);
    const remaining = budgeted - spent;
    const percentageUsed = budgeted > 0 ? (spent / budgeted) * 100 : spent > 0 ? 100 : 0;
    return {
      monthIndex,
      year,
      label: MONTH_SHORT[monthIndex],
      key,
      budgets,
      budgeted,
      spent,
      remaining,
      percentageUsed,
      categoryCount: budgets.length,
      spentFromExpenses: fromExpenses,
      ...totals,
    };
  });
}

export type BudgetYearRollup = {
  budgeted: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  monthsWithBudgets: number;
};

export function rollupBudgetSeries(months: BudgetMonthPoint[]): BudgetYearRollup {
  let budgeted = 0;
  let spent = 0;
  let monthsWithBudgets = 0;
  for (const m of months) {
    if (m.categoryCount > 0) monthsWithBudgets += 1;
    budgeted += m.budgeted;
    spent += m.spent;
  }
  const remaining = budgeted - spent;
  const percentageUsed = budgeted > 0 ? (spent / budgeted) * 100 : spent > 0 ? 100 : 0;
  return { budgeted, spent, remaining, percentageUsed, monthsWithBudgets };
}

/** Current month in current year; else latest month with budgets; else Dec. */
export function defaultBudgetBoardMonthIndex(
  year: number,
  months: BudgetMonthPoint[],
  now = new Date()
): number {
  if (year === now.getFullYear()) return now.getMonth();
  for (let i = 11; i >= 0; i--) {
    if (months[i]?.categoryCount > 0) return i;
  }
  return 11;
}

export function expensesForCategory(
  expenses: Expense[] | undefined,
  categoryId: number
): Expense[] {
  if (!expenses) return [];
  return expenses
    .filter((e) => e.category === categoryId)
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date));
}
