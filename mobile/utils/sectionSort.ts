import type { ListSection } from '../types/lists';

/** Local calendar date as YYYY-MM-DD */
export function formatLocalISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function sortSectionsByDateAndOrder(sections: ListSection[]): ListSection[] {
  return [...sections].sort((a, b) => {
    const da = a.section_date ?? '';
    const db = b.section_date ?? '';
    if (da !== db) return da.localeCompare(db);
    return a.order - b.order;
  });
}
