from django.contrib import admin
from .models import Family, Member, Invitation


@admin.register(Family)
class FamilyAdmin(admin.ModelAdmin):
    """Admin interface for Family model."""
    list_display = ['name', 'owner', 'color', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Family Information', {'fields': ('name', 'color', 'owner')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    """Admin interface for Member model."""
    list_display = ['user', 'family', 'role', 'is_active', 'joined_at']
    list_filter = ['role', 'is_active', 'joined_at']
    search_fields = ['user__email', 'family__name']
    readonly_fields = ['joined_at']
    fieldsets = (
        ('Membership', {'fields': ('family', 'user', 'role', 'is_active')}),
        ('Timestamps', {'fields': ('joined_at',), 'classes': ('collapse',)}),
    )


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    """Admin interface for Invitation model."""
    list_display = ['email', 'family', 'status', 'role', 'invited_by', 'invited_user', 'created_at', 'expires_at', 'accepted_at']
    list_filter = ['status', 'role', 'created_at', 'expires_at']
    search_fields = ['email', 'family__name', 'token']
    readonly_fields = ['token', 'created_at', 'expires_at']
    fieldsets = (
        ('Invitation Details', {
            'fields': ('family', 'email', 'token', 'status', 'role')
        }),
        ('Users', {
            'fields': ('invited_by', 'invited_user')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'expires_at', 'accepted_at'),
            'classes': ('collapse',)
        }),
    )

