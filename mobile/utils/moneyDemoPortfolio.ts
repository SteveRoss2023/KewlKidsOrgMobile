import { AccountType, IncomeStreamType } from '../types/money';

/** Emails allowed to see / use the personal demo portfolio overlay. */
export const MONEY_DEMO_ALLOWED_EMAILS = [
  'steven.ross2023@outlook.com',
  'steven.ross1962@outlook.com',
  'steve.ross1962@outlook.com',
].map((e) => e.toLowerCase());

/** Added on top of real balances when demo overlay is on (display only). */
export const MONEY_DEMO_BOOST: Partial<Record<AccountType, number>> = {
  rrsp: 1_500_000,
  non_reg: 2_000_000,
};

/** Added on top of each employment paycheck / estimate when demo is on (display only). */
export const MONEY_DEMO_EMPLOYMENT_PAY_BOOST = 15_000;

export function canUseMoneyDemoPortfolio(email: string | null | undefined): boolean {
  if (!email) return false;
  return MONEY_DEMO_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

export function demoBoostForAccountType(accountType: AccountType | string): number {
  return MONEY_DEMO_BOOST[accountType as AccountType] ?? 0;
}

/** Real balance + optional demo boost. Null stays null. */
export function withDemoBalance(
  balance: number | null | undefined,
  accountType: AccountType | string,
  demoEnabled: boolean
): number | null {
  if (balance == null || Number.isNaN(Number(balance))) return balance ?? null;
  const n = Number(balance);
  if (!demoEnabled) return n;
  return n + demoBoostForAccountType(accountType);
}

/** Real income amount + optional employment demo boost per pay. Null stays null. */
export function withDemoIncome(
  amount: number | null | undefined,
  streamType: IncomeStreamType | string | null | undefined,
  demoEnabled: boolean
): number | null {
  if (amount == null || Number.isNaN(Number(amount))) return amount ?? null;
  const n = Number(amount);
  if (!demoEnabled || streamType !== 'employment') return n;
  return n + MONEY_DEMO_EMPLOYMENT_PAY_BOOST;
}
