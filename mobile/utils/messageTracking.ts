/**
 * Message tracking utilities for unread message badges.
 * Tracks when users last viewed each room and calculates unread message counts.
 */
import { secureStorage } from './storage';
import { Message } from '../services/chatService';

const LAST_SEEN_KEY_PREFIX = 'room_last_seen_';

/**
 * Get the last seen timestamp for a room.
 * @param roomId - The chat room ID
 * @returns The last seen Date, or null if never viewed
 */
export async function getRoomLastSeen(roomId: number): Promise<Date | null> {
  try {
    const key = `${LAST_SEEN_KEY_PREFIX}${roomId}`;
    const timestampStr = await secureStorage.getItem(key);
    if (!timestampStr) {
      return null;
    }
    return new Date(timestampStr);
  } catch (error) {
    console.error(`[MessageTracking] Error getting last seen for room ${roomId}:`, error);
    return null;
  }
}

/**
 * Set the last seen timestamp for a room.
 * @param roomId - The chat room ID
 * @param timestamp - The timestamp to store (defaults to now)
 */
export async function setRoomLastSeen(roomId: number, timestamp: Date = new Date()): Promise<void> {
  try {
    const key = `${LAST_SEEN_KEY_PREFIX}${roomId}`;
    await secureStorage.setItem(key, timestamp.toISOString());
  } catch (error) {
    console.error(`[MessageTracking] Error setting last seen for room ${roomId}:`, error);
  }
}

/**
 * Calculate unread message count for a room.
 * Only counts messages from other users (not the current user's own messages).
 * @param roomId - The chat room ID
 * @param messages - Array of messages in the room
 * @param userMemberId - The current user's member ID for this room's family
 * @returns The number of unread messages
 */
export async function getUnreadCount(
  roomId: number,
  messages: Message[],
  userMemberId: number | null
): Promise<number> {
  if (!userMemberId || messages.length === 0) {
    return 0;
  }

  try {
    const lastSeen = await getRoomLastSeen(roomId);
    if (!lastSeen) {
      // If never viewed, count all messages from other users
      return messages.filter((msg) => msg.sender !== userMemberId).length;
    }

    // Count messages from other users that were created after last seen
    const unreadCount = messages.filter((msg) => {
      if (msg.sender === userMemberId) {
        return false; // Don't count user's own messages
      }
      const messageTime = new Date(msg.created_at);
      return messageTime > lastSeen;
    }).length;

    return unreadCount;
  } catch (error) {
    console.error(`[MessageTracking] Error calculating unread count for room ${roomId}:`, error);
    return 0;
  }
}

/**
 * Calculate unread count using just the last message timestamp (for performance).
 * Useful when you only have the last_message from the room list.
 * @param roomId - The chat room ID
 * @param lastMessageTime - ISO timestamp of the last message
 * @param lastMessageSenderId - The sender ID of the last message
 * @param userMemberId - The current user's member ID for this room's family
 * @returns 1 if unread, 0 if read or if it's the user's own message
 */
export async function getUnreadCountFromLastMessage(
  roomId: number,
  lastMessageTime: string | null | undefined,
  lastMessageSenderId: number | null | undefined,
  userMemberId: number | null
): Promise<number> {
  if (!lastMessageTime || !userMemberId) {
    return 0;
  }

  // Don't count user's own messages
  if (lastMessageSenderId === userMemberId) {
    return 0;
  }

  try {
    const lastSeen = await getRoomLastSeen(roomId);
    if (!lastSeen) {
      // If never viewed, the last message is unread (if it's not from the user)
      return 1;
    }

    const messageTime = new Date(lastMessageTime);
    return messageTime > lastSeen ? 1 : 0;
  } catch (error) {
    console.error(`[MessageTracking] Error calculating unread count from last message for room ${roomId}:`, error);
    return 0;
  }
}

/**
 * Calculate total unread count across all rooms.
 * @param rooms - Array of chat rooms
 * @param userMemberIds - Map of familyId to user's member ID for that family
 * @param processedMessageIds - Optional set of message IDs that have already been processed via notifications (to avoid double counting)
 * @returns Total number of unread messages across all rooms
 */
export async function getTotalUnreadCount(
  rooms: any[],
  userMemberIds: { [familyId: number]: number },
  processedMessageIds?: Set<number>
): Promise<number> {
  let total = 0;

  for (const room of rooms) {
    const userMemberId = userMemberIds[room.family] || null;
    if (!userMemberId) {
      continue;
    }

    // Use last_message if available for performance
    if (room.last_message) {
      // Skip if this message was already processed via notification (to avoid double counting)
      if (processedMessageIds && room.last_message.id && processedMessageIds.has(room.last_message.id)) {
        console.log(`[MessageTracking] Skipping already processed message ${room.last_message.id} in room ${room.id}`);
        continue;
      }

      const count = await getUnreadCountFromLastMessage(
        room.id,
        room.last_message.created_at,
        room.last_message.sender_id,
        userMemberId
      );
      total += count;
    } else {
      // Fallback: would need to fetch all messages (not ideal for performance)
      // For now, return 0 if no last_message
      total += 0;
    }
  }

  return total;
}

