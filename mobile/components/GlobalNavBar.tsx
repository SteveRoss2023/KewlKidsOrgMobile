import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import FamilySelector from './FamilySelector';
import { useTheme } from '../contexts/ThemeContext';
import AuthService from '../services/authService';

export default function GlobalNavBar() {
  const router = useRouter();
  const { theme, toggleTheme, colors } = useTheme();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);

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
          <FontAwesome name={theme === 'dark' ? 'sun-o' : 'moon-o'} size={18} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleProfilePress}
          style={styles.avatarButton}
          activeOpacity={0.7}
        >
          {userPhotoUrl ? (
            <Image source={{ uri: userPhotoUrl }} style={styles.avatar} />
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

