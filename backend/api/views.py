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
from .models import UserProfile
from .serializers import UserProfileSerializer

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
        from django.http import HttpResponseRedirect
        from urllib.parse import urlencode
        import os
        
        token = request.query_params.get('token')
        email = request.query_params.get('email')

        # Check if this is a browser request (wants HTML) vs API request (wants JSON)
        accept_header = request.META.get('HTTP_ACCEPT', '')
        is_browser_request = 'text/html' in accept_header or (not accept_header.startswith('application/json') and not accept_header.startswith('application/'))

        if not token or not email:
            if is_browser_request:
                web_url = self._get_web_app_url(request)
                redirect_url = f"{web_url}/(auth)/login?error=Invalid verification link"
                return HttpResponseRedirect(redirect_url)
            
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
                    web_url = self._get_web_app_url(request)
                    # Email already verified, redirect to success page
                    redirect_url = f"{web_url}/(tabs)?verified=true&email={email}"
                    return HttpResponseRedirect(redirect_url)
                
                return Response({'detail': 'Email is already verified.'}, status=status.HTTP_200_OK)

            # Try to verify the email
            if profile.verify_email(token):
                if is_browser_request:
                    web_url = self._get_web_app_url(request)
                    # Always redirect to home page - the web app will handle showing success message
                    # and redirecting to login if user is not authenticated
                    redirect_url = f"{web_url}/(tabs)?verified=true&email={email}"
                    return HttpResponseRedirect(redirect_url)
                
                return Response({'detail': 'Email verified successfully.'}, status=status.HTTP_200_OK)
            else:
                if is_browser_request:
                    web_url = self._get_web_app_url(request)
                    redirect_url = f"{web_url}/(auth)/login?error=Invalid or expired verification token"
                    return HttpResponseRedirect(redirect_url)
                
                return Response(
                    {'detail': 'Invalid or expired verification token.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except User.DoesNotExist:
            if is_browser_request:
                web_url = self._get_web_app_url(request)
                redirect_url = f"{web_url}/(auth)/login?error=User not found"
                return HttpResponseRedirect(redirect_url)
            
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
