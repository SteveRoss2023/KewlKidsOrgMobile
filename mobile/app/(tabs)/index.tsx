import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import AuthService from '../../services/authService';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import AlertModal from '../../components/AlertModal';
import EmailVerificationBanner from '../../components/EmailVerificationBanner';
import ProfileService from '../../services/profileService';
import chatService from '../../services/chatService';
import FamilyService from '../../services/familyService';
import { getTotalUnreadCount, getRoomLastSeen } from '../../utils/messageTracking';
import MessageBadge from '../../components/MessageBadge';
import websocketService from '../../services/websocketService';
import { tokenStorage } from '../../utils/storage';
import Logo from '../../components/Logo';

interface FeatureCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  hidden?: boolean;
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { refreshFamilies } = useFamily();
  const params = useLocalSearchParams<{
    verified?: string;
    email?: string;
    message?: string;
    message_type?: 'success' | 'error' | 'info' | 'warning';
  }>();
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVerifiedModal, setShowVerifiedModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState<number>(0);
  const [userMemberIds, setUserMemberIds] = useState<{ [familyId: number]: number }>({});
  const processedMessageIds = useRef<Set<number>>(new Set());
  // Fallback deduplication: track room_id + created_at for messages without message_id
  const processedNotifications = useRef<Set<string>>(new Set());
  // Track timestamps for cleanup
  const processedMessageTimestamps = useRef<Map<number, number>>(new Map());
  const processedNotificationTimestamps = useRef<Map<string, number>>(new Map());
  const MAX_PROCESSED_IDS = 1000; // Limit to prevent memory growth
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  const { selectedFamily, families } = useFamily();

  const cards: FeatureCard[] = [
    {
      id: 'activity',
      title: 'Activity',
      description: 'View today\'s activities and events',
      icon: '⏰',
      color: '#3b82f6',
    },
    {
      id: 'calendar',
      title: 'Calendar',
      description: 'View and manage your family calendar',
      icon: '📆',
      color: '#10b981',
    },
    {
      id: 'lists',
      title: 'Lists',
      description: 'Shopping lists and to-do items',
      icon: '📝',
      color: '#8b5cf6',
    },
    {
      id: 'chat',
      title: 'Chat',
      description: 'Secure family messaging',
      icon: '💬',
      color: '#ec4899',
    },
    {
      id: 'meals',
      title: 'Meal Planning & Recipes',
      description: 'Plan meals and manage recipes',
      icon: '🍽️',
      color: '#f97316',
    },
    {
      id: 'documents',
      title: 'Documents',
      description: 'Share and manage family documents',
      icon: '📄',
      color: '#06b6d4',
    },
    {
      id: 'finance',
      title: 'Finance',
      description: 'Track family finances and budgets',
      icon: '💰',
      color: '#22c55e',
    },
    {
      id: 'map',
      title: 'Map',
      description: 'Location sharing and tracking',
      icon: '🗺️',
      color: '#a855f7',
    },
    {
      id: 'mapbox',
      title: 'Map(MapBox)',
      description: 'MapBox location sharing and tracking',
      icon: '🗺️',
      color: '#0066ff',
    },
  ];

  const loadChatUnreadCount = useCallback(async () => {
    try {
      const rooms = await chatService.getChatRooms();

      if (rooms.length === 0) {
        setChatUnreadCount(0);
        return;
      }

      // Get user member IDs for each family (cache profile to avoid repeated calls)
      const profile = await ProfileService.getProfile();
      const userMemberIds: { [familyId: number]: number } = {};
      const familyIds = new Set(rooms.map(r => r.family));

      for (const familyId of familyIds) {
        try {
          const members = await FamilyService.getFamilyMembers(familyId);
          const userMember = members.find(m => m.user_email.toLowerCase() === profile.email.toLowerCase());
          if (userMember) {
            userMemberIds[familyId] = userMember.id;
          }
        } catch (err) {
          console.error(`Error getting members for family ${familyId}:`, err);
        }
      }

      const totalUnread = await getTotalUnreadCount(rooms, userMemberIds, processedMessageIds.current);
      setChatUnreadCount(totalUnread);
      // Store userMemberIds for notification handler
      setUserMemberIds(userMemberIds);
    } catch (err) {
      console.error('Error loading chat unread count:', err);
      setChatUnreadCount(0);
    }
  }, []);

  // Handle notification WebSocket messages for real-time badge updates
  const handleNotification = useCallback(async (notification: any) => {
    console.log('[Home] Notification received:', notification);
    if (notification.type === 'room_message') {
      const { room_id, sender, created_at, message_id } = notification;
      // Convert room_id to number if it's a string
      const roomIdNum = typeof room_id === 'string' ? parseInt(room_id, 10) : room_id;
      const messageIdNum = message_id ? (typeof message_id === 'string' ? parseInt(message_id, 10) : message_id) : null;

      // Deduplicate: Skip if we've already processed this message
      if (messageIdNum && processedMessageIds.current.has(messageIdNum)) {
        console.log('[Home] Message already processed (by ID), skipping:', messageIdNum);
        return;
      }

      // Fallback deduplication: use room_id + created_at if message_id is missing
      const notificationKey = `${roomIdNum}_${created_at}`;
      if (processedNotifications.current.has(notificationKey)) {
        console.log('[Home] Notification already processed (by key), skipping:', notificationKey);
        return;
      }

      // Mark as processed IMMEDIATELY to prevent race conditions with duplicate notifications
      // This must happen before any async operations
      const now = Date.now();
      if (messageIdNum) {
        processedMessageIds.current.add(messageIdNum);
        processedMessageTimestamps.current.set(messageIdNum, now);
      }
      processedNotifications.current.add(notificationKey);
      processedNotificationTimestamps.current.set(notificationKey, now);

      console.log('[Home] Processing room_message notification:', { room_id: roomIdNum, sender, created_at, message_id: messageIdNum });

      try {
        // Get rooms to find the room's family
        const rooms = await chatService.getChatRooms();
        const room = rooms.find(r => r.id === roomIdNum);

        if (!room) {
          console.log('[Home] Room not found in rooms list, reloading counts to get latest data');
          // Already marked as processed above, just reload counts
          await loadChatUnreadCount();
          return;
        }

        // Get user member ID for this room's family
        let userMemberId = userMemberIds[room.family];

        if (!userMemberId) {
          // If we don't have the member ID yet, reload counts (will get member IDs)
          console.log('[Home] No userMemberId for family, reloading counts');
          // Already marked as processed above, just reload counts
          await loadChatUnreadCount();
          return;
        }

        // Only update if message is from another user (not the current user)
        // Convert sender to number if it's a string
        const senderNum = typeof sender === 'string' ? parseInt(sender, 10) : sender;
        if (senderNum !== userMemberId) {
          console.log('[Home] Message from another user, checking last_seen');
          // Check if message is newer than last seen (user might be viewing the room)
          const lastSeen = await getRoomLastSeen(roomIdNum);
          const messageTime = new Date(created_at);

          console.log('[Home] Last seen check:', { lastSeen, messageTime, isNewer: !lastSeen || messageTime > lastSeen });

          // Only increment if message is newer than last seen (or never seen)
          if (!lastSeen || messageTime > lastSeen) {
            console.log('[Home] Incrementing badge count');
            // Already marked as processed above, just increment
            setChatUnreadCount(prev => {
              const newCount = prev + 1;
              console.log('[Home] Badge count updated:', prev, '->', newCount);
              return newCount;
            });
          } else {
            console.log('[Home] Message already seen, not incrementing');
            // Already marked as processed above
          }
        } else {
          console.log('[Home] Message from current user, not incrementing');
          // Already marked as processed above
        }
      } catch (err) {
        console.error('[Home] Error handling notification:', err);
        // Fallback: reload counts
        await loadChatUnreadCount();
      }
    } else {
      console.log('[Home] Unknown notification type:', notification.type);
    }
  }, [userMemberIds, loadChatUnreadCount]);

  // Store handler in ref to avoid reconnecting when handleNotification changes
  const handleNotificationRef = useRef(handleNotification);
  handleNotificationRef.current = handleNotification;

  // Create a stable handler function that won't change
  const stableNotificationHandler = useCallback((notification: any) => {
    handleNotificationRef.current(notification);
  }, []);

  // Connect to notification WebSocket on mount
  useEffect(() => {
    const connectNotifications = async () => {
      try {
        const token = await tokenStorage.getAccessToken();
        if (token) {
          console.log('[Home] Connecting to notification WebSocket...');
          websocketService.setNotificationHandler(stableNotificationHandler);
          await websocketService.connectToNotifications(token);
          console.log('[Home] Notification WebSocket connected');
        } else {
          console.warn('[Home] No token available for notification WebSocket');
        }
      } catch (err) {
        console.error('[Home] Error connecting to notification WebSocket:', err);
      }
    };

    connectNotifications();

    // Cleanup on unmount
    return () => {
      console.log('[Home] Removing notification handler');
      websocketService.removeNotificationHandler(stableNotificationHandler);
      // Only disconnect if no handlers remain
      if (!websocketService.hasNotificationHandlers()) {
        websocketService.disconnectFromNotifications();
      }
    };
  }, [stableNotificationHandler]);

  // Cleanup processed message IDs and notifications to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();

      // Remove old message IDs (older than 24 hours)
      processedMessageTimestamps.current.forEach((timestamp, id) => {
        if (now - timestamp > MAX_AGE_MS) {
          processedMessageIds.current.delete(id);
          processedMessageTimestamps.current.delete(id);
        }
      });

      // Remove old notifications (older than 24 hours)
      processedNotificationTimestamps.current.forEach((timestamp, key) => {
        if (now - timestamp > MAX_AGE_MS) {
          processedNotifications.current.delete(key);
          processedNotificationTimestamps.current.delete(key);
        }
      });

      // Keep only the most recent message IDs if size exceeds limit
      if (processedMessageIds.current.size > MAX_PROCESSED_IDS) {
        const entries = Array.from(processedMessageTimestamps.current.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by timestamp, newest first
          .slice(0, MAX_PROCESSED_IDS);

        processedMessageIds.current.clear();
        processedMessageTimestamps.current.clear();
        entries.forEach(([id, timestamp]) => {
          processedMessageIds.current.add(id);
          processedMessageTimestamps.current.set(id, timestamp);
        });
      }

      // Keep only the most recent notifications if size exceeds limit
      if (processedNotifications.current.size > MAX_PROCESSED_IDS) {
        const entries = Array.from(processedNotificationTimestamps.current.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by timestamp, newest first
          .slice(0, MAX_PROCESSED_IDS);

        processedNotifications.current.clear();
        processedNotificationTimestamps.current.clear();
        entries.forEach(([key, timestamp]) => {
          processedNotifications.current.add(key);
          processedNotificationTimestamps.current.set(key, timestamp);
        });
      }
    }, 60 * 60 * 1000); // Run every hour

    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    loadUserData();
    // Load chat unread count immediately (don't wait for user data)
    loadChatUnreadCount();
  }, [loadChatUnreadCount]);

  // Refresh verification status when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Only refresh if we have a user email and verification status is false
      if (userEmail && emailVerified === false) {
        loadUserData();
      }
      // Refresh chat unread count when screen comes into focus (throttled to prevent loops)
      // This will pick up updated last_seen timestamps from when user viewed rooms
      const timeoutId = setTimeout(() => {
        loadChatUnreadCount();
      }, 500);

      return () => clearTimeout(timeoutId);
    }, [userEmail, emailVerified, loadChatUnreadCount])
  );

  useEffect(() => {
    // Check if email was just verified
    if (params.verified === 'true') {
      setShowVerifiedModal(true);
      setEmailVerified(true); // Update verification status
      // Reload user data to get updated verification status
      loadUserData();
      // Clear the URL parameters after a short delay to avoid re-triggering
      const timer = setTimeout(() => {
        router.replace('/(tabs)');
      }, 100);
      return () => clearTimeout(timer);
    }

    // Check for other messages (e.g., invitation already accepted)
    if (params.message && params.message_type) {
      setShowMessageModal(true);
      // Clear the URL parameters after a short delay
      const timer = setTimeout(() => {
        router.replace('/(tabs)');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [params.verified, params.message, params.message_type]);

  const loadUserData = async () => {
    try {
      const userData = await AuthService.getUserData();
      if (userData) {
        setUserEmail(userData.email);
        // Check email verification status from user data first
        if (userData.email_verified !== undefined) {
          setEmailVerified(userData.email_verified);
        }
      }

      // Also check profile to get latest verification status
      try {
        const profile = await ProfileService.getProfile();
        setEmailVerified(profile.email_verified);
      } catch (error) {
        // If profile fetch fails, use the value from userData if available
        // Don't set to false if we don't have any data
        if (userData?.email_verified === undefined) {
          setEmailVerified(null);
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh families
      await refreshFamilies();
      // Refresh user data
      await loadUserData();
      // Refresh chat unread count
      await loadChatUnreadCount();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCardPress = (cardId: string) => {
    switch (cardId) {
      case 'activity':
        router.push('/(tabs)/today');
        break;
      case 'calendar':
        router.push('/(tabs)/calendar');
        break;
      case 'lists':
        router.push('/(tabs)/lists');
        break;
      case 'chat':
        router.push('/(tabs)/chat');
        break;
      case 'meals':
        router.push('/(tabs)/meals');
        break;
      case 'documents':
        router.push('/(tabs)/documents');
        break;
      case 'finance':
        // TODO: Navigate to finance when implemented
        break;
      case 'map':
        router.push('/(tabs)/map');
        break;
      case 'mapbox':
        router.push('/(tabs)/mapbox');
        break;
      default:
        console.log('Feature not yet implemented:', cardId);
    }
  };

  const handleLogout = async () => {
    try {
      await AuthService.logout();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still navigate to login even if there's an error
      router.replace('/(auth)/login');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={styles.logoContainer}>
            <Logo width={32} height={32} color={colors.primary} />
          </View>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>Welcome to KewlKidsOrganizer</Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.refreshButton, { borderColor: colors.border }]}
            disabled={refreshing || loading}
          >
            <FontAwesome
              name="refresh"
              size={16}
              color={refreshing || loading ? colors.textSecondary : colors.text}
            />
          </TouchableOpacity>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage your family's activities, events, and communication in one place
        </Text>
        {userEmail && (
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{userEmail}</Text>
        )}
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Show email verification banner if email is not verified */}
        {emailVerified === false && userEmail && (
          <EmailVerificationBanner
            email={userEmail}
            onVerificationComplete={() => {
              setEmailVerified(true);
              loadUserData();
            }}
          />
        )}

      <View style={styles.cardsContainer}>
        {cards.filter(card => !card.hidden).map(card => (
          <TouchableOpacity
            key={card.id}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => handleCardPress(card.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${card.color}20` }, { position: 'relative' }]}>
              <Text style={styles.iconEmoji}>{card.icon}</Text>
              {card.id === 'chat' && (
                <MessageBadge count={chatUnreadCount} style={styles.chatCardBadge} />
              )}
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{card.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      </ScrollView>
      <AlertModal
        visible={showVerifiedModal}
        title="Email Verified"
        message={`Your email ${params.email || 'address'} has been successfully verified!`}
        type="success"
        onClose={() => setShowVerifiedModal(false)}
      />
      <AlertModal
        visible={showMessageModal}
        title={params.message_type === 'info' ? 'Information' : params.message_type === 'error' ? 'Error' : 'Notice'}
        message={params.message || ''}
        type={params.message_type || 'info'}
        onClose={() => setShowMessageModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 20 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTop: {
    width: '100%',
    marginBottom: 8,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logoContainer: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
    marginTop: -4, // Align with title
  },
  title: {
    fontSize: Platform.OS === 'web' ? 24 : 20,
    fontWeight: 'bold',
    textAlign: 'left',
    lineHeight: Platform.OS === 'web' ? 28 : 24,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    minHeight: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  chatCardBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  iconEmoji: {
    fontSize: 24,
  },
  cardContent: {
    flex: 1,
    width: '100%',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
});

