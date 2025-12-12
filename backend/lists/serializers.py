"""
Serializers for lists app.
"""
from rest_framework import serializers
from .models import List, ListItem, GroceryCategory


class GroceryCategorySerializer(serializers.ModelSerializer):
    """GroceryCategory serializer."""

    class Meta:
        model = GroceryCategory
        fields = [
            'id', 'family', 'name', 'description', 'icon', 'order', 'is_default',
            'keywords', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ListSerializer(serializers.ModelSerializer):
    """List serializer."""
    item_count = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()

    def get_created_by_username(self, obj):
        if obj.created_by and obj.created_by.user and hasattr(obj.created_by.user, 'profile') and obj.created_by.user.profile:
            return obj.created_by.user.profile.display_name or obj.created_by.user.email
        return obj.created_by.user.email if obj.created_by and obj.created_by.user else None

    class Meta:
        model = List
        fields = [
            'id', 'family', 'created_by', 'created_by_username', 'name', 'description',
            'list_type', 'color', 'created_at', 'updated_at', 'archived', 'item_count'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_item_count(self, obj):
        return obj.items.count()


class ListItemSerializer(serializers.ModelSerializer):
    """ListItem serializer."""
    created_by_username = serializers.SerializerMethodField()
    assigned_to_username = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()

    def get_created_by_username(self, obj):
        if obj.created_by and obj.created_by.user and hasattr(obj.created_by.user, 'profile') and obj.created_by.user.profile:
            return obj.created_by.user.profile.display_name or obj.created_by.user.email
        return obj.created_by.user.email if obj.created_by and obj.created_by.user else None

    def get_assigned_to_username(self, obj):
        if obj.assigned_to and obj.assigned_to.user and hasattr(obj.assigned_to.user, 'profile') and obj.assigned_to.user.profile:
            return obj.assigned_to.user.profile.display_name or obj.assigned_to.user.email
        return obj.assigned_to.user.email if obj.assigned_to and obj.assigned_to.user else None

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    class Meta:
        model = ListItem
        fields = [
            'id', 'list', 'created_by', 'created_by_username', 'assigned_to', 'assigned_to_username',
            'name', 'notes', 'quantity', 'category', 'category_name', 'completed', 'completed_at', 'completed_by', 'order',
            'due_date', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'completed_at', 'category_name']

