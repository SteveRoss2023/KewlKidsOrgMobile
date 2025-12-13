import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FamilyProvider } from '../contexts/FamilyContext';
import { ThemeProvider } from '../contexts/ThemeContext';

export default function RootLayout() {
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
