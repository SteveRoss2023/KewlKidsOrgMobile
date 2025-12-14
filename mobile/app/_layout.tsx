import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FamilyProvider } from '../contexts/FamilyContext';
import { ThemeProvider } from '../contexts/ThemeContext';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

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
        originalError.apply(console, args);
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

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FamilyProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </FamilyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
