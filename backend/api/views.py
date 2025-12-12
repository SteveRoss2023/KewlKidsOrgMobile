from rest_framework import viewsets, status, serializers
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.generics import CreateAPIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import UserProfile
from .serializers import UserProfileSerializer

User = get_user_model()


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
                response.data['user'] = {
                    'id': user.id,
                    'email': user.email,
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


# Add more views here as you migrate features from the reference project
