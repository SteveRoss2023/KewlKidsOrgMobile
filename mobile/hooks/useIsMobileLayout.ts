import { useWindowDimensions, Platform } from 'react-native';

/**
 * Responsive helper to decide when to use the compact \"mobile\" layout.
 *
 * - Native (iOS / Android): always treated as mobile layout.
 * - Web: treated as mobile layout when the viewport width is below the breakpoint.
 */
export function useIsMobileLayout(breakpoint: number = 768): boolean {
  const { width } = useWindowDimensions();

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return true;
  }

  // Web and any other platforms: narrow viewports use the mobile layout
  return width < breakpoint;
}

