/** Cents-as-you-type money helpers. Typing 2799 → "$27.99". */

const MAX_DIGITS = 10; // up to $99,999,999.99

/** Format a numeric amount for display, e.g. 27.99 → "$27.99". */
export function formatMoneyDisplay(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) return '';
  return `$${n.toFixed(2)}`;
}

/** Format currency with thousand separators, e.g. 1234.5 → "$1,234.50". */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || value === '') return '$0.00';
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parse a money display string to a number, e.g. "$27.99" → 27.99. */
export function parseMoneyDisplay(display: string | null | undefined): number | null {
  if (display == null || !String(display).trim()) return null;
  const n = parseFloat(String(display).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

/**
 * Handle TextInput onChange for money fields.
 * Digits are treated as cents: "2799" → "$27.99".
 */
export function onMoneyChange(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  if (Number.isNaN(cents)) return '';
  return `$${(cents / 100).toFixed(2)}`;
}
