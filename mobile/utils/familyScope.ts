/** Keep only rows whose `family` matches the selected family id. */
export function forFamily<T extends { family?: number | null }>(
  items: T[] | null | undefined,
  familyId: number
): T[] {
  const id = Number(familyId);
  if (!Array.isArray(items) || Number.isNaN(id)) return [];
  return items.filter((item) => Number(item.family) === id);
}
