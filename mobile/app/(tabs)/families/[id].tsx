import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import FamilyService, { Family, Member } from '../../../services/familyService';
import { APIError } from '../../../services/api';
import { FontAwesome } from '@expo/vector-icons';
import AuthService from '../../../services/authService';
import FamilyProfileTab from '../../../components/families/FamilyProfileTab';
import FamilyMembersTab from '../../../components/families/FamilyMembersTab';
import FamilyInvitationsTab from '../../../components/families/FamilyInvitationsTab';
import FamilyStorageTab from '../../../components/families/FamilyStorageTab';
import AlertModal from '../../../components/AlertModal';

type TabType = 'profile' | 'members' | 'invitations' | 'storage';

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'member' | 'child' | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [alertModal, setAlertModal] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

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
      
      // Determine current user's role
      const currentMember = membersData.find(m => m.user === currentUserId);
      if (currentMember) {
        setCurrentUserRole(currentMember.role);
      } else if (familyData.owner === currentUserId) {
        setCurrentUserRole('owner');
      }
    } catch (error) {
      const apiError = error as APIError;
      setAlertModal({
        visible: true,
        title: 'Error',
        message: apiError.message || 'Failed to load family data',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFamilyUpdate = (updatedFamily: Family) => {
    setFamily(updatedFamily);
    setAlertModal({
      visible: true,
      title: 'Success',
      message: 'Family updated successfully',
      type: 'success',
    });
  };

  const handleMembersUpdate = async () => {
    try {
      const membersData = await FamilyService.getFamilyMembers(Number(id));
      setMembers(membersData);
      
      // Update current user role
      const currentMember = membersData.find(m => m.user === currentUserId);
      if (currentMember) {
        setCurrentUserRole(currentMember.role);
      }
    } catch (error) {
      console.error('Error refreshing members:', error);
    }
  };

  const handleInvitationsUpdate = () => {
    // Refresh is handled in the tab component
  };

  const handleDeleteFamily = () => {
    if (!family || deleting) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!family) return;
    
    setShowDeleteModal(false);
    
    try {
      setDeleting(true);
      await FamilyService.deleteFamily(family.id);
      router.replace('/(tabs)/families');
    } catch (error) {
      setDeleting(false);
      const apiError = error as APIError;
      setAlertModal({
        visible: true,
        title: 'Error',
        message: apiError.message || 'Failed to delete family',
        type: 'error',
      });
    }
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'members', label: 'Members', icon: 'users' },
    { id: 'invitations', label: 'Invitations', icon: 'envelope' },
    { id: 'storage', label: 'Storage', icon: 'database' },
  ];

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

  const isOwner = currentUserId && family.owner === currentUserId;

  return (
    <View style={styles.container}>
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
            {isOwner && (
              <TouchableOpacity
                style={styles.deleteHeaderButton}
                onPress={handleDeleteFamily}
                disabled={deleting}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name="trash" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            )}
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

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <FontAwesome
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? '#007AFF' : '#666'}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tabContent}>
        {activeTab === 'profile' && (
          <FamilyProfileTab
            family={family}
            currentUserRole={currentUserRole}
            onFamilyUpdate={handleFamilyUpdate}
          />
        )}
        {activeTab === 'members' && (
          <FamilyMembersTab
            familyId={family.id}
            members={members}
            currentUserRole={currentUserRole}
            currentUserId={currentUserId}
            onMembersUpdate={handleMembersUpdate}
          />
        )}
        {activeTab === 'invitations' && (
          <FamilyInvitationsTab
            familyId={family.id}
            currentUserRole={currentUserRole}
            onInvitationsUpdate={handleInvitationsUpdate}
          />
        )}
        {activeTab === 'storage' && <FamilyStorageTab family={family} />}
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
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
                onPress={() => setShowDeleteModal(false)}
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

      {/* Alert Modal */}
      <AlertModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ ...alertModal, visible: false })}
      />
    </View>
  );
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
  deleteHeaderButton: {
    padding: 8,
    marginRight: 12,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  errorText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
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
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
      },
    }),
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
