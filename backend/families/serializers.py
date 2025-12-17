"""
Serializers for families app.
"""
from rest_framework import serializers
from .models import Family, Member, Invitation
from django.contrib.auth import get_user_model

User = get_user_model()


class MemberSerializer(serializers.ModelSerializer):
    """Serializer for Member model."""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_display_name = serializers.SerializerMethodField()
    family_name = serializers.SerializerMethodField()
    user_profile = serializers.SerializerMethodField()

    class Meta:
        model = Member
        fields = ['id', 'family', 'family_name', 'user', 'user_email', 'user_display_name', 'user_profile', 'role', 'joined_at', 'is_active']
        read_only_fields = ['id', 'joined_at']

    def get_family_name(self, obj):
        """Get decrypted family name - accessing obj.family.name triggers automatic decryption."""
        try:
            if obj.family:
                # Accessing the field triggers automatic decryption by django-encrypted-model-fields
                return obj.family.name
            return ''
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Error decrypting family name for member {obj.id}: {str(e)}', exc_info=True)
            return '[Error decrypting name]'

    def get_user_display_name(self, obj):
        """Get user's display name from profile."""
        if hasattr(obj.user, 'profile') and obj.user.profile.display_name:
            return obj.user.profile.display_name
        return obj.user.email

    def get_user_profile(self, obj):
        """Get user's profile location data."""
        if hasattr(obj.user, 'profile') and obj.user.profile:
            profile = obj.user.profile
            return {
                'location_sharing_enabled': profile.location_sharing_enabled,
                'latitude': str(profile.latitude) if profile.latitude is not None else None,
                'longitude': str(profile.longitude) if profile.longitude is not None else None,
                'last_location_update': profile.last_location_update.isoformat() if profile.last_location_update else None,
            }
        return {
            'location_sharing_enabled': False,
            'latitude': None,
            'longitude': None,
            'last_location_update': None,
        }


class FamilySerializer(serializers.ModelSerializer):
    """Serializer for Family model."""
    members = MemberSerializer(many=True, read_only=True)
    owner_email = serializers.EmailField(source='owner.email', read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Family
        fields = ['id', 'name', 'color', 'owner', 'owner_email', 'created_at', 'updated_at', 'members', 'member_count']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_member_count(self, obj):
        """Get the number of active members."""
        return obj.members.filter(is_active=True).count()

    def to_representation(self, instance):
        """Override to handle potential decryption errors gracefully."""
        try:
            # Force access to name field to trigger decryption
            _ = instance.name  # This triggers the decryption
            return super().to_representation(instance)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Error serializing family {instance.id}: {str(e)}', exc_info=True)
            # Return a safe representation with error message
            return {
                'id': instance.id,
                'name': '[Error decrypting name]',
                'color': getattr(instance, 'color', '#3b82f6'),
                'owner': instance.owner.id if instance.owner else None,
                'owner_email': instance.owner.email if instance.owner else None,
                'created_at': instance.created_at.isoformat() if hasattr(instance, 'created_at') else None,
                'updated_at': instance.updated_at.isoformat() if hasattr(instance, 'updated_at') else None,
                'member_count': instance.members.filter(is_active=True).count() if hasattr(instance, 'members') else 0,
                'members': [],
            }


class FamilyCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a family."""
    class Meta:
        model = Family
        fields = ['name', 'color']
        extra_kwargs = {
            'color': {'required': False}
        }


class InvitationSerializer(serializers.ModelSerializer):
    """Serializer for Invitation model."""
    family_name = serializers.SerializerMethodField()
    invited_by_email = serializers.EmailField(source='invited_by.email', read_only=True)

    class Meta:
        model = Invitation
        fields = ['id', 'family', 'family_name', 'email', 'token', 'status', 'role', 'invited_by', 'invited_by_email', 'created_at', 'expires_at', 'accepted_at']
        read_only_fields = ['id', 'token', 'created_at', 'expires_at', 'accepted_at']

    def get_family_name(self, obj):
        """Get decrypted family name - accessing obj.family.name triggers automatic decryption."""
        try:
            if obj.family:
                # Accessing the field triggers automatic decryption by django-encrypted-model-fields
                return obj.family.name
            return ''
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Error decrypting family name for invitation {obj.id}: {str(e)}', exc_info=True)
            return '[Error decrypting name]'
