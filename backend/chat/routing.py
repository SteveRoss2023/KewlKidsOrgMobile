"""
WebSocket URL routing for Channels
"""
from django.urls import re_path
from chat.consumers import ChatConsumer, UserNotificationConsumer

websocket_urlpatterns = [
    # Put notifications route FIRST so it matches before the room_id route
    re_path(r'ws/chat/notifications/$', UserNotificationConsumer.as_asgi()),
    # Room route - matches numeric room IDs only (prevents matching "notifications")
    re_path(r'ws/chat/(?P<room_id>\d+)/$', ChatConsumer.as_asgi()),
]



