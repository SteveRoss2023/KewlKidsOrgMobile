import { useEffect, useState, useCallback } from 'react';
import { Tabs, useRouter, useFocusEffect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import AuthService from '../../services/authService';

export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshFamilies } = useFamily();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    checkAuthentication();
  }, []);

  // Refresh families when tabs come into focus (e.g., after login or returning from another screen)
  useFocusEffect(
    useCallback(() => {
      const refreshOnFocus = async () => {
        try {
          const isAuthenticated = await AuthService.isAuthenticated();
          if (isAuthenticated) {
            // Refresh families when tabs come into focus and user is authenticated
            await refreshFamilies();
          }
        } catch (error) {
          console.error('Error refreshing families on focus:', error);
          // Don't block if refresh fails
        }
      };

      // Only refresh if we're not currently checking auth (to avoid double refresh on mount)
      if (!isCheckingAuth) {
        refreshOnFocus();
      }
    }, [refreshFamilies, isCheckingAuth])
  );

  const checkAuthentication = async () => {
    try {
      const isAuthenticated = await AuthService.isAuthenticated();

      if (!isAuthenticated) {
        // User is not authenticated, redirect to login
        router.replace('/(auth)/login');
        return;
      }

      // User is authenticated, refresh families to ensure they're loaded
      // This fixes the issue where families don't appear immediately after login
      try {
        await refreshFamilies();
      } catch (error) {
        console.error('Error refreshing families after authentication:', error);
        // Don't block navigation if family refresh fails
      }
    } catch (error) {
      // On error, redirect to login
      console.error('Error checking authentication:', error);
      router.replace('/(auth)/login');
      return;
    } finally {
      setIsCheckingAuth(false);
    }
  };

  // Show loading indicator while checking authentication
  if (isCheckingAuth) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="families"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: 'Lists',
          tabBarLabel: 'Lists',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lists/[id]"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="lists/completed"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="user" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="cog" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="families/[id]"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="families/create"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="today"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="grocery-categories"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="mapbox"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="outlook-sync"
        options={{
          href: null, // Hide from tab bar - accessible via Settings > Services
        }}
      />
      <Tabs.Screen
        name="onedrive-connect"
        options={{
          href: null, // Hide from tab bar - accessible via Settings > Services
        }}
      />
      <Tabs.Screen
        name="googledrive-connect"
        options={{
          href: null, // Hide from tab bar - accessible via Settings > Services
        }}
      />
      <Tabs.Screen
        name="googlephotos-connect"
        options={{
          href: null, // Hide from tab bar - accessible via Settings > Services
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          href: null, // Hide from tab bar - accessible via Home card
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="comments" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat/[roomId]"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

