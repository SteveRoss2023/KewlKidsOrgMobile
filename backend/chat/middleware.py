"""
Custom middleware for WebSocket JWT authentication.
"""
from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

User = get_user_model()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Custom middleware to authenticate WebSocket connections using JWT tokens
    passed in the query string.
    """

    async def __call__(self, scope, receive, send):
        # Extract token from query string
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]

        if token:
            try:
                # Validate and decode JWT token
                access_token = AccessToken(token)
                user_id = access_token['user_id']

                # Get user from database
                user = await self.get_user(user_id)
                scope['user'] = user
            except (TokenError, InvalidToken, User.DoesNotExist) as e:
                # Invalid token or user not found
                scope['user'] = await self.get_anonymous_user()
        else:
            # No token provided
            scope['user'] = await self.get_anonymous_user()

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def get_user(self, user_id):
        """Get user from database."""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def get_anonymous_user(self):
        """Get anonymous user."""
        from django.contrib.auth.models import AnonymousUser
        return AnonymousUser()


def JWTAuthMiddlewareStack(inner):
    """Stack JWTAuthMiddleware on top of the inner application."""
    return JWTAuthMiddleware(inner)



