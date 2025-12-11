import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AuthService from '../../services/authService';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';

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
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const cards: FeatureCard[] = [
    {
      id: 'families',
      title: 'Families',
      description: 'Manage your families and members',
      icon: '👨‍👩‍👧‍👦',
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

  const loadUserData = async () => {
    try {
      const userData = await AuthService.getUserData();
      if (userData) {
        setUserEmail(userData.email);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCardPress = (cardId: string) => {
    switch (cardId) {
      case 'families':
        router.push('/(tabs)/families');
        break;
      case 'calendar':
        // TODO: Navigate to calendar when implemented
        break;
      case 'lists':
        // TODO: Navigate to lists when implemented
        break;
      case 'chat':
        // TODO: Navigate to chat when implemented
        break;
      case 'meals':
        // TODO: Navigate to meals when implemented
        break;
      case 'documents':
        // TODO: Navigate to documents when implemented
        break;
      case 'finance':
        // TODO: Navigate to finance when implemented
        break;
      case 'map':
        // TODO: Navigate to map when implemented
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
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage your family's activities, events, and communication in one place
        </Text>
        {userEmail && (
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{userEmail}</Text>
        )}
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

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
            <FontAwesome name="chevron-right" size={16} color={colors.textSecondary} style={styles.cardArrow} />
          </TouchableOpacity>
        ))}
      </View>
      </ScrollView>
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
  },
  titleContainer: {
    width: '100%',
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
  cardArrow: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
});

