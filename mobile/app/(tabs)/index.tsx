import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import AuthService from '../../services/authService';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import AlertModal from '../../components/AlertModal';
import EmailVerificationBanner from '../../components/EmailVerificationBanner';
import ProfileService from '../../services/profileService';

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
  ];

  useEffect(() => {
    loadUserData();
  }, []);

  // Refresh verification status when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Only refresh if we have a user email and verification status is false
      if (userEmail && emailVerified === false) {
        loadUserData();
      }
      // Don't refresh families here - let FamilyContext handle it on mount
      // This prevents infinite loops
    }, [userEmail, emailVerified])
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
        // TODO: Navigate to chat when implemented
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
            <View style={[styles.cardIcon, { backgroundColor: `${card.color}20` }]}>
              <Text style={styles.iconEmoji}>{card.icon}</Text>
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

