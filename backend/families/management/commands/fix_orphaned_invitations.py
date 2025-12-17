"""
Django management command to fix invitations that are marked as accepted
but don't have corresponding members.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from families.models import Invitation, Member, Family

User = get_user_model()


class Command(BaseCommand):
    help = 'Fix invitations marked as accepted but without corresponding members'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be fixed without making changes',
        )
        parser.add_argument(
            '--family-id',
            type=int,
            help='Only check a specific family ID',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        family_id = options.get('family_id')

        # Find all accepted invitations
        invitations = Invitation.objects.filter(status='accepted')
        
        if family_id:
            invitations = invitations.filter(family_id=family_id)

        orphaned_invitations = []
        for invitation in invitations:
            # Check if user exists
            try:
                user = User.objects.get(email__iexact=invitation.email)
            except User.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f'Invitation {invitation.id}: User {invitation.email} does not exist'
                    )
                )
                orphaned_invitations.append((invitation, None, 'user_not_found'))
                continue

            # Check if member exists
            member_exists = Member.objects.filter(
                family=invitation.family,
                user=user,
                is_active=True
            ).exists()

            if not member_exists:
                orphaned_invitations.append((invitation, user, 'member_missing'))

        if not orphaned_invitations:
            self.stdout.write(
                self.style.SUCCESS('No orphaned invitations found!')
            )
            return

        self.stdout.write(
            self.style.WARNING(
                f'\nFound {len(orphaned_invitations)} orphaned invitation(s):\n'
            )
        )

        for invitation, user, issue_type in orphaned_invitations:
            self.stdout.write(f'\nInvitation ID: {invitation.id}')
            self.stdout.write(f'  Email: {invitation.email}')
            self.stdout.write(f'  Family: {invitation.family.name}')
            self.stdout.write(f'  Status: {invitation.status}')
            self.stdout.write(f'  Issue: {issue_type}')

            if issue_type == 'user_not_found':
                self.stdout.write(
                    self.style.ERROR('  -> User does not exist - cannot create member')
                )
                if not dry_run:
                    # Reset invitation to pending so it can be re-sent
                    invitation.status = 'pending'
                    invitation.invited_user = None
                    invitation.accepted_at = None
                    invitation.save()
                    self.stdout.write(
                        self.style.SUCCESS('  [OK] Reset invitation to pending')
                    )
            elif issue_type == 'member_missing' and user:
                self.stdout.write(
                    self.style.WARNING(f'  -> User exists but member is missing')
                )
                if not dry_run:
                    # Check if email is verified
                    from api.models import UserProfile
                    profile = UserProfile.get_or_create_profile(user)
                    
                    if not profile.email_verified:
                        self.stdout.write(
                            self.style.WARNING(
                                '  -> User email not verified - resetting invitation to pending'
                            )
                        )
                        invitation.status = 'pending'
                        invitation.invited_user = None
                        invitation.accepted_at = None
                        invitation.save()
                    else:
                        # Create the missing member
                        try:
                            Member.objects.create(
                                family=invitation.family,
                                user=user,
                                role=invitation.role
                            )
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f'  [OK] Created member for {user.email}'
                                )
                            )
                        except Exception as e:
                            self.stdout.write(
                                self.style.ERROR(f'  [ERROR] Failed to create member: {e}')
                            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING('\nDRY RUN - No changes made. Remove --dry-run to apply fixes.')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\n[OK] Fixed {len(orphaned_invitations)} invitation(s)')
            )
