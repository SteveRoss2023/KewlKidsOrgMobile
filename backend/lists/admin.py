"""
Admin interface for lists app.
"""
from django.contrib import admin
from .models import List, ListItem, GroceryCategory


@admin.register(List)
class ListAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'list_type', 'family', 'created_by', 'color', 'archived', 'created_at']
    list_filter = ['list_type', 'archived', 'created_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ListItem)
class ListItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'list', 'category', 'completed', 'order', 'due_date', 'created_at']
    list_filter = ['completed', 'category', 'created_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at', 'completed_at']


@admin.register(GroceryCategory)
class GroceryCategoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'family', 'order', 'is_default', 'created_at']
    list_filter = ['is_default', 'family', 'created_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']

