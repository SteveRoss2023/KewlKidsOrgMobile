from rest_framework import viewsets, status, serializers
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.generics import CreateAPIView
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.signing import TimestampSigner
from django.shortcuts import get_object_or_404
from django.http import Http404
from .models import UserProfile
from .serializers import UserProfileSerializer, RecipeSerializer, MealPlanSerializer
from meals.models import Recipe, MealPlan
from families.models import Family, Member

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
            email = data.get('email') or data.get('username')
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
            except User.DoesNotExist:
                pass

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
