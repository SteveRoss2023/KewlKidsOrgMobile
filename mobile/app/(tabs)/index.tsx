import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AuthService from '../../services/authService';
import { FontAwesome } from '@expo/vector-icons';

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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Welcome to KewlKidsOrganizer</Text>
          <TouchableOpacity 
            onPress={() => {
              console.log('Logout button clicked');
              handleLogout();
            }} 
            style={styles.logoutButton}
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <FontAwesome name="sign-out" size={22} color="#FF3B30" />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Manage your family's activities, events, and communication in one place
        </Text>
        {userEmail && (
          <Text style={styles.userEmail}>{userEmail}</Text>
        )}
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

      <View style={styles.cardsContainer}>
        {cards.filter(card => !card.hidden).map(card => (
          <TouchableOpacity
            key={card.id}
            style={styles.card}
            onPress={() => handleCardPress(card.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${card.color}20` }]}>
              <Text style={styles.iconEmoji}>{card.icon}</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#999" style={styles.cardArrow} />
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
    backgroundColor: '#f5f5f5',
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
    paddingTop: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  logoutButton: {
    position: 'absolute',
    right: 0,
    padding: 12,
    zIndex: 1000,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  },
  cardsContainer: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconEmoji: {
    fontSize: 24,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  cardArrow: {
    marginLeft: 8,
  },
});

