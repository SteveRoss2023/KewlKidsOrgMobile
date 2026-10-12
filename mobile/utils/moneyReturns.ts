import { AccountSnapshot, AccountType, MoneyAccount } from '../types/money';
import { withDemoBalance } from './moneyDemoPortfolio';

export type YearReturnRow = {
  id: number;
  name: string;
  accountType: AccountType;
  institution: string | null;
  isCash: boolean;
  startDate: string | null;
  startBalance: number | null;
  latestDate: string | null;
  latestBalance: number | null;
  delta: number | null;
  returnPct: number | null;
  yearEndTarget: number | null;
};

/** Earliest snapshot in the calendar year for an account. */
export function yearStartSnap(
  snapshots: AccountSnapshot[],
  accountId: number,
  year: number
): AccountSnapshot | null {
  const prefix = `${year}-`;
  const inYear = snapshots
    .filter((s) => s.account === accountId && s.as_of_date.startsWith(prefix))
    .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  return inYear[0] || null;
}

/** Latest snapshot on or before end of year (or any latest if none capped). */
export function yearLatestSnap(
  snapshots: AccountSnapshot[],
  accountId: number,
  year: number
): AccountSnapshot | null {
  const end = `${year}-12-31`;
  const eligible = snapshots
    .filter((s) => s.account === accountId && s.as_of_date <= end)
    .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date));
  return eligible[0] || null;
}

export function simpleReturn(start: number, end: number): { delta: number; returnPct: number } {
  const delta = end - start;
  const returnPct = start !== 0 ? (delta / start) * 100 : 0;
  return { delta, returnPct };
}

/** Full-year target from year-start balance at annual %. */
export function yearEndTarget(start: number, annualPct: number, isCash: boolean): number {
  if (isCash) return start;
  return start * (1 + annualPct / 100);
}

export function buildYearReturnRows(
  accounts: MoneyAccount[],
  snapshots: AccountSnapshot[],
  year: number,
  demoEnabled: boolean,
  annualPct = 0
): YearReturnRow[] {
  const ordered = [
    ...accounts.filter((a) => a.account_type !== 'cash'),
    ...accounts.filter((a) => a.account_type === 'cash'),
  ];

  return ordered.map((a) => {
    const isCash = a.account_type === 'cash';
    const startSnap = yearStartSnap(snapshots, a.id, year);
    const latestSnap = yearLatestSnap(snapshots, a.id, year);

    const startRaw = startSnap != null ? Number(startSnap.balance) : null;
    const latestRaw = latestSnap != null ? Number(latestSnap.balance) : null;

    let startBalance: number | null = null;
    let latestBalance: number | null = null;
    let delta: number | null = null;
    let returnPct: number | null = null;

    if (startRaw != null && latestRaw != null) {
      // Real return % from unboosted balances — keep this when demo is on.
      const real = simpleReturn(startRaw, latestRaw);
      returnPct = real.returnPct;
      startBalance = withDemoBalance(startRaw, a.account_type, demoEnabled);
      if (startBalance != null) {
        // Scale latest/delta so demo $ gain matches the same return % on the fake size.
        latestBalance = startBalance * (1 + real.returnPct / 100);
        delta = latestBalance - startBalance;
      }
    } else if (startRaw != null) {
      startBalance = withDemoBalance(startRaw, a.account_type, demoEnabled);
    } else if (latestRaw != null) {
      latestBalance = withDemoBalance(latestRaw, a.account_type, demoEnabled);
    }

    const target =
      startBalance != null && startBalance > 0
        ? yearEndTarget(startBalance, annualPct, isCash)
        : null;

    return {
      id: a.id,
      name: a.name,
      accountType: a.account_type,
      institution: a.institution?.trim() || null,
      isCash,
      startDate: startSnap?.as_of_date ?? null,
      startBalance,
      latestDate: latestSnap?.as_of_date ?? null,
      latestBalance,
      delta,
      returnPct,
      yearEndTarget: target,
    };
  });
}

export function sumReturnRows(rows: YearReturnRow[]) {
  return rows.reduce(
    (acc, row) => {
      if (row.startBalance != null) acc.start += row.startBalance;
      if (row.latestBalance != null) acc.latest += row.latestBalance;
      if (row.yearEndTarget != null) acc.target += row.yearEndTarget;
      return acc;
    },
    { start: 0, latest: 0, target: 0 }
  );
}

export type YtdPortfolioTotals = {
  start: number;
  latest: number;
  delta: number;
  returnPct: number | null;
  target: number;
};

export type YtdSplitTotals = {
  invested: YtdPortfolioTotals;
  cash: YtdPortfolioTotals;
  all: YtdPortfolioTotals;
};

function ytdTotalsForAccounts(
  accounts: MoneyAccount[],
  snapshots: AccountSnapshot[],
  year: number,
  demoEnabled: boolean
): YtdPortfolioTotals {
  let realStart = 0;
  let realLatest = 0;
  let displayStart = 0;
  let hasPair = false;

  for (const a of accounts) {
    const startSnap = yearStartSnap(snapshots, a.id, year);
    const latestSnap = yearLatestSnap(snapshots, a.id, year);
    if (!startSnap || !latestSnap) continue;
    const s = Number(startSnap.balance);
    const l = Number(latestSnap.balance);
    if (Number.isNaN(s) || Number.isNaN(l)) continue;
    hasPair = true;
    realStart += s;
    realLatest += l;
    displayStart += withDemoBalance(s, a.account_type, demoEnabled) ?? s;
  }

  if (!hasPair || realStart <= 0) {
    return { start: displayStart, latest: displayStart, delta: 0, returnPct: null, target: 0 };
  }

  const { returnPct } = simpleReturn(realStart, realLatest);
  const latest = displayStart * (1 + returnPct / 100);
  const delta = latest - displayStart;
  return { start: displayStart, latest, delta, returnPct, target: 0 };
}

/**
 * YTD totals for the hero card, split into investments vs cash.
 * Return % is always the real (unboosted) return for that group.
 * When demo is on, start is boosted and latest/delta are scaled so $ matches that same %.
 */
export function ytdPortfolioTotals(
  accounts: MoneyAccount[],
  snapshots: AccountSnapshot[],
  year: number,
  demoEnabled: boolean
): YtdSplitTotals {
  const investedAccounts = accounts.filter((a) => a.account_type !== 'cash');
  const cashAccounts = accounts.filter((a) => a.account_type === 'cash');
  return {
    invested: ytdTotalsForAccounts(investedAccounts, snapshots, year, demoEnabled),
    cash: ytdTotalsForAccounts(cashAccounts, snapshots, year, demoEnabled),
    all: ytdTotalsForAccounts(accounts, snapshots, year, demoEnabled),
  };
}

/** Portfolio year-end total at a given annual rate (cash flat). */
export function portfolioTargetAtRate(rows: YearReturnRow[], annualPct: number): number {
  return rows.reduce((sum, row) => {
    if (row.startBalance == null || row.startBalance <= 0) return sum;
    return sum + yearEndTarget(row.startBalance, annualPct, row.isCash);
  }, 0);
}

/** Latest balances split (demo-aware) — year 0 for forward forecasts. */
export type PortfolioProjectionBase = {
  invest: number;
  cash: number;
  portfolio: number;
  hasBalances: boolean;
};

export type PortfolioProjectionPoint = {
  yearsAhead: number;
  calendarYear: number;
  /** Invested value at start of this forecast year (end of prior / now for year 1). */
  investStart: number;
  /** Invested growth during this year only. */
  investGrowth: number;
  /** Invested value at end of this calendar year. */
  invest: number;
  cash: number;
  portfolio: number;
  /** Cumulative portfolio growth vs now. */
  growth: number;
};

export function latestPortfolioBase(
  accounts: MoneyAccount[],
  demoEnabled: boolean
): PortfolioProjectionBase {
  let invest = 0;
  let cash = 0;
  let hasBalances = false;
  for (const a of accounts) {
    const bal = withDemoBalance(a.latest_balance, a.account_type, demoEnabled);
    if (bal == null) continue;
    hasBalances = true;
    if (a.account_type === 'cash') cash += bal;
    else invest += bal;
  }
  return { invest, cash, portfolio: invest + cash, hasBalances };
}

/**
 * Forward projection from latest balances: invest compounds annually, cash flat.
 * Points for yearsAhead 1…maxYearsAhead labeled currentYear+n.
 */
export function projectPortfolioAtYears(
  accounts: MoneyAccount[],
  ratePct: number,
  maxYearsAhead: number,
  demoEnabled: boolean,
  currentYear = new Date().getFullYear()
): { base: PortfolioProjectionBase; points: PortfolioProjectionPoint[] } {
  const base = latestPortfolioBase(accounts, demoEnabled);
  const factor = 1 + ratePct / 100;
  const points: PortfolioProjectionPoint[] = [];
  for (let n = 1; n <= maxYearsAhead; n++) {
    const investStart = base.invest * Math.pow(factor, n - 1);
    const invest = base.invest * Math.pow(factor, n);
    const investGrowth = invest - investStart;
    const cash = base.cash;
    const portfolio = invest + cash;
    points.push({
      yearsAhead: n,
      calendarYear: currentYear + n,
      investStart,
      investGrowth,
      invest,
      cash,
      portfolio,
      growth: portfolio - base.portfolio,
    });
  }
  return { base, points };
}

export type AccountProjectionRow = {
  id: number;
  name: string;
  isCash: boolean;
  start: number;
  growth: number;
  end: number;
};

/** Per-account projection for one forecast year ahead (latest base, invest compounds, cash flat). */
export function projectAccountsAtYearsAhead(
  accounts: MoneyAccount[],
  ratePct: number,
  yearsAhead: number,
  demoEnabled: boolean
): AccountProjectionRow[] {
  const n = Math.max(1, yearsAhead);
  const factor = 1 + ratePct / 100;
  const ordered = [
    ...accounts.filter((a) => a.account_type !== 'cash'),
    ...accounts.filter((a) => a.account_type === 'cash'),
  ];
  const rows: AccountProjectionRow[] = [];
  for (const a of ordered) {
    const base = withDemoBalance(a.latest_balance, a.account_type, demoEnabled);
    if (base == null) continue;
    const isCash = a.account_type === 'cash';
    if (isCash) {
      rows.push({ id: a.id, name: a.name, isCash, start: base, growth: 0, end: base });
      continue;
    }
    const start = base * Math.pow(factor, n - 1);
    const end = base * Math.pow(factor, n);
    rows.push({
      id: a.id,
      name: a.name,
      isCash,
      start,
      growth: end - start,
      end,
    });
  }
  return rows;
}
