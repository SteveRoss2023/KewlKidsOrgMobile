"""
Encryption utilities and key management for the application.
"""
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
from django.conf import settings
from django.http import HttpRequest
import base64


def get_fernet_key():
    """
    Get or generate Fernet encryption key.
    In production, this should come from KMS/Vault.
    """
    if settings.FERNET_KEY:
        return settings.FERNET_KEY

    # Generate a new key if none exists (development only)
    key = Fernet.generate_key()
    # In production, this should be stored securely
    return key


def generate_fernet_key():
    """Generate a new Fernet key for encryption."""
    return Fernet.generate_key().decode()


def get_encryption_key():
    """Get the encryption key as bytes."""
    key = get_fernet_key()
    if isinstance(key, str):
        return key.encode()
    return key


def encrypt_field(value):
    """
    Encrypt a field value using Fernet.
    Returns base64-encoded encrypted string.
    """
    if not value:
        return value

    key = get_encryption_key()
    fernet = Fernet(key)
    encrypted = fernet.encrypt(value.encode() if isinstance(value, str) else value)
    return base64.b64encode(encrypted).decode()


def decrypt_field(encrypted_value):
    """
    Decrypt a field value using Fernet.
    Accepts base64-encoded encrypted string.
    """
    if not encrypted_value:
        return encrypted_value

    try:
        key = get_encryption_key()
        fernet = Fernet(key)
        encrypted_bytes = base64.b64decode(encrypted_value.encode())
        decrypted = fernet.decrypt(encrypted_bytes)
        return decrypted.decode()
    except Exception as e:
        # Log error in production
        raise ValueError(f"Decryption failed: {str(e)}")


class KeyManager:
    """
    Manages encryption keys for the application.
    Supports key rotation and envelope encryption.
    """

    @staticmethod
    def get_master_key():
        """Get the master encryption key."""
        return get_fernet_key()

    @staticmethod
    def generate_family_key():
        """Generate a per-family encryption key."""
        return Fernet.generate_key()

    @staticmethod
    def encrypt_with_key(data, key):
        """Encrypt data with a specific key."""
        fernet = Fernet(key)
        return fernet.encrypt(data.encode() if isinstance(data, str) else data)

    @staticmethod
    def decrypt_with_key(encrypted_data, key):
        """Decrypt data with a specific key."""
        fernet = Fernet(key)
        return fernet.decrypt(encrypted_data)


# ============================================================================
# Password-Based Encryption Utilities for OAuth Tokens (Ultra-Secure)
# ============================================================================

def derive_key_from_password(password: str, user_id: int) -> bytes:
    """
    Derive encryption key from user password.
    Used to encrypt/decrypt per-user encryption keys.

    Args:
        password: User's password (plaintext)
        user_id: User ID

    Returns:
        Fernet-compatible encryption key (32 bytes, base64-encoded)
    """
    # Get encryption key (OAUTH_ENCRYPTION_KEY or SECRET_KEY)
    oauth_key = getattr(settings, 'OAUTH_ENCRYPTION_KEY', None) or settings.SECRET_KEY

    # Use password + user_id + SECRET_KEY as key material
    salt = f"password_oauth_{user_id}".encode()
    key_material = f"{password}_{user_id}_{oauth_key}".encode()

    # Derive 32 bytes for Fernet key using PBKDF2
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,  # Slow to prevent brute force
        backend=default_backend()
    )
    derived_key = kdf.derive(key_material)

    # Convert to Fernet-compatible key (base64-encoded)
    return base64.urlsafe_b64encode(derived_key)


def generate_user_encryption_key() -> bytes:
    """
    Generate a unique Fernet key for each user.
    This key will be used to encrypt OAuth tokens.

    Returns:
        Fernet key (32 bytes, base64-encoded)
    """
    return Fernet.generate_key()


def encrypt_user_key(user_key: bytes, password: str, user_id: int) -> str:
    """
    Encrypt a per-user encryption key with password-derived key.

    Args:
        user_key: Per-user Fernet key (bytes)
        password: User's password (plaintext)
        user_id: User ID

    Returns:
        Base64-encoded encrypted user key
    """
    if not user_key:
        raise ValueError("User key cannot be empty")

    # Derive key from password
    password_key = derive_key_from_password(password, user_id)

    # Encrypt user key with password-derived key
    fernet = Fernet(password_key)
    encrypted = fernet.encrypt(user_key)

    # Return base64-encoded
    return base64.b64encode(encrypted).decode()


def decrypt_user_key(encrypted_user_key: str, password: str, user_id: int) -> bytes:
    """
    Decrypt a per-user encryption key using password.

    Args:
        encrypted_user_key: Base64-encoded encrypted user key
        password: User's password (plaintext)
        user_id: User ID

    Returns:
        Decrypted per-user Fernet key (bytes)

    Raises:
        ValueError: If decryption fails (wrong password, corrupted data, etc.)
    """
    if not encrypted_user_key:
        raise ValueError("Encrypted user key cannot be empty")

    try:
        # Derive key from password
        password_key = derive_key_from_password(password, user_id)

        # Decrypt user key
        fernet = Fernet(password_key)
        encrypted_bytes = base64.b64decode(encrypted_user_key.encode())
        decrypted = fernet.decrypt(encrypted_bytes)

        return decrypted
    except Exception as e:
        raise ValueError(f"Failed to decrypt user key: {str(e)}. Incorrect password or corrupted data.")


def encrypt_with_user_key(data: str, user_key: bytes) -> str:
    """
    Encrypt OAuth token data with per-user encryption key.

    Args:
        data: Plaintext string to encrypt (OAuth token)
        user_key: Per-user Fernet key (bytes)

    Returns:
        Base64-encoded encrypted string
    """
    if not data:
        return data

    if not user_key:
        raise ValueError("User key cannot be empty")

    fernet = Fernet(user_key)
    encrypted = fernet.encrypt(data.encode())
    return base64.b64encode(encrypted).decode()


def decrypt_with_user_key(encrypted_data: str, user_key: bytes) -> str:
    """
    Decrypt OAuth token data with per-user encryption key.

    Args:
        encrypted_data: Base64-encoded encrypted string
        user_key: Per-user Fernet key (bytes)

    Returns:
        Decrypted plaintext string

    Raises:
        ValueError: If decryption fails (wrong key, corrupted data, etc.)
    """
    if not encrypted_data:
        return encrypted_data

    if not user_key:
        raise ValueError("User key cannot be empty")

    try:
        fernet = Fernet(user_key)
        encrypted_bytes = base64.b64decode(encrypted_data.encode())
        decrypted = fernet.decrypt(encrypted_bytes)
        return decrypted.decode()
    except Exception as e:
        raise ValueError(f"Decryption failed: {str(e)}")


def get_session_user_key(user_id: int, jwt_token: str = None, auto_refresh: bool = True) -> bytes:
    """
    Get user encryption key from cache (session storage).
    Auto-refreshes the timeout when accessed if auto_refresh is True.

    Args:
        user_id: User ID
        jwt_token: JWT token string (optional, for cache key uniqueness - not used for key, but for refresh)
        auto_refresh: If True, automatically extend timeout when key is accessed

    Returns:
        User encryption key (bytes) or None if not in cache
    """
    from django.core.cache import cache

    # Use user-specific cache key (not JWT-specific) so it persists across JWT refreshes
    cache_key = f"oauth_user_key_{user_id}"

    cached_key = cache.get(cache_key)
    if cached_key:
        # Decode from base64
        user_key = base64.b64decode(cached_key.encode())

        # Auto-refresh: extend the timeout when accessed
        if auto_refresh:
            timeout = getattr(settings, 'OAUTH_SESSION_KEY_LIFETIME', 2592000)  # Default 30 days to match refresh token lifetime
            # Re-store with extended timeout
            encoded_key = base64.b64encode(user_key).decode()
            cache.set(cache_key, encoded_key, timeout=timeout)

        return user_key
    return None


def set_session_user_key(user_id: int, user_key: bytes, jwt_token: str = None, timeout: int = None):
    """
    Store user encryption key in cache (session storage).
    Uses user-specific key (not JWT-specific) so it persists across JWT refreshes.

    Args:
        user_id: User ID
        user_key: User encryption key (bytes)
        jwt_token: JWT token string (optional, ignored - kept for backward compatibility)
        timeout: Cache timeout in seconds (default: 30 days to match JWT refresh token)
    """
    from django.core.cache import cache

    if timeout is None:
        # Default to 30 days (2592000 seconds) to match JWT refresh token lifetime
        # This ensures the session key lasts as long as the refresh token
        timeout = getattr(settings, 'OAUTH_SESSION_KEY_LIFETIME', 2592000)

    # Use user-specific cache key (not JWT-specific) so it persists across JWT refreshes
    cache_key = f"oauth_user_key_{user_id}"

    # Encode to base64 for storage
    encoded_key = base64.b64encode(user_key).decode()
    cache.set(cache_key, encoded_key, timeout=timeout)


def get_user_key_from_request(request: HttpRequest, password: str = None) -> bytes:
    """
    Get user encryption key from request (cache or decrypt with password).

    Args:
        request: Django request object with authenticated user
        password: User's password (optional, if not in cache)

    Returns:
        User encryption key (bytes)

    Raises:
        ValueError: If key cannot be retrieved
    """
    if not request.user or not request.user.is_authenticated:
        raise ValueError("User must be authenticated")

    user_id = request.user.id

    # Try to get from cache first (auto-refreshes timeout on access)
    cached_key = get_session_user_key(user_id, auto_refresh=True)
    if cached_key:
        return cached_key

    # If not in cache, need password
    if not password:
        raise ValueError("User encryption key not in session. Password required.")

    # Decrypt from database
    from encryption.models import UserEncryptionKey
    try:
        user_key_obj = UserEncryptionKey.objects.get(user_id=user_id)
        if not user_key_obj.encrypted_key:
            # Generate new key
            user_key = generate_user_encryption_key()
            user_key_obj.encrypted_key = encrypt_user_key(user_key, password, user_id)
            user_key_obj.save()
            return user_key
        else:
            # Decrypt existing key
            user_key = decrypt_user_key(user_key_obj.encrypted_key, password, user_id)
            # Store in cache for future use (auto-refreshes on access)
            set_session_user_key(user_id, user_key)
            return user_key
    except UserEncryptionKey.DoesNotExist:
        # Create new key
        user_key = generate_user_encryption_key()
        user_key_obj = UserEncryptionKey.objects.create(
            user_id=user_id,
            encrypted_key=encrypt_user_key(user_key, password, user_id)
        )
        # Store in cache (auto-refreshes on access)
        set_session_user_key(user_id, user_key)
        return user_key
