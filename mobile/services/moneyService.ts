import apiClient, { handleAPIError } from './api';
import {
  AccountSnapshot,
  CreateAccountSnapshotData,
  CreateIncomeStreamData,
  CreateMoneyAccountData,
  IncomeOccurrence,
  IncomeStream,
  MoneyAccount,
  UpdateIncomeOccurrenceData,
  UpdateIncomeStreamData,
  UpdateMoneyAccountData,
} from '../types/money';
import { forFamily } from '../utils/familyScope';

async function fetchAllPages<T>(
  initialPath: string,
  params?: Record<string, any>
): Promise<T[]> {
  const response = await apiClient.get(initialPath, { params });
  if (Array.isArray(response.data)) return response.data;
  if (!response.data || !Array.isArray(response.data.results)) return [];

  let items: T[] = [...response.data.results];
  let nextUrl: string | null = response.data.next || null;
  while (nextUrl) {
    // DRF `next` is absolute and includes /api; baseURL already ends with /api.
    let path = nextUrl;
    if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) {
      const url = new URL(nextUrl);
      path = url.pathname + url.search;
      if (path.startsWith('/api')) path = path.substring(4);
    } else if (nextUrl.startsWith('/api')) {
      path = nextUrl.substring(4);
    } else if (!nextUrl.startsWith('/')) {
      path = '/' + nextUrl;
    }
    const next = await apiClient.get(path);
    if (Array.isArray(next.data?.results)) {
      items = items.concat(next.data.results);
      nextUrl = next.data.next || null;
    } else {
      break;
    }
  }
  return items;
}

async function fetchFamilyPages<T extends { family?: number | null }>(
  initialPath: string,
  familyId: number,
  params?: Record<string, any>
): Promise<T[]> {
  const items = await fetchAllPages<T>(initialPath, { family: familyId, ...params });
  return forFamily(items, familyId);
}

class MoneyService {
  async getStreams(familyId: number): Promise<IncomeStream[]> {
    try {
      return await fetchFamilyPages<IncomeStream>('/income-streams/', familyId);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async createStream(data: CreateIncomeStreamData): Promise<IncomeStream> {
    try {
      const res = await apiClient.post<IncomeStream>('/income-streams/', data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async updateStream(id: number, data: UpdateIncomeStreamData): Promise<IncomeStream> {
    try {
      const res = await apiClient.patch<IncomeStream>(`/income-streams/${id}/`, data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async deleteStream(id: number): Promise<void> {
    try {
      await apiClient.delete(`/income-streams/${id}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async generateOccurrences(
    streamId: number,
    until?: string
  ): Promise<{ created: number; occurrences: IncomeOccurrence[] }> {
    try {
      const res = await apiClient.post(`/income-streams/${streamId}/generate_occurrences/`, {
        until,
      });
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async getOccurrences(
    familyId: number,
    opts?: { stream?: number; start_date?: string; end_date?: string }
  ): Promise<IncomeOccurrence[]> {
    try {
      return await fetchFamilyPages<IncomeOccurrence>('/income-occurrences/', familyId, opts);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async updateOccurrence(
    id: number,
    data: UpdateIncomeOccurrenceData
  ): Promise<IncomeOccurrence> {
    try {
      const res = await apiClient.patch<IncomeOccurrence>(`/income-occurrences/${id}/`, data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async deleteOccurrence(id: number): Promise<void> {
    try {
      await apiClient.delete(`/income-occurrences/${id}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async getAccounts(familyId: number): Promise<MoneyAccount[]> {
    try {
      return await fetchFamilyPages<MoneyAccount>('/money-accounts/', familyId);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async createAccount(data: CreateMoneyAccountData): Promise<MoneyAccount> {
    try {
      const res = await apiClient.post<MoneyAccount>('/money-accounts/', data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async updateAccount(id: number, data: UpdateMoneyAccountData): Promise<MoneyAccount> {
    try {
      const res = await apiClient.patch<MoneyAccount>(`/money-accounts/${id}/`, data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async deleteAccount(id: number): Promise<void> {
    try {
      await apiClient.delete(`/money-accounts/${id}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async getSnapshots(familyId: number, accountId?: number): Promise<AccountSnapshot[]> {
    try {
      return await fetchFamilyPages<AccountSnapshot>('/account-snapshots/', familyId, {
        ...(accountId ? { account: accountId } : {}),
      });
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async upsertSnapshot(data: CreateAccountSnapshotData): Promise<AccountSnapshot> {
    try {
      const res = await apiClient.post<AccountSnapshot>('/account-snapshots/', data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async updateSnapshot(
    id: number,
    data: { balance: number | string; as_of_date?: string; notes?: string | null }
  ): Promise<AccountSnapshot> {
    try {
      const res = await apiClient.patch<AccountSnapshot>(`/account-snapshots/${id}/`, data);
      return res.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  async deleteSnapshot(id: number): Promise<void> {
    try {
      await apiClient.delete(`/account-snapshots/${id}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }
}

export default new MoneyService();
