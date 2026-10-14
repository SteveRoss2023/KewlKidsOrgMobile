/**
 * Detect subgroup titles inside ingredient/instruction lists
 * (e.g. Sauce, Chicken, Make the sauce).
 */

const META_LABEL_RE =
  /^(ingredients?|instructions?|directions?|method|steps?|preparation|you.?ll need|what you.?ll need)\s*:?\s*$/i;
const MANGLED_INGREDIENTS_RE = /^n?gredients?\s*:?\s*$/i;
const HAS_QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[.,]?\d*|\d+\s*-\s*\d+)/;

function isMetaLabel(line: string): boolean {
  if (!line) return true;
  return META_LABEL_RE.test(line) || MANGLED_INGREDIENTS_RE.test(line);
}

/** Subgroup titles: Sauce, Chicken, Make the sauce, For the chicken, … */
export function isRecipeSectionHeader(line: string): boolean {
  const text = (line || '').trim();
  if (!text || isMetaLabel(text)) return false;
  if (/[.!?]$/.test(text)) return false;
  if (text.length > 48) return false;
  if (HAS_QTY_RE.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6) return false;
  if (text.includes(',') || text.includes('(')) return false;
  const lower = text.toLowerCase();
  if (
    lower.startsWith('make the ') ||
    lower.startsWith('for the ') ||
    lower.startsWith('to make ') ||
    lower.startsWith('to serve')
  ) {
    return true;
  }
  const alphaWords = words.filter((w) => /[A-Za-z]/.test(w));
  if (!alphaWords.length) return false;
  const small = new Set(['and', 'or', 'the', 'a', 'of', 'for', 'to']);
  return alphaWords.every(
    (w) => (w[0] && w[0] === w[0].toUpperCase()) || small.has(w.toLowerCase())
  );
}
