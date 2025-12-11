import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import FamilyService, { Family, Member } from '../../services/familyService';
import { APIError } from '../../../services/api';
import { FontAwesome } from '@expo/vector-icons';
import AuthService from '../../services/authService';

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      loadFamilyData();
      loadCurrentUser();
    }
  }, [id]);

  const loadCurrentUser = async () => {
    try {
      const userData = await AuthService.getUserData();
      if (userData) {
        setCurrentUserId(userData.id);
      }
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadFamilyData = async () => {
    try {
      setLoading(true);
      const [familyData, membersData] = await Promise.all([
        FamilyService.getFamily(Number(id)),
        FamilyService.getFamilyMembers(Number(id)),
      ]);
      setFamily(familyData);
      setMembers(membersData);
    } catch (error) {
      const apiError = error as APIError;
      Alert.alert('Error', apiError.message || 'Failed to load family data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFamily = () => {
    if (!family) return;

    Alert.alert(
      'Delete Family',
      `Are you sure you want to delete "${family.name}"? This action cannot be undone and will remove all family data.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await FamilyService.deleteFamily(family.id);
              Alert.alert('Success', 'Family deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]);
            } catch (error) {
              const apiError = error as APIError;
              Alert.alert('Error', apiError.message || 'Failed to delete family');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!family) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Family not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.header, { backgroundColor: family.color }]}>
        <Text style={styles.familyName}>{family.name}</Text>
        <Text style={styles.memberCount}>
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {members.map((member) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.user_display_name || member.user_email}</Text>
              <Text style={styles.memberEmail}>{member.user_email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(member.role) }]}>
              <Text style={styles.roleText}>{member.role.toUpperCase()}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(`/families/${id}/invite`)}
        >
          <FontAwesome name="user-plus" size={20} color="#007AFF" />
          <Text style={styles.actionButtonText}>Invite Member</Text>
        </TouchableOpacity>
        
        {currentUserId && family.owner === currentUserId && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteFamily}
          >
            <FontAwesome name="trash" size={20} color="#FF3B30" />
            <Text style={styles.deleteButtonText}>Delete Family</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'owner':
      return '#FF3B30';
    case 'admin':
      return '#FF9500';
    case 'member':
      return '#007AFF';
    case 'child':
      return '#34C759';
    default:
      return '#999';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  familyName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  memberCount: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: '#666',
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    padding: 20,
    paddingBottom: 40,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  actionButtonText: {
    marginLeft: 10,
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF3B30',
    marginTop: 12,
  },
  deleteButtonText: {
    marginLeft: 10,
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});

