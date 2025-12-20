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
        if (this.errorHandler) {
          this.errorHandler(error);
        }
        reject(error);
      };

      ws.onclose = () => {
        this.roomSocket = null;
        if (this.disconnectHandler) {
          this.disconnectHandler();
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
        this.notificationSocket = ws;
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          if (this.notificationHandler) {
            this.notificationHandler(data);
          }
        } catch (error) {
          console.error('Error parsing notification message:', error);
        }
      };

      ws.onerror = (error) => {
        if (this.errorHandler) {
          this.errorHandler(error);
        }
        reject(error);
      };

      ws.onclose = () => {
        this.notificationSocket = null;
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
   */
  setNotificationHandler(handler: MessageHandler | null): void {
    this.notificationHandler = handler;
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

