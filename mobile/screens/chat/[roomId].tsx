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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import chatService, { ChatRoom, Message } from '../../../services/chatService';
import websocketService from '../../../services/websocketService';
import { EncryptionManager } from '../../../utils/encryption';
import { tokenStorage } from '../../../utils/storage';
import { APIError } from '../../../services/api';
import { useFamily } from '../../../contexts/FamilyContext';

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

  const encryptionManager = useRef(new EncryptionManager()).current;
  const messagesEndRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!roomId) {
      router.back();
      return;
    }

    loadRoom();
    loadMessages();
    setupEncryption();
    connectWebSocket();

    return () => {
      websocketService.disconnectFromRoom();
    };
  }, [roomId]);

  const loadRoom = async () => {
    try {
      const roomData = await chatService.getChatRoom(roomId!);
      setRoom(roomData);
    } catch (err) {
      console.error('Error loading room:', err);
    }
  };

  const setupEncryption = async () => {
    try {
      if (!roomId || !selectedFamily) return;

      const familySecret = await encryptionManager.getOrCreateFamilySecret(selectedFamily.id);
      const key = await encryptionManager.deriveRoomKey(roomId, selectedFamily.id, familySecret);
      setEncryptionKey(key);
    } catch (err) {
      console.error('Error setting up encryption:', err);
      setError('Failed to set up encryption');
    }
  };

  const loadMessages = async () => {
    if (!roomId) return;

    try {
      setLoading(true);
      const msgs = await chatService.getMessages(roomId);

      // Decrypt messages
      if (encryptionKey) {
        const decryptedMsgs = await Promise.all(
          msgs.map(async (msg) => {
            try {
              const decrypted = await encryptionManager.decryptMessage(
                { ciphertext: msg.body_ciphertext, iv: msg.iv },
                encryptionKey
              );
              return { ...msg, decrypted };
            } catch (err) {
              console.error('Error decrypting message:', err);
              return { ...msg, decrypted: '[Encrypted message]' };
            }
          })
        );
        setMessages(decryptedMsgs);
      } else {
        setMessages(msgs);
      }
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
    if (message.type === 'message' && encryptionKey) {
      try {
        const decrypted = await encryptionManager.decryptMessage(
          { ciphertext: message.ciphertext, iv: message.iv },
          encryptionKey
        );

        const newMessage: DecryptedMessage = {
          id: message.id || Date.now(),
          room: message.room || roomId!,
          sender: 0, // Will be set from sender info
          sender_username: message.sender_username,
          sender_photo_url: message.sender_photo_url,
          body_ciphertext: message.ciphertext,
          iv: message.iv,
          created_at: message.created_at || new Date().toISOString(),
          decrypted,
        };

        setMessages((prev) => [...prev, newMessage]);
        scrollToBottom();
      } catch (err) {
        console.error('Error decrypting WebSocket message:', err);
      }
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !encryptionKey || !connected || sending) return;

    try {
      setSending(true);
      const encrypted = await encryptionManager.encryptMessage(inputMessage.trim(), encryptionKey);

      websocketService.sendMessage(encrypted.ciphertext, encrypted.iv);
      setInputMessage('');
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

  const renderMessage = ({ item }: { item: DecryptedMessage }) => {
    const isGif = item.decrypted?.match(/\.gif(\?|$)/i) || item.decrypted?.includes('giphy.com');

    return (
      <View style={styles.messageContainer}>
        {item.sender_photo_url && (
          <Image source={{ uri: item.sender_photo_url }} style={styles.avatar} />
        )}
        <View style={styles.messageContent}>
          <Text style={[styles.senderName, { color: colors.textSecondary }]}>
            {item.sender_username || 'User'}
          </Text>
          <View style={[styles.messageBubble, { backgroundColor: colors.card }]}>
            {isGif ? (
              <Image source={{ uri: item.decrypted }} style={styles.gifImage} />
            ) : (
              <Text style={[styles.messageText, { color: colors.text }]}>
                {item.decrypted || '[Encrypted message]'}
              </Text>
            )}
          </View>
          <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
            {new Date(item.created_at).toLocaleTimeString()}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {room?.name || `Room ${roomId}`}
        </Text>
        <View style={styles.statusIndicator}>
          {connected ? (
            <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: '#FF9800' }]} />
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
          editable={connected && !sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: connected && inputMessage.trim() ? colors.primary : colors.textSecondary },
          ]}
          onPress={sendMessage}
          disabled={!connected || !inputMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome name="send" size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
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
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  senderName: {
    fontSize: 12,
    marginBottom: 4,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 4,
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
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



