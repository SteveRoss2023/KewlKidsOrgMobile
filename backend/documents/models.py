"""
Document and OAuth sync models.
"""
from django.db import models
from django.core.files.storage import default_storage
from encrypted_model_fields.fields import EncryptedCharField, EncryptedTextField
from encryption.models import JWTOAuthTokenMixin
from families.models import Family, Member


def document_upload_path(instance, filename):
    """Generate upload path for documents."""
    return f'documents/family_{instance.family.id}/{filename}'


class OneDriveSync(JWTOAuthTokenMixin, models.Model):
    """Stores OAuth tokens for OneDrive integration with password-based encryption."""
    member = models.ForeignKey('families.Member', on_delete=models.CASCADE, related_name='onedrive_syncs')
    onedrive_email = EncryptedCharField(max_length=254, help_text="Email address of the connected OneDrive account")

    # OAuth tokens (encrypted with password-based encryption)
    access_token_encrypted = models.TextField(help_text="Access token encrypted with password-based key")
    refresh_token_encrypted = models.TextField(blank=True, null=True, help_text="Refresh token encrypted with password-based key")
    token_expires_at = models.DateTimeField(null=True, blank=True)

    # Connection metadata
    connected_at = models.DateTimeField(auto_now_add=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Note: unique_together removed - encrypted fields cannot be used in database constraints
        # Uniqueness is enforced at application level
        indexes = [
            models.Index(fields=['member', 'is_active']),
        ]

    def __str__(self):
        # Don't expose decrypted email in string representation
        return f"{self.member.user.email} - OneDrive (connected)"


class GoogleDriveSync(JWTOAuthTokenMixin, models.Model):
    """Stores OAuth tokens for Google Drive integration with password-based encryption."""
    member = models.ForeignKey('families.Member', on_delete=models.CASCADE, related_name='googledrive_syncs')
    googledrive_email = EncryptedCharField(max_length=254, help_text="Email address of the connected Google Drive account")

    # OAuth tokens (encrypted with password-based encryption)
    access_token_encrypted = models.TextField(help_text="Access token encrypted with password-based key")
    refresh_token_encrypted = models.TextField(blank=True, null=True, help_text="Refresh token encrypted with password-based key")
    token_expires_at = models.DateTimeField(null=True, blank=True)

    # Connection metadata
    connected_at = models.DateTimeField(auto_now_add=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Note: unique_together removed - encrypted fields cannot be used in database constraints
        # Uniqueness is enforced at application level
        indexes = [
            models.Index(fields=['member', 'is_active']),
        ]

    def __str__(self):
        # Don't expose decrypted email in string representation
        return f"{self.member.user.email} - Google Drive (connected)"


class GooglePhotosSync(JWTOAuthTokenMixin, models.Model):
    """Stores OAuth tokens for Google Photos integration with password-based encryption."""
    member = models.ForeignKey('families.Member', on_delete=models.CASCADE, related_name='googlephotos_syncs')
    googlephotos_email = EncryptedCharField(max_length=254, help_text="Email address of the connected Google Photos account")

    # OAuth tokens (encrypted with password-based encryption)
    access_token_encrypted = models.TextField(help_text="Access token encrypted with password-based key")
    refresh_token_encrypted = models.TextField(blank=True, null=True, help_text="Refresh token encrypted with password-based key")
    token_expires_at = models.DateTimeField(null=True, blank=True)

    # Connection metadata
    connected_at = models.DateTimeField(auto_now_add=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Note: unique_together removed - encrypted fields cannot be used in database constraints
        # Uniqueness is enforced at application level
        indexes = [
            models.Index(fields=['member', 'is_active']),
        ]

    def __str__(self):
        # Don't expose decrypted email in string representation
        return f"{self.member.user.email} - Google Photos (connected)"


class Folder(models.Model):
    """Represents a folder for organizing documents."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='folders')
    parent_folder = models.ForeignKey('self', on_delete=models.CASCADE, related_name='subfolders', null=True, blank=True)

    # Encrypted fields
    name = EncryptedCharField(max_length=200)
    description = EncryptedTextField(blank=True, null=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['family', 'parent_folder']),
        ]

    def __str__(self):
        return self.name

    def get_subfolders_count(self):
        """Get count of subfolders."""
        return self.subfolders.count()

    def get_documents_count(self):
        """Get count of documents in this folder."""
        return self.documents.count()


class Document(models.Model):
    """Represents a document/file stored in the app."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='documents')
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, related_name='documents', null=True, blank=True)
    uploaded_by = models.ForeignKey(Member, on_delete=models.SET_NULL, related_name='uploaded_documents', null=True, blank=True)

    # Encrypted fields
    name = EncryptedCharField(max_length=200)
    description = EncryptedTextField(blank=True, null=True)

    # File fields
    file = models.FileField(upload_to=document_upload_path)
    file_size = models.BigIntegerField(help_text="File size in bytes")
    mime_type = models.CharField(max_length=255, blank=True, null=True)

    # Security
    is_encrypted = models.BooleanField(default=False, help_text="Whether the file content is encrypted")

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['family', 'folder']),
            models.Index(fields=['family', 'created_at']),
        ]

    def __str__(self):
        return self.name

    @property
    def parent_folder(self):
        """Return parent folder ID for API compatibility."""
        return self.folder_id

    @property
    def uploaded_by_username(self):
        """Return username of uploader."""
        if self.uploaded_by and self.uploaded_by.user:
            return self.uploaded_by.user.profile.display_name if hasattr(self.uploaded_by.user, 'profile') and self.uploaded_by.user.profile.display_name else self.uploaded_by.user.email
        return None

    def delete(self, *args, **kwargs):
        """Override delete to also delete the file."""
        if self.file:
            self.file.delete(save=False)
        super().delete(*args, **kwargs)

