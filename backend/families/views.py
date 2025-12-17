"""
API views for family management.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from django.utils.crypto import get_random_string
from django.core.mail import send_mail
from django.conf import settings
import os
from .models import Family, Member, Invitation
from .serializers import FamilySerializer, FamilyCreateSerializer, MemberSerializer, InvitationSerializer
from django.contrib.auth import get_user_model

User = get_user_model()


class FamilyViewSet(viewsets.ModelViewSet):
    """ViewSet for Family model."""
    permission_classes = [IsAuthenticated]
    serializer_class = FamilySerializer

    def get_queryset(self):
        """Return families the user is a member of."""
        user = self.request.user
        return Family.objects.filter(members__user=user, members__is_active=True).distinct()

    def get_serializer_class(self):
        """Use different serializer for create."""
        if self.action == 'create':
            return FamilyCreateSerializer
        return FamilySerializer

    def perform_create(self, serializer):
        """Create family and add creator as owner."""
        family = serializer.save(owner=self.request.user)
        # Add creator as owner member
        Member.objects.create(
            family=family,
            user=self.request.user,
            role='owner'
        )

    def perform_destroy(self, instance):
        """Only allow family owner to delete the family."""
        member = get_object_or_404(Member, family=instance, user=self.request.user, is_active=True)
        if not member.is_owner():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the family owner can delete the family.')
        instance.delete()

    @action(detail=True, methods=['post'])
    def invite_member(self, request, pk=None):
        """Invite a user to join the family."""
        family = self.get_object()
        
        # Check if user is admin
        member = get_object_or_404(Member, family=family, user=request.user, is_active=True)
        if not member.is_admin():
            return Response(
                {'error': 'Only admins can invite members.'},
                status=status.HTTP_403_FORBIDDEN
            )

        email = request.data.get('email')
        role = request.data.get('role', 'member')
        
        if not email:
            return Response(
                {'error': 'Email is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Delete any existing invitations for this email (pending, cancelled, expired)
        # This avoids unique constraint violations and ensures we only have one active invitation
        Invitation.objects.filter(
            family=family,
            email=email
        ).delete()

        # Create new invitation
        invitation = Invitation.create_invitation(
            family=family,
            email=email,
            invited_by=request.user,
            role=role
        )

        # Send invitation email
        invitation_url = f"{request.scheme}://{request.get_host()}/api/invitations/accept/?token={invitation.token}&email={email}"
        try:
            from django.core.mail import EmailMultiAlternatives
            
            subject = f'Invitation to join {family.name} - KewlKidsOrganizer'
            text_message = f'''You've been invited to join {family.name} on KewlKidsOrganizer!

Click the link below to accept the invitation:

{invitation_url}

This invitation will expire in 7 days.

If you did not expect this invitation, please ignore this email.'''
            
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
        <h1>You've been invited!</h1>
        <div class="content">
            <p>You've been invited to join <strong>{family.name}</strong> on KewlKidsOrganizer!</p>
            <p>Click the button below to accept the invitation and start collaborating with your family.</p>
        </div>
        <div class="button-container">
            <a href="{invitation_url}" class="button">Accept Invitation</a>
        </div>
        <div class="expiry">
            <p class="expiry-text"><strong>⏰ This invitation will expire in 7 days.</strong></p>
        </div>
        <div class="footer">
            <p>If you did not expect this invitation, please ignore this email.</p>
            <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                This email was sent by {request.user.email if request.user.is_authenticated else 'KewlKidsOrganizer'}
            </p>
        </div>
    </div>
</body>
</html>'''
            
            email_msg = EmailMultiAlternatives(
                subject=subject,
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email]
            )
            email_msg.attach_alternative(html_message, "text/html")
            email_msg.send()
        except Exception as e:
            # Continue even if email fails
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f'Failed to send invitation email to {email}: {str(e)}')

        serializer = InvitationSerializer(invitation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def add_member(self, request, pk=None):
        """Add an existing user to the family (by email)."""
        family = self.get_object()
        
        # Check if user is admin
        member = get_object_or_404(Member, family=family, user=request.user, is_active=True)
        if not member.is_admin():
            return Response(
                {'error': 'Only admins can add members.'},
                status=status.HTTP_403_FORBIDDEN
            )

        email = request.data.get('email')
        role = request.data.get('role', 'member')
        
        if not email:
            return Response(
                {'error': 'Email is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(email=email)
            if Member.objects.filter(family=family, user=user).exists():
                return Response(
                    {'error': 'User is already a member of this family.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            new_member = Member.objects.create(
                family=family,
                user=user,
                role=role
            )
            serializer = MemberSerializer(new_member)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        """Get all members of a family."""
        family = self.get_object()
        
        # Check if user is a member
        if not Member.objects.filter(family=family, user=request.user, is_active=True).exists():
            return Response(
                {'error': 'You are not a member of this family.'},
                status=status.HTTP_403_FORBIDDEN
            )

        members = family.members.filter(is_active=True)
        serializer = MemberSerializer(members, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def invitations(self, request, pk=None):
        """Get all invitations for a family."""
        family = self.get_object()
        
        # Check if user is admin
        member = get_object_or_404(Member, family=family, user=request.user, is_active=True)
        if not member.is_admin():
            return Response(
                {'error': 'Only admins can view invitations.'},
                status=status.HTTP_403_FORBIDDEN
            )

        invitations = family.invitations.all()
        serializer = InvitationSerializer(invitations, many=True)
        return Response(serializer.data)


class InvitationViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing and accepting invitations."""
    permission_classes = [IsAuthenticated]
    serializer_class = InvitationSerializer

    def get_queryset(self):
        """Return invitations for the current user."""
        user = self.request.user
        return Invitation.objects.filter(email=user.email)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Accept an invitation."""
        invitation = self.get_object()
        
        if invitation.email != request.user.email:
            return Response(
                {'error': 'This invitation is not for you.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if not invitation.can_be_accepted():
            return Response(
                {'error': 'This invitation cannot be accepted (expired or already processed).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is already a member
        if Member.objects.filter(family=invitation.family, user=request.user).exists():
            invitation.status = 'cancelled'
            invitation.save()
            return Response(
                {'error': 'You are already a member of this family.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create member
        Member.objects.create(
            family=invitation.family,
            user=request.user,
            role=invitation.role
        )

        # Update invitation
        invitation.status = 'accepted'
        invitation.invited_user = request.user
        invitation.accepted_at = timezone.now()
        invitation.save()

        serializer = InvitationSerializer(invitation)
        return Response(serializer.data)


class AcceptInvitationView(APIView):
    """Accept a family invitation."""
    # GET doesn't require auth (for email links), POST requires auth (for API calls)
    permission_classes = [AllowAny]

    def _is_mobile_request(self, request):
        """Check if request is from a mobile device."""
        user_agent = request.META.get('HTTP_USER_AGENT', '').lower()
        mobile_keywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone']
        return any(keyword in user_agent for keyword in mobile_keywords)

    def _get_web_app_url(self, request):
        """Helper method to determine web app URL for redirects."""
        host = request.get_host()
        # Remove any /api path from host
        clean_host = host.split('/')[0] if '/' in host else host
        
        # Always check for WEB_APP_URL environment variable first
        if os.getenv('WEB_APP_URL'):
            return os.getenv('WEB_APP_URL')
        
        if 'ngrok' in host:
            # For ngrok, web app might be on same domain (if also exposed via ngrok)
            # Or on a different ngrok tunnel
            # Default to same ngrok domain - user should set WEB_APP_URL if web app is elsewhere
            # Note: If web app is only on localhost:8081, set WEB_APP_URL env var
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

    def post(self, request):
        """Accept invitation with token - requires authentication."""
        # Check authentication for POST
        if not request.user.is_authenticated:
            return Response(
                {'detail': 'Authentication required to accept invitation.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        token = request.data.get('token')
        email = request.data.get('email')

        if not token:
            return Response(
                {'detail': 'Token is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            invitation = Invitation.objects.get(token=token, status='pending')
        except Invitation.DoesNotExist:
            return Response(
                {'detail': 'Invalid invitation token.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not invitation.can_be_accepted():
            return Response(
                {'detail': 'Invitation has expired or is no longer valid.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if logged-in user's email matches invitation email
        if request.user.email.lower() != invitation.email.lower():
            return Response(
                {'detail': f'This invitation was sent to {invitation.email}, but you are logged in as {request.user.email}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is already a member
        if Member.objects.filter(family=invitation.family, user=request.user).exists():
            invitation.status = 'cancelled'
            invitation.save()
            return Response(
                {'detail': 'You are already a member of this family.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is verified
        from api.models import UserProfile
        profile = UserProfile.get_or_create_profile(request.user)
        if not profile.email_verified:
            return Response(
                {'detail': 'Please verify your email before accepting invitations.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if member already exists (race condition check)
        if not Member.objects.filter(family=invitation.family, user=request.user).exists():
            # Create member
            Member.objects.create(
                family=invitation.family,
                user=request.user,
                role=invitation.role
            )

        # Update invitation (only if still pending)
        if invitation.status == 'pending':
            invitation.status = 'accepted'
            invitation.invited_user = request.user
            invitation.accepted_at = timezone.now()
            invitation.save()

        return Response({
            'detail': 'Invitation accepted successfully.',
            'family_id': invitation.family.id,
            'family_name': str(invitation.family.name)
        }, status=status.HTTP_200_OK)

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

    def get(self, request):
        """Accept invitation via GET request (for email links) - redirects to login/register or returns JSON."""
        from urllib.parse import urlencode
        
        token = request.query_params.get('token')
        email = request.query_params.get('email')

        if not token:
            # Check if browser request - redirect to login with error
            accept_header = request.META.get('HTTP_ACCEPT', '')
            if 'text/html' in accept_header or not accept_header.startswith('application/json'):
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {'error': 'Invalid invitation link'})
                return self._safe_redirect(redirect_url)
            
            return Response(
                {'detail': 'Token is required.', 'needs_registration': False},
                status=status.HTTP_400_BAD_REQUEST
            )

        # First try to find invitation by token (any status)
        try:
            invitation = Invitation.objects.get(token=token)
        except Invitation.DoesNotExist:
            # Invitation doesn't exist at all
            accept_header = request.META.get('HTTP_ACCEPT', '')
            if 'text/html' in accept_header or not accept_header.startswith('application/json'):
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {'error': 'Invalid invitation link'})
                return self._safe_redirect(redirect_url)
            
            return Response(
                {'detail': 'Invalid invitation token. The invitation may have been cancelled or does not exist.', 'needs_registration': False},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if invitation was already accepted
        if invitation.status == 'accepted':
            accept_header = request.META.get('HTTP_ACCEPT', '')
            if 'text/html' in accept_header or not accept_header.startswith('application/json'):
                # Check if user is logged in
                if request.user.is_authenticated:
                    # Redirect to home page with message
                    redirect_url = self._get_redirect_url(request, '/(tabs)', {
                        'message': f'This invitation to join {invitation.family.name} has already been accepted.',
                        'message_type': 'info'
                    })
                else:
                    # Redirect to login with message and email
                    redirect_url = self._get_redirect_url(request, '/(auth)/login', {
                        'message': f'This invitation to join {invitation.family.name} has already been accepted. Please log in to access the family.',
                        'message_type': 'info',
                        'email': invitation.email
                    })
                return self._safe_redirect(redirect_url)
            
            return Response({
                'detail': 'This invitation has already been accepted.',
                'already_accepted': True,
                'family_id': invitation.family.id,
                'family_name': str(invitation.family.name),
            }, status=status.HTTP_200_OK)
        
        # Check if invitation was cancelled
        if invitation.status == 'cancelled':
            accept_header = request.META.get('HTTP_ACCEPT', '')
            if 'text/html' in accept_header or not accept_header.startswith('application/json'):
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {'error': 'This invitation has been cancelled'})
                return self._safe_redirect(redirect_url)
            
            return Response({
                'detail': 'This invitation has been cancelled.',
                'cancelled': True,
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # If we get here, invitation status is 'pending' - continue with normal flow

        if not invitation.can_be_accepted():
            accept_header = request.META.get('HTTP_ACCEPT', '')
            if 'text/html' in accept_header or not accept_header.startswith('application/json'):
                # Check if expired or other reason
                if invitation.is_expired():
                    error_msg = 'This invitation has expired. Please ask for another invitation from your host.'
                else:
                    error_msg = 'This invitation is no longer valid. Please ask for another invitation from your host.'
                
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {
                    'error': error_msg,
                    'email': invitation.email
                })
                return self._safe_redirect(redirect_url)
            
            return Response(
                {'detail': 'Invitation has expired or is no longer valid. Please ask for another invitation from your host.', 'needs_registration': False},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user with invitation email exists
        try:
            invited_user = User.objects.get(email__iexact=invitation.email)
            user_exists = True
        except User.DoesNotExist:
            user_exists = False
        
        # Check if this is a browser request (wants HTML) vs API request (wants JSON)
        accept_header = request.META.get('HTTP_ACCEPT', '')
        is_browser_request = 'text/html' in accept_header or (not accept_header.startswith('application/json') and not accept_header.startswith('application/'))

        # If user doesn't exist yet, redirect to register or return JSON
        if not user_exists:
            if is_browser_request:
                # Redirect to register with invitation token
                redirect_url = self._get_redirect_url(request, '/(auth)/register', {
                    'invitation_token': token,
                    'invitation_email': invitation.email,
                    'family_name': str(invitation.family.name)
                })
                return self._safe_redirect(redirect_url)
            
            return Response({
                'detail': 'User account not found. Please register to accept this invitation.',
                'needs_registration': True,
                'family_name': str(invitation.family.name),
                'invitation_email': invitation.email,
                'invitation_token': token,
                'invited_by': invitation.invited_by.email if invitation.invited_by else None,
            }, status=status.HTTP_200_OK)

        # If user is authenticated, check if email matches and auto-accept
        if request.user.is_authenticated:
            # Check if logged-in user's email matches invitation email
            if request.user.email.lower() != invitation.email.lower():
                if is_browser_request:
                    redirect_url = self._get_redirect_url(request, '/(auth)/login', {
                        'error': f'This invitation was sent to {invitation.email}, but you are logged in as {request.user.email}',
                        'email': invitation.email
                    })
                    return self._safe_redirect(redirect_url)
                
                return Response({
                    'detail': f'This invitation was sent to {invitation.email}, but you are logged in as {request.user.email}. Please log out and log in with the correct account.',
                    'needs_registration': False,
                    'wrong_account': True,
                }, status=status.HTTP_400_BAD_REQUEST)

            # Check if user is already a member
            if Member.objects.filter(family=invitation.family, user=request.user).exists():
                invitation.status = 'cancelled'
                invitation.save()
                if is_browser_request:
                    redirect_url = self._get_redirect_url(request, '/(tabs)')
                    return self._safe_redirect(redirect_url)
                
                return Response({
                    'detail': 'You are already a member of this family.',
                    'family_id': invitation.family.id,
                    'family_name': str(invitation.family.name),
                    'already_member': True,
                }, status=status.HTTP_200_OK)

            # Check if user is verified
            from api.models import UserProfile
            profile = UserProfile.get_or_create_profile(request.user)
            if not profile.email_verified:
                if is_browser_request:
                    redirect_url = self._get_redirect_url(request, '/(tabs)/profile', {
                        'error': 'Please verify your email before accepting invitations'
                    })
                    return self._safe_redirect(redirect_url)
                
                return Response({
                    'detail': 'Please verify your email before accepting invitations.',
                    'needs_verification': True,
                }, status=status.HTTP_400_BAD_REQUEST)

            # Check if member already exists (race condition check)
            if not Member.objects.filter(family=invitation.family, user=request.user).exists():
                # Create member
                Member.objects.create(
                    family=invitation.family,
                    user=request.user,
                    role=invitation.role
                )

            # Update invitation (only if still pending)
            if invitation.status == 'pending':
                invitation.status = 'accepted'
                invitation.invited_user = request.user
                invitation.accepted_at = timezone.now()
                invitation.save()

            # Generate temporary login token for redirect (even if already logged in, for consistency)
            from django.core.signing import TimestampSigner
            signer = TimestampSigner()
            temp_token = signer.sign(f"{request.user.id}:{request.user.email}")

            if is_browser_request:
                # Redirect to web app with temp token
                redirect_url = self._get_redirect_url(request, '/', {
                    'verify_token': temp_token,
                    'email': request.user.email,
                    'accept_invitation_token': token,
                    'accept_invitation_email': invitation.email
                })
                return self._safe_redirect(redirect_url)
            
            return Response({
                'detail': 'Invitation accepted successfully.',
                'temp_token': temp_token,
                'email': request.user.email,
                'family_id': invitation.family.id,
                'family_name': str(invitation.family.name),
                'accepted': True,
            }, status=status.HTTP_200_OK)

        # User exists but is not authenticated - auto-accept invitation and generate temp token
        from api.models import UserProfile
        profile = UserProfile.get_or_create_profile(invited_user)
        
        if not profile.email_verified:
            if is_browser_request:
                # Redirect to login with clear instructions
                redirect_url = self._get_redirect_url(request, '/(auth)/login', {
                    'message': 'Please verify your email address before accepting this invitation. After logging in, check your email for a verification link, then click the invitation link again.',
                    'message_type': 'warning',
                    'email': invitation.email,
                    'invitation_token': token
                })
                return self._safe_redirect(redirect_url)
            
            return Response({
                'detail': 'Please verify your email before accepting invitations.',
                'needs_verification': True,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Auto-accept invitation
        if Member.objects.filter(family=invitation.family, user=invited_user).exists():
            invitation.status = 'cancelled'
            invitation.save()
        else:
            Member.objects.create(
                family=invitation.family,
                user=invited_user,
                role=invitation.role
            )

            invitation.status = 'accepted'
            invitation.invited_user = invited_user
            invitation.accepted_at = timezone.now()
            invitation.save()

        # Generate temporary login token
        from django.core.signing import TimestampSigner
        signer = TimestampSigner()
        temp_token = signer.sign(f"{invited_user.id}:{invited_user.email}")
        
        if is_browser_request:
            # Redirect to web app with temp token
            redirect_url = self._get_redirect_url(request, '/', {
                'verify_token': temp_token,
                'email': invited_user.email,
                'accept_invitation_token': token,
                'accept_invitation_email': invitation.email
            })
            return self._safe_redirect(redirect_url)
        
        return Response({
            'detail': 'Invitation accepted successfully. Use the temporary token to log in.',
            'temp_token': temp_token,
            'email': invited_user.email,
            'family_id': invitation.family.id,
            'family_name': str(invitation.family.name),
            'accepted': True,
        }, status=status.HTTP_200_OK)

