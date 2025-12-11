import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Member } from '../../services/familyService';
import FamilyService from '../../services/familyService';
import { APIError } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

interface FamilyMembersTabProps {
  familyId: number;
  members: Member[];
  currentUserRole: 'owner' | 'admin' | 'member' | 'child' | null;
  currentUserId: number | null;
  onMembersUpdate: () => void;
}

export default function FamilyMembersTab({
  familyId,
  members,
  currentUserRole,
  currentUserId,
  onMembersUpdate,
}: FamilyMembersTabProps) {
  const { colors } = useTheme();
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<number | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [memberToChangeRole, setMemberToChangeRole] = useState<Member | null>(null);
  const [newRole, setNewRole] = useState<'admin' | 'member' | 'child'>('member');

  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleRemoveMember = (member: Member) => {
    setMemberToRemove(member);
    setShowRemoveModal(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    setRemovingMemberId(memberToRemove.id);
    setShowRemoveModal(false);

    try {
      await FamilyService.removeMember(familyId, memberToRemove.id);
      onMembersUpdate();
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error removing member:', apiError);
      // TODO: Show error alert
    } finally {
      setRemovingMemberId(null);
      setMemberToRemove(null);
    }
  };

  const handleChangeRole = (member: Member) => {
    setMemberToChangeRole(member);
    setNewRole(member.role === 'admin' ? 'member' : member.role === 'member' ? 'child' : 'admin');
    setShowRoleModal(true);
  };

  const confirmChangeRole = async () => {
    if (!memberToChangeRole) return;

    setChangingRoleId(memberToChangeRole.id);

    try {
      await FamilyService.updateMemberRole(familyId, memberToChangeRole.id, newRole);
      setShowRoleModal(false);
      onMembersUpdate();
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error changing role:', apiError);
      // TODO: Show error alert
    } finally {
      setChangingRoleId(null);
      setMemberToChangeRole(null);
    }
  };

  const getRoleColor = (role: string): string => {
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
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {members.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No members found</Text>
        </View>
      ) : (
        members.map((member) => {
          const isCurrentUser = currentUserId === member.user;
          const canEditThisMember =
            canManageMembers && !isCurrentUser && member.role !== 'owner';

          return (
            <View key={member.id} style={[styles.memberCard, { backgroundColor: colors.surface }]}>
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {member.user_display_name || member.user_email}
                </Text>
                <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>{member.user_email}</Text>
                <Text style={[styles.memberJoined, { color: colors.textSecondary }]}>
                  Joined: {new Date(member.joined_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.memberActions}>
                <View style={[styles.roleBadge, { backgroundColor: getRoleColor(member.role) }]}>
                  <Text style={styles.roleText}>{member.role.toUpperCase()}</Text>
                </View>
                {canEditThisMember && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.roleButton}
                      onPress={() => handleChangeRole(member)}
                      disabled={changingRoleId === member.id}
                    >
                      {changingRoleId === member.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <FontAwesome name="edit" size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveMember(member)}
                      disabled={removingMemberId === member.id}
                    >
                      {removingMemberId === member.id ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <FontAwesome name="trash" size={16} color={colors.error} />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Remove Member Modal */}
      <Modal
        visible={showRemoveModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRemoveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Remove Member</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Are you sure you want to remove {memberToRemove?.user_display_name || memberToRemove?.user_email} from this family?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowRemoveModal(false)}
              >
                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.error }]}
                onPress={confirmRemoveMember}
                disabled={removingMemberId !== null}
              >
                {removingMemberId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDeleteText}>Remove</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        visible={showRoleModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Change Role</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Select a new role for {memberToChangeRole?.user_display_name || memberToChangeRole?.user_email}:
            </Text>
            <View style={styles.roleOptions}>
              {(['admin', 'member', 'child'] as const).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleOption,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    newRole === role && { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
                  ]}
                  onPress={() => setNewRole(role)}
                >
                  <Text style={[styles.roleOptionText, { color: colors.text }]}>{role.toUpperCase()}</Text>
                  {newRole === role && (
                    <FontAwesome name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowRoleModal(false)}
              >
                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={confirmChangeRole}
                disabled={changingRoleId !== null}
              >
                {changingRoleId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonConfirmText}>Change Role</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  memberCard: {
    borderRadius: 12,
    ...Platform.select({
      web: {
        padding: 16,
        margin: 16,
        marginBottom: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      default: {
        padding: 20,
        marginHorizontal: 16,
        marginVertical: 8,
        flexDirection: 'column',
        gap: 16,
      },
    }),
  },
  memberInfo: {
    ...Platform.select({
      web: {
        flex: 1,
      },
      default: {
        width: '100%',
      },
    }),
  },
  memberName: {
    ...Platform.select({
      web: {
        fontSize: 16,
      },
      default: {
        fontSize: 18,
      },
    }),
    fontWeight: '600',
    marginBottom: 4,
  },
  memberEmail: {
    ...Platform.select({
      web: {
        fontSize: 14,
      },
      default: {
        fontSize: 15,
      },
    }),
    marginBottom: 4,
  },
  memberJoined: {
    ...Platform.select({
      web: {
        fontSize: 12,
      },
      default: {
        fontSize: 13,
      },
    }),
  },
  memberActions: {
    ...Platform.select({
      web: {
        alignItems: 'flex-end',
        gap: 8,
      },
      default: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 8,
      },
    }),
  },
  roleBadge: {
    ...Platform.select({
      web: {
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      default: {
        paddingHorizontal: 14,
        paddingVertical: 8,
      },
    }),
    borderRadius: 12,
  },
  roleText: {
    color: '#fff',
    ...Platform.select({
      web: {
        fontSize: 12,
      },
      default: {
        fontSize: 13,
      },
    }),
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    ...Platform.select({
      web: {
        marginTop: 8,
      },
      default: {
        marginTop: 0,
      },
    }),
  },
  roleButton: {
    ...Platform.select({
      web: {
        padding: 8,
      },
      default: {
        padding: 12,
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
      },
    }),
  },
  removeButton: {
    ...Platform.select({
      web: {
        padding: 8,
      },
      default: {
        padding: 12,
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
      },
    }),
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
  roleOptions: {
    marginBottom: 24,
    gap: 8,
  },
  roleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
  },
  roleOptionSelected: {
    // Applied inline
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
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
  modalButtonConfirm: {
    // Applied inline
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

