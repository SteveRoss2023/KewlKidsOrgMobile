import api from './api';

export interface ChatRoom {
  id: number;
  family: number;
  family_name?: string;
  name?: string;
  display_name?: string;  // Name showing other members, excluding current user
  members: number[];
  created_by?: number;
  created_at: string;
  updated_at: string;
  member_count?: number;
  last_message?: {
    id: number;
    sender_id: number;
    sender_email?: string;
    created_at: string;
  };
  member_ids_list?: number[];
}

export interface Message {
  id: number;
  room: number;
  sender: number;
  sender_username?: string;
  sender_photo_url?: string;
  body_ciphertext: string;
  iv: string;
  created_at: string;
  edited_at?: string;
  is_edited?: boolean;
}

/**
 * Chat service for managing chat rooms and messages.
 */
class ChatService {
  /**
   * Get all chat rooms the user is a member of.
   */
  async getChatRooms(): Promise<ChatRoom[]> {
    const response = await api.get('/chat-rooms/');
    return response.data.results || response.data;
  }

  /**
   * Get a specific chat room by ID.
   */
  async getChatRoom(roomId: number): Promise<ChatRoom> {
    const response = await api.get(`/chat-rooms/${roomId}/`);
    return response.data;
  }

  /**
   * Create a new chat room.
   */
  async createChatRoom(familyId: number, name: string | null, memberIds: number[]): Promise<ChatRoom> {
    try {
      console.log('ChatService: Creating room with data:', {
        family: familyId,
        name: name || null,
        member_ids: memberIds,
      });

      const response = await api.post('/chat-rooms/', {
        family: familyId,
        name: name || null,
        member_ids: memberIds,
      });

      console.log('ChatService: Room created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('ChatService: Error creating room:', error);
      console.error('ChatService: Error response:', error?.response?.data);
      console.error('ChatService: Error status:', error?.response?.status);
      throw error;
    }
  }

  /**
   * Delete a chat room.
   */
  async deleteChatRoom(roomId: number): Promise<void> {
    await api.delete(`/chat-rooms/${roomId}/`);
  }

  /**
   * Get messages for a specific room.
   */
  async getMessages(roomId: number): Promise<Message[]> {
    const response = await api.get(`/messages/?room=${roomId}`);
    return response.data.results || response.data;
  }

  /**
   * Delete a message.
   */
  async deleteMessage(messageId: number): Promise<void> {
    await api.delete(`/messages/${messageId}/`);
  }

  /**
   * Get room members (via family members endpoint).
   */
  async getRoomMembers(roomId: number): Promise<any[]> {
    const room = await this.getChatRoom(roomId);
    // Get family members using the correct endpoint
    const response = await api.get(`/families/${room.family}/members/`);
    const allMembers = response.data.results || response.data || [];
    // Filter to only room members
    const roomMemberIds = room.member_ids_list || [];
    return allMembers.filter((member: any) => roomMemberIds.includes(member.id));
  }
}

export default new ChatService();

