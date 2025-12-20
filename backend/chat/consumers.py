"""
WebSocket consumer for real-time chat messaging.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from chat.models import ChatRoom, Message, Member


class ChatConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for chat room messaging."""

    async def connect(self):
        """Handle WebSocket connection."""
        try:
            # Check authentication
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                print("WebSocket connection rejected: User not authenticated")
                await self.close(code=4001)  # Unauthorized
                return

            self.room_id = self.scope['url_route']['kwargs']['room_id']
            self.room_group_name = f'chat_{self.room_id}'

            # Verify user has access to this room
            has_access = await self.check_room_access(user, self.room_id)
            if not has_access:
                display_name = await self.get_user_display_name(user)
                print(f"WebSocket connection rejected: User {display_name} does not have access to room {self.room_id}")
                await self.close(code=4003)  # Forbidden
                return

            # Join room group
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            await self.accept()
        except Exception as e:
            print(f"Error in WebSocket connect: {e}")
            await self.close(code=4000)  # Internal error (valid code in range 3000-4999)

    @database_sync_to_async
    def get_user_display_name(self, user):
        """Get user's display name safely in async context."""
        try:
            if hasattr(user, 'profile') and user.profile and user.profile.display_name:
                return user.profile.display_name
            return user.email
        except Exception:
            return user.email

    @database_sync_to_async
    def get_user_photo_url(self, user):
        """Get user's photo URL safely in async context."""
        try:
            if hasattr(user, 'profile') and user.profile and user.profile.photo:
                # Return relative URL - frontend will construct full URL
                return f'/api/users/{user.id}/photo/'
            return None
        except Exception:
            return None

    @database_sync_to_async
    def check_room_access(self, user, room_id):
        """Check if user has access to this chat room."""
        try:
            from chat.models import ChatRoom
            room = ChatRoom.objects.get(id=room_id)
            # Check if user is a member of the room's family
            has_access = room.family.members.filter(user=user).exists()
            return has_access
        except ChatRoom.DoesNotExist:
            print(f"Chat room {room_id} does not exist")
            return False
        except Exception as e:
            print(f"Error checking room access: {e}")
            return False

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        """Receive message from WebSocket."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type', 'message')

            if message_type == 'message':
                # Get user from scope (set by AuthMiddlewareStack)
                user = self.scope.get('user')

                if not user or not user.is_authenticated:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Authentication required'
                    }))
                    return

                # Validate required fields
                ciphertext = data.get('ciphertext')
                iv = data.get('iv')

                if not ciphertext or not iv:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Missing ciphertext or iv'
                    }))
                    return

                # Save message to database and get the created message
                message_obj = await self.save_message(
                    room_id=self.room_id,
                    user=user,
                    ciphertext=ciphertext,
                    iv=iv
                )

                # Log if message wasn't saved
                if not message_obj:
                    print(f"ERROR: Failed to save message for room {self.room_id}, user {user.email}")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Failed to save message to database'
                    }))
                    return

                # Get user display name and photo URL
                sender_username = await self.get_user_display_name(user)
                sender_photo_url = await self.get_user_photo_url(user)
                # Get sender member ID from the saved message
                sender_member_id = message_obj.sender.id if message_obj.sender else None

                # Get the stored ciphertext and IV from the database (they're stored as bytes)
                # Convert them back to base64 strings for WebSocket transmission
                import base64
                stored_ciphertext = message_obj.body_ciphertext
                stored_iv = message_obj.iv

                # Convert bytes to base64 strings
                ciphertext_str = base64.b64encode(stored_ciphertext).decode('utf-8')
                iv_str = base64.b64encode(stored_iv).decode('utf-8')

                # Broadcast message to room group with full message details
                # Ensure room_id is an integer (not string) for consistency
                room_id_int = int(self.room_id) if isinstance(self.room_id, str) else self.room_id

                broadcast_message = {
                    'type': 'message',
                    'id': message_obj.id,
                    'room': room_id_int,  # Include room ID so frontend knows which room
                    'ciphertext': ciphertext_str,
                    'iv': iv_str,
                    'sender': sender_member_id,  # Send member ID, not email
                    'sender_email': user.email,  # Keep email for backwards compatibility
                    'sender_username': sender_username,
                    'sender_photo_url': sender_photo_url,
                    'created_at': message_obj.created_at.isoformat() if message_obj.created_at else None,
                }

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_message',
                        'message': broadcast_message
                    }
                )

                # Also broadcast to user notification groups for all room members (except sender)
                if message_obj:
                    user_ids = await self.get_room_member_user_ids(self.room_id)
                    notification_data = {
                        'type': 'room_message',
                        'room_id': self.room_id,
                        'message_id': message_obj.id,
                        'sender': sender_member_id,  # Include sender member ID
                        'sender_email': user.email,  # Keep email for backwards compatibility
                        'sender_username': sender_username,
                        'created_at': message_obj.created_at.isoformat() if message_obj.created_at else None,
                    }

                    # Broadcast to each user's notification group (except the sender)
                    for user_id in user_ids:
                        if user_id != user.id:  # Don't send notification to the sender
                            user_group_name = f'user_notifications_{user_id}'
                            await self.channel_layer.group_send(
                                user_group_name,
                                {
                                    'type': 'room_notification',
                                    'notification': notification_data
                                }
                            )
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON'
            }))
        except Exception as e:
            print(f"Error in receive: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Server error processing message'
            }))

    async def chat_message(self, event):
        """Send message to WebSocket."""
        message = event['message']

        # Send message to WebSocket
        try:
            await self.send(text_data=json.dumps(message))
        except Exception as e:
            print(f"Error sending message to WebSocket: {e}")
            import traceback
            traceback.print_exc()

    @database_sync_to_async
    def get_room_member_user_ids(self, room_id):
        """Get list of user IDs for all members of a room."""
        try:
            room = ChatRoom.objects.get(id=room_id)
            user_ids = [member.user.id for member in room.members.all()]
            return user_ids
        except ChatRoom.DoesNotExist:
            return []
        except Exception as e:
            print(f"Error getting room members: {e}")
            return []

    @database_sync_to_async
    def save_message(self, room_id, user, ciphertext, iv):
        """Save message to database and return the created message."""
        import base64

        try:
            # Get chat room
            room = ChatRoom.objects.get(id=room_id)

            # Get member for this user
            member = Member.objects.get(user=user, family=room.family)

            # CRITICAL: Verify that the member is actually a member of this room
            # This prevents messages from being saved to the wrong room
            if not room.members.filter(id=member.id).exists():
                print(f"ERROR: User {user.email} (member {member.id}) is not a member of room {room_id}")
                print(f"Room {room_id} members: {list(room.members.values_list('id', flat=True))}")
                return None

            # Convert ciphertext and iv to bytes if they're strings (base64 encoded)
            if isinstance(ciphertext, str):
                ciphertext = base64.b64decode(ciphertext)
            elif not isinstance(ciphertext, bytes):
                raise ValueError("Ciphertext must be a string or bytes")

            if isinstance(iv, str):
                iv = base64.b64decode(iv)
            elif not isinstance(iv, bytes):
                raise ValueError("IV must be a string or bytes")

            # Create message and return it
            message = Message.objects.create(
                room=room,
                sender=member,
                body_ciphertext=ciphertext,
                iv=iv
            )
            return message
        except ChatRoom.DoesNotExist:
            print(f"Chat room {room_id} does not exist")
            return None
        except Member.DoesNotExist:
            # Note: This is already in a @database_sync_to_async function, so we can access profile directly
            try:
                display_name = user.profile.display_name if hasattr(user, 'profile') and user.profile and user.profile.display_name else user.email
            except Exception:
                display_name = user.email
            print(f"Member for user {display_name} not found in family")
            return None
        except Exception as e:
            print(f"Error saving message: {e}")
            return None


class UserNotificationConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for user-level chat notifications across all rooms."""

    async def connect(self):
        """Handle WebSocket connection."""
        try:
            # Check authentication
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                print("User notification WebSocket connection rejected: User not authenticated")
                await self.close(code=4001)  # Unauthorized
                return

            self.user_id = user.id
            self.user_group_name = f'user_notifications_{self.user_id}'

            # Join user notification group
            await self.channel_layer.group_add(
                self.user_group_name,
                self.channel_name
            )

            await self.accept()
        except Exception as e:
            print(f"Error in user notification WebSocket connect: {e}")
            await self.close(code=4000)

    @database_sync_to_async
    def get_user_display_name(self, user):
        """Get user's display name safely in async context."""
        try:
            if hasattr(user, 'profile') and user.profile and user.profile.display_name:
                return user.profile.display_name
            return user.email
        except Exception:
            return user.email

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )

    async def room_notification(self, event):
        """Send room notification to WebSocket."""
        notification = event['notification']
        try:
            await self.send(text_data=json.dumps(notification))
        except Exception as e:
            print(f"UserNotificationConsumer: Error sending notification to user {self.user_id}: {e}")


