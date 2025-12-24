/**
 * WebSocket service for real-time chat messaging.
 */
import { Platform } from 'react-native';

export interface WebSocketMessage {
  type: string;
  id?: number;
  room?: number;
  ciphertext?: string;
  iv?: string;
  sender?: string;
  sender_username?: string;
  sender_photo_url?: string;
  created_at?: string;
  message?: string;
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type ErrorHandler = (error: Event | Error) => void;
export type ConnectionHandler = () => void;

class WebSocketService {
  private roomSocket: WebSocket | null = null;
  private notificationSocket: WebSocket | null = null;
  private roomMessageHandler: MessageHandler | null = null;
  private notificationHandler: MessageHandler | null = null;
  private notificationHandlers: Set<MessageHandler> = new Set(); // Support multiple handlers
  private errorHandler: ErrorHandler | null = null;
  private connectionHandler: ConnectionHandler | null = null;
  private disconnectHandler: ConnectionHandler | null = null;

  /**
   * Get WebSocket URL based on platform.
   */
  private getWebSocketUrl(path: string, token: string): string {
    // Use the same logic as API service to get base URL
    let baseUrl: string;

    if (process.env.EXPO_PUBLIC_API_URL) {
      baseUrl = process.env.EXPO_PUBLIC_API_URL.trim();
    } else if (Platform.OS === 'web') {
      // Check if we're accessing the app via ngrok
      if (typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
        const hostname = window.location.hostname;
        if (hostname.includes('kewlkidsorganizermobile-web')) {
          baseUrl = 'https://kewlkidsorganizermobile.ngrok.app/api';
        } else {
          baseUrl = `https://${hostname.replace('-web', '')}/api`;
        }
      } else {
        baseUrl = 'http://localhost:8900/api';
      }
    } else {
      baseUrl = 'http://10.0.0.25:8900/api';
    }

    // Remove /api suffix if present (WebSocket path doesn't need it)
    const apiBaseUrl = baseUrl.replace(/\/api$/, '');

    // Convert http/https to ws/wss
    const wsProtocol = apiBaseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsBaseUrl = apiBaseUrl.replace(/^https?:\/\//, '');

    // WebSocket path does NOT include /api prefix - Django Channels routes are at root level
    return `${wsProtocol}://${wsBaseUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Connect to a chat room WebSocket.
   */
  connectToRoom(roomId: number, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close existing connection if any
      if (this.roomSocket) {
        this.roomSocket.close();
      }

      const url = this.getWebSocketUrl(`/ws/chat/${roomId}/`, token);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        this.roomSocket = ws;
        if (this.connectionHandler) {
          this.connectionHandler();
        }
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          console.log('WebSocket message received:', { type: data.type, id: data.id, room: data.room });
          if (this.roomMessageHandler) {
            this.roomMessageHandler(data);
          } else {
            console.warn('No room message handler set');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          console.error('Raw message data:', event.data);
        }
      };

      ws.onerror = (error) => {
        // Extract more useful error information
        // In React Native, WebSocket errors are typically Error objects or plain objects
        const errorInfo = error instanceof Error
          ? { message: error.message, name: error.name }
          : error && typeof error === 'object' && 'type' in error
          ? { type: (error as any).type }
          : { error: String(error) };

        console.warn('[WebSocketService] Room WebSocket error:', errorInfo);
        // Don't reject immediately - let onclose handle cleanup
        if (this.errorHandler) {
          this.errorHandler(error);
        }
      };

      ws.onclose = (event) => {
        this.roomSocket = null;
        if (this.disconnectHandler) {
          this.disconnectHandler();
        }

        // Only reject if we haven't resolved yet (connection failed before opening)
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error(`WebSocket closed before opening (code: ${event.code})`));
        }
      };
    });
  }

  /**
   * Disconnect from room WebSocket.
   */
  disconnectFromRoom(): void {
    if (this.roomSocket) {
      this.roomSocket.close();
      this.roomSocket = null;
    }
  }

  /**
   * Send a message through the room WebSocket.
   */
  sendMessage(ciphertext: string, iv: string): void {
    if (!this.roomSocket || this.roomSocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.roomSocket.send(
      JSON.stringify({
        type: 'message',
        ciphertext,
        iv,
      })
    );
  }

  /**
   * Connect to user notification WebSocket.
   */
  connectToNotifications(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close existing connection if any
      if (this.notificationSocket) {
        this.notificationSocket.close();
      }

      const url = this.getWebSocketUrl('/ws/chat/notifications/', token);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[WebSocketService] Notification WebSocket connected');
        this.notificationSocket = ws;
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocketService] Notification message received:', data);

          // Call all registered handlers
          if (this.notificationHandlers.size > 0) {
            console.log(`[WebSocketService] Calling ${this.notificationHandlers.size} notification handler(s)`);
            this.notificationHandlers.forEach(handler => {
              try {
                handler(data);
              } catch (error) {
                console.error('[WebSocketService] Error in notification handler:', error);
              }
            });
          } else if (this.notificationHandler) {
            // Fallback to single handler for backwards compatibility
            console.log('[WebSocketService] Calling notification handler (single)');
            this.notificationHandler(data);
          } else {
            console.warn('[WebSocketService] No notification handler set');
          }
        } catch (error) {
          console.error('[WebSocketService] Error parsing notification message:', error);
        }
      };

      ws.onerror = (error) => {
        // Extract more useful error information
        // In React Native, WebSocket errors are typically Error objects or plain objects
        const errorInfo = error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : error && typeof error === 'object' && 'type' in error
          ? { type: (error as any).type, target: (error as any).target }
          : { error: String(error) };

        console.warn('[WebSocketService] Notification WebSocket error:', errorInfo);
        // Don't reject immediately - let onclose handle cleanup
        // This prevents unhandled promise rejections
        if (this.errorHandler) {
          this.errorHandler(error);
        }
      };

      ws.onclose = (event) => {
        const wasClean = event.wasClean;
        const code = event.code;
        const reason = event.reason;

        if (!wasClean && code !== 1000) {
          // Only log if it wasn't a clean close
          console.log(`[WebSocketService] Notification WebSocket closed (code: ${code}, reason: ${reason || 'none'})`);
        } else {
          console.log('[WebSocketService] Notification WebSocket closed');
        }

        this.notificationSocket = null;

        // Only reject if we haven't resolved yet (connection failed before opening)
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error(`WebSocket closed before opening (code: ${code})`));
        }
      };
    });
  }

  /**
   * Disconnect from notification WebSocket.
   */
  disconnectFromNotifications(): void {
    if (this.notificationSocket) {
      this.notificationSocket.close();
      this.notificationSocket = null;
    }
  }

  /**
   * Set message handler for room messages.
   */
  setRoomMessageHandler(handler: MessageHandler | null): void {
    this.roomMessageHandler = handler;
  }

  /**
   * Set message handler for notifications.
   * Supports multiple handlers - each handler will be called for every notification.
   */
  setNotificationHandler(handler: MessageHandler | null): void {
    this.notificationHandler = handler; // Keep for backwards compatibility

    if (handler) {
      this.notificationHandlers.add(handler);
    } else {
      // If null, don't clear all handlers - let individual screens remove their own
      // This allows multiple screens to have handlers
    }
  }

  /**
   * Remove a specific notification handler.
   */
  removeNotificationHandler(handler: MessageHandler): void {
    this.notificationHandlers.delete(handler);
    // Also clear single handler if it matches
    if (this.notificationHandler === handler) {
      this.notificationHandler = null;
    }
  }

  /**
   * Check if there are any notification handlers registered.
   */
  hasNotificationHandlers(): boolean {
    return this.notificationHandlers.size > 0 || this.notificationHandler !== null;
  }

  /**
   * Set error handler.
   */
  setErrorHandler(handler: ErrorHandler | null): void {
    this.errorHandler = handler;
  }

  /**
   * Set connection handler.
   */
  setConnectionHandler(handler: ConnectionHandler | null): void {
    this.connectionHandler = handler;
  }

  /**
   * Set disconnect handler.
   */
  setDisconnectHandler(handler: ConnectionHandler | null): void {
    this.disconnectHandler = handler;
  }

  /**
   * Check if room WebSocket is connected.
   */
  isRoomConnected(): boolean {
    return this.roomSocket !== null && this.roomSocket.readyState === WebSocket.OPEN;
  }

  /**
   * Check if notification WebSocket is connected.
   */
  isNotificationConnected(): boolean {
    return this.notificationSocket !== null && this.notificationSocket.readyState === WebSocket.OPEN;
  }
}

export default new WebSocketService();

