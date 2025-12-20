from django.contrib import admin
from .models import ChatRoom, Message, MessageReaction


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ['id', 'family', 'name', 'created_by', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['name']
    filter_horizontal = ['members']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'room', 'sender', 'created_at', 'is_edited']
    list_filter = ['created_at', 'is_edited']
    search_fields = ['room__name']


@admin.register(MessageReaction)
class MessageReactionAdmin(admin.ModelAdmin):
    list_display = ['id', 'message', 'member', 'emoji', 'created_at']
    list_filter = ['created_at', 'emoji']
    search_fields = ['emoji']
