"""
Chat models for secure messaging with end-to-end encryption.
"""
from django.db import models
from django.contrib.auth import get_user_model
from encrypted_model_fields.fields import EncryptedCharField
from families.models import Family, Member

User = get_user_model()


class ChatRoom(models.Model):
    """Chat room for family members."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='chat_rooms')
    name = EncryptedCharField(max_length=200, blank=True, null=True)  # Optional room name
    members = models.ManyToManyField(Member, related_name='chat_rooms')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_chat_rooms')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"Chat Room: {self.name or f'Family {self.family.name}'}"


class Message(models.Model):
    """Encrypted chat message (ciphertext stored, plaintext never on server)."""
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='sent_messages')

    # Encrypted message data (ciphertext from client)
    body_ciphertext = models.BinaryField()  # Encrypted message body
    iv = models.BinaryField()  # Initialization vector for decryption

    # Metadata (not encrypted, for search/filtering)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    is_edited = models.BooleanField(default=False)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['room', 'created_at']),
        ]

    def __str__(self):
        display_name = self.sender.user.profile.display_name if hasattr(self.sender.user, 'profile') and self.sender.user.profile.display_name else self.sender.user.email
        return f"Message from {display_name} at {self.created_at}"


class MessageReaction(models.Model):
    """Reaction to a message."""
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reactions')
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='message_reactions')
    emoji = models.CharField(max_length=10)  # Emoji character
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['message', 'member', 'emoji']

    def __str__(self):
        display_name = self.member.user.profile.display_name if hasattr(self.member.user, 'profile') and self.member.user.profile.display_name else self.member.user.email
        return f"{self.emoji} from {display_name}"
