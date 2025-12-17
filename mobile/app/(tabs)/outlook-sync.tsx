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
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import oauthService, { OAuthConnectionStatus } from '../../services/oauthService';

export default function OutlookSyncScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<OAuthConnectionStatus>({ connected: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      setError(err.message || 'Failed to check connection status');
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
      setError(err.message || 'Failed to connect Outlook calendar. Please try again.');
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
              setError(err.message || 'Failed to disconnect');
            } finally {
              setLoading(false);
              await checkConnection();
            }
          },
        },
      ]
    );
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

