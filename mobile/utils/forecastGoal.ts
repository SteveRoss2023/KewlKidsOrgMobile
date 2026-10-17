import { STORAGE_KEYS, storage } from './storage';

/** Same choices as the Forecast yearly investment goal. */
export const FORECAST_GOAL_RATES = [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];
export const DEFAULT_FORECAST_GOAL = 2.5;

export function forecastGoalKey(familyId: number): string {
  return `${STORAGE_KEYS.MONEY_YEAR_TARGET_RATE}:${familyId}`;
}

export async function readForecastGoal(familyId: number): Promise<number> {
  const raw = await storage.getItem(forecastGoalKey(familyId));
  const n = raw == null ? NaN : Number(raw);
  return FORECAST_GOAL_RATES.includes(n) ? n : DEFAULT_FORECAST_GOAL;
}

export async function writeForecastGoal(familyId: number, rate: number): Promise<void> {
  await storage.setItem(forecastGoalKey(familyId), String(rate));
}
