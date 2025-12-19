"""
Calendar event and sync models.
"""
from django.db import models
from encrypted_model_fields.fields import EncryptedCharField, EncryptedTextField
from encryption.models import JWTOAuthTokenMixin
from families.models import Family, Member


class Event(models.Model):
    """Calendar event with encrypted sensitive fields."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='events')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_events')

    # Encrypted fields
    title = EncryptedCharField(max_length=200)
    notes = EncryptedTextField(blank=True, null=True)
    location = EncryptedTextField(blank=True, null=True)

    # Public fields
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(blank=True, null=True)
    is_all_day = models.BooleanField(default=False)
    color = models.CharField(max_length=7, default='#3b82f6')  # Hex color code

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # External calendar sync fields
    external_calendar_id = models.CharField(max_length=255, blank=True, null=True, help_text="ID from external calendar (Outlook/Google)")
    external_calendar_type = models.CharField(max_length=20, blank=True, null=True, choices=[('outlook', 'Outlook'), ('google', 'Google')])
    external_calendar_etag = models.CharField(max_length=255, blank=True, null=True, help_text="ETag for conflict detection")
    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['starts_at']
        indexes = [
            models.Index(fields=['family', 'starts_at']),
            models.Index(fields=['starts_at', 'ends_at']),
            models.Index(fields=['external_calendar_id', 'external_calendar_type']),
        ]

    def __str__(self):
        return f"{self.title} - {self.starts_at}"


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

