import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import chatService, { ChatRoom } from '../../services/chatService';
import FamilyService, { Member } from '../../services/familyService';
import ProfileService from '../../services/profileService';
import { APIError } from '../../services/api';
import GlobalNavBar from '../../components/GlobalNavBar';
import { getUnreadCountFromLastMessage } from '../../utils/messageTracking';
import MessageBadge from '../../components/MessageBadge';
import ConfirmModal from '../../components/ConfirmModal';

interface RoomGroup {
  familyId: number;
  familyName: string;
  rooms: ChatRoom[];
}

export default function ChatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily, families } = useFamily();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [familyMembers, setFamilyMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [userMemberIds, setUserMemberIds] = useState<{ [familyId: number]: number }>({});
  const [userRoles, setUserRoles] = useState<{ [familyId: number]: string }>({});
  const [deletingRoomId, setDeletingRoomId] = useState<number | null>(null);
  const [showRoomDetailsModal, setShowRoomDetailsModal] = useState(false);
  const [selectedRoomDetails, setSelectedRoomDetails] = useState<ChatRoom | null>(null);
  const [roomDetailsMembers, setRoomDetailsMembers] = useState<Member[]>([]);
  const [loadingRoomDetails, setLoadingRoomDetails] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<{ [roomId: number]: number }>({});
  const [showDeleteRoomModal, setShowDeleteRoomModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<ChatRoom | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      setError('');
      const allRooms = await chatService.getChatRooms();
      console.log('[Chat] Loaded rooms from API:', allRooms.length, 'rooms');
      if (allRooms.length > 0) {
        console.log('[Chat] Room details:', allRooms.map(r => ({
          id: r.id,
          family: r.family,
          name: r.name || r.display_name || 'Unnamed',
          members: r.members?.length || 0,
          created_by: r.created_by
        })));
      }
      setRooms(allRooms);
      // Don't calculate unread counts here - do it in a separate effect
    } catch (err) {
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to load chat rooms');
      console.error('Error loading chat rooms:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // Remove userMemberIds dependency to break circular dependency

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Refresh rooms and unread counts when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Refresh rooms list when screen comes into focus
      loadRooms();

      // Also update unread counts if we already have rooms and member IDs
      if (rooms.length > 0 && Object.keys(userMemberIds).length > 0) {
        // Throttle to prevent rapid-fire calls
        const timeoutId = setTimeout(() => {
          const updateCounts = async () => {
            const counts: { [roomId: number]: number } = {};
            for (const room of rooms) {
              const userMemberId = userMemberIds[room.family] || null;
              if (room.last_message) {
                const count = await getUnreadCountFromLastMessage(
                  room.id,
                  room.last_message.created_at,
                  room.last_message.sender_id,
                  userMemberId
                );
                counts[room.id] = count;
              } else {
                counts[room.id] = 0;
              }
            }
            setUnreadCounts(counts);
          };
          updateCounts();
        }, 300);

        return () => clearTimeout(timeoutId);
      }
    }, [loadRooms, rooms.length, Object.keys(userMemberIds).join(',')]) // Include loadRooms to refresh on focus
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRooms();
  }, [loadRooms]);

  const groupRoomsByFamily = (rooms: ChatRoom[]): RoomGroup[] => {
    const grouped: { [key: number]: RoomGroup } = {};

    rooms.forEach((room) => {
      const familyId = room.family;
      if (!grouped[familyId]) {
        const family = families.find((f) => f.id === familyId);
        grouped[familyId] = {
          familyId,
          familyName: room.family_name || family?.name || `Family ${familyId}`,
          rooms: [],
        };
      }
      grouped[familyId].rooms.push(room);
    });

    return Object.values(grouped).sort((a, b) =>
      a.familyName.localeCompare(b.familyName)
    );
  };

  const handleRoomPress = (roomId: number) => {
    router.push(`/(tabs)/chat/${roomId}` as any);
  };

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const profile = await ProfileService.getProfile();
        setCurrentUserId(profile.id);
      } catch (err) {
        console.error('Error fetching current user:', err);
      }
    };
    fetchCurrentUser();
  }, []);

      // Load member IDs and roles for each family to check room ownership and permissions
      useEffect(() => {
        const loadUserMemberData = async () => {
          if (!currentUserId || rooms.length === 0) return;

          const memberIdMap: { [familyId: number]: number } = {};
          const roleMap: { [familyId: number]: string } = {};

          // Get current user's email for matching (only once)
          let userEmail: string | null = null;
          try {
            const profile = await ProfileService.getProfile();
            userEmail = profile.email;
          } catch (err) {
            console.error('Error getting profile for member lookup:', err);
            return;
          }

          // Load members for each family that has rooms
          const familyIds = new Set(rooms.map(room => room.family));

          for (const familyId of familyIds) {
            // Skip if we already have this family's member ID
            if (userMemberIds[familyId]) {
              memberIdMap[familyId] = userMemberIds[familyId];
              roleMap[familyId] = userRoles[familyId] || '';
              continue;
            }

            try {
              const members = await FamilyService.getFamilyMembers(familyId);
              // Match by email since profile.id is not the user ID
              const userMember = userEmail ? members.find(m => m.user_email.toLowerCase() === userEmail.toLowerCase()) : null;
              if (userMember) {
                memberIdMap[familyId] = userMember.id;
                roleMap[familyId] = userMember.role;
              }
            } catch (err) {
              console.error(`Error loading members for family ${familyId}:`, err);
            }
          }

          // Only update if we have new data
          if (Object.keys(memberIdMap).length > 0) {
            setUserMemberIds(prev => ({ ...prev, ...memberIdMap }));
            setUserRoles(prev => ({ ...prev, ...roleMap }));
          }
        };

        loadUserMemberData();
      }, [rooms.length, currentUserId]); // Only depend on length, not the array itself

  useEffect(() => {
    const fetchMembers = async () => {
      if (!showCreateModal || !selectedFamily) {
        setFamilyMembers([]);
        return;
      }

      setLoadingMembers(true);
      try {
        const members = await FamilyService.getFamilyMembers(selectedFamily.id);
        setFamilyMembers(members);
      } catch (err) {
        console.error('[Chat] Error fetching members:', err);
        setFamilyMembers([]);
        setError('Failed to load family members');
      } finally {
        setLoadingMembers(false);
      }
    };

    fetchMembers();
  }, [showCreateModal, selectedFamily]);

  const handleCreateRoom = () => {
    console.log('[Chat] handleCreateRoom called, selectedFamily:', selectedFamily);
    if (!selectedFamily) {
      setError('Please select a family first');
      console.log('[Chat] No selectedFamily, showing error');
      return;
    }
    console.log('[Chat] Opening create room modal');
    setShowCreateModal(true);
    setRoomName('');
    setSelectedMemberIds([]);
    setError('');
  };

  const handleCreateRoomSubmit = async () => {
    if (!selectedFamily) {
      setError('Please select a family first');
      return;
    }

    // Allow creating room even if no other members (you can chat with yourself)
    // But warn if there are other members available and none selected
    if (selectedMemberIds.length === 0 && availableMembers.length > 0) {
      setError('Please select at least one member to invite, or create a room for yourself');
      return;
    }

    // Double-check to prevent submission if button is somehow enabled
    if (creatingRoom) {
      console.log('Already creating room, ignoring duplicate request');
      return;
    }

    setCreatingRoom(true);
    setError('');


    try {
      // If no members selected but there are no other members, create room with empty member list
      // (the backend will add the creator automatically)
      const memberIdsToUse = selectedMemberIds.length > 0 ? selectedMemberIds : [];

      console.log('Creating room with:', {
        familyId: selectedFamily.id,
        name: roomName.trim() || null,
        memberIds: memberIdsToUse,
      });

      const newRoom = await chatService.createChatRoom(
        selectedFamily.id,
        roomName.trim() || null,
        memberIdsToUse
      );


      // Refresh rooms list
      await loadRooms();

      // Close modal and navigate to new room
      setShowCreateModal(false);
      setRoomName('');
      setSelectedMemberIds([]);
      router.push(`/(tabs)/chat/${newRoom.id}` as any);
    } catch (err: any) {
      console.error('Error creating room - full error:', err);
      console.error('Error response:', err?.response?.data);
      console.error('Error status:', err?.response?.status);

      let errorMessage = 'Failed to create chat room';
      if (err?.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.detail) {
          errorMessage = err.response.data.detail;
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        } else if (err.response.data.member_ids) {
          errorMessage = Array.isArray(err.response.data.member_ids)
            ? err.response.data.member_ids.join(', ')
            : String(err.response.data.member_ids);
        } else if (err.response.data.family) {
          errorMessage = Array.isArray(err.response.data.family)
            ? err.response.data.family.join(', ')
            : String(err.response.data.family);
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setCreatingRoom(false);
    }
  };

  const toggleMemberSelection = (memberId: number) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleDeleteRoom = (room: ChatRoom) => {
    setRoomToDelete(room);
    setShowDeleteRoomModal(true);
  };

  const handleShowRoomDetails = async (room: ChatRoom) => {
    setSelectedRoomDetails(room);
    setShowRoomDetailsModal(true);
    setLoadingRoomDetails(true);
    setRoomDetailsMembers([]);

    try {
      // Fetch room members
      const members = await chatService.getRoomMembers(room.id);
      setRoomDetailsMembers(members);
    } catch (err) {
      console.error('Error loading room details:', err);
      setError('Failed to load room details');
    } finally {
      setLoadingRoomDetails(false);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!roomToDelete) return;

    try {
      setDeletingRoomId(roomToDelete.id);
      await chatService.deleteChatRoom(roomToDelete.id);
      // Refresh rooms list
      await loadRooms();
      setShowDeleteRoomModal(false);
      setRoomToDelete(null);
    } catch (err) {
      const apiError = err as APIError;
      Alert.alert('Error', apiError.message || 'Failed to delete room');
    } finally {
      setDeletingRoomId(null);
    }
  };

  const cancelDeleteRoom = () => {
    setShowDeleteRoomModal(false);
    setRoomToDelete(null);
  };

  const renderRoomItem = ({ item }: { item: ChatRoom }) => {
    const unreadCount = unreadCounts[item.id] || 0;
    const lastMessage = item.last_message;
    const userMemberId = userMemberIds[item.family];
    const userRole = userRoles[item.family];
        // Check if user is creator by member ID
        const isCreatorByMemberId = item.created_by && userMemberId && item.created_by === userMemberId;

        // Also check if the creator member belongs to the same user (in case of multiple member records)
        let isCreatorByUserId = false;
        if (item.created_by && currentUserId) {
          // Find the creator member in the family members list
          const creatorMember = familyMembers.find(m => m.id === item.created_by);
          if (creatorMember && creatorMember.user === currentUserId) {
            isCreatorByUserId = true;
          }
        }

        const isCreator = isCreatorByMemberId || isCreatorByUserId;
        const isAdminOrOwner = userRole === 'admin' || userRole === 'owner';
        const canDelete = isCreator || isAdminOrOwner;
    const isDeleting = deletingRoomId === item.id;

    // Debug logging removed to prevent console spam

    return (
      <View style={[styles.roomItemContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.roomItem}
          onPress={() => handleRoomPress(item.id)}
          disabled={isDeleting}
        >
          <View style={styles.roomContent}>
            <Text style={[styles.roomName, { color: colors.text }]}>
              {item.display_name || item.name || `Room ${item.id}`}
            </Text>
            {lastMessage && (
              <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                {lastMessage.sender_email ? `${lastMessage.sender_email.split('@')[0]}: ` : ''}Last message
              </Text>
            )}
          </View>
          <MessageBadge count={unreadCount} style={styles.roomBadge} />
        </TouchableOpacity>
        <View style={styles.roomActions}>
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => handleShowRoomDetails(item)}
            disabled={isDeleting}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="info-circle" size={18} color={colors.primary} />
          </TouchableOpacity>
          {canDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteRoom(item)}
              disabled={isDeleting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <FontAwesome name="trash" size={18} color={colors.error} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderFamilyGroup = ({ item }: { item: RoomGroup }) => (
    <View style={styles.familyGroup}>
      <Text style={[styles.familyName, { color: colors.text }]}>
        {item.familyName} ({item.rooms.length})
      </Text>
      {item.rooms.map((room) => (
        <View key={room.id}>{renderRoomItem({ item: room })}</View>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const groupedRooms = groupRoomsByFamily(rooms);
  console.log('[Chat] Rendering with', rooms.length, 'rooms in', groupedRooms.length, 'groups');

  // Filter out current user from member selection
  const availableMembers = familyMembers.filter(
    (member) => !currentUserId || member.user !== currentUserId
  );

  // Removed console.log to prevent infinite loop

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text, flex: 1 }]} numberOfLines={1}>
          Chat Rooms
        </Text>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            console.log('[Chat] Add button pressed!');
            handleCreateRoom();
          }}
          accessibilityLabel="Create new chat room"
          accessibilityRole="button"
        >
          <FontAwesome name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      {groupedRooms.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No chat rooms yet. Create one to start chatting!
          </Text>
          <TouchableOpacity
            style={[styles.floatingCreateButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[Chat] Floating add button pressed!');
              handleCreateRoom();
            }}
          >
            <FontAwesome name="plus" size={24} color="#fff" />
            <Text style={styles.floatingButtonText}>Create Room</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groupedRooms}
          renderItem={renderFamilyGroup}
          keyExtractor={(item) => `family-${item.familyId}`}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Chat Room</Text>
            <TouchableOpacity
              onPress={() => setShowCreateModal(false)}
              style={styles.closeButton}
            >
              <FontAwesome name="times" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {!selectedFamily ? (
              <Text style={[styles.errorText, { color: colors.error }]}>
                Please select a family first
              </Text>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Room Name (Optional)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                    value={roomName}
                    onChangeText={setRoomName}
                    placeholder="Enter room name..."
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Select Members to Invite
                  </Text>
                  {loadingMembers ? (
                    <ActivityIndicator size="small" color={colors.primary} style={styles.loadingMembers} />
                  ) : availableMembers.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No other members in this family
                    </Text>
                  ) : (
                    <View style={styles.memberList}>
                      {availableMembers.map((member) => (
                        <TouchableOpacity
                          key={member.id}
                          style={[
                            styles.memberItem,
                            { backgroundColor: colors.card, borderColor: colors.border },
                            selectedMemberIds.includes(member.id) && {
                              backgroundColor: colors.primary + '20',
                              borderColor: colors.primary,
                            },
                          ]}
                          onPress={() => toggleMemberSelection(member.id)}
                        >
                          <View style={styles.memberItemContent}>
                            <View
                              style={[
                                styles.checkbox,
                                { borderColor: colors.border },
                                selectedMemberIds.includes(member.id) && {
                                  backgroundColor: colors.primary,
                                  borderColor: colors.primary,
                                },
                              ]}
                            >
                              {selectedMemberIds.includes(member.id) && (
                                <FontAwesome name="check" size={12} color="#fff" />
                              )}
                            </View>
                            <View style={styles.memberInfo}>
                              <Text style={[styles.memberName, { color: colors.text }]}>
                                {member.user_display_name || member.user_email}
                              </Text>
                              <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>
                                {member.user_email}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                  </View>
                )}

                {selectedMemberIds.length === 0 && availableMembers.length > 0 && (
                  <View style={styles.warningContainer}>
                    <Text style={[styles.warningText, { color: colors.error }]}>
                      Please select at least one member to invite
                    </Text>
                  </View>
                )}
                {selectedMemberIds.length === 0 && availableMembers.length === 0 && (
                  <View style={styles.warningContainer}>
                    <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                      No other members available. You can create a personal room.
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
                    onPress={() => {
                      setShowCreateModal(false);
                      setRoomName('');
                      setSelectedMemberIds([]);
                      setError('');
                      setCreatingRoom(false);
                    }}
                    disabled={creatingRoom}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.createRoomButton,
                      { backgroundColor: colors.primary },
                      (creatingRoom || (selectedMemberIds.length === 0 && availableMembers.length > 0)) && {
                        backgroundColor: colors.textSecondary,
                      },
                    ]}
                    onPress={() => {
                      console.log('[Chat] Create button pressed:', {
                        creatingRoom,
                        selectedMemberIds,
                        availableMembers: availableMembers.length,
                      });
                      handleCreateRoomSubmit();
                    }}
                    disabled={creatingRoom || (selectedMemberIds.length === 0 && availableMembers.length > 0)}
                  >
                    {creatingRoom ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>
                        {selectedMemberIds.length === 0 && availableMembers.length > 0
                          ? 'Select members first'
                          : selectedMemberIds.length > 0
                            ? `Create Room (${selectedMemberIds.length} selected)`
                            : 'Create Personal Room'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Room Details Modal */}
      <Modal
        visible={showRoomDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoomDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Room Details</Text>
              <TouchableOpacity
                onPress={() => setShowRoomDetailsModal(false)}
                style={styles.closeButton}
              >
                <FontAwesome name="times" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedRoomDetails && (
              <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 16 }}>
                {/* Room Name */}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Room Name</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {selectedRoomDetails.display_name || selectedRoomDetails.name || `Room ${selectedRoomDetails.id}`}
                  </Text>
                </View>

                {/* Created Date */}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Created</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(selectedRoomDetails.created_at).toLocaleString()}
                  </Text>
                </View>

                {/* Last Updated */}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Updated</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(selectedRoomDetails.updated_at).toLocaleString()}
                  </Text>
                </View>

                {/* Creator/Owner */}
                {selectedRoomDetails.created_by && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Created By</Text>
                    {loadingRoomDetails ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {(() => {
                          const creatorMember = roomDetailsMembers.find(m => m.id === selectedRoomDetails.created_by);
                          if (creatorMember) {
                            return creatorMember.user_display_name || creatorMember.user_email || 'Unknown';
                          }
                          return 'Loading...';
                        })()}
                      </Text>
                    )}
                  </View>
                )}

                {/* Members */}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                    Members ({selectedRoomDetails.member_count || roomDetailsMembers.length})
                  </Text>
                  {loadingRoomDetails ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
                  ) : (
                    <View style={styles.membersList}>
                      {roomDetailsMembers.map((member) => (
                        <View key={member.id} style={[styles.memberItem, { backgroundColor: colors.background }]}>
                          <View style={styles.memberInfo}>
                            <Text style={[styles.memberName, { color: colors.text }]}>
                              {member.user_display_name || member.user_email || 'Unknown'}
                            </Text>
                            <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>
                              {member.user_email}
                            </Text>
                            {member.role && (
                              <Text style={[styles.memberRole, { color: colors.primary }]}>
                                {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                              </Text>
                            )}
                          </View>
                          {member.id === selectedRoomDetails.created_by && (
                            <View style={[styles.ownerBadge, { backgroundColor: colors.primary }]}>
                              <Text style={styles.ownerBadgeText}>Owner</Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={showDeleteRoomModal}
        title="Delete Room"
        message={`Are you sure you want to delete "${roomToDelete?.display_name || roomToDelete?.name || `Room ${roomToDelete?.id}`}"? This action cannot be undone.`}
        onClose={cancelDeleteRoom}
        onConfirm={confirmDeleteRoom}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 56,
    ...Platform.select({
      web: {
        maxWidth: '100%',
        overflow: 'hidden',
      },
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 12,
    ...Platform.select({
      web: {
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    }),
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: {
        flexShrink: 0,
        minWidth: 40,
      },
    }),
  },
  errorContainer: {
    padding: 16,
  },
  errorText: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
  },
  familyGroup: {
    marginBottom: 24,
  },
  familyName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  roomItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  roomItem: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  roomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomContent: {
    flex: 1,
  },
  roomBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 32,
    marginBottom: 24,
  },
  floatingCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 12,
  },
  floatingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    flex: 1,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    marginTop: 4,
  },
  membersList: {
    marginTop: 8,
    gap: 12,
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 12,
    fontWeight: '500',
  },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  ownerBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  loadingMembers: {
    marginVertical: 16,
  },
  memberList: {
    marginTop: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  memberItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  memberEmail: {
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createRoomButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff3cd',
  },
  warningText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

