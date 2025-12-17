"""
Family and Member models for the family coordination system.
"""
from django.db import models
from django.contrib.auth import get_user_model
from encrypted_model_fields.fields import EncryptedCharField

User = get_user_model()


class Family(models.Model):
    """Represents a family group."""
    name = EncryptedCharField(max_length=120)
    color = models.CharField(max_length=7, default='#3b82f6', help_text='Hex color code for the family')
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_families', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "families"
        ordering = ['name']

    def __str__(self):
        return self.name


class Member(models.Model):
    """Represents a family member with role-based permissions."""
    ROLE_CHOICES = [
        ('owner', 'Owner'),
        ('admin', 'Admin'),
        ('member', 'Member'),
        ('child', 'Child'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-joined_at']
        unique_together = [['family', 'user']]

    def __str__(self):
        display_name = self.user.profile.display_name if hasattr(self.user, 'profile') and self.user.profile.display_name else self.user.email
        return f"{display_name} - {self.family.name} ({self.role})"

    def is_owner(self):
        """Check if member is the family owner."""
        return self.role == 'owner'

    def is_admin(self):
        """Check if member is an admin (owner or admin role)."""
        return self.role in ['owner', 'admin']

    def is_adult(self):
        """Check if member is an adult (not a child)."""
        return self.role != 'child'

    def can_manage_finance(self):
        """Check if member can access finance features (adults only)."""
        return self.is_adult()


class Invitation(models.Model):
    """Family invitation model."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='invitations')
    email = models.EmailField()
    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    role = models.CharField(max_length=30, choices=Member.ROLE_CHOICES, default='member')
    invited_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_invitations')
    invited_user = models.ForeignKey(User, on_delete=models.SET_NULL, related_name='received_invitations', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [['family', 'email', 'status']]
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['email', 'status']),
        ]

    def __str__(self):
        return f"{self.email} -> {self.family.name} ({self.status})"

    def is_expired(self):
        """Check if invitation has expired."""
        from django.utils import timezone
        return timezone.now() > self.expires_at

    def can_be_accepted(self):
        """Check if invitation can be accepted."""
        return self.status == 'pending' and not self.is_expired()

    @classmethod
    def create_invitation(cls, family, email, invited_by, role='member', expires_in_days=7):
        """Create a new invitation."""
        from django.utils import timezone
        from datetime import timedelta
        from django.utils.crypto import get_random_string

        token = get_random_string(64)
        expires_at = timezone.now() + timedelta(days=expires_in_days)

        # Note: Cancellation of old invitations should be done before calling this method
        # to avoid unique constraint violations

        invitation = cls.objects.create(
            family=family,
            email=email,
            invited_by=invited_by,
            token=token,
            role=role,
            expires_at=expires_at
        )
        return invitation

