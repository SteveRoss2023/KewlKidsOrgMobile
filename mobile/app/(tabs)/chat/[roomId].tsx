import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';

// Declare window for web
declare global {
  interface Window {
    confirm?: (message?: string) => boolean;
    alert?: (message?: string) => void;
  }
}
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import chatService, { ChatRoom, Message } from '../../../services/chatService';
import websocketService from '../../../services/websocketService';
import { EncryptionManager } from '../../../utils/encryption';
import { tokenStorage } from '../../../utils/storage';
import { APIError } from '../../../services/api';
import GlobalNavBar from '../../../components/GlobalNavBar';
import { useFamily } from '../../../contexts/FamilyContext';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import ProfileService from '../../../services/profileService';
import FamilyService from '../../../services/familyService';
import ConfirmModal from '../../../components/ConfirmModal';

interface DecryptedMessage extends Message {
  decrypted?: string;
}

export default function ConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId: string }>();
  const { colors } = useTheme();
  const { selectedFamily, families } = useFamily();
  const roomId = params.roomId ? parseInt(params.roomId) : null;

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string>('');
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userMemberId, setUserMemberId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<number | null>(null);

  const encryptionManager = useRef(new EncryptionManager()).current;
  const messagesEndRef = useRef<FlatList>(null);
  const encryptionKeyRef = useRef<CryptoKey | null>(null);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!roomId) {
      router.back();
      return;
    }

    // Clear messages when room changes to prevent cross-room contamination
    setMessages([]);
    setPendingMessages([]);
    setEncryptionKey(null);
    encryptionKeyRef.current = null;

    const initialize = async () => {
      try {
        await loadRoom();
      } catch (err) {
        console.error('Error initializing chat:', err);
        setError('Failed to initialize chat');
        setLoading(false);
      }
    };

    initialize();

    return () => {
      websocketService.disconnectFromRoom();
      setInitialized(false);
      // Clear messages when component unmounts or room changes
      setMessages([]);
      setPendingMessages([]);
    };
  }, [roomId]);

  // Set up encryption and WebSocket when room and selectedFamily are available
  useEffect(() => {
    if (roomId && room && selectedFamily && !encryptionKey) {
      const setup = async () => {
        try {
          await setupEncryption();
          await connectWebSocket();
          setInitialized(true);
        } catch (err) {
          console.error('Error setting up encryption/websocket:', err);
          setLoading(false);
        }
      };
      setup();
    }
  }, [roomId, room, selectedFamily, encryptionKey]);

  // Re-check delete permission when room data changes
  useEffect(() => {
    if (room) {
      checkDeletePermission(room);
    }
  }, [room?.id, room?.created_by, room?.family]);

  useEffect(() => {
    if (encryptionKey && roomId && messages.length === 0) {
      loadMessages();
    }

    // Process any pending messages now that encryption key is available
    if (encryptionKey && pendingMessages.length > 0) {
      console.log(`Processing ${pendingMessages.length} pending messages now that encryption key is available`);
      const messagesToProcess = [...pendingMessages];
      setPendingMessages([]);

      // Process each queued message
      messagesToProcess.forEach(async (message) => {
        await handleWebSocketMessage(message);
      });
    }
  }, [encryptionKey, roomId, pendingMessages.length]);

  const loadRoom = async () => {
    try {
      setLoading(true);
      console.log(`[Chat] Loading room ${roomId}...`);
      const startTime = Date.now();

      const roomData = await chatService.getChatRoom(roomId!);
      console.log(`[Chat] Room data loaded in ${Date.now() - startTime}ms`);

      setRoom(roomData);

      // Warn if room's family doesn't match selectedFamily
      if (selectedFamily && roomData.family !== selectedFamily.id) {
        console.warn(`[MOBILE] WARNING: Room ${roomId} belongs to family ${roomData.family}, but selectedFamily is ${selectedFamily.id}. Using room's family for encryption.`);
      }

      // Check if user can delete this room (non-blocking - don't await)
      checkDeletePermission(roomData).catch(err => {
        console.error('Error checking delete permission:', err);
      });

      // Don't set loading to false here - wait for encryption setup and messages to load
      // The loading will be set to false in loadMessages() finally block
    } catch (err) {
      console.error('Error loading room:', err);
      setError('Failed to load room');
      setLoading(false);
    }
  };

  const checkDeletePermission = async (roomData: ChatRoom) => {
    try {
      const profile = await ProfileService.getProfile();
      console.log('[Chat] Profile:', { id: profile.id, email: profile.email });

      // Store user's photo URL
      if (profile.photo_url) {
        // Construct full photo URL if it's a relative path
        let photoUrl = profile.photo_url;
        if (photoUrl && !photoUrl.startsWith('http://') && !photoUrl.startsWith('https://')) {
          // Get base URL - use the same logic as API service
          let apiBaseUrl: string;
          if (process.env.EXPO_PUBLIC_API_URL) {
            apiBaseUrl = process.env.EXPO_PUBLIC_API_URL.trim();
          } else if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
            const hostname = window.location.hostname;
            if (hostname.includes('kewlkidsorganizermobile-web')) {
              apiBaseUrl = 'https://kewlkidsorganizermobile.ngrok.app/api';
            } else {
              apiBaseUrl = `https://${hostname.replace('-web', '')}/api`;
            }
          } else if (Platform.OS === 'web') {
            apiBaseUrl = 'http://localhost:8900/api';
          } else {
            apiBaseUrl = 'http://10.0.0.25:8900/api';
          }

          // Remove /api suffix for photo URL (photos are served at /api/users/{id}/photo/)
          const baseUrl = apiBaseUrl.replace(/\/api$/, '');
          photoUrl = `${baseUrl}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
        }
        setUserPhotoUrl(photoUrl);
      } else {
        setUserPhotoUrl(null);
      }

      const members = await FamilyService.getFamilyMembers(roomData.family);
      console.log('[Chat] All members:', members.map(m => ({ id: m.id, userId: m.user, email: m.user_email, role: m.role })));

      // Find member by email (profile.id is profile ID, not user ID, so we use email instead)
      const userMember = members.find(m => m.user_email.toLowerCase() === profile.email.toLowerCase());
      console.log('[Chat] Found user member:', userMember ? { id: userMember.id, userId: userMember.user, role: userMember.role } : 'NOT FOUND');

      console.log('[Chat] Checking delete permission:', {
        roomId: roomData.id,
        roomCreatedBy: roomData.created_by,
        userProfileId: profile.id,
        userEmail: profile.email,
        userMember: userMember ? { id: userMember.id, userId: userMember.user, role: userMember.role } : null,
      });

      if (userMember) {
        setUserMemberId(userMember.id);
        setUserRole(userMember.role);

        // Check if user is creator by member ID
        const isCreatorByMemberId = roomData.created_by && userMember.id === roomData.created_by;

        // Also check if the creator member belongs to the same user (in case of multiple member records)
        let isCreatorByUserId = false;
        if (roomData.created_by) {
          const creatorMember = members.find(m => m.id === roomData.created_by);
          if (creatorMember && creatorMember.user === profile.id) {
            isCreatorByUserId = true;
            console.log('[Chat] User is creator by user ID match:', {
              creatorMemberId: creatorMember.id,
              creatorUserId: creatorMember.user,
              currentUserId: profile.id,
            });
          }
        }

        const isCreator = isCreatorByMemberId || isCreatorByUserId;
        const isAdminOrOwner = userMember.role === 'admin' || userMember.role === 'owner';
        const canDeleteValue = isCreator || isAdminOrOwner;
        console.log('[Chat] Delete permission result:', {
          userMemberId: userMember.id,
          userMemberUserId: userMember.user,
          roomCreatedBy: roomData.created_by,
          isCreatorByMemberId,
          isCreatorByUserId,
          isCreator,
          userRole: userMember.role,
          isAdminOrOwner,
          canDelete: canDeleteValue,
          profileId: profile.id,
          profileEmail: profile.email,
        });
        setCanDelete(canDeleteValue);
      } else {
        console.log('[Chat] User member not found, cannot delete');
        console.log('[Chat] Member lookup details:', {
          profileId: profile.id,
          profileEmail: profile.email,
          allMemberUserIds: members.map(m => ({ id: m.id, userId: m.user, email: m.user_email })),
        });
        setCanDelete(false);
      }
    } catch (err) {
      console.error('Error checking delete permission:', err);
      setCanDelete(false);
    }
  };

  const handleDeleteRoom = () => {
    if (!room) return;

    Alert.alert(
      'Delete Room',
      `Are you sure you want to delete "${room.display_name || room.name || `Room ${roomId}`}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDeleteRoom,
        },
      ]
    );
  };

  const confirmDeleteRoom = async () => {
    if (!roomId) return;

    try {
      setDeleting(true);
      await chatService.deleteChatRoom(roomId);
      // Navigate back to chat list
      router.back();
    } catch (err) {
      const apiError = err as APIError;
      Alert.alert('Error', apiError.message || 'Failed to delete room');
    } finally {
      setDeleting(false);
    }
  };

  const setupEncryption = async (forceRegenerateSecret: boolean = false) => {
    try {
      if (!roomId || !selectedFamily) {
        console.log('setupEncryption: Missing roomId or selectedFamily');
        return;
      }

      // Use room's family ID if available, otherwise use selectedFamily
      const familyIdToUse = room?.family || selectedFamily.id;

      if (room?.family && room.family !== selectedFamily.id) {
        console.warn(`[MOBILE] Room ${roomId} belongs to family ${room.family}, but selectedFamily is ${selectedFamily.id}. Using room's family ${room.family} for encryption.`);
      }

      console.log(`[MOBILE] Setting up encryption for room ${roomId}, family ${familyIdToUse}${forceRegenerateSecret ? ' (forcing secret regeneration)' : ''}`);
      const encryptionStartTime = Date.now();
      const familySecret = await encryptionManager.getOrCreateFamilySecret(familyIdToUse, forceRegenerateSecret);
      console.log(`[MOBILE] Got family secret (length: ${familySecret.length}) in ${Date.now() - encryptionStartTime}ms, preview: ${familySecret.substring(0, 20)}...`);
      const keyStartTime = Date.now();
      const key = await encryptionManager.deriveRoomKey(roomId, familyIdToUse, familySecret);
      console.log(`[MOBILE] Derived encryption key successfully in ${Date.now() - keyStartTime}ms`);

      // Debug: Log key info to compare with web
      if (__DEV__) {
        try {
          const cryptoAPI = global.crypto || (global as any).window?.crypto;
          if (cryptoAPI && cryptoAPI.subtle) {
            const exported = await cryptoAPI.subtle.exportKey('raw', key);
            const keyBytes = new Uint8Array(exported);
            const keyPreview = Array.from(keyBytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
            const platform = Platform.OS === 'web' ? 'WEB' : 'MOBILE';
            console.log(`[${platform}] Room ${roomId}, Family ${familyIdToUse}, FamilySecret length: ${familySecret.length}, Key: ${keyPreview}...`);
          }
        } catch (e) {
          // Ignore
        }
      }

      setEncryptionKey(key);
      encryptionKeyRef.current = key; // Also store in ref for immediate access
    } catch (err) {
      console.error('Error setting up encryption:', err);
      setError('Failed to set up encryption');
      setLoading(false); // Stop loading spinner if encryption fails
    }
  };

  const loadMessages = async (retryAfterRegenerate: boolean = false) => {
    if (!roomId || !encryptionKey) return;

    try {
      // Only set loading if it's not already set (to avoid flickering)
      if (!loading) {
        setLoading(true);
      }
      console.log(`[Chat] Loading messages for room ${roomId}...`);
      const messagesStartTime = Date.now();
      const msgs = await chatService.getMessages(roomId);
      console.log(`[Chat] Fetched ${msgs.length} messages in ${Date.now() - messagesStartTime}ms`);

      // Decrypt messages
      console.log(`[Chat] Decrypting ${msgs.length} messages...`);
      const decryptStartTime = Date.now();
      const decryptedMsgs = await Promise.all(
        msgs.map(async (msg) => {
          try {
            const decrypted = await encryptionManager.decryptMessage(
              { ciphertext: msg.body_ciphertext, iv: msg.iv },
              encryptionKey
            );
            return { ...msg, decrypted };
          } catch (err: any) {
            const platform = Platform.OS === 'web' ? 'WEB' : 'MOBILE';
            console.error(`[${platform}] Error decrypting message ID ${msg.id} from sender ${msg.sender_username || msg.sender}:`, err);
            console.error(`[${platform}] Error details:`, {
              name: err?.name,
              message: err?.message,
              ciphertextLength: msg.body_ciphertext?.length,
              ivLength: msg.iv?.length,
              messageCreatedAt: msg.created_at,
            });

            // Show a more helpful message indicating which sender's message failed
            const senderInfo = msg.sender_username || `User ${msg.sender}`;
            // Check if this might be due to family secret mismatch
            const isOldMessage = new Date(msg.created_at) < new Date(Date.now() - 5 * 60 * 1000); // Older than 5 minutes
            const errorMsg = isOldMessage
              ? `[Unable to decrypt old message from ${senderInfo} - may need to refresh web app]`
              : `[Unable to decrypt message from ${senderInfo}]`;
            return { ...msg, decrypted: errorMsg };
          }
        })
      );
      console.log(`[Chat] Decrypted ${decryptedMsgs.length} messages in ${Date.now() - decryptStartTime}ms`);

      // On mobile, if ALL messages failed to decrypt, regenerate secret and retry once
      if (Platform.OS !== 'web' && !retryAfterRegenerate && msgs.length > 0) {
        const allFailed = decryptedMsgs.every(msg =>
          msg.decrypted?.includes('Unable to decrypt')
        );

        if (allFailed) {
          console.warn('[MOBILE] All messages failed to decrypt, attempting to regenerate family secret and retry...');
          const familyIdToUse = room?.family || selectedFamily?.id;
          if (familyIdToUse) {
            try {
              // Force regenerate the family secret
              await setupEncryption(true);
              // Wait a moment for the key to be set
              await new Promise(resolve => setTimeout(resolve, 200));
              // Retry loading messages with the new key
              if (encryptionKeyRef.current) {
                console.log('[MOBILE] Retrying message decryption with regenerated secret...');
                // Use the new key from the ref
                const newKey = encryptionKeyRef.current;
                const retryDecryptedMsgs = await Promise.all(
                  msgs.map(async (msg) => {
                    try {
                      const decrypted = await encryptionManager.decryptMessage(
                        { ciphertext: msg.body_ciphertext, iv: msg.iv },
                        newKey
                      );
                      return { ...msg, decrypted };
                    } catch (err: any) {
                      const senderInfo = msg.sender_username || `User ${msg.sender}`;
                      const errorMsg = `[Unable to decrypt message from ${senderInfo}]`;
                      return { ...msg, decrypted: errorMsg };
                    }
                  })
                );
                // Replace decryptedMsgs with retry results
                decryptedMsgs.splice(0, decryptedMsgs.length, ...retryDecryptedMsgs);
              }
            } catch (regenerateErr) {
              console.error('[MOBILE] Failed to regenerate family secret:', regenerateErr);
            }
          }
        }
      }

      // Merge with existing messages, preserving successfully decrypted WebSocket messages
      setMessages((prevMessages) => {
        const messageMap = new Map<number, DecryptedMessage>();

        // First, add all API-loaded messages (filter by room to prevent cross-room contamination)
        decryptedMsgs.forEach((msg) => {
          if (msg.room !== roomId) {
            console.warn(`[Chat] Filtering out message ${msg.id} - wrong room: ${msg.room} (current: ${roomId})`);
            return;
          }
          messageMap.set(msg.id, msg);
        });

        // Then, preserve any existing messages that were successfully decrypted via WebSocket
        // BUT only if they're for the current room
        prevMessages.forEach((msg) => {
          if (msg.room !== roomId) {
            // Skip messages from other rooms
            return;
          }
          if (msg.decrypted && !msg.decrypted.startsWith('[Unable to decrypt')) {
            // Only preserve if it's not already in the map, or if the existing one failed to decrypt
            const existing = messageMap.get(msg.id);
            if (!existing || existing.decrypted?.startsWith('[Unable to decrypt')) {
              messageMap.set(msg.id, msg);
              console.log(`Preserving successfully decrypted WebSocket message ID ${msg.id}`);
            }
          }
        });

        // Convert map back to array and sort by created_at
        const merged = Array.from(messageMap.values()).sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeA - timeB;
        });

        return merged;
      });
    } catch (err) {
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to load messages');
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = async () => {
    if (!roomId) return;

    try {
      const token = await tokenStorage.getAccessToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }

      websocketService.setRoomMessageHandler((message) => {
        handleWebSocketMessage(message);
      });

      websocketService.setConnectionHandler(() => {
        setConnected(true);
      });

      websocketService.setDisconnectHandler(() => {
        setConnected(false);
      });

      websocketService.setErrorHandler((error) => {
        console.error('WebSocket error:', error);
        setError('Connection error');
      });

      await websocketService.connectToRoom(roomId, token);
    } catch (err) {
      console.error('Error connecting WebSocket:', err);
      setError('Failed to connect');
    }
  };

  const handleWebSocketMessage = async (message: any) => {
    // Filter messages by room ID - only process messages for the current room
    // Also check if message.room is missing or 0, which would be invalid
    const messageRoomId = message.room ? parseInt(String(message.room)) : null;
    const currentRoomId = roomId ? parseInt(String(roomId)) : null;

    if (messageRoomId && messageRoomId !== currentRoomId) {
      console.log(`[Chat] Ignoring WebSocket message for different room: ${messageRoomId} (current: ${currentRoomId})`);
      return;
    }

    // If message.room is missing, don't process it (shouldn't happen, but safety check)
    if (!messageRoomId && currentRoomId) {
      console.warn(`[Chat] WebSocket message missing room ID, ignoring. Current room: ${currentRoomId}`);
      return;
    }

    // Use ref for immediate access to encryption key (avoids stale closure)
    const currentKey = encryptionKeyRef.current || encryptionKey;

    if (message.type === 'message') {
      if (!currentKey) {
        setPendingMessages((prev) => [...prev, message]);
        return;
      }

      try {
        const decrypted = await encryptionManager.decryptMessage(
          { ciphertext: message.ciphertext, iv: message.iv },
          currentKey
        );

        // Construct full photo URL if it's a relative path
        let photoUrl = message.sender_photo_url;
        if (photoUrl && !photoUrl.startsWith('http://') && !photoUrl.startsWith('https://')) {
          // Get base URL - use the same logic as API service
          let apiBaseUrl: string;
          if (process.env.EXPO_PUBLIC_API_URL) {
            apiBaseUrl = process.env.EXPO_PUBLIC_API_URL.trim();
          } else if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
            const hostname = window.location.hostname;
            if (hostname.includes('kewlkidsorganizermobile-web')) {
              apiBaseUrl = 'https://kewlkidsorganizermobile.ngrok.app/api';
            } else {
              apiBaseUrl = `https://${hostname.replace('-web', '')}/api`;
            }
          } else if (Platform.OS === 'web') {
            apiBaseUrl = 'http://localhost:8900/api';
          } else {
            apiBaseUrl = 'http://10.0.0.25:8900/api';
          }

          // Remove /api suffix for photo URL (photos are served at /api/users/{id}/photo/)
          const baseUrl = apiBaseUrl.replace(/\/api$/, '');

          photoUrl = `${baseUrl}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
        }

        // For WebSocket messages, sender might not be provided
        // Try to find sender member ID from the room's members by matching username/email
        let senderMemberId = message.sender || 0;
        if (!senderMemberId && message.sender_username && room) {
          // Try to find member by matching username with member emails
          // This is a fallback - ideally WebSocket should include sender member ID
          const members = await FamilyService.getFamilyMembers(room.family);
          const usernameLower = message.sender_username.toLowerCase();

          const senderMember = members.find(m => {
            const memberEmail = m.user_email.toLowerCase();
            const memberDisplayName = (m.user_display_name || '').toLowerCase();

            // Try multiple matching strategies:
            // 1. Exact email match
            if (memberEmail === usernameLower) return true;

            // 2. Display name match (e.g., "Steven (2023)" matches "steven (2023)")
            if (memberDisplayName === usernameLower) return true;

            // 3. Display name contains username or vice versa
            if (memberDisplayName && (memberDisplayName.includes(usernameLower) || usernameLower.includes(memberDisplayName))) return true;

            // 4. Email username part matches (e.g., "steven" from "steven@...")
            const emailUsername = memberEmail.split('@')[0];
            if (usernameLower.includes(emailUsername) || emailUsername.includes(usernameLower.replace(/[^a-z0-9]/g, ''))) return true;

            return false;
          });

          if (senderMember) {
            senderMemberId = senderMember.id;
            console.log(`[WebSocket] Found sender member ID ${senderMemberId} for username "${message.sender_username}" (matched with ${senderMember.user_email})`);
          } else {
            console.warn(`[WebSocket] Could not find sender member for username "${message.sender_username}". Available members:`,
              members.map(m => ({ email: m.user_email, displayName: m.user_display_name })));
          }
        }

        const newMessage: DecryptedMessage = {
          id: message.id || Date.now(),
          room: messageRoomId || currentRoomId || roomId!,
          sender: senderMemberId,
          sender_username: message.sender_username,
          sender_photo_url: photoUrl,
          body_ciphertext: message.ciphertext,
          iv: message.iv,
          created_at: message.created_at || new Date().toISOString(),
          decrypted,
        };

        setMessages((prev) => {
          // Check if message already exists
          const existingIndex = prev.findIndex((msg) => msg.id === newMessage.id);

          if (existingIndex >= 0) {
            // Message exists - update it if the existing one failed to decrypt or if this one is successfully decrypted
            const existing = prev[existingIndex];
            if (existing.decrypted?.startsWith('[Unable to decrypt') ||
                (newMessage.decrypted && !newMessage.decrypted.startsWith('[Unable to decrypt'))) {
              const updated = [...prev];
              updated[existingIndex] = newMessage;
              return updated;
            } else {
              return prev;
            }
          } else {
            // New message - add it
            return [...prev, newMessage];
          }
        });
        scrollToBottom();
      } catch (err: any) {
        console.error('Error decrypting WebSocket message:', err);
        console.error('Error name:', err?.name);
        console.error('Error message:', err?.message);
        console.error('Error stack:', err?.stack);
        console.error('Message data:', {
          messageId: message.id,
          ciphertextLength: message.ciphertext?.length,
          ivLength: message.iv?.length,
          ciphertext: message.ciphertext?.substring(0, 100),
          iv: message.iv?.substring(0, 30),
          sender: message.sender_username || message.sender
        });


        // Still add the message to state with an error indicator, so user knows a message was received
        const senderInfo = message.sender_username || `User ${message.sender || 'Unknown'}`;
        const errorMessage: DecryptedMessage = {
          id: message.id || Date.now(),
          room: messageRoomId || currentRoomId || roomId!,
          sender: 0,
          sender_username: message.sender_username,
          sender_photo_url: message.sender_photo_url,
          body_ciphertext: message.ciphertext,
          iv: message.iv,
          created_at: message.created_at || new Date().toISOString(),
          decrypted: `[Unable to decrypt message from ${senderInfo}]`,
        };

        setMessages((prev) => {
          const existingIndex = prev.findIndex((msg) => msg.id === errorMessage.id);
          if (existingIndex >= 0) {
            // Update existing message
            const updated = [...prev];
            updated[existingIndex] = errorMessage;
            return updated;
          } else {
            // Add new message
            return [...prev, errorMessage];
          }
        });

        // Try to show a user-friendly error
        if (err?.name === 'OperationError' || err?.message?.includes('decrypt') || err?.message?.includes('ghash')) {
          console.warn('Decryption failed - this may be due to encryption key mismatch. Ensure both web and mobile are using the latest code.');
        }
      }
    } else if (message.type === 'error') {
      console.error('WebSocket error message:', message.message);
      setError(message.message || 'WebSocket error');
    }
  };

  const sendMessage = async () => {
    console.log('[Send] sendMessage called:', {
      hasInput: !!inputMessage.trim(),
      inputText: inputMessage.substring(0, 20),
      hasEncryptionKey: !!encryptionKey,
      connected,
      sending,
    });

    if (!inputMessage.trim() || !encryptionKey || !connected || sending) {
      console.log('[Send] Cannot send message - validation failed:', {
        hasInput: !!inputMessage.trim(),
        hasEncryptionKey: !!encryptionKey,
        connected,
        sending
      });
      return;
    }

    try {
      setSending(true);
      const messageText = inputMessage.trim();
      console.log('Encrypting message:', messageText.substring(0, 50));

      const encrypted = await encryptionManager.encryptMessage(messageText, encryptionKey);
      console.log('Message encrypted, sending via WebSocket');

      websocketService.sendMessage(encrypted.ciphertext, encrypted.iv);
      setInputMessage('');
      console.log('Message sent via WebSocket, waiting for response...');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleDeleteMessage = (messageId: number) => {
    console.log('[Message] Delete button pressed for message:', messageId);
    setMessageToDelete(messageId);
    setShowDeleteMessageModal(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;

    setShowDeleteMessageModal(false);
    await performDelete(messageToDelete);
    setMessageToDelete(null);
  };

  const cancelDeleteMessage = () => {
    setShowDeleteMessageModal(false);
    setMessageToDelete(null);
  };

  const performDelete = async (messageId: number) => {
    console.log('[Message] Confirmed delete for message:', messageId);
    setDeletingMessageId(messageId);
    try {
      await chatService.deleteMessage(messageId);
      console.log('[Message] Message deleted successfully:', messageId);
      // Remove message from state
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    } catch (err) {
      console.error('[Message] Error deleting message:', err);
      const apiError = err as APIError;
      if (Platform.OS === 'web') {
        window.alert(apiError.message || 'Failed to delete message');
      } else {
        Alert.alert('Error', apiError.message || 'Failed to delete message');
      }
    } finally {
      setDeletingMessageId(null);
    }
  };

  const renderMessage = ({ item }: { item: DecryptedMessage }) => {
    const isGif = item.decrypted?.match(/\.gif(\?|$)/i) || item.decrypted?.includes('giphy.com');
    const isMyMessage = userMemberId && item.sender === userMemberId;
    const isDeleting = deletingMessageId === item.id;

    // Debug logging for delete button visibility
    if (__DEV__) {
      console.log(`[Message Delete Check] Message ${item.id}: sender=${item.sender}, userMemberId=${userMemberId}, isMyMessage=${isMyMessage}, senderUsername=${item.sender_username}`);
    }

    // Debug logging
    if (__DEV__ && item.sender) {
      console.log(`[Message] Message ${item.id}: sender=${item.sender}, userMemberId=${userMemberId}, isMyMessage=${isMyMessage}`);
    }

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer
      ]}>
        {!isMyMessage && (
          <>
            {item.sender_photo_url ? (
              <AuthenticatedImage
                source={{ uri: item.sender_photo_url }}
                style={styles.avatar}
                placeholder={
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                    <FontAwesome name="user" size={16} color={colors.textSecondary} />
                  </View>
                }
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                <FontAwesome name="user" size={16} color={colors.textSecondary} />
              </View>
            )}
          </>
        )}
        <View style={[
          styles.messageContent,
          isMyMessage ? styles.myMessageContent : styles.otherMessageContent
        ]}>
          {!isMyMessage && (
            <View style={styles.messageHeader}>
              <Text style={[styles.senderName, { color: colors.textSecondary }]}>
                {item.sender_username || 'User'}
              </Text>
            </View>
          )}
          <View style={[
            styles.messageBubbleContainer,
            isMyMessage ? styles.myMessageBubbleContainer : styles.otherMessageBubbleContainer
          ]}>
            {isMyMessage && (
              <TouchableOpacity
                onPress={() => {
                  console.log('[Message] Delete button clicked for message:', item.id);
                  handleDeleteMessage(item.id);
                }}
                disabled={isDeleting}
                style={styles.messageDeleteButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <FontAwesome name="trash" size={14} color={colors.error} />
                )}
              </TouchableOpacity>
            )}
            <View style={[
              styles.messageBubble,
              isMyMessage
                ? { backgroundColor: '#007AFF' }
                : { backgroundColor: colors.card }
            ]}>
              {isGif ? (
                <Image source={{ uri: item.decrypted }} style={styles.gifImage} />
              ) : (
                <Text style={[
                  styles.messageText,
                  isMyMessage ? { color: '#FFFFFF' } : { color: colors.text }
                ]}>
                  {item.decrypted || '[Encrypted message]'}
                </Text>
              )}
            </View>
            {!isMyMessage && (
              <View style={styles.avatarSpacer} />
            )}
          </View>
          <Text style={[
            styles.timestamp,
            { color: colors.textSecondary },
            isMyMessage ? styles.myTimestamp : styles.otherTimestamp
          ]}>
            {new Date(item.created_at).toLocaleTimeString()}
          </Text>
        </View>
        {isMyMessage && (
          <>
            {userPhotoUrl ? (
              <AuthenticatedImage
                source={{ uri: userPhotoUrl }}
                style={styles.avatar}
                placeholder={
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                    <FontAwesome name="user" size={16} color={colors.textSecondary} />
                  </View>
                }
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                <FontAwesome name="user" size={16} color={colors.textSecondary} />
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary, marginTop: 16 }]}>
          Loading room...
        </Text>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Room not found
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {room?.display_name || room?.name || `Room ${roomId}`}
        </Text>
        <View style={styles.headerRight}>
          <View style={styles.statusIndicator}>
            {connected ? (
              <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
            ) : (
              <View style={[styles.statusDot, { backgroundColor: '#FF9800' }]} />
            )}
          </View>
          {canDelete ? (
            <TouchableOpacity
              onPress={handleDeleteRoom}
              disabled={deleting}
              style={styles.deleteButton}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <FontAwesome name="trash" size={18} color={colors.error} />
              )}
            </TouchableOpacity>
          ) : (
            // Debug: Show why delete button is not visible
            __DEV__ && (
              <View style={styles.debugContainer}>
                <Text style={[styles.debugText, { color: colors.textSecondary }]}>
                  {!room ? 'No room' : !userMemberId ? `No member (role: ${userRole || 'none'})` : userRole === 'member' && room?.created_by !== userMemberId ? `Member (not creator)` : `Can't delete`}
                </Text>
              </View>
            )
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        ref={messagesEndRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => `msg-${item.id || index}`}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={scrollToBottom}
      />

      <View style={[styles.inputContainer, { backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
          value={inputMessage}
          onChangeText={setInputMessage}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          multiline
          editable={!sending}
          autoFocus={false}
          onSubmitEditing={() => {
            if (connected && inputMessage.trim() && !sending) {
              sendMessage();
            }
          }}
          blurOnSubmit={false}
          returnKeyType="send"
          onKeyPress={(e) => {
            // On web, handle Enter key to send (Shift+Enter for new line)
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
              e.preventDefault();
              if (connected && inputMessage.trim() && !sending) {
                sendMessage();
              }
            }
          }}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: connected && inputMessage.trim() ? colors.primary : colors.textSecondary },
          ]}
          onPress={() => {
            console.log('[Send] Button pressed:', {
              hasInput: !!inputMessage.trim(),
              inputLength: inputMessage.length,
              connected,
              hasEncryptionKey: !!encryptionKey,
              sending,
              disabled: !connected || !inputMessage.trim() || sending,
            });
            sendMessage();
          }}
          disabled={!connected || !inputMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome name="send" size={16} color="#fff" />
          )}
        </TouchableOpacity>
        </View>

        <ConfirmModal
          visible={showDeleteMessageModal}
          title="Delete Message"
          message="Are you sure you want to delete this message? This action cannot be undone."
          onClose={cancelDeleteMessage}
          onConfirm={confirmDeleteMessage}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
        />
      </KeyboardAvoidingView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugContainer: {
    padding: 4,
    marginLeft: 8,
  },
  debugText: {
    fontSize: 10,
  },
  statusIndicator: {
    marginLeft: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  errorContainer: {
    padding: 16,
  },
  errorText: {
    fontSize: 14,
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingHorizontal: 8,
    width: '100%',
  },
  myMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    marginLeft: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSpacer: {
    width: 52, // avatar width (40) + margin (12)
  },
  messageContent: {
    maxWidth: '75%',
    flex: 1,
  },
  myMessageContent: {
    alignItems: 'flex-end',
  },
  otherMessageContent: {
    alignItems: 'flex-start',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 12,
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  myMessageBubbleContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageBubbleContainer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '100%',
  },
  messageDeleteButton: {
    padding: 6,
    marginRight: 6,
    minWidth: 24,
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  messageText: {
    fontSize: 16,
  },
  gifImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  timestamp: {
    fontSize: 10,
  },
  myTimestamp: {
    textAlign: 'right',
  },
  otherTimestamp: {
    textAlign: 'left',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    zIndex: 1,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    padding: 12,
    borderRadius: 20,
    marginRight: 8,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

