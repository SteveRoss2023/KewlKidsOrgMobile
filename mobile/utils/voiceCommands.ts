/**
 * Normalize text for matching (lowercase, remove punctuation, trim spaces)
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize list item / spoken names for matching: hyphens become spaces first so
 * "Strap-on cover" aligns with speech "strap on cover" (plain normalizeText would drop
 * the hyphen and merge words).
 */
export function normalizeTextForListItemMatch(text: string): string {
  if (!text) return '';
  return normalizeText(text.replace(/-/g, ' '));
}

/**
 * Capitalize words in a string
 */
export function capitalizeWords(text: string): string {
  if (!text) return '';
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Returns true if the text is a cancel/abort command (e.g. "cancel", "never mind", "stop").
 */
export function isCancelCommand(text: string): boolean {
  const normalized = normalizeText(text);
  const cancelPhrases = [
    'cancel',
    'never mind',
    'nevermind',
    'stop',
    'abort',
    'forget it',
    'forgetit',
  ];
  return cancelPhrases.some((phrase) => {
    if (normalized === phrase || normalized.startsWith(phrase + ' ')) return true;
    if (normalized.endsWith(' ' + phrase)) return true;
    const padded = ` ${normalized} `;
    return padded.includes(` ${phrase} `);
  });
}

function stripTokenEdges(t: string): string {
  return t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
}

/** Yes / go ahead (voice delete confirm). Handles accumulated Web Speech text e.g. "fall clean up yes". */
export function isAffirmativeResponse(text: string): boolean {
  const n = normalizeText(text);
  if (!n) return false;
  const affirm = [
    'yes',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'do it',
    'delete it',
    'go ahead',
    'confirm',
    'right',
    'correct',
    'absolutely',
    'definitely',
  ];
  if (affirm.some((a) => n === a || n.startsWith(a + ' '))) return true;
  // ASR often returns filler + yes ("uh huh yes"); match anywhere as whole words.
  if (
    /\b(yes|yeah|yep|sure|ok|okay|confirm|right|correct|absolutely|definitely)\b/.test(
      n
    )
  ) {
    return true;
  }
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const singleWord = new Set([
    'yes',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'confirm',
    'right',
    'correct',
    'absolutely',
    'definitely',
  ]);
  if (tokens.some((t) => singleWord.has(stripTokenEdges(t)))) return true;
  const last = stripTokenEdges(tokens[tokens.length - 1]);
  const first = stripTokenEdges(tokens[0]);
  return affirm.some((a) => last === a || first === a);
}

/** No / don't delete (voice delete confirm). Handles trailing "no" on accumulated transcript. */
export function isNegativeResponse(text: string): boolean {
  const n = normalizeText(text);
  if (!n) return false;
  const neg = ['no', 'nope', "don't", 'dont', 'negative'];
  if (neg.some((a) => n === a || n.startsWith(a + ' '))) return true;
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const last = stripTokenEdges(tokens[tokens.length - 1]);
  const first = stripTokenEdges(tokens[0]);
  return neg.some((a) => last === a || first === a);
}

const SPOKEN_ORDINAL: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

/**
 * Parse 1..max from disambiguation or section pick ("1", "one", "number 2", "first").
 */
export function parseVoiceSelectionNumber(text: string, max: number): number | null {
  if (!text || max < 1) return null;
  const n = normalizeText(text);
  if (!n) return null;

  if (/^\d+$/.test(n)) {
    const v = parseInt(n, 10);
    if (v >= 1 && v <= max) return v;
    return null;
  }

  const digitMatch = n.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    const v = parseInt(digitMatch[1], 10);
    if (v >= 1 && v <= max) return v;
  }

  for (const word of n.split(/\s+/)) {
    const v = SPOKEN_ORDINAL[word];
    if (v !== undefined && v >= 1 && v <= max) return v;
  }

  return null;
}

/**
 * Parse "create list [name]" command
 * Always prompts for list type after name is provided
 */
export function parseCreateList(text: string): { type: 'createList'; name: string } | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/^create\s+list\s+(.+)$/);
  if (match) {
    return {
      type: 'createList',
      name: capitalizeWords(match[1].trim()),
    };
  }
  return null;
}

/**
 * True when the user intends to start checklist "add item" flow (no item name yet).
 * Matches: add (alone), add item, add items, add an item, add a item
 */
export function parseChecklistBareAddItemIntent(text: string): boolean {
  const n = normalizeText(text);
  return /^(add|add\s+item|add\s+items|add\s+an\s+item|add\s+a\s+item)$/.test(n);
}

/**
 * Bare "delete" on checklist → prompt: say delete section or delete item.
 */
export function parseChecklistBareDeleteOnlyIntent(text: string): boolean {
  const n = normalizeText(text);
  return n === 'delete';
}

/**
 * Start checklist delete-item flow (then section number/name or item name), like bare add item.
 * Matches: delete item, delete items, delete an item, delete a item
 */
export function parseChecklistDeleteItemBareIntent(text: string): boolean {
  const n = normalizeText(text);
  return /^(delete\s+item|delete\s+items|delete\s+an\s+item|delete\s+a\s+item)$/.test(n);
}

/**
 * After bare delete: user said section vs item (short answers ok).
 */
export function parseChecklistDeleteFollowupChoice(text: string): 'section' | 'item' | null {
  const n = normalizeText(text);
  if (/^(delete\s+section|section|a\s+section|the\s+section)$/.test(n)) return 'section';
  if (/^(delete\s+item|item|an\s+item|items|the\s+item)$/.test(n)) return 'item';
  return null;
}

/**
 * Bare "update" on checklist → prompt: say update section or update item.
 */
export function parseChecklistBareUpdateOnlyIntent(text: string): boolean {
  const n = normalizeText(text);
  return n === 'update';
}

/**
 * Start checklist update-item flow (then section or item, then new name).
 */
export function parseChecklistUpdateItemBareIntent(text: string): boolean {
  const n = normalizeText(text);
  return /^(update\s+item|update\s+items|update\s+an\s+item|update\s+a\s+item)$/.test(n);
}

/**
 * After bare update: user said section vs item.
 */
export function parseChecklistUpdateFollowupChoice(text: string): 'section' | 'item' | null {
  const n = normalizeText(text);
  if (/^(update\s+section|section|a\s+section|the\s+section)$/.test(n)) return 'section';
  if (/^(update\s+item|item|an\s+item|items|the\s+item)$/.test(n)) return 'item';
  return null;
}

/** Mic wizard step 1 (checklist): add, delete/remove, update/change. */
export function parseGuidedVoiceAction(text: string): 'add' | 'delete' | 'update' | null {
  const n = normalizeText(text);
  if (!n) return null;
  const tokens = n.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t === 'delete' || t === 'remove') return 'delete';
    if (t === 'update' || t === 'change') return 'update';
    if (t === 'add') return 'add';
  }
  return null;
}

/** Mic wizard step 2 (checklist): section vs item (after action chosen). */
export function parseGuidedVoiceTarget(text: string): 'section' | 'item' | null {
  const n = normalizeText(text);
  if (!n) return null;
  if (/^(section|sections|a\s+section|the\s+section)$/.test(n)) return 'section';
  if (/^(item|items|an\s+item|the\s+item|task|tasks)$/.test(n)) return 'item';
  const tokens = n.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t === 'section' || t === 'sections') return 'section';
    if (t === 'item' || t === 'items' || t === 'task' || t === 'tasks') return 'item';
  }
  return null;
}

/**
 * Parse "delete section" or "delete section [query]" (checklist; call before parseDeleteItem).
 */
export function parseDeleteSectionCommand(text: string): { query?: string } | null {
  const normalized = normalizeText(text);
  const m = normalized.match(/^delete\s+section(?:\s+(.+))?$/);
  if (!m) return null;
  const rest = m[1]?.trim();
  if (!rest) return {};
  return { query: rest };
}

/**
 * Parse "update section" or "update section [query]" (checklist; call before parseUpdateItem).
 */
export function parseUpdateSectionCommand(text: string): { query?: string } | null {
  const normalized = normalizeText(text);
  const m = normalized.match(/^update\s+section(?:\s+(.+))?$/);
  if (!m) return null;
  const rest = m[1]?.trim();
  if (!rest) return {};
  return { query: rest };
}

/**
 * Parse "add section" or "add section [title]" (checklist only at call site).
 */
export function parseAddSectionCommand(text: string): { title?: string } | null {
  const normalized = normalizeText(text);
  const m = normalized.match(/^add\s+section(?:\s+(.+))?$/);
  if (!m) return null;
  const rest = m[1]?.trim();
  if (!rest) return {};
  return { title: capitalizeWords(rest) };
}

/**
 * Parse "add [item]" command
 */
export function parseAddItem(text: string): { type: 'addItem'; name: string } | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/^add\s+(.+)$/);
  if (match) {
    return {
      type: 'addItem',
      name: capitalizeWords(match[1].trim()),
    };
  }
  return null;
}

/**
 * Parse "delete [item]" command
 */
export function parseDeleteItem(text: string): { type: 'deleteItem'; name: string } | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/^delete\s+(.+)$/);
  if (match) {
    return {
      type: 'deleteItem',
      name: match[1].trim(),
    };
  }
  return null;
}

/**
 * Parse "update [old] to [new]" command
 */
export function parseUpdateItem(text: string): { type: 'updateItem'; oldName: string; newName: string } | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/^update\s+(.+?)\s+to\s+(.+)$/);
  if (match) {
    return {
      type: 'updateItem',
      oldName: match[1].trim(),
      newName: capitalizeWords(match[2].trim()),
    };
  }
  return null;
}

/**
 * Find matching items in a list using fuzzy matching
 */
export function findMatchingItems<T>(
  items: T[],
  searchText: string,
  getName: (item: T) => string = (item: any) => item.name
): T[] {
  const normalizedSearch = normalizeTextForListItemMatch(searchText);
  if (!normalizedSearch) return [];

  return items.filter((item) => {
    const itemName = getName(item);
    const normalizedItemName = normalizeTextForListItemMatch(itemName);
    if (!normalizedItemName) return false;

    if (normalizedItemName.includes(normalizedSearch)) return true;

    // Avoid treating the spoken phrase as a haystack for single-word item names:
    // "strap on cover".includes("on") would match an item literally named "on".
    const searchTokens = normalizedSearch.split(/\s+/).filter(Boolean);
    const itemTokens = normalizedItemName.split(/\s+/).filter(Boolean);
    const multiWordSearch = searchTokens.length > 1;
    const singleWordItem = itemTokens.length === 1;
    if (multiWordSearch && singleWordItem) return false;

    return normalizedSearch.includes(normalizedItemName);
  });
}

/** Fuzzy match checklist sections by title (same rules as findMatchingItems). */
export function findMatchingSections<T extends { title: string }>(
  sections: T[],
  searchText: string
): T[] {
  return findMatchingItems(sections, searchText, (s) => s.title);
}

/**
 * Strip "item name", "item", parentheses from spoken delete query ("delete item name (x)" → x).
 */
export function stripChecklistVoiceItemQueryForSearch(rawName: string): string {
  let s = rawName.trim();
  s = s.replace(/^\(+/, '').replace(/\)+$/, '').trim();
  s = s.replace(/^the\s+/i, '').trim();
  s = s.replace(/^(item\s+name|item)\s+/i, '').trim();
  return normalizeTextForListItemMatch(s);
}

/** Items whose name contains the full normalized phrase (stricter than fuzzy bidirectional match). */
export function findItemsWithNormalizedPhraseInName<T>(
  items: T[],
  normalizedPhrase: string,
  getName: (item: T) => string = (item: any) => item.name
): T[] {
  if (!normalizedPhrase) return [];
  return items.filter((item) =>
    normalizeTextForListItemMatch(getName(item)).includes(normalizedPhrase)
  );
}

/**
 * Checklist voice delete: no partial-word matches.
 * - Multi-word query: item name must contain the full normalized phrase (all words, in order, together).
 * - Single-word query: that word must appear as a whole token (not e.g. "cover" inside "recover").
 */
export function findChecklistVoiceDeleteMatches<T>(
  items: T[],
  normalizedQuery: string,
  getName: (item: T) => string = (item: any) => item.name
): T[] {
  const q = normalizedQuery.trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const itemNorm = normalizeTextForListItemMatch(getName(item));
    if (!itemNorm) return false;
    if (tokens.length === 1) {
      const itemTokens = itemNorm.split(/\s+/).filter(Boolean);
      return itemTokens.includes(tokens[0]);
    }
    return itemNorm.includes(q);
  });
}

/** Spoken label for what we searched (after stripping "item name", parens). */
export function formatDeleteQueryForSpeech(rawCapture: string): string {
  let s = rawCapture.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim();
  s = s.replace(/^the\s+item\s+/i, '').replace(/^the\s+/i, '').trim();
  s = s.replace(/^(item\s+name|item)\s+/i, '').trim();
  return capitalizeWords(s);
}

/**
 * Parse date string like "today", "tomorrow", "next monday", "january 15", etc.
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const cleanDate = dateStr.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Match "tomorrow"
  if (cleanDate.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // Match "today"
  if (cleanDate === 'today') {
    return new Date(today);
  }

  // Match "next [day]"
  const nextDayMatch = cleanDate.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (nextDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(nextDayMatch[1]);
    const currentDay = today.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;
    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate;
  }

  // Match month and day like "january 15" or "nov 27"
  const normalizedDate = normalizeText(dateStr).toLowerCase().trim();
  const monthDayMatch = cleanDate.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/) ||
                       normalizedDate.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/);
  if (monthDayMatch) {
    const monthNames: Record<string, number> = {
      'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
      'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
      'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
    };
    const month = monthNames[monthDayMatch[1].toLowerCase()];
    const day = parseInt(monthDayMatch[2]);
    let year = monthDayMatch[3] ? parseInt(monthDayMatch[3]) : today.getFullYear();

    if (month !== undefined && day >= 1 && day <= 31) {
      const date = new Date(year, month, day);
      // If the date is in the past (more than 7 days ago), assume next year
      if (date < today && (today.getTime() - date.getTime()) > 7 * 24 * 60 * 60 * 1000) {
        year = today.getFullYear() + 1;
        const nextYearDate = new Date(year, month, day);
        if (nextYearDate.getDate() === day) {
          return nextYearDate;
        }
      }
      if (date.getDate() === day) {
        return date;
      }
    }
  }

  // Match relative days like "monday", "tuesday", etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.indexOf(cleanDate);
  if (dayIndex !== -1) {
    const currentDay = today.getDay();
    let daysToAdd = dayIndex - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;
    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate;
  }

  return null;
}

/**
 * Parse time string like "3pm", "3:30pm", "15:00", "3 o'clock", etc.
 */
export function parseTime(timeStr: string): { hour: number; minute: number } | null {
  if (!timeStr) return null;

  const cleanTime = timeStr.toLowerCase().trim();

  // Match patterns like "3pm", "3 pm", "3:30pm", "3:30 pm"
  const pmMatch = cleanTime.match(/(\d{1,2})(?::(\d{2}))?\s*(?:pm|p\.m\.|p\s*m|p)/);
  if (pmMatch) {
    let hour = parseInt(pmMatch[1]);
    const minute = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
    if (hour !== 12) hour += 12;
    if (hour >= 24) hour = 23;
    if (minute >= 60) return null;
    return { hour, minute };
  }

  // Match patterns like "3am", "3 am", "3:30am", "3:30 am"
  const amMatch = cleanTime.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|a\.m\.|a)/);
  if (amMatch) {
    let hour = parseInt(amMatch[1]);
    const minute = amMatch[2] ? parseInt(amMatch[2]) : 0;
    if (hour === 12) hour = 0;
    if (hour >= 24) return null;
    if (minute >= 60) return null;
    return { hour, minute };
  }

  // Match 24-hour format like "15:00", "15", "15:30"
  const hour24Match = cleanTime.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (hour24Match) {
    const hour = parseInt(hour24Match[1]);
    const minute = hour24Match[2] ? parseInt(hour24Match[2]) : 0;
    if (hour >= 24 || minute >= 60) return null;
    return { hour, minute };
  }

  // Match "3 o'clock", "3 o clock"
  const oclockMatch = cleanTime.match(/(\d{1,2})\s*o['\s]?clock(?:\s*(am|pm|a\.m\.|p\.m\.))?/);
  if (oclockMatch) {
    let hour = parseInt(oclockMatch[1]);
    const period = oclockMatch[2] ? oclockMatch[2].toLowerCase() : null;

    if (period && (period.includes('pm') || period.includes('p'))) {
      if (hour !== 12) hour += 12;
    } else if (period && (period.includes('am') || period.includes('a'))) {
      if (hour === 12) hour = 0;
    } else {
      // Default to PM if between 1-11, AM if 12
      if (hour >= 1 && hour <= 11) hour += 12;
    }

    if (hour >= 24) hour = 23;
    return { hour, minute: 0 };
  }

  return null;
}

/**
 * Parse "delete event [title]" command
 */
export function parseDeleteEvent(text: string): { type: 'deleteEvent'; title: string } | null {
  const normalized = normalizeText(text);

  // Try the standard pattern first
  let match = normalized.match(/^delete\s+event\s+(.+)$/);

  // If that doesn't match, try "delete [title]" (without "event")
  if (!match) {
    match = normalized.match(/^delete\s+(.+)$/);
    // Only accept if it doesn't look like a number (to avoid conflicts with number selection)
    if (match && /^\d+$/.test(match[1].trim())) {
      match = null;
    }
  }

  if (match) {
    return {
      type: 'deleteEvent',
      title: match[1].trim()
    };
  }

  return null;
}

