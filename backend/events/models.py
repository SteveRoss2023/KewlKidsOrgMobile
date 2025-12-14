"""
Calendar event and sync models.
"""
from django.db import models
from encrypted_model_fields.fields import EncryptedCharField
from encryption.models import JWTOAuthTokenMixin


class CalendarSync(JWTOAuthTokenMixin, models.Model):
    """Stores OAuth tokens and sync settings for calendar integrations with password-based encryption."""
    SYNC_TYPES = [
        ('outlook', 'Outlook Calendar'),
        ('google', 'Google Calendar'),
    ]

    member = models.ForeignKey('families.Member', on_delete=models.CASCADE, related_name='calendar_syncs')
    sync_type = models.CharField(max_length=20, choices=SYNC_TYPES)
    calendar_id = models.CharField(max_length=255, help_text="External calendar ID")
    calendar_name = models.CharField(max_length=255, blank=True, help_text="Display name of the calendar")
    outlook_email = EncryptedCharField(blank=True, null=True, max_length=254, help_text="Email address of the connected Outlook account")

    # OAuth tokens (encrypted with password-based encryption)
    access_token_encrypted = models.TextField(help_text="Access token encrypted with password-based key")
    refresh_token_encrypted = models.TextField(blank=True, null=True, help_text="Refresh token encrypted with password-based key")
    token_expires_at = models.DateTimeField(null=True, blank=True)

    # Sync settings
    sync_enabled = models.BooleanField(default=True)
    sync_direction = models.CharField(max_length=20, default='bidirectional', choices=[
        ('import', 'Import only (Outlook → App)'),
        ('export', 'Export only (App → Outlook)'),
        ('bidirectional', 'Bidirectional (Both ways)'),
    ])
    last_sync_at = models.DateTimeField(null=True, blank=True)
    last_sync_status = models.CharField(max_length=50, blank=True, help_text="Success, Error, etc.")
    last_sync_error = models.TextField(blank=True, null=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['member', 'sync_type', 'calendar_id']
        indexes = [
            models.Index(fields=['member', 'sync_type', 'sync_enabled']),
        ]

    def __str__(self):
        return f"{self.member.user.email} - {self.get_sync_type_display()} - {self.calendar_name}"
