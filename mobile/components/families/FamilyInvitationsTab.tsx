import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Invitation } from '../../services/familyService';
import FamilyService from '../../services/familyService';
import { APIError } from '../../services/api';

interface FamilyInvitationsTabProps {
  familyId: number;
  currentUserRole: 'owner' | 'admin' | 'member' | 'child' | null;
  onInvitationsUpdate: () => void;
}

export default function FamilyInvitationsTab({
  familyId,
  currentUserRole,
  onInvitationsUpdate,
}: FamilyInvitationsTabProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'child'>('member');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin';

  useEffect(() => {
    loadInvitations();
  }, [familyId]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      const allInvitations = await FamilyService.getFamilyInvitations(familyId);
      setInvitations(allInvitations);
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error loading invitations:', apiError);
      // TODO: Show error alert
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;

    setSendingInvite(true);
    try {
      await FamilyService.inviteMember(familyId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail('');
      setInviteRole('member');
      setShowInviteModal(false);
      await loadInvitations();
      onInvitationsUpdate();
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error sending invitation:', apiError);
      // TODO: Show error alert
    } finally {
      setSendingInvite(false);
    }
  };

  const handleCancelInvite = async (invitationId: number) => {
    setCancellingId(invitationId);
    try {
      await FamilyService.cancelInvitation(invitationId);
      await loadInvitations();
      onInvitationsUpdate();
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error cancelling invitation:', apiError);
      // TODO: Show error alert
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return '#007AFF';
      case 'accepted':
        return '#34C759';
      case 'expired':
        return '#999';
      case 'cancelled':
        return '#FF3B30';
      default:
        return '#999';
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
    <ScrollView style={styles.container}>
      {canInvite && (
        <View style={styles.inviteSection}>
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={() => setShowInviteModal(true)}
          >
            <FontAwesome name="user-plus" size={18} color="#007AFF" />
            <Text style={styles.inviteButtonText}>Send Invitation</Text>
          </TouchableOpacity>
        </View>
      )}

      {invitations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No invitations</Text>
        </View>
      ) : (
        invitations.map((invitation) => (
          <View key={invitation.id} style={styles.invitationCard}>
            <View style={styles.invitationInfo}>
              <Text style={styles.invitationEmail}>{invitation.email}</Text>
              <Text style={styles.invitationDetails}>
                Role: {invitation.role.toUpperCase()} • Invited by: {invitation.invited_by_email}
              </Text>
              <Text style={styles.invitationDate}>
                Sent: {new Date(invitation.created_at).toLocaleDateString()}
                {invitation.expires_at && (
                  <> • Expires: {new Date(invitation.expires_at).toLocaleDateString()}</>
                )}
              </Text>
            </View>
            <View style={styles.invitationActions}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(invitation.status) },
                ]}
              >
                <Text style={styles.statusText}>{invitation.status.toUpperCase()}</Text>
              </View>
              {canInvite &&
                invitation.status === 'pending' &&
                cancellingId !== invitation.id && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelInvite(invitation.id)}
                  >
                    <FontAwesome name="times" size={14} color="#FF3B30" />
                  </TouchableOpacity>
                )}
              {cancellingId === invitation.id && (
                <ActivityIndicator size="small" color="#FF3B30" />
              )}
            </View>
          </View>
        ))
      )}

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Invitation</Text>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sendingInvite}
            />
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleOptions}>
              {(['admin', 'member', 'child'] as const).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleOption,
                    inviteRole === role && styles.roleOptionSelected,
                  ]}
                  onPress={() => setInviteRole(role)}
                >
                  <Text style={styles.roleOptionText}>{role.toUpperCase()}</Text>
                  {inviteRole === role && (
                    <FontAwesome name="check" size={16} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowInviteModal(false)}
                disabled={sendingInvite}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSendInvite}
                disabled={sendingInvite || !inviteEmail.trim()}
              >
                {sendingInvite ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonConfirmText}>Send</Text>
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
    backgroundColor: '#f5f5f5',
  },
  inviteSection: {
    padding: 16,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  invitationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  invitationInfo: {
    flex: 1,
  },
  invitationEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  invitationDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  invitationDate: {
    fontSize: 12,
    color: '#999',
  },
  invitationActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 8,
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
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
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
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  roleOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f7ff',
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
  modalButtonConfirm: {
    backgroundColor: '#007AFF',
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

