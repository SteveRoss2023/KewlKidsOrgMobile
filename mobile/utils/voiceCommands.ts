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
  return cancelPhrases.some((phrase) => normalized === phrase || normalized.startsWith(phrase + ' '));
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
  const normalizedSearch = normalizeText(searchText);

  return items.filter((item) => {
    const itemName = getName(item);
    const normalizedItemName = normalizeText(itemName);
    return (
      normalizedItemName.includes(normalizedSearch) ||
      normalizedSearch.includes(normalizedItemName)
    );
  });
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

