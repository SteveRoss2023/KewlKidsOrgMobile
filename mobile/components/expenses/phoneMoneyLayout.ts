import { Platform, TextStyle, ViewStyle } from 'react-native';

/** Phone widths where a full money row cannot hold million-scale amounts at the desktop size. */
export const PHONE_MONEY_MAX_WIDTH = 520;

export function isPhoneMoneyLayout(windowWidth: number): boolean {
  return windowWidth < PHONE_MONEY_MAX_WIDTH;
}

/** Keep every figure on the same row. Type shrinks instead of wrapping. */
export const phoneMoneyGrid: ViewStyle = {
  flexDirection: 'row',
  flexWrap: 'nowrap',
  width: '100%',
  alignItems: 'flex-start',
};

/** Equal share of one row. Do not combine with a minWidth cell style. */
export const phoneMoneyCell: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '0%',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  gap: 2,
};

export const phoneMoneyCaption: TextStyle = {
  fontSize: 10,
  ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as TextStyle) : {}),
};

/** Tighter gap so phone hero figures can use the row. */
export const phoneMoneyTight: ViewStyle = { gap: 2 };

/** Hero amounts on a phone: grow toward `base` while a full currency string still fits. */
export function phoneHeroValueStyle(
  text: string,
  windowWidth: number,
  base: number,
  columns: number
): TextStyle {
  return phoneMoneyValueStyle(text, windowWidth, base, columns, 0, 0.58, 2);
}

/**
 * Shrink just enough that the full currency string fits its share of one row.
 * Pass a column count (2–6) for equal cells, or a width fraction (0–1) for a custom slot.
 * Desktop (width >= PHONE_MONEY_MAX_WIDTH) should not call this.
 */
export function phoneMoneyValueStyle(
  text: string,
  windowWidth: number,
  base = 16,
  columnsOrFraction: number = 4,
  cellInset = 0,
  charWidth = 0.7,
  columnGap = 8
): TextStyle {
  const columns = columnsOrFraction >= 2 ? Math.round(columnsOrFraction) : 0;
  const gaps = columns > 1 ? (columns - 1) * columnGap : 0;
  // Page padding plus the card padding around these rows.
  const outer = 64;
  const cell =
    columns > 0
      ? (windowWidth - outer - gaps) / columns - cellInset
      : (windowWidth - outer) * columnsOrFraction - cellInset;
  const fitted = Math.max(cell - 2, 4) / (Math.max(text.length, 1) * charWidth);
  const fontSize = Math.min(base, Math.max(4, fitted));
  return {
    fontSize,
    lineHeight: Math.round(fontSize + 3),
    fontVariant: ['tabular-nums'],
    maxWidth: '100%',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as TextStyle) : {}),
  };
}
