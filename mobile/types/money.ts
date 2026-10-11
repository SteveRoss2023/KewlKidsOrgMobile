export type IncomeStreamType = 'employment' | 'pension' | 'other';
export type IncomeFrequency =
  | 'biweekly'
  | 'monthly'
  | 'third_last_biz'
  | 'second_last_biz'
  | 'one_time';
export type IncomeOccurrenceStatus = 'estimated' | 'received' | 'skipped';
export type AccountType = 'rrsp' | 'tfsa' | 'non_reg' | 'cash' | 'other';

export interface IncomeStream {
  id: number;
  family: number;
  created_by: number | null;
  name: string;
  stream_type: IncomeStreamType;
  frequency: IncomeFrequency;
  default_estimate: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IncomeOccurrence {
  id: number;
  stream: number;
  stream_name: string | null;
  family: number;
  due_date: string;
  estimated_amount: number;
  actual_amount: number | null;
  status: IncomeOccurrenceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoneyAccount {
  id: number;
  family: number;
  name: string;
  institution: string | null;
  account_type: AccountType;
  notes: string | null;
  is_active: boolean;
  latest_balance: number | null;
  latest_as_of: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountSnapshot {
  id: number;
  account: number;
  account_name: string | null;
  family: number;
  as_of_date: string;
  balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateIncomeStreamData = {
  family: number;
  name: string;
  stream_type: IncomeStreamType;
  frequency: IncomeFrequency;
  default_estimate: number | string;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export type UpdateIncomeStreamData = Partial<Omit<CreateIncomeStreamData, 'family'>>;

export type UpdateIncomeOccurrenceData = {
  estimated_amount?: number | string;
  actual_amount?: number | string | null;
  status?: IncomeOccurrenceStatus;
  notes?: string | null;
  due_date?: string;
};

export type CreateMoneyAccountData = {
  family: number;
  name: string;
  institution?: string | null;
  account_type: AccountType;
  notes?: string | null;
  is_active?: boolean;
};

export type UpdateMoneyAccountData = Partial<Omit<CreateMoneyAccountData, 'family'>>;

export type CreateAccountSnapshotData = {
  account: number;
  as_of_date: string;
  balance: number | string;
  notes?: string | null;
};
