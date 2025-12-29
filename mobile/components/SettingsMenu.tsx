import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AuthService from '../services/authService';
import { useTheme } from '../contexts/ThemeContext';
import oauthService from '../services/oauthService';

const SettingsMenu = () => {
  const router = useRouter();
  const { colors } = useTheme();
  const [servicesSubmenuOpen, setServicesSubmenuOpen] = useState(false);
  const [onedriveConnected, setOnedriveConnected] = useState(false);
  const [googledriveConnected, setGoogledriveConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);

    useEffect(() => {
      checkOAuthConnections();
    }, []);

    const checkOAuthConnections = async () => {
      try {
        // Check all OAuth connections in parallel
        // Note: Google Photos check removed - it uses Google Drive tokens automatically
        const [outlookStatus, onedriveStatus, googledriveStatus] = await Promise.all([
          oauthService.checkConnection('outlook').catch(() => ({ connected: false })),
          oauthService.checkConnection('onedrive').catch(() => ({ connected: false })),
          oauthService.checkConnection('googledrive').catch(() => ({ connected: false })),
          // oauthService.checkConnection('googlephotos').catch(() => ({ connected: false })),
        ]);

        setOutlookConnected(outlookStatus.connected);
        setOnedriveConnected(onedriveStatus.connected);
        setGoogledriveConnected(googledriveStatus.connected);
        // setGooglephotosConnected(googlephotosStatus.connected);
      } catch (error) {
        console.error('Error checking OAuth connections:', error);
        // On error, assume not connected
        setOutlookConnected(false);
        setOnedriveConnected(false);
        setGoogledriveConnected(false);
        // setGooglephotosConnected(false);
      }
    };

    const handleBack = () => {
      router.back();
    };

    const handleNavigate = (route: string) => {
      setServicesSubmenuOpen(false);
      router.push(route as any);
    };

    const handleLogout = async () => {
      try {
        await AuthService.logout();
        router.replace('/(auth)/login');
      } catch (error) {
        console.error('Error during logout:', error);
        router.replace('/(auth)/login');
      }
    };

    const menuItems = [
      {
        id: 'families',
        label: 'Families',
        icon: 'users',
        route: '/(tabs)/families',
      },
      {
        id: 'profile',
        label: 'Profile',
        icon: 'user',
        route: '/(tabs)/profile',
      },
      {
        id: 'voice-settings',
        label: 'Voice Settings',
        icon: 'microphone',
        route: '/(tabs)/settings',
      },
      {
        id: 'grocery-categories',
        label: 'Grocery Categories',
        icon: 'list',
        route: '/(tabs)/grocery-categories',
      },
    ];

    const serviceItems = [
      {
        id: 'outlook-sync',
        label: 'Outlook Sync',
        icon: 'calendar',
        route: '/(tabs)/outlook-sync',
        connected: outlookConnected,
      },
      {
        id: 'onedrive',
        label: 'Microsoft OneDrive Connect',
        icon: 'cloud',
        route: '/(tabs)/onedrive-connect',
        connected: onedriveConnected,
      },
      {
        id: 'googledrive',
        label: 'Google Drive/Photos Connect',
        icon: 'google',
        route: '/(tabs)/googledrive-connect',
        connected: googledriveConnected,
      },
      // Google Photos Connect - Hidden until Google Photos Library API is implemented
      // Google Photos currently uses Google Drive tokens automatically
      // {
      //   id: 'googlephotos',
      //   label: 'Google Photos Connect',
      //   icon: 'photo',
      //   route: '/(tabs)/googlephotos-connect',
      //   connected: googlephotosConnected,
      // },
    ];

    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
          >
            <FontAwesome name="arrow-left" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.menuList}
          contentContainerStyle={styles.menuListContent}
          showsVerticalScrollIndicator={true}
        >
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => handleNavigate(item.route)}
            >
              <FontAwesome name={item.icon as any} size={16} color={colors.text} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>{item.label}</Text>
              <FontAwesome name="chevron-right" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}

          <View style={[styles.menuSection, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => setServicesSubmenuOpen(!servicesSubmenuOpen)}
            >
              <FontAwesome name="plug" size={16} color={colors.text} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Services</Text>
              <FontAwesome
                name={servicesSubmenuOpen ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {servicesSubmenuOpen && (
              <View style={[styles.submenu, { backgroundColor: colors.background }]}>
                {serviceItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.submenuItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleNavigate(item.route)}
                  >
                    <FontAwesome name={item.icon as any} size={16} color={colors.text} style={styles.menuIcon} />
                    <Text style={[styles.submenuItemText, { color: colors.textSecondary }]}>{item.label}</Text>
                    {item.connected ? (
                      <View style={styles.connectedIndicator}>
                        <FontAwesome name="check-circle" size={12} color={colors.success} />
                      </View>
                    ) : (
                      <View style={styles.disconnectedIndicator}>
                        <FontAwesome name="times-circle" size={12} color={colors.error} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.menuItem, styles.logoutItem, { borderTopColor: colors.border }]}
            onPress={handleLogout}
          >
            <FontAwesome name="sign-out" size={16} color={colors.error} style={styles.menuIcon} />
            <Text style={[styles.menuItemText, styles.logoutText, { color: colors.error }]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 4,
  },
  menuList: {
    flex: 1,
  },
  menuListContent: {
    paddingBottom: 40,
  },
  menuSection: {
    borderTopWidth: 1,
    marginTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  menuIcon: {
    marginRight: 12,
    width: 20,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
  },
  submenu: {
    paddingLeft: 48,
  },
  submenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    borderBottomWidth: 1,
  },
  submenuItemText: {
    flex: 1,
    fontSize: 14,
  },
  connectedIndicator: {
    marginLeft: 8,
  },
  disconnectedIndicator: {
    marginLeft: 8,
  },
  logoutItem: {
    borderTopWidth: 1,
    marginTop: 8,
  },
  logoutText: {
    // Color applied inline
  },
});

export default SettingsMenu;

