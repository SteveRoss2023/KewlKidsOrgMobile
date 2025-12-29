import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import oauthService, { OAuthConnectionStatus } from '../../services/oauthService';
import AlertModal from '../../components/AlertModal';
import AuthService from '../../services/authService';
import { APIError } from '../../services/api';

export default function OutlookSyncScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedFamily } = useFamily();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<OAuthConnectionStatus>({ connected: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    requiresReconnect: boolean;
    requiresLogout: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    requiresReconnect: false,
    requiresLogout: false,
  });

  const parseError = (err: any): { message: string; requiresReconnect: boolean; requiresLogout: boolean } => {
    const apiError = err as APIError;
    const errorData = apiError.data || {};
    const errorMessage = apiError.message || err.message || 'An error occurred';

    const requiresReconnect = errorData.requires_reconnect ||
                            errorMessage.toLowerCase().includes('reconnect') ||
                            errorMessage.toLowerCase().includes('disconnect and reconnect') ||
                            errorMessage.toLowerCase().includes('token expired') ||
                            errorMessage.toLowerCase().includes('decrypt');

    const requiresLogout = errorData.requires_logout ||
                          errorMessage.toLowerCase().includes('log out') ||
                          errorMessage.toLowerCase().includes('log in again') ||
                          (apiError.status === 401 && !requiresReconnect);

    return {
      message: errorMessage,
      requiresReconnect,
      requiresLogout,
    };
  };

  useEffect(() => {
    checkConnection();
  }, []);

  // Clear "Please complete authorization" message whenever connection is confirmed
  useEffect(() => {
    if (connectionStatus.connected) {
      // Always clear this message when connected
      setSuccess((prev) => {
        if (prev && prev.includes('Please complete authorization')) {
          return '';
        }
        return prev;
      });
    }
  }, [connectionStatus.connected]);

  const checkConnection = async () => {
    try {
      setLoading(true);
      setError('');
      const status = await oauthService.checkConnection('outlook');
      setConnectionStatus(status);
      // Always clear "Please complete authorization" message if connection is confirmed
      if (status.connected) {
        setSuccess((prev) => {
          if (prev && prev.includes('Please complete authorization')) {
            return '';
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error('Error checking Outlook connection:', err);
      const parsedError = parseError(err);

      setErrorModal({
        visible: true,
        title: 'Connection Error',
        message: parsedError.message,
        requiresReconnect: parsedError.requiresReconnect,
        requiresLogout: parsedError.requiresLogout,
      });

      setConnectionStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedFamily) {
      Alert.alert('No Family Selected', 'Please select a family first');
      return;
    }

    try {
      setConnecting(true);
      setError('');
      setSuccess('');

      const result = await oauthService.connectOutlook(selectedFamily.id);

      if (result.success) {
        // Always check connection status after OAuth flow
        const status = await oauthService.checkConnection('outlook');

        // If connection is confirmed, don't show the "complete in browser" message
        if (status.connected) {
          // Only show success if it's not the "complete in browser" message
          if (!result.message.includes('Please complete authorization')) {
            setSuccess(result.message || 'Outlook calendar connected successfully!');
            // Clear success message after 3 seconds
            setTimeout(() => {
              setSuccess('');
            }, 3000);
          } else {
            // Clear the "complete in browser" message since we're now connected
            setSuccess('');
          }
          // Update connection status
          setConnectionStatus(status);
        } else {
          await checkConnection();
        }
      } else {
        setError(result.message || 'Failed to connect Outlook calendar');
      }
    } catch (err: any) {
      console.error('Error connecting Outlook:', err);
      const parsedError = parseError(err);

      setErrorModal({
        visible: true,
        title: 'Connection Failed',
        message: parsedError.message,
        requiresReconnect: parsedError.requiresReconnect,
        requiresLogout: parsedError.requiresLogout,
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Outlook',
      'Are you sure you want to disconnect your Outlook calendar? This will stop syncing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // TODO: Implement disconnect endpoint for Outlook
              setError('Disconnect not yet implemented for Outlook');
            } catch (err: any) {
              const parsedError = parseError(err);
              setErrorModal({
                visible: true,
                title: 'Disconnect Failed',
                message: parsedError.message,
                requiresReconnect: false,
                requiresLogout: parsedError.requiresLogout,
              });
            } finally {
              setLoading(false);
              await checkConnection();
            }
          },
        },
      ]
    );
  };

  const handleErrorModalClose = () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
  };

  const handleReconnect = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    // Outlook doesn't have a disconnect endpoint, so just try to reconnect
    try {
      setConnecting(true);
      await handleConnect();
    } catch (err: any) {
      const parsedError = parseError(err);
      setErrorModal({
        visible: true,
        title: 'Reconnect Failed',
        message: parsedError.message,
        requiresReconnect: false,
        requiresLogout: parsedError.requiresLogout,
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    try {
      await AuthService.logout();
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('Error during logout:', err);
      router.replace('/(auth)/login');
    }
  };

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.placeholder}>
          <FontAwesome name="calendar" size={48} color={colors.textSecondary} />
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Please select a family to manage Outlook calendar sync
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <FontAwesome name="calendar" size={24} color={colors.text} />
        <Text style={[styles.title, { color: colors.text }]}>Outlook Calendar Sync</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/settings')}
          style={styles.settingsButton}
          activeOpacity={0.7}
        >
          <FontAwesome name="cog" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={[styles.alert, styles.errorAlert, { backgroundColor: colors.error + '20' }]}>
          <FontAwesome name="exclamation-circle" size={16} color={colors.error} />
          <Text style={[styles.alertText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {success && !success.includes('Please complete authorization') && (
        <View style={[styles.alert, styles.successAlert, { backgroundColor: colors.success + '20' }]}>
          <FontAwesome name="check-circle" size={16} color={colors.success} />
          <Text style={[styles.alertText, { color: colors.success }]}>{success}</Text>
        </View>
      )}

      {loading && !connecting && (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Checking connection...
          </Text>
        </View>
      )}

      {connectionStatus.connected ? (
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statusHeader}>
            <FontAwesome name="check-circle" size={20} color={colors.success} />
            <Text style={[styles.statusTitle, { color: colors.text }]}>Connected</Text>
          </View>

          <View style={styles.statusInfo}>
            {connectionStatus.calendar_name && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Calendar:</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {connectionStatus.calendar_name}
                </Text>
              </View>
            )}
            {connectionStatus.email && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Account:</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {connectionStatus.email}
                </Text>
              </View>
            )}
            {connectionStatus.connected_at && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Connected:</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {new Date(connectionStatus.connected_at).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, styles.disconnectButton, { backgroundColor: colors.error }]}
            onPress={handleDisconnect}
            disabled={loading}
          >
            <FontAwesome name="times-circle" size={16} color="#fff" />
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FontAwesome name="calendar-o" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Outlook Calendar Not Connected
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Connect your Outlook calendar to sync events between Outlook and this app.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.connectButton, { backgroundColor: colors.primary }]}
            onPress={handleConnect}
            disabled={connecting || loading}
          >
            {connecting ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.buttonText}>Connecting...</Text>
              </>
            ) : (
              <>
                <FontAwesome name="plug" size={16} color="#fff" />
                <Text style={styles.buttonText}>Connect Outlook</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <AlertModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        type="error"
        onClose={handleErrorModalClose}
        onConfirm={errorModal.requiresReconnect ? handleReconnect : errorModal.requiresLogout ? handleLogout : handleErrorModalClose}
        confirmText={errorModal.requiresReconnect ? 'Reconnect' : errorModal.requiresLogout ? 'Logout' : 'OK'}
        showCancel={errorModal.requiresReconnect || errorModal.requiresLogout}
        cancelText="Cancel"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  settingsButton: {
    marginLeft: 'auto',
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorAlert: {
    // Background color set inline
  },
  successAlert: {
    // Background color set inline
  },
  alertText: {
    flex: 1,
    fontSize: 14,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  statusCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusInfo: {
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  emptyCard: {
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  connectButton: {
    minWidth: 200,
  },
  disconnectButton: {
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
});

