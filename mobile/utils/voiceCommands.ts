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

