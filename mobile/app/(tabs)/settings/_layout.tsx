import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        ...(Platform.OS === 'web' && {
          presentation: 'card',
        }),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          ...(Platform.OS === 'web' && {
            animation: 'slide_from_right',
          }),
        }}
      />
    </Stack>
  );
}

