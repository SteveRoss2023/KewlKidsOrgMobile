import expenseService from '../services/expenseService';
import type { EnsureYearResult } from '../types/expenses';

export function ensureYearHasChanges(result: EnsureYearResult): boolean {
  return (result.created || 0) + (result.updated || 0) + (result.removed || 0) > 0;
}

/** Preview reconcile for year (no writes). */
export async function previewBillExpensesForYear(
  familyId: number,
  year: number
): Promise<EnsureYearResult> {
  return expenseService.ensureYear(familyId, year, { dryRun: true });
}

/** Apply reconcile for year. */
export async function applyBillExpensesForYear(
  familyId: number,
  year: number
): Promise<EnsureYearResult> {
  return expenseService.ensureYear(familyId, year, { dryRun: false });
}
