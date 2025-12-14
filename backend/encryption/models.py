"""
Base mixin for OAuth token models with password-based encryption.
"""
from django.db import models
from django.http import HttpRequest
from encryption.utils import (
    generate_user_encryption_key,
    encrypt_user_key,
    decrypt_user_key,
    encrypt_with_user_key,
    decrypt_with_user_key
)


class UserEncryptionKey(models.Model):
    """Stores encrypted per-user encryption keys."""
    user = models.OneToOneField('api.User', on_delete=models.CASCADE, related_name='encryption_key')
    encrypted_key = models.TextField(help_text="Per-user key encrypted with password")
    key_version = models.IntegerField(default=1, help_text="For key rotation")
    oauth_tokens_require_reconnection = models.BooleanField(
        default=False,
        help_text="True if tokens need reconnection after password reset without old password"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'encryption_userencryptionkey'
        verbose_name = 'User Encryption Key'
        verbose_name_plural = 'User Encryption Keys'

    def __str__(self):
        return f"Encryption key for user {self.user.id} (version {self.key_version})"


class JWTOAuthTokenMixin(models.Model):
    """
    Abstract base mixin for OAuth token models.
    Provides password-based encryption/decryption methods.

    Models using this mixin must have:
    - access_token_encrypted: TextField
    - refresh_token_encrypted: TextField (optional)
    - A ForeignKey to Member (or similar) to get user
    """

    class Meta:
        abstract = True

    def get_user_id(self) -> int:
        """
        Extract user_id from Member relationship.

        Returns:
            User ID

        Raises:
            ValueError: If user_id cannot be determined
        """
        if hasattr(self, 'member') and hasattr(self.member, 'user'):
            return self.member.user.id
        raise ValueError("Cannot determine user_id from model. Model must have 'member' relationship with 'user'.")

    def get_user_encryption_key(self, password: str) -> bytes:
        """
        Get or create user's encryption key, decrypting with password.

        Args:
            password: User's password (plaintext)

        Returns:
            Decrypted per-user encryption key (bytes)

        Raises:
            ValueError: If password is incorrect or key cannot be decrypted
        """
        from encryption.models import UserEncryptionKey

        user_id = self.get_user_id()

        # Get or create user encryption key
        user_key_obj, created = UserEncryptionKey.objects.get_or_create(
            user_id=user_id,
            defaults={
                'encrypted_key': '',  # Will be set below
            }
        )

        if created:
            # Generate new key and encrypt it
            user_key = generate_user_encryption_key()
            user_key_obj.encrypted_key = encrypt_user_key(user_key, password, user_id)
            user_key_obj.save()
            return user_key
        else:
            # Decrypt existing key
            if not user_key_obj.encrypted_key:
                # Key exists but not encrypted yet - generate and encrypt
                user_key = generate_user_encryption_key()
                user_key_obj.encrypted_key = encrypt_user_key(user_key, password, user_id)
                user_key_obj.save()
                return user_key

            return decrypt_user_key(user_key_obj.encrypted_key, password, user_id)

    def encrypt_tokens(self, access_token: str, refresh_token: str = None, password: str = None, user_key: bytes = None):
        """
        Encrypt OAuth tokens using password-based encryption.

        Args:
            access_token: OAuth access token
            refresh_token: OAuth refresh token (optional)
            password: User's password (required if user_key not provided)
            user_key: Pre-decrypted user encryption key (optional, if already available)
        """
        if not user_key:
            if not password:
                raise ValueError("Either password or user_key must be provided")
            user_key = self.get_user_encryption_key(password)

        self.access_token_encrypted = encrypt_with_user_key(access_token, user_key)
        if refresh_token:
            self.refresh_token_encrypted = encrypt_with_user_key(refresh_token, user_key)
        else:
            self.refresh_token_encrypted = None
        self.save()

    def decrypt_tokens(self, password: str = None, user_key: bytes = None) -> tuple:
        """
        Decrypt OAuth tokens using password-based encryption.

        Args:
            password: User's password (required if user_key not provided)
            user_key: Pre-decrypted user encryption key (optional, if already available)

        Returns:
            Tuple of (access_token, refresh_token)

        Raises:
            ValueError: If decryption fails (wrong password, corrupted data, etc.)
        """
        if not user_key:
            if not password:
                raise ValueError("Either password or user_key must be provided")
            user_key = self.get_user_encryption_key(password)

        try:
            access_token = decrypt_with_user_key(self.access_token_encrypted, user_key)
            refresh_token = None
            if hasattr(self, 'refresh_token_encrypted') and self.refresh_token_encrypted:
                refresh_token = decrypt_with_user_key(self.refresh_token_encrypted, user_key)

            return (access_token, refresh_token)
        except ValueError as e:
            raise ValueError(f"Failed to decrypt OAuth tokens: {str(e)}. Please reconnect your account.")

    def update_tokens(self, access_token: str, refresh_token: str = None, password: str = None, user_key: bytes = None):
        """
        Update encrypted tokens (convenience method).

        Args:
            access_token: New OAuth access token
            refresh_token: New OAuth refresh token (optional)
            password: User's password (required if user_key not provided)
            user_key: Pre-decrypted user encryption key (optional, if already available)
        """
        self.encrypt_tokens(access_token, refresh_token, password, user_key)
