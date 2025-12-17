import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AuthService from '../services/authService';
import { useTheme } from '../contexts/ThemeContext';
import oauthService from '../services/oauthService';

interface SettingsMenuProps {
  onClose?: () => void;
  showButton?: boolean;
  autoOpen?: boolean;
}

export interface SettingsMenuRef {
  openModal: () => void;
}

const SettingsMenu = forwardRef<SettingsMenuRef, SettingsMenuProps>(
  ({ onClose, showButton = true, autoOpen = false }, ref) => {
    const router = useRouter();
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    const [servicesSubmenuOpen, setServicesSubmenuOpen] = useState(false);
    const [onedriveConnected, setOnedriveConnected] = useState(false);
    const [googledriveConnected, setGoogledriveConnected] = useState(false);
    const [outlookConnected, setOutlookConnected] = useState(false);
    const [googlephotosConnected, setGooglephotosConnected] = useState(false);

    useImperativeHandle(ref, () => ({
      openModal: () => {
        setModalVisible(true);
      },
    }));

    useEffect(() => {
      if (autoOpen) {
        setModalVisible(true);
      }
    }, [autoOpen]);

    useEffect(() => {
      if (modalVisible) {
        checkOAuthConnections();
      }
    }, [modalVisible]);

    const checkOAuthConnections = async () => {
      try {
        // Check all OAuth connections in parallel
        const [outlookStatus, onedriveStatus, googledriveStatus, googlephotosStatus] = await Promise.all([
          oauthService.checkConnection('outlook').catch(() => ({ connected: false })),
          oauthService.checkConnection('onedrive').catch(() => ({ connected: false })),
          oauthService.checkConnection('googledrive').catch(() => ({ connected: false })),
          oauthService.checkConnection('googlephotos').catch(() => ({ connected: false })),
        ]);

        setOutlookConnected(outlookStatus.connected);
        setOnedriveConnected(onedriveStatus.connected);
        setGoogledriveConnected(googledriveStatus.connected);
        setGooglephotosConnected(googlephotosStatus.connected);
      } catch (error) {
        console.error('Error checking OAuth connections:', error);
        // On error, assume not connected
        setOutlookConnected(false);
        setOnedriveConnected(false);
        setGoogledriveConnected(false);
        setGooglephotosConnected(false);
      }
    };

    const handleClose = () => {
      setModalVisible(false);
      setServicesSubmenuOpen(false);
      if (onClose) onClose();
    };

    const handleNavigate = (route: string) => {
      setModalVisible(false);
      setServicesSubmenuOpen(false);
      if (onClose) onClose();
      router.push(route as any);
    };

    const handleLogout = async () => {
      try {
        await AuthService.logout();
        setModalVisible(false);
        if (onClose) onClose();
        router.replace('/(auth)/login');
      } catch (error) {
        console.error('Error during logout:', error);
        setModalVisible(false);
        if (onClose) onClose();
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
        label: 'Google Drive Connect',
        icon: 'google',
        route: '/(tabs)/googledrive-connect',
        connected: googledriveConnected,
      },
      {
        id: 'googlephotos',
        label: 'Google Photos Connect',
        icon: 'photo',
        route: '/(tabs)/googlephotos-connect',
        connected: googlephotosConnected,
      },
    ];

    return (
      <>
        {showButton && (
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={styles.settingsButton}
            activeOpacity={0.7}
          >
            <FontAwesome name="cog" size={20} color={colors.text} />
          </TouchableOpacity>
        )}

        <Modal
          visible={modalVisible}
          transparent={true}
          animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
          onRequestClose={handleClose}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Settings</Text>
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeButton}
                >
                  <FontAwesome name="times" size={20} color={colors.textSecondary} />
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
          </View>
        </Modal>
      </>
    );
  }
);

const styles = StyleSheet.create({
  settingsButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    ...Platform.select({
      web: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      },
      default: {
        justifyContent: 'flex-end',
      },
    }),
  },
  modalContent: {
    width: '100%',
    flexDirection: 'column',
    ...Platform.select({
      web: {
        borderRadius: 12,
        maxWidth: 400,
        maxHeight: '80vh',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
      },
      default: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '95%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  menuList: {
    ...Platform.select({
      web: {
        maxHeight: 'calc(80vh - 80px)',
      },
      default: {
        flex: 1,
      },
    }),
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

