"""
API views for family management.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from django.utils.crypto import get_random_string
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

        # Cancel any existing pending invitations for this email
        Invitation.objects.filter(
            family=family,
            email=email,
            status='pending'
        ).update(status='cancelled')

        # Create new invitation
        invitation = Invitation.create_invitation(
            family=family,
            email=email,
            invited_by=request.user,
            role=role
        )

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
