from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProfile


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin interface for User model."""
    list_display = ['email', 'is_active', 'is_staff', 'is_superuser', 'last_login', 'date_joined']
    list_filter = ['is_active', 'is_staff', 'is_superuser', 'date_joined', 'last_login']
    search_fields = ['email']
    ordering = ['email']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """Admin interface for UserProfile model."""
    list_display = ['user', 'display_name', 'email_verified', 'location_sharing_enabled', 'voice_language', 'calendar_view_preference', 'created_at', 'updated_at']
    list_filter = ['email_verified', 'location_sharing_enabled', 'voice_language', 'calendar_view_preference', 'created_at']
    search_fields = ['user__email', 'display_name']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('User', {'fields': ('user',)}),
        ('Profile Information', {'fields': ('display_name', 'photo')}),
        ('Email Verification', {'fields': ('email_verified', 'email_verification_token', 'email_verification_sent_at')}),
        ('Preferences', {
            'fields': (
                'voice_preference', 'voice_type', 'voice_language',
                'calendar_view_preference'
            )
        }),
        ('Location', {
            'fields': (
                'location_sharing_enabled', 'latitude', 'longitude', 'last_location_update'
            )
        }),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )
