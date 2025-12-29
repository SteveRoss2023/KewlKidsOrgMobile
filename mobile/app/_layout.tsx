// Suppress warnings FIRST - before any other imports that might trigger them
import '../utils/suppressWarnings';

// Polyfill Web Crypto API for native platforms - must be imported and called first
import { setupCryptoPolyfill } from '../utils/crypto-polyfill';

// Set up the crypto polyfill
setupCryptoPolyfill();

import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Linking, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FamilyProvider } from '../contexts/FamilyContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import navigationService from '../services/navigationService';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  // Initialize navigation service with router
  useEffect(() => {
    navigationService.setRouter(router);
  }, [router]);

  useEffect(() => {
    // Suppress React Native Web accessibility warnings in development
    if (__DEV__ && Platform.OS === 'web') {
      const originalError = console.error;
      console.error = (...args: any[]) => {
        // Filter out aria-hidden warnings from React Native Web
        if (
          typeof args[0] === 'string' &&
          args[0].includes('aria-hidden') &&
          args[0].includes('Blocked aria-hidden')
        ) {
          return; // Suppress this warning
        }
        // Filter out measureLayout warnings from react-native-drax (known issue with React Native new architecture)
        if (
          typeof args[0] === 'string' &&
          args[0].includes('ref.measureLayout must be called with a ref to a native component')
        ) {
          return; // Suppress this warning
        }
        // Filter out SafeAreaView deprecation warnings from react-native-dropdown-picker
        if (
          typeof args[0] === 'string' &&
          args[0].includes('SafeAreaView has been deprecated') &&
          args[0].includes('react-native-safe-area-context')
        ) {
          return; // Suppress this warning (library issue, not our code)
        }
        // Filter out NativeEventEmitter warnings from @react-native-voice/voice (new architecture compatibility issue)
        if (
          typeof args[0] === 'string' &&
          (args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method') ||
           args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `addListener` method'))
        ) {
          return; // Suppress this warning (library issue, not our code)
        }
        originalError.apply(console, args);
      };
    }

    // Suppress react-native-drax measureLayout warnings (known issue with React Native new architecture)
    if (__DEV__) {
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        // Filter out measureLayout warnings from react-native-drax
        if (
          typeof args[0] === 'string' &&
          args[0].includes('ref.measureLayout must be called with a ref to a native component')
        ) {
          return; // Suppress this warning
        }
        // Filter out SafeAreaView deprecation warnings from react-native-dropdown-picker
        if (
          typeof args[0] === 'string' &&
          args[0].includes('SafeAreaView has been deprecated') &&
          args[0].includes('react-native-safe-area-context')
        ) {
          return; // Suppress this warning (library issue, not our code)
        }
        // Filter out NativeEventEmitter warnings from @react-native-voice/voice (new architecture compatibility issue)
        if (
          typeof args[0] === 'string' &&
          (args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method') ||
           args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `addListener` method'))
        ) {
          return; // Suppress this warning (library issue, not our code)
        }
        originalWarn.apply(console, args);
      };
    }
  }, []);

  useEffect(() => {
    // Handle deep links for OAuth callbacks
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url.startsWith('kewlkids://oauth/callback')) {
        const parsedUrl = new URL(url);
        const service = parsedUrl.searchParams.get('service');
        const success = parsedUrl.searchParams.get('success') === 'true';
        const message = parsedUrl.searchParams.get('message');

        // Navigate to the appropriate service screen
        if (service === 'outlook') {
          router.push('/(tabs)/outlook-sync');
        } else if (service === 'onedrive') {
          router.push('/(tabs)/onedrive-connect');
        } else if (service === 'googledrive') {
          router.push('/(tabs)/googledrive-connect');
        } else if (service === 'googlephotos') {
          router.push('/(tabs)/googlephotos-connect');
        }
      }
    };

    // Listen for deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Add favicon to document head for web
  // Use SVG logo as data URI since static file serving may not work correctly
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const setupFavicon = () => {
        // Remove existing favicon links
        const existingLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
        existingLinks.forEach(link => link.remove());

        // Create SVG favicon from logo (using a simplified version with actual colors for better favicon display)
        // Using a dark theme-friendly version with #4A90E2 (blue) as the primary color
        const svgFavicon = `<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Background circle -->
          <circle cx="20" cy="20" r="18" fill="#4A90E2" opacity="0.1"/>
          <!-- Family/People icon -->
          <g fill="#4A90E2">
            <!-- Adult 1 -->
            <circle cx="14" cy="14" r="4"/>
            <path d="M14 20C14 20 10 22 10 24V26H18V24C18 22 14 20 14 20Z"/>
            <!-- Adult 2 -->
            <circle cx="26" cy="14" r="4"/>
            <path d="M26 20C26 20 30 22 30 24V26H22V24C22 22 26 20 26 20Z"/>
            <!-- Child -->
            <circle cx="20" cy="18" r="3"/>
            <path d="M20 22C20 22 17 23.5 17 25V27H23V25C23 23.5 20 22 20 22Z"/>
          </g>
          <!-- Calendar/Organizer accent -->
          <rect x="12" y="28" width="16" height="8" rx="1" fill="#4A90E2" opacity="0.3"/>
          <line x1="16" y1="28" x2="16" y2="36" stroke="#4A90E2" stroke-width="1"/>
          <line x1="20" y1="28" x2="20" y2="36" stroke="#4A90E2" stroke-width="1"/>
          <line x1="24" y1="28" x2="24" y2="36" stroke="#4A90E2" stroke-width="1"/>
        </svg>`;

        // Convert SVG to data URI
        const svgDataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgFavicon)))}`;

        // Add SVG favicon (modern browsers)
        const faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        faviconLink.type = 'image/svg+xml';
        faviconLink.href = svgDataUri;
        document.head.appendChild(faviconLink);

        // Add shortcut icon for older browsers (fallback)
        const shortcutLink = document.createElement('link');
        shortcutLink.rel = 'shortcut icon';
        shortcutLink.type = 'image/svg+xml';
        shortcutLink.href = svgDataUri;
        document.head.appendChild(shortcutLink);

        // Also add with sizes for better browser support
        const sizedFaviconLink = document.createElement('link');
        sizedFaviconLink.rel = 'icon';
        sizedFaviconLink.type = 'image/svg+xml';
        sizedFaviconLink.sizes = 'any';
        sizedFaviconLink.href = svgDataUri;
        document.head.appendChild(sizedFaviconLink);
      };

      // Run immediately and after a short delay to ensure DOM is ready
      setupFavicon();
      setTimeout(setupFavicon, 100);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FamilyProvider>
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </View>
        </FamilyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

