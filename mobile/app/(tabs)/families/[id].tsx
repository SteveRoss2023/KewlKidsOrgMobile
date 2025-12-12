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
import { useTheme } from '../../../contexts/ThemeContext';
import { useFamily } from '../../../contexts/FamilyContext';

type TabType = 'profile' | 'members' | 'invitations' | 'storage';

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { refreshFamilies } = useFamily();
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
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load current user first
      const userData = await AuthService.getUserData();
      if (userData) {
        setCurrentUserId(userData.id);
        
        // Then load family data
        const [familyData, membersData] = await Promise.all([
          FamilyService.getFamily(Number(id)),
          FamilyService.getFamilyMembers(Number(id)),
        ]);
        setFamily(familyData);
        setMembers(membersData);
        
        // Determine current user's role now that we have both userData and membersData
        const currentMember = membersData.find(m => m.user === userData.id);
        if (currentMember) {
          setCurrentUserRole(currentMember.role);
        } else if (familyData.owner === userData.id) {
          setCurrentUserRole('owner');
        }
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

  const handleFamilyUpdate = async (updatedFamily: Family) => {
    setFamily(updatedFamily);
    // Refresh the families list in the context so the FamilySelector updates
    await refreshFamilies();
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!family) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Family not found</Text>
      </View>
    );
  }

  const isOwner = currentUserId && family.owner === currentUserId;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: family.color }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/families')}
        >
          <FontAwesome name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.familyName}>{family.name}</Text>
          <Text style={styles.memberCount}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <FontAwesome
              name={tab.icon as any}
              size={Platform.OS === 'web' ? 16 : 16}
              color={activeTab === tab.id ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.id ? colors.primary : colors.textSecondary },
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
            onDeleteFamily={handleDeleteFamily}
            deleting={deleting}
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
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Family</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Are you sure you want to delete "{family?.name}"? This action cannot be undone and will remove all family data.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.error }]}
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
  },
  header: {
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerContent: {
    flex: 1,
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
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        paddingVertical: 12,
        gap: 6,
      },
      default: {
        paddingVertical: 16,
        gap: 8,
        paddingHorizontal: 8,
      },
    }),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    // Applied inline
  },
  tabLabel: {
    ...Platform.select({
      web: {
        fontSize: 12,
      },
      default: {
        fontSize: 11,
      },
    }),
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  errorText: {
    fontSize: 16,
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
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
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
    // Applied inline
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonDelete: {
    // Applied inline
  },
  modalButtonDeleteText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
