import { useWindowDimensions } from 'react-native';

/** Viewport width at which Money / Expense dashboards switch to multi-column layout. */
export const WIDE_BREAKPOINT = 768;

/**
 * True when the window is wide enough for tablet/desktop multi-column layouts.
 * Uses viewport width on all platforms (including native tablets).
 */
export function useIsWideLayout(breakpoint: number = WIDE_BREAKPOINT): boolean {
  const { width } = useWindowDimensions();
  return width >= breakpoint;
}
