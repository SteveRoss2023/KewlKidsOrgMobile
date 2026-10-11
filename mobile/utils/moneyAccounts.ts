import { AccountType, MoneyAccount } from '../types/money';

export type InstitutionGroup = {
  key: string;
  label: string;
  accounts: MoneyAccount[];
};

const TYPE_ORDER: Record<AccountType, number> = {
  rrsp: 0,
  tfsa: 1,
  non_reg: 2,
  cash: 3,
  other: 4,
};

function institutionKey(account: MoneyAccount): string {
  return (account.institution || '').trim().toLowerCase();
}

function institutionLabel(account: MoneyAccount): string {
  const trimmed = (account.institution || '').trim();
  return trimmed || 'Other';
}

function compareAccounts(a: MoneyAccount, b: MoneyAccount): number {
  const ta = TYPE_ORDER[a.account_type] ?? 99;
  const tb = TYPE_ORDER[b.account_type] ?? 99;
  if (ta !== tb) return ta - tb;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Group accounts by institution (blank → Other), A–Z groups, Other last. */
export function groupAccountsByInstitution(accounts: MoneyAccount[]): InstitutionGroup[] {
  const byKey = new Map<string, MoneyAccount[]>();
  for (const account of accounts) {
    const key = institutionKey(account);
    const list = byKey.get(key);
    if (list) list.push(account);
    else byKey.set(key, [account]);
  }

  const groups: InstitutionGroup[] = [];
  for (const [key, list] of byKey) {
    list.sort(compareAccounts);
    groups.push({
      key,
      label: key === '' ? 'Other' : institutionLabel(list[0]),
      accounts: list,
    });
  }

  groups.sort((a, b) => {
    if (a.key === '') return 1;
    if (b.key === '') return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return groups;
}

export function sortAccountsByInstitution(accounts: MoneyAccount[]): MoneyAccount[] {
  return groupAccountsByInstitution(accounts).flatMap((g) => g.accounts);
}
