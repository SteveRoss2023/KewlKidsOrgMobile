from rest_framework import viewsets, status, serializers
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.generics import CreateAPIView
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.signing import TimestampSigner
from django.shortcuts import get_object_or_404
from django.http import Http404
from .models import UserProfile
from .serializers import UserProfileSerializer, RecipeSerializer, MealPlanSerializer, EventSerializer, ChatRoomSerializer, MessageSerializer
from meals.models import Recipe, MealPlan
from families.models import Family, Member
from events.models import Event
from chat.models import ChatRoom, Message

User = get_user_model()


class TemporaryLoginToken:
    """Utility class for generating and validating temporary login tokens."""

    @staticmethod
    def generate(user):
        """Generate a temporary token for auto-login."""
        signer = TimestampSigner()
        token = signer.sign(f"{user.id}:{user.email}")
        return token

    @staticmethod
    def validate(token):
        """Validate and extract user info from token."""
        try:
            signer = TimestampSigner()
            # Max age is 10 minutes (600 seconds)
            unsigned = signer.unsign(token, max_age=600)
            user_id, email = unsigned.split(':')
            return int(user_id), email
        except Exception:
            return None, None


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint"""
    return Response({'status': 'ok', 'message': 'API is running'}, status=status.HTTP_200_OK)


class RegisterSerializer(serializers.ModelSerializer):
    """User registration serializer - email-based with display name."""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    display_name = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['email', 'display_name', 'password', 'password2']

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        display_name = validated_data.pop('display_name', '')
        email = validated_data['email']
        password = validated_data.pop('password')

        # Create user with email (email is now the USERNAME_FIELD)
        user = User.objects.create_user(
            email=email,
            password=password,
        )

        # Create profile with display_name
        profile = UserProfile.get_or_create_profile(user)
        if display_name:
            profile.display_name = display_name.strip()
            profile.save()

        return user


class RegisterView(CreateAPIView):
    """User registration view."""
    queryset = User.objects.all()
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Create user profile and generate verification token
        profile = UserProfile.get_or_create_profile(user)
        token = profile.generate_verification_token()

        # Send verification email
        verification_url = f"{request.scheme}://{request.get_host()}/api/auth/verify-email/?token={token}&email={user.email}"
        try:
            from django.core.mail import EmailMultiAlternatives
            from django.conf import settings

            subject = 'Verify Your Email - KewlKidsOrganizer'
            text_message = f'''Welcome to KewlKidsOrganizer!

Please verify your email address by clicking the link below:

{verification_url}

If you did not create an account, please ignore this email.

This link will expire in 24 hours.'''

            html_message = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 28px;
            font-weight: bold;
            color: #3b82f6;
            margin-bottom: 10px;
        }}
        h1 {{
            color: #1f2937;
            font-size: 24px;
            margin: 0 0 10px 0;
        }}
        .content {{
            margin-bottom: 30px;
        }}
        .button-container {{
            text-align: center;
            margin: 30px 0;
        }}
        .button {{
            display: inline-block;
            padding: 14px 32px;
            background-color: #3b82f6;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
        }}
        .button:hover {{
            background-color: #2563eb;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
            text-align: center;
        }}
        .expiry {{
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px 16px;
            margin: 20px 0;
            border-radius: 4px;
        }}
        .expiry-text {{
            color: #92400e;
            font-size: 14px;
            margin: 0;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">KewlKids Organizer</div>
        </div>
        <h1>Welcome to KewlKidsOrganizer!</h1>
        <div class="content">
            <p>Thank you for creating an account. To get started, please verify your email address by clicking the button below.</p>
        </div>
        <div class="button-container">
            <a href="{verification_url}" class="button">Verify Email Address</a>
        </div>
        <div class="expiry">
            <p class="expiry-text"><strong>⏰ This verification link will expire in 24 hours.</strong></p>
        </div>
        <div class="footer">
            <p>If you did not create an account, please ignore this email.</p>
        </div>
    </div>
</body>
</html>'''

            email_msg = EmailMultiAlternatives(
                subject=subject,
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[user.email]
            )
            email_msg.attach_alternative(html_message, "text/html")
            email_msg.send()
        except Exception as e:
            # Continue even if email fails
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f'Failed to send verification email to {user.email}: {str(e)}')

        # Check for pending invitations
        from families.models import Invitation, Member
        pending_invitations = Invitation.objects.filter(
            email=user.email,
            status='pending'
        ).select_related('family')

        family = None
        has_pending_invitation = False
        invitation_url = None

        if pending_invitations.exists():
            # Use the first pending invitation
            invitation = pending_invitations.first()
            if invitation.can_be_accepted():
                family = invitation.family
                # Create member
                Member.objects.create(
                    family=family,
                    user=user,
                    role=invitation.role
                )
                # Update invitation
                invitation.status = 'accepted'
                invitation.invited_user = user
                from django.utils import timezone
                invitation.accepted_at = timezone.now()
                invitation.save()
            else:
                # Invitation expired, create new family
                has_pending_invitation = True
                invitation_url = f"/invitations/{invitation.token}/"

        # If no family from invitation, create a new one
        if not family:
            from families.models import Family
            family_name = f"{user.email.split('@')[0]}'s Family"
            family = Family.objects.create(
                name=family_name,
                owner=user
            )
            # Add user as owner member
            Member.objects.create(
                family=family,
                user=user,
                role='owner'
            )

        # Generate tokens for auto-login
        refresh = RefreshToken.for_user(user)

        # Build user data response
        user_data = {
            'id': user.id,
            'email': user.email,
        }
        if hasattr(user, 'profile') and user.profile and user.profile.display_name:
            user_data['display_name'] = user.profile.display_name

        response_data = {
            'user': user_data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'email': user.email,
            'family_id': family.id,
        }

        if has_pending_invitation:
            response_data['has_pending_invitation'] = True
            response_data['invitation_url'] = invitation_url

        return Response(response_data, status=status.HTTP_201_CREATED)


class EmailTokenObtainPairView(TokenObtainPairView):
    """Token view that uses email (now the USERNAME_FIELD)."""
    def post(self, request, *args, **kwargs):
        # Map 'email' to the username field (which is now 'email')
        # request.data is immutable, so we need to create a mutable copy
        data = dict(request.data)
        if 'email' in data and 'username' not in data:
            data['username'] = data['email']

        # Capture password BEFORE authentication (it may be cleared after)
        password = data.get('password')
        email = data.get('email') or data.get('username')

        # Temporarily replace request.data with mutable version
        original_data = request._full_data
        request._full_data = data

        try:
            response = super().post(request, *args, **kwargs)
        finally:
            # Restore original data
            request._full_data = original_data

        # Add user information to the response
        if response.status_code == 200:
            try:
                user = User.objects.get(email=email)
                profile = UserProfile.get_or_create_profile(user)
                response.data['user'] = {
                    'id': user.id,
                    'email': user.email,
                    'email_verified': profile.email_verified,
                }
                if hasattr(user, 'profile') and user.profile:
                    response.data['user']['display_name'] = user.profile.display_name or ''

                # Cache user encryption key for OAuth token encryption
                # This allows OAuth callbacks to encrypt tokens without requiring password again
                if password:
                    try:
                        from encryption.utils import set_session_user_key
                        from encryption.models import UserEncryptionKey
                        from encryption.utils import generate_user_encryption_key, encrypt_user_key, decrypt_user_key

                        # Get or create user encryption key and cache it
                        user_key_obj, created = UserEncryptionKey.objects.get_or_create(
                            user_id=user.id,
                            defaults={'encrypted_key': ''}
                        )

                        if created or not user_key_obj.encrypted_key:
                            # Generate new key
                            user_key = generate_user_encryption_key()
                            user_key_obj.encrypted_key = encrypt_user_key(user_key, password, user.id)
                            user_key_obj.save()
                        else:
                            # Decrypt existing key
                            try:
                                user_key = decrypt_user_key(user_key_obj.encrypted_key, password, user.id)
                            except ValueError as e:
                                # If decryption fails (wrong password), log but don't fail login
                                # This can happen if user changed password but key wasn't updated
                                import logging
                                logger = logging.getLogger(__name__)
                                logger.warning(f'Failed to decrypt user encryption key during login: {e}')
                                # Generate a new key with the new password
                                user_key = generate_user_encryption_key()
                                user_key_obj.encrypted_key = encrypt_user_key(user_key, password, user.id)
                                user_key_obj.save()

                        # Cache the key for OAuth use (24 hour lifetime to match JWT refresh token)
                        set_session_user_key(user.id, user_key)
                    except Exception as e:
                        # If key caching fails, log but don't fail login
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f'Failed to cache user encryption key during login: {e}')
            except User.DoesNotExist:
                pass

        return response


class CustomTokenRefreshView(TokenRefreshView):
    """
    Custom token refresh view that also refreshes/extends the session key.
    This ensures the session key stays alive when JWT tokens are refreshed.
    """
    def post(self, request, *args, **kwargs):
        # Extract user_id from refresh token before calling super()
        user_id = None
        refresh_token_str = request.data.get('refresh')
        if refresh_token_str:
            try:
                from rest_framework_simplejwt.tokens import RefreshToken
                refresh_token = RefreshToken(refresh_token_str)
                # RefreshToken.payload is a dict containing the token claims including 'user_id'
                user_id = refresh_token.payload.get('user_id')
            except Exception:
                # If we can't extract user_id, that's okay - we'll skip session key refresh
                pass

        response = super().post(request, *args, **kwargs)

        # If token refresh was successful and we have user_id, also refresh session key if it exists
        if response.status_code == 200 and user_id:
            try:
                from encryption.utils import get_session_user_key, set_session_user_key

                # Try to get existing session key
                existing_key = get_session_user_key(user_id, auto_refresh=False)
                if existing_key:
                    # Re-store with extended timeout (24 hours)
                    set_session_user_key(user_id, existing_key)
            except Exception as e:
                # Log error but don't fail token refresh
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f'Failed to refresh session key during token refresh: {e}')

        return response


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """User viewset for profile management."""
    queryset = User.objects.all()
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        """Add request to serializer context."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=False, methods=['get', 'put', 'patch'], url_path='me/profile')
    def my_profile(self, request):
        """Get or update current user's profile."""
        profile = UserProfile.get_or_create_profile(request.user)

        if request.method == 'GET':
            serializer = UserProfileSerializer(profile, context={'request': request})
            return Response(serializer.data)

        elif request.method in ['PUT', 'PATCH']:
            serializer = UserProfileSerializer(
                profile,
                data=request.data,
                partial=request.method == 'PATCH',
                context={'request': request}
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['delete'], url_path='me/profile/photo')
    def delete_photo(self, request):
        """Delete current user's profile photo."""
        profile = UserProfile.get_or_create_profile(request.user)
        if profile.photo:
            profile.photo.delete()
            profile.save()
            return Response({'detail': 'Photo deleted successfully.'}, status=status.HTTP_200_OK)
        return Response({'detail': 'No photo to delete.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], url_path='photo', permission_classes=[IsAuthenticated])
    def get_photo(self, request, pk=None):
        """Get user's profile photo (decrypted)."""
        from django.http import HttpResponse

        user = self.get_object()
        profile = UserProfile.get_or_create_profile(user)

        # Allow users to view their own photo or photos of users in their families
        can_view = False
        if user == request.user:
            can_view = True
        else:
            # Check if user is in the same family
            from families.models import Member
            user_families = Member.objects.filter(user=request.user).values_list('family_id', flat=True)
            target_families = Member.objects.filter(user=user).values_list('family_id', flat=True)
            if set(user_families) & set(target_families):
                can_view = True

        if not can_view:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        if not profile.photo:
            return Response({'detail': 'No photo available.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            profile.photo.seek(0)
            file_data = profile.photo.read()

            # Decrypt the file data
            decrypted_data = profile._decrypt_file_data(file_data)

            # Determine content type
            if hasattr(profile.photo, 'name'):
                name = profile.photo.name
                if name.endswith('.png'):
                    content_type = 'image/png'
                elif name.endswith('.gif'):
                    content_type = 'image/gif'
                else:
                    content_type = 'image/jpeg'
            else:
                content_type = 'image/jpeg'

            # Return HttpResponse directly to bypass DRF content negotiation
            # This allows any Accept header to work
            response = HttpResponse(decrypted_data, content_type=content_type)
            # Add cache headers to help with performance
            response['Cache-Control'] = 'private, max-age=3600'
            return response
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Error serving photo: {str(e)}', exc_info=True)
            return Response({'detail': 'Error serving photo.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EmailVerificationView(APIView):
    """Verify user email with token."""
    permission_classes = [AllowAny]

    def _is_mobile_request(self, request):
        """Check if request is from a mobile device."""
        user_agent = request.META.get('HTTP_USER_AGENT', '').lower()
        mobile_keywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone']
        return any(keyword in user_agent for keyword in mobile_keywords)

    def _get_web_app_url(self, request):
        """Helper method to determine web app URL for redirects."""
        import os
        host = request.get_host()
        # Remove any /api path from host
        clean_host = host.split('/')[0] if '/' in host else host

        # Always check for WEB_APP_URL environment variable first
        if os.getenv('WEB_APP_URL'):
            return os.getenv('WEB_APP_URL')

        if 'ngrok' in host:
            # For ngrok, web app might be on same domain (if also exposed via ngrok)
            # Or on a different ngrok tunnel
            web_url = f"{request.scheme}://{clean_host}"
        elif 'localhost' in host or '127.0.0.1' in host:
            # For localhost, web app runs on port 8081
            web_url = 'http://localhost:8081'
        else:
            # For other hosts, construct from request
            web_url = f"{request.scheme}://{clean_host}"

        return web_url

    def _get_redirect_url(self, request, path, params=None):
        """Get redirect URL - deep link for mobile, web URL for desktop."""
        from urllib.parse import urlencode

        if params is None:
            params = {}

        query_string = urlencode(params) if params else ''
        full_path = f"{path}?{query_string}" if query_string else path

        # If mobile device, use deep link
        if self._is_mobile_request(request):
            return f"kewlkids://{full_path}"

        # Otherwise, use web app URL
        web_url = self._get_web_app_url(request)
        return f"{web_url}{full_path}"

    def _safe_redirect(self, url):
        """Create a safe redirect response that allows custom URL schemes."""
        from django.http import HttpResponse
        # Check if it's a custom scheme (like kewlkids://)
        if '://' in url and not url.startswith(('http://', 'https://')):
            # For custom schemes, use immediate JavaScript redirect with fallback
            # Escape the URL for use in HTML/JavaScript
            import html
            escaped_url = html.escape(url)
            html_content = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Opening App...</title>
    <style>
        * {{
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
            padding: 20px;
        }}
        .container {{
            text-align: center;
            max-width: 400px;
            width: 100%;
        }}
        .spinner {{
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }}
        @keyframes spin {{
            0% {{ transform: rotate(0deg); }}
            100% {{ transform: rotate(360deg); }}
        }}
        .message {{
            font-size: 16px;
            color: #333;
            margin-bottom: 30px;
        }}
        .link-button {{
            display: inline-block;
            background-color: #3b82f6;
            color: white !important;
            padding: 14px 28px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 16px;
            font-weight: 600;
            margin-top: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .link-button:hover {{
            background-color: #2563eb;
        }}
        .link-button:active {{
            background-color: #1d4ed8;
        }}
        .info-text {{
            font-size: 14px;
            color: #666;
            margin-top: 20px;
            line-height: 1.5;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <p class="message">Opening app...</p>
        <a href="{escaped_url}" class="link-button">Open in App</a>
        <p class="info-text">
            If the app doesn't open automatically, tap the button above.
            <br><br>
            <small>Note: Deep links work after building the app. In Expo Go, you may need to tap the button.</small>
        </p>
    </div>
    <script>
        // Try immediate redirect
        (function() {{
            try {{
                window.location.href = "{escaped_url}";
            }} catch (e) {{
                console.error('Redirect error:', e);
            }}
        }})();

        // Fallback: try after a short delay
        setTimeout(function() {{
            try {{
                window.location.href = "{escaped_url}";
            }} catch (e) {{
                console.error('Fallback redirect error:', e);
            }}
        }}, 100);

        // Final fallback: try with location.replace
        setTimeout(function() {{
            try {{
                window.location.replace("{escaped_url}");
            }} catch (e) {{
                console.error('Replace redirect error:', e);
            }}
        }}, 500);
    </script>
</body>
</html>'''
            response = HttpResponse(html_content, content_type='text/html; charset=utf-8')
            response.status_code = 200
            return response
        else:
            # For http/https, use standard redirect
            from django.http import HttpResponseRedirect
            return HttpResponseRedirect(url)

    def post(self, request):
        """Verify email via POST request."""
        token = request.data.get('token')
        email = request.data.get('email')

        if not token or not email:
            return Response(
                {'detail': 'Token and email are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(email=email)
            profile = UserProfile.get_or_create_profile(user)

            # Check if email is already verified
            if profile.email_verified:
                return Response({'detail': 'Email is already verified.'}, status=status.HTTP_200_OK)

            # Try to verify the email
            if profile.verify_email(token):
                return Response({'detail': 'Email verified successfully.'}, status=status.HTTP_200_OK)
            else:
                return Response(
                    {'detail': 'Invalid or expired verification token.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

    def get(self, request):
        """Verify email via GET request (for email links)."""
        from urllib.parse import urlencode
        import os

        token = request.query_params.get('token')
        email = request.query_params.get('email')

        # Check if this is a browser request (wants HTML) vs API request (wants JSON)
        accept_header = request.META.get('HTTP_ACCEPT', '')
        is_browser_request = 'text/html' in accept_header or (not accept_header.startswith('application/json') and not accept_header.startswith('application/'))

        if not token or not email:
            if is_browser_request:
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {'error': 'Invalid verification link'})
                return self._safe_redirect(redirect_url)

            return Response(
                {'detail': 'Token and email are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(email=email)
            profile = UserProfile.get_or_create_profile(user)

            # Check if email is already verified
            if profile.email_verified:
                if is_browser_request:
                    # Email already verified, redirect to success page
                    redirect_url = self._get_redirect_url(request, '/(tabs)', {'verified': 'true', 'email': email})
                    return self._safe_redirect(redirect_url)

                return Response({'detail': 'Email is already verified.'}, status=status.HTTP_200_OK)

            # Try to verify the email
            if profile.verify_email(token):
                if is_browser_request:
                    # Always redirect to home page - the web app will handle showing success message
                    # and redirecting to login if user is not authenticated
                    redirect_url = self._get_redirect_url(request, '/(tabs)', {'verified': 'true', 'email': email})
                    return self._safe_redirect(redirect_url)

                return Response({'detail': 'Email verified successfully.'}, status=status.HTTP_200_OK)
            else:
                if is_browser_request:
                    redirect_url = self._get_redirect_url(request, '/(auth)/login', {'error': 'Invalid or expired verification token'})
                    return self._safe_redirect(redirect_url)

                return Response(
                    {'detail': 'Invalid or expired verification token.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except User.DoesNotExist:
            if is_browser_request:
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {'error': 'User not found'})
                return self._safe_redirect(redirect_url)

            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )


class ResendVerificationEmailView(APIView):
    """Resend email verification email."""
    permission_classes = [AllowAny]

    def post(self, request):
        """Resend verification email."""
        # If user is authenticated, use their email automatically
        if request.user and request.user.is_authenticated:
            email = request.user.email
        else:
            email = request.data.get('email')
            if not email:
                return Response(
                    {'detail': 'Email is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            user = User.objects.get(email=email)
            profile = UserProfile.get_or_create_profile(user)

            # Check if already verified
            if profile.email_verified:
                return Response(
                    {'detail': 'Email is already verified.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Generate new verification token
            token = profile.generate_verification_token()

            # Send verification email
            verification_url = f"{request.scheme}://{request.get_host()}/api/auth/verify-email/?token={token}&email={user.email}"
            try:
                from django.core.mail import EmailMultiAlternatives
                from django.conf import settings

                subject = 'Verify Your Email - KewlKidsOrganizer'
                text_message = f'''Please verify your email address by clicking the link below:

{verification_url}

If you did not request this verification email, please ignore it.

This link will expire in 24 hours.'''

                html_message = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            font-size: 28px;
            font-weight: bold;
            color: #3b82f6;
            margin-bottom: 10px;
        }}
        h1 {{
            color: #1f2937;
            font-size: 24px;
            margin: 0 0 10px 0;
        }}
        .content {{
            margin-bottom: 30px;
        }}
        .button-container {{
            text-align: center;
            margin: 30px 0;
        }}
        .button {{
            display: inline-block;
            padding: 14px 32px;
            background-color: #3b82f6;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
        }}
        .button:hover {{
            background-color: #2563eb;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
            text-align: center;
        }}
        .expiry {{
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px 16px;
            margin: 20px 0;
            border-radius: 4px;
        }}
        .expiry-text {{
            color: #92400e;
            font-size: 14px;
            margin: 0;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">KewlKids Organizer</div>
        </div>
        <h1>Verify Your Email</h1>
        <div class="content">
            <p>Please verify your email address by clicking the button below to complete your account setup.</p>
        </div>
        <div class="button-container">
            <a href="{verification_url}" class="button">Verify Email Address</a>
        </div>
        <div class="expiry">
            <p class="expiry-text"><strong>⏰ This verification link will expire in 24 hours.</strong></p>
        </div>
        <div class="footer">
            <p>If you did not request this verification email, please ignore it.</p>
        </div>
    </div>
</body>
</html>'''

                email_msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text_message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[user.email]
                )
                email_msg.attach_alternative(html_message, "text/html")
                email_msg.send()
                return Response(
                    {'detail': 'Verification email sent successfully.'},
                    status=status.HTTP_200_OK
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f'Failed to send verification email to {user.email}: {str(e)}')
                return Response(
                    {'detail': 'Failed to send verification email. Please try again later.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except User.DoesNotExist:
            # Don't reveal if user exists or not for security
            return Response(
                {'detail': 'If an account exists with this email, a verification email has been sent.'},
                status=status.HTTP_200_OK
            )


class ExchangeTempTokenView(APIView):
    """Exchange temporary token for JWT tokens."""
    permission_classes = [AllowAny]

    def post(self, request):
        """Exchange temporary token for JWT."""
        temp_token = request.data.get('token')

        if not temp_token:
            return Response(
                {'detail': 'Token is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user_id, email = TemporaryLoginToken.validate(temp_token)

        if not user_id or not email:
            return Response(
                {'detail': 'Invalid or expired token.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(id=user_id, email=email)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        profile = UserProfile.get_or_create_profile(user)
        display_name = profile.display_name if profile.display_name else user.email

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'email': user.email,
                'display_name': display_name,
            }
        }, status=status.HTTP_200_OK)


# Add more views here as you migrate features from the reference project


class EventViewSet(viewsets.ModelViewSet):
    """Event viewset."""
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return events for families the user belongs to."""
        user = self.request.user
        queryset = Event.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                family_id = int(family_id)
                queryset = queryset.filter(family_id=family_id)
            except (ValueError, TypeError):
                pass  # Invalid family ID, ignore filter

        # Ensure consistent ordering
        return queryset.order_by('-starts_at')

    def perform_create(self, serializer):
        """Create event with creator as created_by."""
        family = get_object_or_404(Family, id=self.request.data.get('family'))
        member = get_object_or_404(Member, user=self.request.user, family=family)
        serializer.save(created_by=member)


class ChatRoomViewSet(viewsets.ModelViewSet):
    """ChatRoom viewset."""
    serializer_class = ChatRoomSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return chat rooms where the user is a member."""
        user = self.request.user
        # Filter by rooms where the user is in the members ManyToMany field
        # This ensures users only see rooms they're actually part of
        return ChatRoom.objects.filter(members__user=user).distinct()

    def perform_create(self, serializer):
        """Create chat room with creator as created_by and invited members."""
        family_id = self.request.data.get('family')
        if not family_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'family': 'Family ID is required'})

        family = get_object_or_404(Family, id=family_id)

        # Check if user is a member of the family
        try:
            member = Member.objects.get(user=self.request.user, family=family)
        except Member.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                f'You are not a member of this family. Please join the family first.'
            )

        # Get member IDs from request
        member_ids = self.request.data.get('member_ids', [])

        # Validate that all member IDs belong to the same family
        if member_ids:
            invalid_members = Member.objects.filter(
                id__in=member_ids
            ).exclude(family=family)
            if invalid_members.exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'member_ids': 'All members must belong to the same family as the chat room.'
                })

        # Generate room name from all members (creator + invited) if not provided
        room_name = (self.request.data.get('name') or '').strip()
        if not room_name:
            # Get all members that will be in the room (creator + invited)
            all_member_ids = [member.id]
            if member_ids:
                all_member_ids.extend(member_ids)

            all_members = Member.objects.filter(id__in=all_member_ids, family=family)
            member_names = []
            for room_member in all_members:
                try:
                    if hasattr(room_member.user, 'profile') and room_member.user.profile and room_member.user.profile.display_name:
                        member_names.append(room_member.user.profile.display_name)
                    else:
                        # Use email username (part before @)
                        email_username = room_member.user.email.split('@')[0]
                        # Capitalize first letter
                        member_names.append(email_username.capitalize())
                except:
                    # Fallback to email username
                    email_username = room_member.user.email.split('@')[0]
                    member_names.append(email_username.capitalize())

            if len(member_names) == 1:
                room_name = member_names[0]
            elif len(member_names) == 2:
                room_name = f"{member_names[0]} & {member_names[1]}"
            else:
                room_name = f"{member_names[0]} & {len(member_names) - 1} others"

        # Save room with generated or provided name (or None if empty)
        save_kwargs = {'created_by': member, 'family': family}
        if room_name:
            save_kwargs['name'] = room_name
        room = serializer.save(**save_kwargs)

        # Add creator to members (always included)
        room.members.add(member)

        # Add invited members
        if member_ids:
            invited_members = Member.objects.filter(id__in=member_ids, family=family)
            room.members.add(*invited_members)

    def perform_destroy(self, instance):
        """Only allow deletion if user is the creator or is an admin/owner of the family."""
        user = self.request.user
        member = get_object_or_404(Member, user=user, family=instance.family)

        # Allow deletion if user is the creator or is admin/owner
        if instance.created_by == member or member.role in ['owner', 'admin']:
            instance.delete()
        else:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only delete rooms you created or must be an admin/owner.')


class MessageViewSet(viewsets.ModelViewSet):
    """Message viewset (creation via WebSocket, deletion via API)."""
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Disable pagination for messages - we want all messages in a room

    def get_queryset(self):
        """Return messages for rooms where the user is a member."""
        user = self.request.user
        # Filter by rooms where the user is in the members ManyToMany field
        # This ensures users only see messages from rooms they're actually part of
        queryset = Message.objects.filter(room__members__user=user).distinct()

        # Filter by room if room_id is provided
        room_id = self.request.query_params.get('room', None)
        if room_id:
            queryset = queryset.filter(room_id=room_id)

        return queryset.order_by('created_at')

    def perform_destroy(self, instance):
        """Only allow deletion if user is the sender or is an admin/owner of the family."""
        user = self.request.user
        member = get_object_or_404(Member, user=user, family=instance.room.family)

        # Allow deletion if user is the sender or is admin/owner
        if instance.sender == member or member.role in ['owner', 'admin']:
            instance.delete()
        else:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only delete your own messages or must be an admin/owner.')


class RecipeViewSet(viewsets.ModelViewSet):
    """Recipe viewset."""
    serializer_class = RecipeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return recipes for families the user belongs to."""
        user = self.request.user
        return Recipe.objects.filter(family__members__user=user)

    def perform_create(self, serializer):
        """Create recipe with creator as created_by."""
        family = get_object_or_404(Family, id=self.request.data.get('family'))
        member = get_object_or_404(Member, user=self.request.user, family=family)
        serializer.save(created_by=member)

    def perform_destroy(self, instance):
        """Allow deletion if user is a member of the recipe's family."""
        user = self.request.user
        try:
            member = Member.objects.get(user=user, family=instance.family)
            # Any family member can delete recipes
            instance.delete()
        except Member.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You must be a member of the family to delete recipes.')

    @action(detail=False, methods=['post'])
    def import_from_url(self, request):
        """Import recipe from URL."""
        from meals.importers import import_recipe_from_url, extract_ingredients_for_shopping_list

        url = request.data.get('url')
        family_id = request.data.get('family')
        list_id = request.data.get('list_id')  # Optional: add to shopping list

        if not url or not family_id:
            return Response({'error': 'URL and family are required'}, status=status.HTTP_400_BAD_REQUEST)

        # Import recipe
        recipe_data = import_recipe_from_url(url)
        if not recipe_data:
            return Response({'error': 'Failed to import recipe'}, status=status.HTTP_400_BAD_REQUEST)

        # Create recipe
        family = get_object_or_404(Family, id=family_id)
        member = get_object_or_404(Member, user=request.user, family=family)

        # Create recipe first (without image)
        recipe = Recipe.objects.create(
            family=family,
            created_by=member,
            title=recipe_data['title'],
            ingredients=recipe_data['ingredients'],
            instructions=recipe_data['instructions'],
            servings=recipe_data.get('servings'),
            prep_time_minutes=recipe_data.get('prep_time_minutes'),
            cook_time_minutes=recipe_data.get('cook_time_minutes'),
            image_url=recipe_data.get('image_url'),  # Keep original URL for reference
            source_url=recipe_data.get('source_url'),
        )

        # Download and save image if we have an image URL
        if recipe_data.get('image_url'):
            from meals.importers import download_and_save_image
            from django.core.files import File
            from django.core.files.storage import default_storage
            import os
            import logging
            logger = logging.getLogger(__name__)

            try:
                # Download image directly and save to recipe.image field
                image_url = recipe_data.get('image_url')
                if image_url:
                    import requests
                    from django.core.files.base import ContentFile
                    from urllib.parse import urlparse

                    # Extract referrer from source URL if available
                    referer = recipe_data.get('source_url', image_url)
                    if referer and '/' in referer:
                        # Get base URL for referer
                        parsed_referer = urlparse(referer)
                        referer = f'{parsed_referer.scheme}://{parsed_referer.netloc}'

                    # Download the image with proper headers to avoid 403 errors
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': referer if referer else image_url,
                        'Origin': referer if referer else image_url,
                        'Sec-Fetch-Dest': 'image',
                        'Sec-Fetch-Mode': 'no-cors',
                        'Sec-Fetch-Site': 'cross-site',
                    }
                    response = requests.get(image_url, timeout=30, headers=headers, stream=True)
                    response.raise_for_status()

                    # Check content type
                    content_type = response.headers.get('Content-Type', '')
                    if content_type.startswith('image/'):
                        # Get file extension
                        parsed_url = urlparse(image_url)
                        path = parsed_url.path
                        ext = os.path.splitext(path)[1].lower().lstrip('.')
                        if not ext:
                            content_type_map = {
                                'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
                                'image/gif': 'gif', 'image/webp': 'webp',
                            }
                            ext = content_type_map.get(content_type.split(';')[0].strip(), 'jpg')

                        # Save directly to recipe.image field
                        filename = f'recipe_{recipe.id}.{ext}'
                        recipe.image.save(filename, ContentFile(response.content), save=True)
                        recipe.refresh_from_db()
                        logger.info(f"Successfully downloaded and saved image for recipe {recipe.id}: {recipe.image.name}")
                    else:
                        logger.warning(f"URL does not point to an image: {content_type}")
            except requests.exceptions.HTTPError as e:
                # If image download fails (403, 404, etc.), log but don't fail the recipe import
                image_url = recipe_data.get('image_url', 'unknown')
                logger.warning(f"Failed to download image for recipe {recipe.id} from {image_url}: {e.response.status_code} {e.response.reason}. Recipe will be created without image.")
            except Exception as e:
                # For other errors, log but don't fail the recipe import
                image_url = recipe_data.get('image_url', 'unknown')
                logger.error(f"Error downloading/saving image for recipe {recipe.id}: {str(e)}. Recipe will be created without image.", exc_info=True)

        # Optionally add ingredients to shopping or grocery list
        if list_id:
            from lists.models import List, ListItem
            # Note: list_type is encrypted, so we check after fetching
            shopping_list = get_object_or_404(List, id=list_id, family=family)
            if shopping_list.list_type not in ['shopping', 'grocery']:
                raise Http404("List is not a shopping or grocery list")
            ingredients = extract_ingredients_for_shopping_list(recipe_data)

            for ingredient in ingredients:
                ListItem.objects.create(
                    list=shopping_list,
                    created_by=member,
                    name=ingredient['name'],
                    quantity=ingredient.get('quantity'),
                )

        serializer = self.get_serializer(recipe)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='add-to-list')
    def add_to_list(self, request, pk=None):
        """Add recipe ingredients to a shopping list."""
        from lists.models import List, ListItem
        from meals.importers import extract_ingredients_for_shopping_list

        recipe = self.get_object()
        list_id = request.data.get('list_id')

        if not list_id:
            return Response({'error': 'list_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Note: list_type is encrypted, so we check after fetching
        shopping_list = get_object_or_404(List, id=list_id, family=recipe.family)
        if shopping_list.list_type not in ['shopping', 'grocery']:
            raise Http404("List is not a shopping or grocery list")
        member = get_object_or_404(Member, user=request.user, family=recipe.family)

        recipe_data = {
            'ingredients': recipe.ingredients,
        }
        ingredients = extract_ingredients_for_shopping_list(recipe_data)

        created_items = []
        for ingredient in ingredients:
            item = ListItem.objects.create(
                list=shopping_list,
                created_by=member,
                name=ingredient['name'],
                quantity=ingredient.get('quantity'),
            )
            created_items.append(item.id)

        return Response({'added_items': created_items}, status=status.HTTP_201_CREATED)


class MealPlanViewSet(viewsets.ModelViewSet):
    """MealPlan viewset."""
    serializer_class = MealPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return meal plans for families the user belongs to."""
        user = self.request.user
        return MealPlan.objects.filter(family__members__user=user)

    def perform_create(self, serializer):
        """Create meal plan with creator as created_by."""
        family = get_object_or_404(Family, id=self.request.data.get('family'))
        member = get_object_or_404(Member, user=self.request.user, family=family)
        serializer.save(created_by=member)


class RecipeImportView(APIView):
    """Import recipe from URL."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from meals.importers import import_recipe_from_url

        url = request.data.get('url')
        family_id = request.data.get('family')

        if not url:
            return Response({'error': 'URL is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Basic URL validation
        if not url.startswith(('http://', 'https://')):
            return Response({
                'error': 'Invalid URL format',
                'detail': 'URL must start with http:// or https://'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not family_id:
            return Response({'error': 'Family is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            family = Family.objects.get(id=family_id)
        except Family.DoesNotExist:
            return Response({'error': 'Family not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            member = Member.objects.get(user=request.user, family=family)
        except Member.DoesNotExist:
            return Response({'error': 'You are not a member of this family'}, status=status.HTTP_403_FORBIDDEN)

        try:
            recipe_data = import_recipe_from_url(url)
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            print(f"Recipe import error: {error_detail}")  # Log to console for debugging
            return Response({
                'error': 'Failed to import recipe from URL',
                'detail': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

        if not recipe_data:
            return Response({
                'error': 'Failed to import recipe. The URL may not contain a valid recipe, or the site is not supported.',
                'suggestion': 'Try a recipe from sites like AllRecipes, Food Network, BBC Good Food, or any site with Schema.org recipe markup.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not recipe_data.get('title'):
            return Response({
                'error': 'Recipe import failed: Could not extract recipe title from the URL'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Validate that we have essential recipe data
        ingredients = recipe_data.get('ingredients', [])
        instructions = recipe_data.get('instructions', [])

        if not ingredients and not instructions:
            return Response({
                'error': 'Failed to import recipe: Could not extract ingredients or instructions from the URL',
                'detail': 'The recipe may not be in a supported format, or the website structure is not recognized.',
                'suggestion': 'Try a recipe from sites like AllRecipes, Food Network, BBC Good Food, or any site with Schema.org recipe markup.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not ingredients:
            return Response({
                'error': 'Failed to import recipe: Could not extract ingredients from the URL',
                'detail': 'The recipe was found but no ingredients could be extracted.',
                'suggestion': 'The recipe may be incomplete or in an unsupported format.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not instructions:
            return Response({
                'error': 'Failed to import recipe: Could not extract instructions from the URL',
                'detail': 'The recipe was found but no cooking instructions could be extracted.',
                'suggestion': 'The recipe may be incomplete or in an unsupported format.'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Create recipe first (without image)
            recipe = Recipe.objects.create(
                family=family,
                created_by=member,
                title=recipe_data['title'],
                ingredients=ingredients,
                instructions=instructions,
                servings=recipe_data.get('servings'),
                prep_time_minutes=recipe_data.get('prep_time_minutes'),
                cook_time_minutes=recipe_data.get('cook_time_minutes'),
                image_url=recipe_data.get('image_url'),  # Keep original URL for reference
                source_url=recipe_data.get('source_url', url),
            )

            # Download and save image if we have an image URL
            if recipe_data.get('image_url'):
                import requests
                import os
                from django.core.files.base import ContentFile
                from urllib.parse import urlparse
                import logging
                logger = logging.getLogger(__name__)

                try:
                    image_url = recipe_data.get('image_url')
                    # Extract referrer from source URL if available
                    referer = recipe_data.get('source_url', image_url)
                    if referer and '/' in referer:
                        # Get base URL for referer
                        parsed_referer = urlparse(referer)
                        referer = f'{parsed_referer.scheme}://{parsed_referer.netloc}'

                    # Download the image with proper headers to avoid 403 errors
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': referer if referer else image_url,
                        'Origin': referer if referer else image_url,
                        'Sec-Fetch-Dest': 'image',
                        'Sec-Fetch-Mode': 'no-cors',
                        'Sec-Fetch-Site': 'cross-site',
                    }
                    response = requests.get(image_url, timeout=30, headers=headers, stream=True)
                    response.raise_for_status()

                    # Check content type
                    content_type = response.headers.get('Content-Type', '')
                    if content_type.startswith('image/'):
                        # Get file extension
                        parsed_url = urlparse(image_url)
                        path = parsed_url.path
                        ext = os.path.splitext(path)[1].lower().lstrip('.')
                        if not ext:
                            content_type_map = {
                                'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
                                'image/gif': 'gif', 'image/webp': 'webp',
                            }
                            ext = content_type_map.get(content_type.split(';')[0].strip(), 'jpg')

                        # Save directly to recipe.image field
                        filename = f'recipe_{recipe.id}.{ext}'
                        recipe.image.save(filename, ContentFile(response.content), save=True)
                        recipe.refresh_from_db()
                        logger.info(f"Successfully downloaded and saved image for recipe {recipe.id}: {recipe.image.name}")
                    else:
                        logger.warning(f"URL does not point to an image: {content_type}")
                except Exception as e:
                    logger.error(f"Error downloading/saving image for recipe {recipe.id}: {str(e)}", exc_info=True)

            serializer = RecipeSerializer(recipe, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({
                'error': 'Failed to create recipe',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recipe_add_to_list(request, pk):
    """Add recipe ingredients to a shopping list - explicit URL handler."""
    try:
        recipe = get_object_or_404(Recipe, id=pk)
        list_id = request.data.get('list_id')

        if not list_id:
            return Response({'error': 'list_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Convert list_id to int if it's a string
        try:
            list_id = int(list_id)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid list_id format'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if list exists and belongs to the recipe's family (shopping or grocery)
        # Note: list_type is encrypted, so we need to check after fetching
        from lists.models import List, ListItem
        from meals.importers import extract_ingredients_for_shopping_list
        from lists.utils import assign_category_to_item

        try:
            shopping_list = List.objects.get(id=list_id, family=recipe.family)
            # Verify list_type is shopping or grocery (encrypted field comparison)
            if shopping_list.list_type not in ['shopping', 'grocery']:
                raise List.DoesNotExist
        except List.DoesNotExist:
            # Check if list exists at all
            list_exists = List.objects.filter(id=list_id).exists()
            if not list_exists:
                return Response({
                    'error': f'Shopping list with ID {list_id} does not exist'
                }, status=status.HTTP_404_NOT_FOUND)

            # Check if list belongs to a different family
            list_family = List.objects.filter(id=list_id).first()
            if list_family and list_family.family_id != recipe.family_id:
                return Response({
                    'error': f'Shopping list belongs to a different family. Recipe family: {recipe.family_id}, List family: {list_family.family_id}'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Check if list is not a shopping or grocery list
            if list_family and list_family.list_type not in ['shopping', 'grocery']:
                return Response({
                    'error': f'List is not a shopping or grocery list. List type: {list_family.list_type}'
                }, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                'error': 'Shopping list not found or does not belong to this recipe\'s family'
            }, status=status.HTTP_404_NOT_FOUND)

        # Check if user is a member of the family
        try:
            member = Member.objects.get(user=request.user, family=recipe.family)
        except Member.DoesNotExist:
            return Response({
                'error': 'You are not a member of this recipe\'s family'
            }, status=status.HTTP_403_FORBIDDEN)

        recipe_data = {
            'ingredients': recipe.ingredients,
        }
        ingredients = extract_ingredients_for_shopping_list(recipe_data)

        if not ingredients:
            return Response({
                'error': 'No ingredients found in recipe'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Get existing items to check for duplicates
        existing_items = ListItem.objects.filter(list=shopping_list, completed=False)
        existing_names = {item.name.lower().strip() for item in existing_items}

        created_items = []
        skipped_duplicates = []
        categorized_items = []
        uncategorized_items = []
        uncategorized_item_names = []

        for ingredient in ingredients:
            ingredient_name = ingredient['name'].strip()
            ingredient_name_lower = ingredient_name.lower()

            # Check if duplicate exists (case-insensitive)
            if ingredient_name_lower in existing_names:
                skipped_duplicates.append(ingredient_name)
                continue

            # Create new item with recipe name in notes
            item = ListItem.objects.create(
                list=shopping_list,
                created_by=member,
                name=ingredient_name,
                quantity=ingredient.get('quantity'),
                notes=f"From recipe: {recipe.title}",
            )
            created_items.append(item.id)
            # Add to existing names to prevent duplicates within the same batch
            existing_names.add(ingredient_name_lower)

            # Auto-assign category for grocery lists
            if shopping_list.list_type == 'grocery':
                item, category_assigned, category_name = assign_category_to_item(item, recipe.family)
                if category_assigned:
                    categorized_items.append(item.id)
                else:
                    uncategorized_items.append(item.id)
                    uncategorized_item_names.append(ingredient_name)

        # Build response message
        response_data = {
            'added_count': len(created_items),
            'skipped_count': len(skipped_duplicates),
            'added_items': created_items,
        }

        # Add category information if this is a grocery list
        if shopping_list.list_type == 'grocery':
            response_data['categorized_items'] = categorized_items
            response_data['uncategorized_items'] = uncategorized_items
            response_data['uncategorized_item_names'] = uncategorized_item_names

        if created_items and skipped_duplicates:
            response_data['message'] = f'Added {len(created_items)} new ingredient(s). {len(skipped_duplicates)} duplicate(s) skipped.'
            response_data['skipped_items'] = skipped_duplicates
        elif created_items:
            response_data['message'] = f'Successfully added {len(created_items)} ingredient(s) to shopping list!'
        elif skipped_duplicates:
            response_data['message'] = f'All {len(skipped_duplicates)} ingredient(s) already exist in the list and were skipped.'
            response_data['skipped_items'] = skipped_duplicates
        else:
            response_data['message'] = 'No ingredients to add.'

        # Use 200 OK if no items were added (all duplicates), 201 Created if items were added
        status_code = status.HTTP_201_CREATED if created_items else status.HTTP_200_OK
        return Response(response_data, status=status_code)
    except Exception as e:
        import traceback
        return Response({
            'error': 'Failed to add ingredients to list',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# OAuth Views for Sync Services
# ============================================================================

import secrets
import requests
from urllib.parse import quote
from django.utils import timezone
from datetime import timedelta
from django.core.cache import cache
from encryption.utils import get_session_user_key, set_session_user_key, get_user_key_from_request
from events.models import CalendarSync
from documents.models import OneDriveSync, GoogleDriveSync, GooglePhotosSync, Document, Folder
from documents.googledrive_sync import GoogleDriveSync as GoogleDriveSyncService
from documents.serializers import DocumentSerializer, FolderSerializer
from django.http import FileResponse, HttpResponse
from django.core.files.base import ContentFile
import os


# Outlook Calendar OAuth
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def OutlookOAuthInitiateView(request):
    """Initiate OAuth flow for Outlook Calendar."""
    from django.conf import settings

    client_id = settings.MICROSOFT_CLIENT_ID
    redirect_uri = settings.MICROSOFT_REDIRECT_URI

    if not client_id:
        return Response({'error': 'Microsoft OAuth not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Generate state token for CSRF protection
    state = secrets.token_urlsafe(32)
    cache.set(f'outlook_oauth_state_{request.user.id}', state, timeout=600)
    cache.set(f'outlook_oauth_user_{state}', request.user.id, timeout=600)

    # Store JWT token for encryption
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        jwt_token = auth_header.split(' ')[1]
        cache.set(f'outlook_oauth_jwt_{state}', jwt_token, timeout=600)

    # Store family_id if provided
    family_id = request.GET.get('family_id')
    if family_id:
        cache.set(f'outlook_oauth_family_{state}', family_id, timeout=600)

    # Detect if this is a mobile request
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    is_mobile = 'Mobile' in user_agent or 'Expo' in user_agent or request.GET.get('mobile') == 'true'
    cache.set(f'outlook_oauth_mobile_{state}', is_mobile, timeout=600)

    # Microsoft OAuth 2.0 authorization URL
    tenant = 'consumers'
    login_hint = request.user.email if request.user.is_authenticated else None

    auth_url = (
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?"
        f"client_id={client_id}&"
        f"response_type=code&"
        f"redirect_uri={quote(redirect_uri)}&"
        f"response_mode=query&"
        f"scope=offline_access%20Calendars.ReadWrite&"
        f"state={state}"
    )

    if login_hint:
        auth_url += f"&login_hint={quote(login_hint)}"

    return Response({'auth_url': auth_url, 'state': state})


@api_view(['GET'])
@permission_classes([AllowAny])  # AllowAny because callback comes from OAuth provider
def OutlookOAuthCallbackView(request):
    """Handle OAuth callback from Microsoft for Outlook Calendar."""
    from django.conf import settings

    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    if error:
        return Response({
            'error': 'OAuth error',
            'detail': request.GET.get('error_description', error)
        }, status=status.HTTP_400_BAD_REQUEST)

    if not code or not state:
        return Response({
            'error': 'Missing authorization code or state'
        }, status=status.HTTP_400_BAD_REQUEST)

    # Get user from cache
    user_id = cache.get(f'outlook_oauth_user_{state}')
    jwt_token = cache.get(f'outlook_oauth_jwt_{state}')
    family_id = cache.get(f'outlook_oauth_family_{state}')
    is_mobile = cache.get(f'outlook_oauth_mobile_{state}', False)

    if not user_id:
        return Response({
            'error': 'Invalid or expired state token'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({
            'error': 'User not found'
        }, status=status.HTTP_404_NOT_FOUND)

    # Get user encryption key from cache or request
    user_key = None
    if jwt_token:
        user_key = get_session_user_key(user_id)

    # If not in cache, we can't encrypt - return error
    if not user_key:
        # Provide helpful error message
        error_msg = (
            'User encryption key not found in session. '
            'This usually happens if you logged in before the encryption key was cached, '
            'or if your session expired. Please log out and log back in, then try connecting Outlook again.'
        )
        return Response({
            'error': error_msg,
            'detail': 'The encryption key is cached when you log in. Please ensure you are logged in and try again.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    # Exchange code for tokens
    tenant = 'consumers'
    token_url = f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
    token_data = {
        'client_id': settings.MICROSOFT_CLIENT_ID,
        'client_secret': settings.MICROSOFT_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': settings.MICROSOFT_REDIRECT_URI,
    }

    response = requests.post(token_url, data=token_data)
    if response.status_code != 200:
        return Response({
            'error': 'Failed to exchange authorization code',
            'detail': response.text
        }, status=status.HTTP_400_BAD_REQUEST)

    token_response = response.json()
    access_token = token_response.get('access_token')
    refresh_token = token_response.get('refresh_token')
    expires_in = token_response.get('expires_in', 3600)

    # Get Outlook email
    outlook_email = user.email
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        me_response = requests.get('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', headers=headers)
        if me_response.status_code == 200:
            me_data = me_response.json()
            outlook_email = me_data.get('mail') or me_data.get('userPrincipalName', user.email)
    except:
        pass

    # Get calendars
    try:
        calendars_response = requests.get('https://graph.microsoft.com/v1.0/me/calendars', headers=headers)
        calendars = calendars_response.json().get('value', []) if calendars_response.status_code == 200 else []
        calendar = calendars[0] if calendars else None
        calendar_id = calendar.get('id') if calendar else 'primary'
        calendar_name = calendar.get('name', 'Calendar') if calendar else 'Calendar'
    except:
        calendar_id = 'primary'
        calendar_name = 'Calendar'

    # Get or create member
    if not family_id:
        member_obj = Member.objects.filter(user=user).first()
        if member_obj:
            family_id = member_obj.family.id
        else:
            return Response({
                'error': 'No family found. Please create a family first.'
            }, status=status.HTTP_400_BAD_REQUEST)

    family = get_object_or_404(Family, id=family_id)
    member = get_object_or_404(Member, user=user, family=family)

    # Save sync record
    sync_record, created = CalendarSync.objects.update_or_create(
        member=member,
        sync_type='outlook',
        calendar_id=calendar_id,
        defaults={
            'calendar_name': calendar_name,
            'outlook_email': outlook_email,
            'token_expires_at': timezone.now() + timedelta(seconds=expires_in),
            'sync_enabled': True,
        }
    )
    sync_record.encrypt_tokens(access_token, refresh_token, user_key=user_key)

    # Clean up cache
    cache.delete(f'outlook_oauth_user_{state}')
    cache.delete(f'outlook_oauth_state_{user_id}')
    cache.delete(f'outlook_oauth_family_{state}')
    cache.delete(f'outlook_oauth_jwt_{state}')
    cache.delete(f'outlook_oauth_mobile_{state}')

    # Check if this is a mobile OAuth request
    if is_mobile:
        # For mobile, redirect to deep link
        deep_link = f'kewlkids://oauth/callback?service=outlook&success=true&message={quote(f"Outlook calendar {calendar_name} connected successfully!")}'
        from django.http import HttpResponse
        import html as html_escape
        escaped_link = html_escape.escape(deep_link)
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Outlook Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">Outlook Connected!</h2>
        <button onclick="window.close()" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">OK</button>
    </div>
    <script>
        var link = "{escaped_link}";
        window.location.href = link;
        setTimeout(function(){{ window.location.href = link; }}, 100);
    </script>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')
    else:
        # For web, return JSON
        return Response({
            'success': True,
            'message': f'Outlook calendar "{calendar_name}" connected successfully!',
            'email': outlook_email,
            'calendar_name': calendar_name,
        })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def OutlookConnectionView(request):
    """Check Outlook calendar connection status."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'connected': False})

    sync = CalendarSync.objects.filter(member=member, sync_type='outlook', sync_enabled=True).first()
    if sync:
        return Response({
            'connected': True,
            'email': sync.outlook_email if hasattr(sync, 'outlook_email') else None,
            'calendar_name': sync.calendar_name,
            'connected_at': sync.created_at,
        })
    return Response({'connected': False})


# OneDrive OAuth
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def OneDriveOAuthInitiateView(request):
    """Initiate OAuth flow for OneDrive."""
    from django.conf import settings
    from encryption.utils import get_session_user_key

    client_id = settings.ONEDRIVE_CLIENT_ID
    redirect_uri = settings.ONEDRIVE_REDIRECT_URI

    if not client_id:
        return Response({'error': 'OneDrive OAuth not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Ensure encryption key is in cache (refresh if exists, error if not)
    user_key = get_session_user_key(request.user.id, auto_refresh=True)
    if not user_key:
        return Response({
            'error': 'User encryption key not found in session. Please log out and log back in, then try connecting OneDrive again.',
            'detail': 'The encryption key is cached when you log in. Your session may have expired.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    state = secrets.token_urlsafe(32)
    cache.set(f'onedrive_oauth_state_{request.user.id}', state, timeout=600)
    cache.set(f'onedrive_oauth_user_{state}', request.user.id, timeout=600)

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        jwt_token = auth_header.split(' ')[1]
        cache.set(f'onedrive_oauth_jwt_{state}', jwt_token, timeout=600)

    # Detect if this is a mobile request
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    is_mobile = 'Mobile' in user_agent or 'Expo' in user_agent or request.GET.get('mobile') == 'true'
    cache.set(f'onedrive_oauth_mobile_{state}', is_mobile, timeout=600)

    tenant = 'consumers'
    login_hint = request.user.email if request.user.is_authenticated else None

    auth_url = (
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?"
        f"client_id={client_id}&"
        f"response_type=code&"
        f"redirect_uri={quote(redirect_uri)}&"
        f"response_mode=query&"
        f"scope=offline_access%20Files.ReadWrite&"
        f"state={state}"
    )

    if login_hint:
        auth_url += f"&login_hint={quote(login_hint)}"

    return Response({'auth_url': auth_url, 'state': state})


@api_view(['GET'])
@permission_classes([AllowAny])
def OneDriveOAuthCallbackView(request):
    """Handle OAuth callback from Microsoft for OneDrive."""
    from django.conf import settings

    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    if error:
        return Response({
            'error': 'OAuth error',
            'detail': request.GET.get('error_description', error)
        }, status=status.HTTP_400_BAD_REQUEST)

    if not code or not state:
        return Response({
            'error': 'Missing authorization code or state'
        }, status=status.HTTP_400_BAD_REQUEST)

    user_id = cache.get(f'onedrive_oauth_user_{state}')
    jwt_token = cache.get(f'onedrive_oauth_jwt_{state}')
    is_mobile = cache.get(f'onedrive_oauth_mobile_{state}', False)

    if not user_id:
        return Response({
            'error': 'Invalid or expired state token'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({
            'error': 'User not found'
        }, status=status.HTTP_404_NOT_FOUND)

    user_key = get_session_user_key(user_id) if jwt_token else None
    if not user_key:
        # Provide helpful error message
        error_msg = (
            'User encryption key not found in session. '
            'This usually happens if you logged in before the encryption key was cached, '
            'or if your session expired. Please log out and log back in, then try connecting OneDrive again.'
        )
        return Response({
            'error': error_msg,
            'detail': 'The encryption key is cached when you log in. Please ensure you are logged in and try again.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    # Exchange code for tokens
    tenant = 'consumers'
    token_url = f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
    token_data = {
        'client_id': settings.ONEDRIVE_CLIENT_ID,
        'client_secret': settings.ONEDRIVE_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': settings.ONEDRIVE_REDIRECT_URI,
    }

    response = requests.post(token_url, data=token_data)
    if response.status_code != 200:
        return Response({
            'error': 'Failed to exchange authorization code',
            'detail': response.text
        }, status=status.HTTP_400_BAD_REQUEST)

    token_response = response.json()
    access_token = token_response.get('access_token')
    refresh_token = token_response.get('refresh_token')
    expires_in = token_response.get('expires_in', 3600)

    # Get OneDrive email
    onedrive_email = user.email
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        me_response = requests.get('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', headers=headers)
        if me_response.status_code == 200:
            me_data = me_response.json()
            onedrive_email = me_data.get('mail') or me_data.get('userPrincipalName', user.email)
    except:
        pass

    # Get or create member
    member_obj = Member.objects.filter(user=user).first()
    if not member_obj:
        return Response({
            'error': 'No family found. Please create a family first.'
        }, status=status.HTTP_400_BAD_REQUEST)

    # Save sync record
    sync_record, created = OneDriveSync.objects.update_or_create(
        member=member_obj,
        defaults={
            'onedrive_email': onedrive_email,
            'token_expires_at': timezone.now() + timedelta(seconds=expires_in),
            'is_active': True,
        }
    )
    sync_record.encrypt_tokens(access_token, refresh_token, user_key=user_key)

    # Clean up cache
    cache.delete(f'onedrive_oauth_user_{state}')
    cache.delete(f'onedrive_oauth_state_{user_id}')
    cache.delete(f'onedrive_oauth_jwt_{state}')
    cache.delete(f'onedrive_oauth_mobile_{state}')

    # Check if this is a mobile OAuth request
    if is_mobile:
        # For mobile, redirect to deep link using HTML with JavaScript (Django blocks custom schemes in HttpResponseRedirect)
        deep_link = f'kewlkids://oauth/callback?service=onedrive&success=true&message={quote("OneDrive connected successfully!")}'
        from django.http import HttpResponse
        import html as html_escape
        escaped_link = html_escape.escape(deep_link)
        # Escape for use in onclick attribute (need to escape quotes for JavaScript)
        onclick_link = deep_link.replace("'", "\\'").replace('"', '\\"')
        # Simple success page with OK button
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OneDrive Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">OneDrive Connected!</h2>
        <button onclick="window.location.href='{onclick_link}'; window.close();" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">OK</button>
    </div>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')
    else:
        # For web, redirect to web app with success parameters
        from django.http import HttpResponse
        import html as html_escape
        # Get the web app URL from referer or use default
        referer = request.META.get('HTTP_REFERER', '')
        web_app_url = 'http://localhost:8081'  # Default Expo web port
        if referer:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                # If referer is from ngrok or localhost, use that
                if 'ngrok' in parsed.netloc:
                    web_app_url = f'{parsed.scheme}://{parsed.netloc}'
                elif 'localhost' in parsed.netloc or '127.0.0.1' in parsed.netloc:
                    web_app_url = f'{parsed.scheme}://{parsed.netloc}'
            except:
                pass

        redirect_url = f'{web_app_url}/(tabs)/onedrive-connect?success=true&service=onedrive&message={quote("OneDrive connected successfully!")}'
        escaped_url = html_escape.escape(redirect_url)
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OneDrive Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">OneDrive Connected!</h2>
        <p style="color:#666666;margin-bottom:20px;">Redirecting back to app...</p>
        <button onclick="window.location.href='{escaped_url}'" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin-top:20px;">OK</button>
    </div>
    <script>
        // Redirect to web app automatically
        window.location.href = "{escaped_url}";
    </script>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def OneDriveConnectionView(request):
    """Check OneDrive connection status."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'connected': False})

    sync = OneDriveSync.objects.filter(member=member, is_active=True).first()
    if sync:
        return Response({
            'connected': True,
            'email': sync.onedrive_email if hasattr(sync, 'onedrive_email') else None,
            'connected_at': sync.connected_at,
        })
    return Response({'connected': False})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def OneDriveDisconnectView(request):
    """Disconnect OneDrive account."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'No family found'}, status=status.HTTP_404_NOT_FOUND)

    sync = OneDriveSync.objects.filter(member=member, is_active=True).first()
    if sync:
        sync.is_active = False
        sync.save()
        return Response({'success': True, 'message': 'OneDrive disconnected successfully'})

    return Response({'error': 'OneDrive not connected'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def OneDriveListFilesView(request):
    """List files/folders in OneDrive."""
    from documents.models import OneDriveSync
    from documents.onedrive_sync import OneDriveSync as OneDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = OneDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'OneDrive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    folder_id = request.GET.get('folder_id')  # None for root

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = OneDriveSyncService(access_token, refresh_token)
        files = sync.list_files(folder_id)

        # Normalize files to ensure consistent structure
        # Microsoft Graph API returns items with 'name', 'id', 'folder', 'file', etc.
        normalized_files = []
        for file_item in files:
            normalized_item = {
                'id': file_item.get('id', ''),
                'name': file_item.get('name', 'Unknown'),
                'folder': 'folder' in file_item,
                'mimeType': file_item.get('file', {}).get('mimeType') if 'file' in file_item else None,
                'size': file_item.get('size'),
                'lastModifiedDateTime': file_item.get('lastModifiedDateTime'),
                'createdDateTime': file_item.get('createdDateTime'),
                'webUrl': file_item.get('webUrl'),
            }
            # If it's a folder, set folder flag
            if 'folder' in file_item:
                normalized_item['folder'] = True
            normalized_files.append(normalized_item)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response({'files': normalized_files}, status=status.HTTP_200_OK)
    except ValueError as e:
        error_msg = str(e).lower()
        # Check if it's a session key issue (not OAuth expiration)
        if 'not in session' in error_msg or 'password required' in error_msg:
            # Session key expired - user needs to refresh/login, not reconnect OAuth
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your OneDrive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        # Check if it's a decryption failure (wrong key, corrupted data)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt OneDrive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            # Other ValueError - log and return generic error
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive list files error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"OneDrive list files error: {str(e)}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def OneDriveUploadFileView(request):
    """Upload file to OneDrive."""
    from documents.models import OneDriveSync
    from documents.onedrive_sync import OneDriveSync as OneDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = OneDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'OneDrive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    if 'file' not in request.FILES:
        return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

    uploaded_file = request.FILES['file']
    folder_id = request.data.get('folder_id')  # None for root

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = OneDriveSyncService(access_token, refresh_token)

        # Read file content
        file_data = uploaded_file.read()
        filename = uploaded_file.name

        result = sync.upload_file(file_data, filename, folder_id)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        error_msg = str(e).lower()
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your OneDrive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt OneDrive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive upload error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def OneDriveCreateFolderView(request):
    """Create folder in OneDrive."""
    from documents.models import OneDriveSync
    from documents.onedrive_sync import OneDriveSync as OneDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = OneDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'OneDrive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    name = request.data.get('name')
    if not name:
        return Response({'error': 'Folder name required'}, status=status.HTTP_400_BAD_REQUEST)

    parent_folder_id = request.data.get('parent_folder_id')  # None for root

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = OneDriveSyncService(access_token, refresh_token)
        result = sync.create_folder(name, parent_folder_id)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        error_msg = str(e).lower()
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your OneDrive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt OneDrive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive create folder error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def OneDriveDeleteItemView(request, item_id):
    """Delete file or folder from OneDrive."""
    from documents.models import OneDriveSync
    from documents.onedrive_sync import OneDriveSync as OneDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = OneDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'OneDrive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = OneDriveSyncService(access_token, refresh_token)
        sync.delete_item(item_id)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response({'message': 'Item deleted successfully'}, status=status.HTTP_200_OK)
    except ValueError as e:
        error_msg = str(e).lower()
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your OneDrive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt OneDrive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"OneDrive delete error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Google Drive OAuth
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def GoogleDriveOAuthInitiateView(request):
    """Initiate OAuth flow for Google Drive."""
    from django.conf import settings
    from encryption.utils import get_session_user_key

    client_id = settings.GOOGLEDRIVE_CLIENT_ID
    redirect_uri = settings.GOOGLEDRIVE_REDIRECT_URI

    if not client_id:
        return Response({'error': 'Google Drive OAuth not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Ensure encryption key is in cache (refresh if exists, error if not)
    user_key = get_session_user_key(request.user.id, auto_refresh=True)
    if not user_key:
        return Response({
            'error': 'User encryption key not found in session. Please log out and log back in, then try connecting Google Drive again.',
            'detail': 'The encryption key is cached when you log in. Your session may have expired.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    state = secrets.token_urlsafe(32)
    cache.set(f'googledrive_oauth_state_{request.user.id}', state, timeout=600)
    cache.set(f'googledrive_oauth_user_{state}', request.user.id, timeout=600)

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        jwt_token = auth_header.split(' ')[1]
        cache.set(f'googledrive_oauth_jwt_{state}', jwt_token, timeout=600)

    # Detect if this is a mobile request
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    is_mobile = 'Mobile' in user_agent or 'Expo' in user_agent or request.GET.get('mobile') == 'true'
    cache.set(f'googledrive_oauth_mobile_{state}', is_mobile, timeout=600)

    # Request offline access so we get a long-lived refresh token.
    # Also include prompt=consent so Google will actually send a refresh token
    # even if the user has previously granted access.
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={quote(redirect_uri)}&"
        f"response_type=code&"
        f"scope=https://www.googleapis.com/auth/drive&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"
    )

    return Response({'auth_url': auth_url, 'state': state})


@api_view(['GET'])
@permission_classes([AllowAny])
def GoogleDriveOAuthCallbackView(request):
    """Handle OAuth callback from Google for Google Drive."""
    from django.conf import settings

    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    if error:
        return Response({
            'error': 'OAuth error',
            'detail': request.GET.get('error_description', error)
        }, status=status.HTTP_400_BAD_REQUEST)

    if not code or not state:
        return Response({
            'error': 'Missing authorization code or state'
        }, status=status.HTTP_400_BAD_REQUEST)

    user_id = cache.get(f'googledrive_oauth_user_{state}')
    jwt_token = cache.get(f'googledrive_oauth_jwt_{state}')
    is_mobile = cache.get(f'googledrive_oauth_mobile_{state}', False)

    if not user_id:
        return Response({
            'error': 'Invalid or expired state token'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({
            'error': 'User not found'
        }, status=status.HTTP_404_NOT_FOUND)

    user_key = get_session_user_key(user_id) if jwt_token else None
    if not user_key:
        # Provide helpful error message
        error_msg = (
            'User encryption key not found in session. '
            'This usually happens if you logged in before the encryption key was cached, '
            'or if your session expired. Please log out and log back in, then try connecting Google Drive again.'
        )
        return Response({
            'error': error_msg,
            'detail': 'The encryption key is cached when you log in. Please ensure you are logged in and try again.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    # Exchange code for tokens
    token_url = 'https://oauth2.googleapis.com/token'
    token_data = {
        'client_id': settings.GOOGLEDRIVE_CLIENT_ID,
        'client_secret': settings.GOOGLEDRIVE_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': settings.GOOGLEDRIVE_REDIRECT_URI,
    }

    response = requests.post(token_url, data=token_data)
    if response.status_code != 200:
        return Response({
            'error': 'Failed to exchange authorization code',
            'detail': response.text
        }, status=status.HTTP_400_BAD_REQUEST)

    token_response = response.json()
    access_token = token_response.get('access_token')
    refresh_token = token_response.get('refresh_token')
    expires_in = token_response.get('expires_in', 3600)

    # Get Google email
    googledrive_email = user.email
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        me_response = requests.get('https://www.googleapis.com/oauth2/v2/userinfo', headers=headers)
        if me_response.status_code == 200:
            me_data = me_response.json()
            googledrive_email = me_data.get('email', user.email)
    except:
        pass

    # Get or create member
    member_obj = Member.objects.filter(user=user).first()
    if not member_obj:
        return Response({
            'error': 'No family found. Please create a family first.'
        }, status=status.HTTP_400_BAD_REQUEST)

    # Save sync record
    sync_record, created = GoogleDriveSync.objects.update_or_create(
        member=member_obj,
        defaults={
            'googledrive_email': googledrive_email,
            'token_expires_at': timezone.now() + timedelta(seconds=expires_in),
            'is_active': True,
        }
    )

    # Google will often omit refresh_token on subsequent consents.
    # If we already have a stored refresh token and Google didn't send a new one,
    # keep the existing token instead of overwriting it with None.
    if not refresh_token and not created and sync_record.refresh_token_encrypted:
        try:
            _old_access, old_refresh = sync_record.decrypt_tokens(user_key=user_key)
            if old_refresh:
                refresh_token = old_refresh
        except ValueError:
            # If decryption fails, fall back to whatever we got from Google
            pass

    sync_record.encrypt_tokens(access_token, refresh_token, user_key=user_key)

    # Clean up cache
    cache.delete(f'googledrive_oauth_user_{state}')
    cache.delete(f'googledrive_oauth_state_{user_id}')
    cache.delete(f'googledrive_oauth_jwt_{state}')
    cache.delete(f'googledrive_oauth_mobile_{state}')

    # Check if this is a mobile OAuth request
    if is_mobile:
        # For mobile, redirect to deep link using HTML with JavaScript (Django blocks custom schemes in HttpResponseRedirect)
        deep_link = f'kewlkids://oauth/callback?service=googledrive&success=true&message={quote("Google Drive connected successfully!")}'
        from django.http import HttpResponse
        import html as html_escape
        import json
        # Simple success page with OK button
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Drive Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">Google Drive Connected!</h2>
        <button id="okBtn" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">OK</button>
    </div>
    <script>
        (function() {{
            var link = {json.dumps(deep_link)};
            document.getElementById('okBtn').onclick = function() {{
                window.location.href = link;
                window.close();
            }};
        }})();
    </script>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')
    else:
        # For web, redirect to web app with success parameters
        from django.http import HttpResponse
        import html as html_escape
        # Get the web app URL from referer or use default
        referer = request.META.get('HTTP_REFERER', '')
        web_app_url = 'http://localhost:8081'  # Default Expo web port
        if referer:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                # If referer is from ngrok or localhost, use that
                if 'ngrok' in parsed.netloc:
                    web_app_url = f'{parsed.scheme}://{parsed.netloc}'
                elif 'localhost' in parsed.netloc or '127.0.0.1' in parsed.netloc:
                    web_app_url = f'{parsed.scheme}://{parsed.netloc}'
            except:
                pass

        redirect_url = f'{web_app_url}/(tabs)/googledrive-connect?success=true&service=googledrive&message={quote("Google Drive connected successfully!")}'
        escaped_url = html_escape.escape(redirect_url)
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Drive Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">Google Drive Connected!</h2>
        <p style="color:#666666;margin-bottom:20px;">Redirecting back to app...</p>
        <button onclick="window.location.href='{escaped_url}'" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin-top:20px;">OK</button>
    </div>
    <script>
        // Redirect to web app automatically
        window.location.href = "{escaped_url}";
    </script>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def GoogleDriveConnectionView(request):
    """Check Google Drive connection status."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'connected': False})

    sync = GoogleDriveSync.objects.filter(member=member, is_active=True).first()
    if sync:
        return Response({
            'connected': True,
            'email': sync.googledrive_email if hasattr(sync, 'googledrive_email') else None,
            'connected_at': sync.connected_at,
        })
    return Response({'connected': False})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def GoogleDriveDisconnectView(request):
    """Disconnect Google Drive account."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'No family found'}, status=status.HTTP_404_NOT_FOUND)

    sync = GoogleDriveSync.objects.filter(member=member, is_active=True).first()
    if sync:
        sync.is_active = False
        sync.save()
        return Response({'success': True, 'message': 'Google Drive disconnected successfully'})

    return Response({'error': 'Google Drive not connected'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def GoogleDriveListFilesView(request):
    """List files/folders in Google Drive."""
    from documents.models import GoogleDriveSync
    from documents.googledrive_sync import GoogleDriveSync as GoogleDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = GoogleDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'Google Drive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    folder_id = request.GET.get('folder_id')  # None for root

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = GoogleDriveSyncService(access_token, refresh_token)
        files = sync.list_files(folder_id)

        # Normalize files to ensure consistent structure
        # Google Drive API already returns normalized structure from googledrive_sync
        # But ensure name is always present
        normalized_files = []
        for file_item in files:
            normalized_item = {
                'id': file_item.get('id', ''),
                'name': file_item.get('name', 'Unknown'),
                'folder': file_item.get('folder', False),
                'mimeType': file_item.get('mimeType'),
                'size': file_item.get('size'),
                'modifiedTime': file_item.get('modifiedTime'),
                'createdTime': file_item.get('createdTime'),
                'webViewLink': file_item.get('webViewLink'),
                'parents': file_item.get('parents', []),
            }
            normalized_files.append(normalized_item)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response({'files': normalized_files}, status=status.HTTP_200_OK)
    except ValueError as e:
        error_msg = str(e).lower()
        # Check if it's a session key issue (not OAuth expiration)
        if 'not in session' in error_msg or 'password required' in error_msg:
            # Session key expired - user needs to refresh/login, not reconnect OAuth
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your Google Drive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        # Check if it's a decryption failure (wrong key, corrupted data)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt Google Drive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            # Other ValueError - log and return generic error
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive list files error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Google Drive list files error: {str(e)}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def GoogleDriveUploadFileView(request):
    """Upload file to Google Drive."""
    from documents.models import GoogleDriveSync
    from documents.googledrive_sync import GoogleDriveSync as GoogleDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = GoogleDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'Google Drive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    if 'file' not in request.FILES:
        return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

    uploaded_file = request.FILES['file']
    folder_id = request.data.get('folder_id')  # None for root

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = GoogleDriveSyncService(access_token, refresh_token)

        # Read file content
        file_data = uploaded_file.read()
        filename = uploaded_file.name

        result = sync.upload_file(file_data, filename, folder_id)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        error_msg = str(e).lower()
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your Google Drive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt Google Drive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive upload error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def GoogleDriveCreateFolderView(request):
    """Create folder in Google Drive."""
    from documents.models import GoogleDriveSync
    from documents.googledrive_sync import GoogleDriveSync as GoogleDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = GoogleDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'Google Drive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    name = request.data.get('name')
    if not name:
        return Response({'error': 'Folder name is required'}, status=status.HTTP_400_BAD_REQUEST)

    folder_id = request.data.get('folder_id')  # None for root

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = GoogleDriveSyncService(access_token, refresh_token)
        result = sync.create_folder(name, folder_id)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        error_msg = str(e).lower()
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your Google Drive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt Google Drive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive create folder error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def GoogleDriveDeleteItemView(request, item_id):
    """Delete file or folder from Google Drive."""
    from documents.models import GoogleDriveSync
    from documents.googledrive_sync import GoogleDriveSync as GoogleDriveSyncService

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = GoogleDriveSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'Google Drive not connected'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request
        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        sync = GoogleDriveSyncService(access_token, refresh_token)
        sync.delete_item(item_id)

        # Refresh token if it was updated
        if sync.access_token != access_token:
            sync_record.update_tokens(
                sync.access_token,
                sync.refresh_token if sync.refresh_token else refresh_token,
                user_key=user_key
            )

        return Response({'message': 'Item deleted successfully'}, status=status.HTTP_200_OK)
    except ValueError as e:
        error_msg = str(e).lower()
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response({
                'error': 'Session expired. Please refresh the page or log in again.',
                'detail': 'Your session key has expired. Your Google Drive connection is still valid.',
                'requires_refresh': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive decryption error: {str(e)}", exc_info=True)
            return Response({
                'error': 'Unable to decrypt Google Drive tokens. Please disconnect and reconnect.',
                'detail': str(e),
                'requires_reconnect': True
            }, status=status.HTTP_401_UNAUTHORIZED)
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Google Drive delete error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Google Photos OAuth
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def GooglePhotosOAuthInitiateView(request):
    """Initiate OAuth flow for Google Photos."""
    from django.conf import settings
    from encryption.utils import get_session_user_key

    client_id = settings.GOOGLE_PHOTOS_CLIENT_ID
    redirect_uri = settings.GOOGLE_PHOTOS_REDIRECT_URI

    if not client_id:
        return Response({'error': 'Google Photos OAuth not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Ensure encryption key is in cache (refresh if exists, error if not)
    user_key = get_session_user_key(request.user.id, auto_refresh=True)
    if not user_key:
        return Response({
            'error': 'User encryption key not found in session. Please log out and log back in, then try connecting Google Photos again.',
            'detail': 'The encryption key is cached when you log in. Your session may have expired.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    state = secrets.token_urlsafe(32)
    cache.set(f'googlephotos_oauth_state_{request.user.id}', state, timeout=600)
    cache.set(f'googlephotos_oauth_user_{state}', request.user.id, timeout=600)

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        jwt_token = auth_header.split(' ')[1]
        cache.set(f'googlephotos_oauth_jwt_{state}', jwt_token, timeout=600)

    # Detect if this is a mobile request
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    is_mobile = 'Mobile' in user_agent or 'Expo' in user_agent or request.GET.get('mobile') == 'true'
    cache.set(f'googlephotos_oauth_mobile_{state}', is_mobile, timeout=600)

    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={quote(redirect_uri)}&"
        f"response_type=code&"
        f"scope=https://www.googleapis.com/auth/drive.readonly&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"
    )

    return Response({'auth_url': auth_url, 'state': state})


@api_view(['GET'])
@permission_classes([AllowAny])
def GooglePhotosOAuthCallbackView(request):
    """Handle OAuth callback from Google for Google Photos."""
    from django.conf import settings

    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    if error:
        return Response({
            'error': 'OAuth error',
            'detail': request.GET.get('error_description', error)
        }, status=status.HTTP_400_BAD_REQUEST)

    if not code or not state:
        return Response({
            'error': 'Missing authorization code or state'
        }, status=status.HTTP_400_BAD_REQUEST)

    user_id = cache.get(f'googlephotos_oauth_user_{state}')
    jwt_token = cache.get(f'googlephotos_oauth_jwt_{state}')
    is_mobile = cache.get(f'googlephotos_oauth_mobile_{state}', False)

    if not user_id:
        return Response({
            'error': 'Invalid or expired state token'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({
            'error': 'User not found'
        }, status=status.HTTP_404_NOT_FOUND)

    user_key = get_session_user_key(user_id) if jwt_token else None
    if not user_key:
        # Provide helpful error message
        error_msg = (
            'User encryption key not found in session. '
            'This usually happens if you logged in before the encryption key was cached, '
            'or if your session expired. Please log out and log back in, then try connecting Google Photos again.'
        )
        return Response({
            'error': error_msg,
            'detail': 'The encryption key is cached when you log in. Please ensure you are logged in and try again.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    # Exchange code for tokens
    token_url = 'https://oauth2.googleapis.com/token'
    token_data = {
        'client_id': settings.GOOGLE_PHOTOS_CLIENT_ID,
        'client_secret': settings.GOOGLE_PHOTOS_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': settings.GOOGLE_PHOTOS_REDIRECT_URI,
    }

    response = requests.post(token_url, data=token_data)
    if response.status_code != 200:
        return Response({
            'error': 'Failed to exchange authorization code',
            'detail': response.text
        }, status=status.HTTP_400_BAD_REQUEST)

    token_response = response.json()
    access_token = token_response.get('access_token')
    refresh_token = token_response.get('refresh_token')
    expires_in = token_response.get('expires_in', 3600)

    # Get Google email
    googlephotos_email = user.email
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        me_response = requests.get('https://www.googleapis.com/oauth2/v2/userinfo', headers=headers)
        if me_response.status_code == 200:
            me_data = me_response.json()
            googlephotos_email = me_data.get('email', user.email)
    except:
        pass

    # Get or create member
    member_obj = Member.objects.filter(user=user).first()
    if not member_obj:
        return Response({
            'error': 'No family found. Please create a family first.'
        }, status=status.HTTP_400_BAD_REQUEST)

    # Save sync record
    sync_record, created = GooglePhotosSync.objects.update_or_create(
        member=member_obj,
        defaults={
            'googlephotos_email': googlephotos_email,
            'token_expires_at': timezone.now() + timedelta(seconds=expires_in),
            'is_active': True,
        }
    )
    sync_record.encrypt_tokens(access_token, refresh_token, user_key=user_key)

    # Clean up cache
    cache.delete(f'googlephotos_oauth_user_{state}')
    cache.delete(f'googlephotos_oauth_state_{user_id}')
    cache.delete(f'googlephotos_oauth_jwt_{state}')
    cache.delete(f'googlephotos_oauth_mobile_{state}')

    # Check if this is a mobile OAuth request
    if is_mobile:
        # For mobile, redirect to deep link using HTML with JavaScript (Django blocks custom schemes in HttpResponseRedirect)
        deep_link = f'kewlkids://oauth/callback?service=googlephotos&success=true&message={quote("Google Photos connected successfully!")}'
        from django.http import HttpResponse
        import html as html_escape
        import json
        # Simple success page with OK button
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Photos Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">Google Photos Connected!</h2>
        <button id="okBtn" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">OK</button>
    </div>
    <script>
        (function() {{
            var link = {json.dumps(deep_link)};
            document.getElementById('okBtn').onclick = function() {{
                window.location.href = link;
                window.close();
            }};
        }})();
    </script>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')
    else:
        # For web, redirect to web app with success parameters
        from django.http import HttpResponse
        import html as html_escape
        # Get the web app URL from referer or use default
        referer = request.META.get('HTTP_REFERER', '')
        web_app_url = 'http://localhost:8081'  # Default Expo web port
        if referer:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                # If referer is from ngrok or localhost, use that
                if 'ngrok' in parsed.netloc:
                    web_app_url = f'{parsed.scheme}://{parsed.netloc}'
                elif 'localhost' in parsed.netloc or '127.0.0.1' in parsed.netloc:
                    web_app_url = f'{parsed.scheme}://{parsed.netloc}'
            except:
                pass

        redirect_url = f'{web_app_url}/(tabs)/googlephotos-connect?success=true&service=googlephotos&message={quote("Google Photos connected successfully!")}'
        escaped_url = html_escape.escape(redirect_url)
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Photos Connected</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <div style="padding:40px 20px;text-align:center;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
        <div style="color:#34C759;font-size:48px;margin-bottom:20px;">✓</div>
        <h2 style="color:#000000;margin:0 0 20px 0;font-size:24px;">Google Photos Connected!</h2>
        <p style="color:#666666;margin-bottom:20px;">Redirecting back to app...</p>
        <button onclick="window.location.href='{escaped_url}'" style="background-color:#007AFF;color:#ffffff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin-top:20px;">OK</button>
    </div>
    <script>
        // Redirect to web app automatically
        window.location.href = "{escaped_url}";
    </script>
</body>
</html>'''
        return HttpResponse(html, content_type='text/html; charset=utf-8')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def GooglePhotosConnectionView(request):
    """Check Google Photos connection status."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'connected': False})

    sync = GooglePhotosSync.objects.filter(member=member, is_active=True).first()
    if sync:
        return Response({
            'connected': True,
            'email': sync.googlephotos_email if hasattr(sync, 'googlephotos_email') else None,
            'connected_at': sync.connected_at,
        })
    return Response({'connected': False})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def GooglePhotosDisconnectView(request):
    """Disconnect Google Photos account."""
    from encryption.utils import get_session_user_key
    # Refresh encryption key cache if it exists (keeps it alive)
    get_session_user_key(request.user.id, auto_refresh=True)

    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'No family found'}, status=status.HTTP_404_NOT_FOUND)

    sync = GooglePhotosSync.objects.filter(member=member, is_active=True).first()
    if sync:
        sync.is_active = False
        sync.save()
        return Response({'success': True, 'message': 'Google Photos disconnected successfully'})

    return Response({'error': 'Google Photos not connected'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def GooglePhotosListMediaItemsView(request):
    """
    List media items from Google Photos for the connected account.

    This powers the Documents > Google Photos tab and returns normalized
    items with viewable image URLs (baseUrl).
    """
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    sync_record = GooglePhotosSync.objects.filter(member=member, is_active=True).first()
    if not sync_record:
        return Response({'error': 'Google Photos not connected'}, status=status.HTTP_400_BAD_REQUEST)

    # Debug: tokeninfo fields we want to include in both success and error responses
    tokeninfo_scopes = None
    tokeninfo_aud = None

    try:
        # Decrypt tokens using password-based encryption (user_key from cache)
        from encryption.utils import get_user_key_from_request

        user_key = get_user_key_from_request(request)
        access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)

        # Use Google Drive API (photos space) with drive.photos.readonly scope
        drive_client = GoogleDriveSyncService(access_token, refresh_token)

        # Debug: inspect token scopes via Google's tokeninfo endpoint
        import requests as _requests
        try:
            ti_resp = _requests.get(
                "https://www.googleapis.com/oauth2/v1/tokeninfo",
                params={"access_token": access_token},
                timeout=5,
            )
            if ti_resp.ok:
                ti_json = ti_resp.json()
                tokeninfo_scopes = ti_json.get("scope")
                tokeninfo_aud = ti_json.get("audience") or ti_json.get("aud")
        except Exception:
            # Best-effort only; don’t fail the main request because of this
            tokeninfo_scopes = None
            tokeninfo_aud = None

        # Support simple pagination via page_token query param
        page_token = request.GET.get('page_token')
        raw = drive_client.list_photos(page_size=100, page_token=page_token or None)

        files = raw.get('files', [])
        items = []
        for file in files:
            items.append(
                {
                    'id': file.get('id'),
                    # Use thumbnailLink as a ready-to-use image URL
                    'baseUrl': file.get('thumbnailLink'),
                    'mimeType': file.get('mimeType'),
                    'filename': file.get('name'),
                    'mediaMetadata': {
                        'creationTime': file.get('createdTime'),
                        'width': None,
                        'height': None,
                    },
                }
            )

        # Persist refreshed tokens if they changed
        if drive_client.access_token != access_token:
            sync_record.update_tokens(
                drive_client.access_token,
                drive_client.refresh_token if drive_client.refresh_token else refresh_token,
                user_key=user_key,
            )

        return Response(
            {
                'items': items,
                'nextPageToken': raw.get('nextPageToken'),
                'tokeninfo': {
                    'scope': tokeninfo_scopes,
                    'audience': tokeninfo_aud,
                },
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        # Special handling for HTTP errors from Google so we can see the real error
        import logging
        import requests

        logger = logging.getLogger(__name__)

        if isinstance(e, requests.HTTPError) and e.response is not None:
            try:
                error_json = e.response.json()
            except Exception:
                error_json = {'raw': e.response.text}

            logger.error(
                "Google Photos API error: %s", error_json, exc_info=True
            )
            return Response(
                {
                    'error': 'Google Photos API error',
                    'google_error': error_json,
                    'tokeninfo': {
                        'scope': tokeninfo_scopes,
                        'audience': tokeninfo_aud,
                    },
                },
                status=e.response.status_code,
            )

        logger.error(f"Google Photos list media items error: {str(e)}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except ValueError as e:
        error_msg = str(e).lower()
        # Session key / encryption-key issues
        if 'not in session' in error_msg or 'password required' in error_msg:
            return Response(
                {
                    'error': 'Session expired. Please refresh the page or log in again.',
                    'detail': 'Your session key has expired. Your Google Photos connection is still valid.',
                    'requires_refresh': True,
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        elif 'decryption failed' in error_msg or 'failed to decrypt' in error_msg:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Google Photos decryption error: {str(e)}", exc_info=True)
            return Response(
                {
                    'error': 'Unable to decrypt Google Photos tokens. Please disconnect and reconnect.',
                    'detail': str(e),
                    'requires_reconnect': True,
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        else:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Google Photos list media items error: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# App Documents and Folders Views
# ============================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def DocumentListView(request):
    """List or create documents."""
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    family_id = request.GET.get('family') or request.data.get('family')
    if not family_id:
        return Response({'error': 'Family ID is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        family = Family.objects.get(id=family_id)
        # Check if user is a member of this family
        if not Member.objects.filter(user=request.user, family=family).exists():
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    except Family.DoesNotExist:
        return Response({'error': 'Family not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        # List documents
        # Check if parent_folder parameter exists in query string (not just if it's None)
        parent_folder = request.GET.get('parent_folder')
        queryset = Document.objects.filter(family=family)

        # Only filter by parent_folder if it's explicitly provided in the query string
        # If not provided at all, return all documents regardless of folder
        if 'parent_folder' in request.GET:
            if parent_folder == 'null':
                queryset = queryset.filter(folder__isnull=True)
            elif parent_folder:
                try:
                    folder = Folder.objects.get(id=parent_folder, family=family)
                    queryset = queryset.filter(folder=folder)
                except Folder.DoesNotExist:
                    return Response({'error': 'Folder not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = DocumentSerializer(queryset, many=True, context={'request': request})
        return Response({'results': serializer.data, 'count': len(serializer.data)})

    elif request.method == 'POST':
        # Create document
        # Check if file is provided
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if name is provided
        if 'name' not in request.data or not request.data.get('name', '').strip():
            return Response({'error': 'Document name is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Prepare data for serializer
        # For multipart/form-data, files are in both request.data and request.FILES
        # Create a mutable copy and ensure file is included
        data = {}
        # Copy all fields from request.data
        for key, value in request.data.items():
            data[key] = value
        # Ensure file is included (it should be in request.data for multipart, but also check FILES)
        if 'file' in request.FILES:
            data['file'] = request.FILES['file']
        # Add our additional fields
        data['family'] = family_id
        data['uploaded_by'] = member.id

        # Pass data - the serializer will validate and use the file
        serializer = DocumentSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            serializer.save(family=family, uploaded_by=member)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # Log validation errors for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Document serializer validation errors: {serializer.errors}")
        logger.error(f"Request data: {request.data}")
        logger.error(f"Request FILES keys: {list(request.FILES.keys())}")

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def DocumentDetailView(request, pk):
    """Retrieve, update, or delete a document."""
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        document = Document.objects.get(pk=pk)
        # Check if user is a member of the document's family
        if not Member.objects.filter(user=request.user, family=document.family).exists():
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = DocumentSerializer(document, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'PATCH':
        # For multipart/form-data, ensure file is in data if provided
        data = {}
        # Copy all fields from request.data
        for key, value in request.data.items():
            data[key] = value
        # Include file if it's being updated
        if 'file' in request.FILES:
            data['file'] = request.FILES['file']

        serializer = DocumentSerializer(document, data=data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def DocumentDownloadView(request, pk):
    """Download a document file."""
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        document = Document.objects.get(pk=pk)
        # Check if user is a member of the document's family
        if not Member.objects.filter(user=request.user, family=document.family).exists():
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

    if not document.file:
        return Response({'error': 'File not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        response = FileResponse(document.file.open('rb'), content_type=document.mime_type or 'application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{document.name}"'
        return response
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def DocumentViewTokenView(request, pk):
    """Get a view token/URL for a document."""
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        document = Document.objects.get(pk=pk)
        # Check if user is a member of the document's family
        if not Member.objects.filter(user=request.user, family=document.family).exists():
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

    if not document.file:
        return Response({'error': 'File not found'}, status=status.HTTP_404_NOT_FOUND)

    # Return the file URL
    serializer = DocumentSerializer(document, context={'request': request})
    file_url = serializer.get_file_url(document)
    return Response({'url': file_url})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def FolderListView(request):
    """List or create folders."""
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    family_id = request.GET.get('family') or request.data.get('family')
    if not family_id:
        return Response({'error': 'Family ID is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        family = Family.objects.get(id=family_id)
        # Check if user is a member of this family
        if not Member.objects.filter(user=request.user, family=family).exists():
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    except Family.DoesNotExist:
        return Response({'error': 'Family not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        # List folders
        # Check if parent_folder parameter exists in query string (not just if it's None)
        parent_folder = request.GET.get('parent_folder')
        queryset = Folder.objects.filter(family=family)

        # Only filter by parent_folder if it's explicitly provided in the query string
        # If not provided at all, return all folders regardless of parent
        if 'parent_folder' in request.GET:
            if parent_folder == 'null':
                queryset = queryset.filter(parent_folder__isnull=True)
            elif parent_folder:
                try:
                    parent = Folder.objects.get(id=parent_folder, family=family)
                    queryset = queryset.filter(parent_folder=parent)
                except Folder.DoesNotExist:
                    return Response({'error': 'Parent folder not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = FolderSerializer(queryset, many=True)
        return Response({'results': serializer.data, 'count': len(serializer.data)})

    elif request.method == 'POST':
        # Create folder
        data = request.data.copy()
        data['family'] = family_id

        serializer = FolderSerializer(data=data)
        if serializer.is_valid():
            serializer.save(family=family)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def FolderDetailView(request, pk):
    """Retrieve, update, or delete a folder."""
    member = Member.objects.filter(user=request.user).first()
    if not member:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        folder = Folder.objects.get(pk=pk)
        # Check if user is a member of the folder's family
        if not Member.objects.filter(user=request.user, family=folder.family).exists():
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    except Folder.DoesNotExist:
        return Response({'error': 'Folder not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = FolderSerializer(folder)
        return Response(serializer.data)

    elif request.method == 'PATCH':
        serializer = FolderSerializer(folder, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        # Check if folder has subfolders or documents
        if folder.subfolders.exists() or folder.documents.exists():
            return Response({
                'error': 'Cannot delete folder with subfolders or documents'
            }, status=status.HTTP_400_BAD_REQUEST)
        folder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

