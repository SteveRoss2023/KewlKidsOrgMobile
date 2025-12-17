import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  StatusBar,
  AppState,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import FamilySelector from './FamilySelector';
import { useTheme } from '../contexts/ThemeContext';
import ProfileService from '../services/profileService';
import AuthenticatedImage from './AuthenticatedImage';

export default function GlobalNavBar() {
  const router = useRouter();
  const { theme, toggleTheme, colors } = useTheme();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [photoCacheBuster, setPhotoCacheBuster] = useState<number>(Date.now());

  const loadUserPhoto = async () => {
    try {
      const profile = await ProfileService.getProfile();
      if (profile?.photo_url) {
        // Handle both full URLs and relative paths
        const photoUrl = profile.photo_url.startsWith('http') 
          ? profile.photo_url 
          : profile.photo_url;
        setUserPhotoUrl(photoUrl);
        // Update cache buster to force image reload
        setPhotoCacheBuster(Date.now());
      } else {
        setUserPhotoUrl(null);
      }
    } catch (error: any) {
      // Silently fail if endpoint doesn't exist (404) - profile feature may not be implemented yet
      if (error?.status !== 404) {
        console.error('Error loading user photo:', error);
      }
      setUserPhotoUrl(null);
    }
  };

  // Load photo on mount
  useEffect(() => {
    loadUserPhoto();
    
    // Reload photo when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadUserPhoto();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Reload photo when screen comes into focus (e.g., returning from profile page)
  useFocusEffect(
    useCallback(() => {
      loadUserPhoto();
    }, [])
  );

  const handleProfilePress = () => {
    router.push('/(tabs)/profile');
  };

  return (
    <View style={[styles.navbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.leftSection}>
        {/* Empty left section - FamilySelector is centered */}
      </View>

      <View style={styles.centerSection}>
        <FamilySelector />
      </View>

      <View style={styles.rightSection}>
        <TouchableOpacity
          onPress={toggleTheme}
          style={styles.darkModeButton}
          activeOpacity={0.7}
        >
          <Ionicons 
            name={theme === 'dark' ? 'sunny' : 'moon'} 
            size={22} 
            color={theme === 'dark' ? '#FFB800' : '#6366F1'} 
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleProfilePress}
          style={styles.avatarButton}
          activeOpacity={0.7}
        >
          {userPhotoUrl ? (
            <AuthenticatedImage 
              source={{ 
                uri: userPhotoUrl.includes('?') 
                  ? `${userPhotoUrl}&_t=${photoCacheBuster}` 
                  : `${userPhotoUrl}?_t=${photoCacheBuster}`
              }} 
              style={styles.avatar}
              placeholder={
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                  <FontAwesome name="user" size={16} color={colors.textSecondary} />
                </View>
              }
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
              <FontAwesome name="user" size={16} color={colors.textSecondary} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    ...Platform.select({
      web: {
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      },
      default: {
        paddingTop: (StatusBar.currentHeight || 0) + 12,
      },
    }),
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  centerSection: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    ...Platform.select({
      default: {
        minWidth: 0,
      },
    }),
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
  },
  darkModeButton: {
    padding: 8,
  },
  avatarButton: {
    padding: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
