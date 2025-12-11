import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import FamilyService, { Family, Member } from '../../../services/familyService';
import { APIError } from '../../../../services/api';
import { FontAwesome } from '@expo/vector-icons';
import AuthService from '../../../services/authService';

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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
    if (!family || deleting) return;
    console.log('Delete button pressed, showing confirmation');
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!family) return;
    
    console.log('Delete confirmed, starting deletion');
    setShowDeleteModal(false);
    
    try {
      setDeleting(true);
      await FamilyService.deleteFamily(family.id);
      console.log('Family deleted successfully');
      // Navigate to families list page and it will refresh automatically
      router.replace('/(tabs)/families');
    } catch (error) {
      console.error('Error deleting family:', error);
      setDeleting(false);
      const apiError = error as APIError;
      
      // Use browser confirm for web, Alert for native
      if (Platform.OS === 'web') {
        window.alert(apiError.message || 'Failed to delete family');
      } else {
        Alert.alert('Error', apiError.message || 'Failed to delete family');
      }
    }
  };

  const cancelDelete = () => {
    console.log('Delete cancelled');
    setShowDeleteModal(false);
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
        <View style={styles.headerTop}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              onPress={() => router.push('/(tabs)')} 
              style={styles.homeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome name="home" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
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
          onPress={() => router.push(`/(tabs)/families/${id}/invite`)}
        >
          <FontAwesome name="user-plus" size={20} color="#007AFF" />
          <Text style={styles.actionButtonText}>Invite Member</Text>
        </TouchableOpacity>
        
        {currentUserId && family.owner === currentUserId && (
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
            onPress={handleDeleteFamily}
            disabled={deleting}
            activeOpacity={0.7}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <>
                <FontAwesome name="trash" size={20} color="#FF3B30" />
                <Text style={styles.deleteButtonText}>Delete Family</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Family</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to delete "{family?.name}"? This action cannot be undone and will remove all family data.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={cancelDelete}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
    zIndex: 10,
  },
  homeButton: {
    padding: 8,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
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
    minHeight: 52,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    marginLeft: 10,
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonCancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonDelete: {
    backgroundColor: '#FF3B30',
  },
  modalButtonDeleteText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});



