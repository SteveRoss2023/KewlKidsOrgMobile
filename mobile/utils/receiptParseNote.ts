import { ReceiptParseResult } from '../types/expenses';
import { formatMoneyDisplay } from './moneyInput';

function plainMoney(n: number): string {
  return formatMoneyDisplay(n).replace(/^\$/, '');
}

function rateLabel(rate: number | null | undefined): string {
  if (rate == null) return '';
  const n = Number(rate);
  return Number.isFinite(n) ? n.toFixed(4) : String(rate);
}

/** One-line conversion summary for the review UI (under Total). */
export function receiptConversionSummary(parsed: ReceiptParseResult | null): string | null {
  if (!parsed) return null;
  if (parsed.fx_error) return parsed.fx_error;
  if (
    parsed.currency &&
    parsed.currency !== 'CAD' &&
    parsed.converted_to === 'CAD' &&
    parsed.original_total != null &&
    parsed.total != null &&
    parsed.fx_rate != null
  ) {
    const asOf = parsed.fx_as_of ? ` as of ${parsed.fx_as_of}` : '';
    return `Original ${parsed.currency} ${plainMoney(parsed.original_total)} → CAD ${plainMoney(parsed.total)} (rate ${rateLabel(parsed.fx_rate)}${asOf})`;
  }
  if (parsed.currency === 'CAD') return 'Currency: CAD';
  return null;
}

/** Extra OCR note bits: detected language and CAD FX conversion. */
export function receiptLanguageFxSuffix(parsed: ReceiptParseResult): string {
  const parts: string[] = [];
  if (parsed.source_language) {
    parts.push(`Language: ${parsed.source_language}`);
  }
  const conv = receiptConversionSummary(parsed);
  if (conv) parts.push(conv);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/**
 * Multi-line details for the expense Notes field (translate + FX).
 * Safe to append when the user already typed notes.
 */
export function buildReceiptParseNotes(parsed: ReceiptParseResult): string {
  const lines: string[] = ['Receipt scan:'];

  if (parsed.source_language) {
    const lang = parsed.source_language;
    if (/^english$/i.test(lang.trim())) {
      lines.push(`- Language: ${lang}`);
    } else {
      lines.push(`- Language: ${lang} (item names translated to English)`);
    }
  }

  if (parsed.engine) {
    lines.push(`- Engine: ${parsed.engine}`);
  }

  if (parsed.fx_error) {
    lines.push(`- FX: ${parsed.fx_error}`);
    if (parsed.currency) lines.push(`- Detected currency: ${parsed.currency}`);
  } else if (
    parsed.currency &&
    parsed.currency !== 'CAD' &&
    parsed.converted_to === 'CAD' &&
    parsed.original_total != null &&
    parsed.total != null &&
    parsed.fx_rate != null
  ) {
    lines.push(`- Original currency: ${parsed.currency}`);
    lines.push(`- Original total: ${parsed.currency} ${plainMoney(parsed.original_total)}`);
    lines.push(`- Converted total: CAD ${plainMoney(parsed.total)}`);
    lines.push(
      `- FX rate: 1 ${parsed.currency} = ${rateLabel(parsed.fx_rate)} CAD` +
        (parsed.fx_as_of ? ` (as of ${parsed.fx_as_of})` : '')
    );
  } else if (parsed.currency) {
    lines.push(`- Currency: ${parsed.currency}`);
    if (parsed.total != null) {
      lines.push(`- Total: ${parsed.currency} ${plainMoney(parsed.total)}`);
    }
  }

  const n = parsed.line_items?.length || 0;
  if (n > 0) {
    lines.push(`- Line items: ${n}`);
  }

  return lines.join('\n');
}

/** Merge auto receipt notes into existing user notes without duplicating. */
export function mergeReceiptNotes(existing: string, parsed: ReceiptParseResult): string {
  const block = buildReceiptParseNotes(parsed);
  const trimmed = (existing || '').trim();
  if (!trimmed) return block;
  if (trimmed.includes('Receipt scan:')) {
    // Replace previous auto block if present at the end
    const idx = trimmed.lastIndexOf('Receipt scan:');
    if (idx >= 0) {
      const before = trimmed.slice(0, idx).trimEnd();
      return before ? `${before}\n\n${block}` : block;
    }
  }
  return `${trimmed}\n\n${block}`;
}
