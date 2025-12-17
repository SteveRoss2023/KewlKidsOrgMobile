from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from secrets import token_urlsafe
from encrypted_model_fields.fields import EncryptedCharField
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
import os
import base64


def user_photo_upload_path(instance, filename):
    """Generate upload path for user photos."""
    return f'user_photos/{instance.user.id}/{filename}'


class UserManager(BaseUserManager):
    """Custom user manager where email is the unique identifier."""

    def create_user(self, email, password=None, **extra_fields):
        """Create and return a user with email and password."""
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create and return a superuser with email and password."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user model that uses email instead of username."""
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []  # Email is already required

    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'

    def __str__(self):
        return self.email


class UserProfile(models.Model):
    """Extended user profile with email verification and user data."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    display_name = EncryptedCharField(max_length=150, blank=True, default='')
    photo = models.ImageField(upload_to=user_photo_upload_path, blank=True, null=True)
    email_verified = models.BooleanField(default=False)
    email_verification_token = EncryptedCharField(max_length=64, blank=True, null=True)
    email_verification_sent_at = models.DateTimeField(blank=True, null=True)
    voice_preference = models.CharField(max_length=200, blank=True, null=True)
    voice_type = models.CharField(max_length=50, blank=True, null=True)
    voice_language = models.CharField(max_length=10, blank=True, null=True, default='en')
    calendar_view_preference = models.CharField(max_length=10, blank=True, null=True, default='month')
    location_sharing_enabled = models.BooleanField(default=False)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    last_location_update = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} - {self.display_name or 'No name'}"

    def _get_encryption_key(self):
        """Get encryption key from settings."""
        from django.conf import settings
        key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None)
        if not key:
            raise ValueError('FIELD_ENCRYPTION_KEY must be set in settings')
        if isinstance(key, str):
            key = key.encode()
        return key

    def _encrypt_file_data(self, file_data):
        """Encrypt file data using Fernet."""
        from cryptography.fernet import Fernet
        key = self._get_encryption_key()
        fernet = Fernet(key)
        encrypted = fernet.encrypt(file_data)
        return encrypted

    def _decrypt_file_data(self, encrypted_data):
        """Decrypt file data using Fernet."""
        from cryptography.fernet import Fernet, InvalidToken
        try:
            key = self._get_encryption_key()
            fernet = Fernet(key)
            decrypted = fernet.decrypt(encrypted_data)
            return decrypted
        except InvalidToken:
            import logging
            logger = logging.getLogger(__name__)
            logger.error('Attempted to decrypt an unencrypted photo file.')
            raise ValueError('Photo file is not encrypted.')

    def generate_verification_token(self):
        """Generate a new email verification token."""
        self.email_verification_token = token_urlsafe(32)
        self.email_verification_sent_at = timezone.now()
        self.save()
        return self.email_verification_token

    def verify_email(self, token):
        """Verify email with token."""
        if (self.email_verification_token == token and
            self.email_verification_sent_at and
            (timezone.now() - self.email_verification_sent_at).total_seconds() < 86400):  # 24 hours
            self.email_verified = True
            self.email_verification_token = None
            self.email_verification_sent_at = None
            self.save()
            return True
        return False

    @classmethod
    def get_or_create_profile(cls, user):
        """Get or create a user profile."""
        profile, created = cls.objects.get_or_create(user=user)
        return profile

