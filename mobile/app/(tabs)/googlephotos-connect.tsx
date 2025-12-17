import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import oauthService, { OAuthConnectionStatus } from '../../services/oauthService';
import ConfirmModal from '../../components/ConfirmModal';

export default function GooglePhotosConnectScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ success?: string; service?: string; message?: string }>();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<OAuthConnectionStatus>({ connected: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  // Handle OAuth callback from web (URL parameters) or mobile (deep link)
  useEffect(() => {
    if (params.success === 'true' && params.service === 'googlephotos' && params.message) {
      // Wait a moment for backend to process, then check connection
      const timer = setTimeout(async () => {
        const status = await oauthService.checkConnection('googlephotos');
        setConnectionStatus(status);
        if (status.connected) {
          setSuccess(decodeURIComponent(params.message || 'Google Photos connected successfully!'));
          setTimeout(() => {
            setSuccess('');
          }, 2000);
        }
        // Clear URL parameters
        if (Platform.OS === 'web') {
          router.replace('/(tabs)/googlephotos-connect');
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [params.success, params.service, params.message]);

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
      const status = await oauthService.checkConnection('googlephotos');
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
      console.error('Error checking Google Photos connection:', err);
      setError(err.message || 'Failed to check connection status');
      setConnectionStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError('');
      setSuccess('');

      const result = await oauthService.connectGooglePhotos();

      if (result.success) {
        // Wait a moment for backend to process callback, then check connection status
        await new Promise(resolve => setTimeout(resolve, 500));
        const status = await oauthService.checkConnection('googlephotos');
        setConnectionStatus(status);

        // If connection is confirmed, NEVER show "Please complete authorization" message
        if (status.connected) {
          // Connection confirmed - clear any "Please complete authorization" message
          setSuccess('');
        } else {
          // Connection not confirmed yet - only show message if it's NOT "Please complete authorization"
          if (!result.message.includes('Please complete authorization')) {
            setSuccess(result.message || 'Google Photos connected successfully!');
          }
          // Don't set the "Please complete authorization" message
        }
      } else {
        setError(result.message || 'Failed to connect Google Photos');
      }
    } catch (err: any) {
      console.error('Error connecting Google Photos:', err);
      setError(err.message || 'Failed to connect Google Photos. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectModal(true);
  };

  const confirmDisconnect = async () => {
    setShowDisconnectModal(false);
    try {
      setLoading(true);
      await oauthService.disconnect('googlephotos');
      setSuccess('Google Photos disconnected successfully');
      await checkConnection();
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <FontAwesome name="photo" size={24} color={colors.text} />
        <Text style={[styles.title, { color: colors.text }]}>Google Photos Connect</Text>
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
          <FontAwesome name="photo" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Google Photos Not Connected
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Connect your Google Photos account to access and manage your photos.
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
                <Text style={styles.buttonText}>Connect Google Photos</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ConfirmModal
        visible={showDisconnectModal}
        title="Disconnect Google Photos"
        message="Are you sure you want to disconnect your Google Photos account? You will need to reconnect to access your photos."
        onClose={() => setShowDisconnectModal(false)}
        onConfirm={confirmDisconnect}
        confirmText="Disconnect"
        cancelText="Cancel"
        type="danger"
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
  errorAlert: {},
  successAlert: {},
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
});

