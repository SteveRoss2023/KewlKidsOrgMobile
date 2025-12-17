"""Django management command to cleanup user and related data."""
from django.core.management.base import BaseCommand
from api.models import User, UserProfile
from families.models import Member, Invitation


class Command(BaseCommand):
    help = 'Delete a user and all related data'

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='Email address of the user to delete')

    def handle(self, *args, **options):
        email = options['email']
        
        # Find the user
        user = User.objects.filter(email=email).first()

        if user:
            self.stdout.write(self.style.SUCCESS(f"Found user: {user.email} (ID: {user.id})"))
            
            # Check related data
            profile = UserProfile.objects.filter(user=user).first()
            memberships = Member.objects.filter(user=user)
            invitations_to = Invitation.objects.filter(email=email)
            invitations_from = Invitation.objects.filter(invited_by=user)
            
            self.stdout.write(f"  Profile: {'exists' if profile else 'none'}")
            self.stdout.write(f"  Memberships: {memberships.count()}")
            self.stdout.write(f"  Invitations to this email: {invitations_to.count()}")
            self.stdout.write(f"  Invitations sent by this user: {invitations_from.count()}")
            
            # Delete invitations to this email
            if invitations_to.exists():
                self.stdout.write(f"\nDeleting {invitations_to.count()} invitation(s) to {email}...")
                invitations_to.delete()
            
            # Delete memberships (this will cascade from user deletion, but let's be explicit)
            if memberships.exists():
                self.stdout.write(f"\nDeleting {memberships.count()} membership(s)...")
                memberships.delete()
            
            # Delete the user (this will cascade delete profile)
            self.stdout.write(f"\nDeleting user {user.email}...")
            user.delete()
            
            self.stdout.write(self.style.SUCCESS(f"\nUser {email} and all related data deleted successfully!"))
        else:
            self.stdout.write(self.style.WARNING(f"User {email} not found."))
            
            # Still clean up any orphaned invitations
            invitations = Invitation.objects.filter(email=email)
            if invitations.exists():
                self.stdout.write(f"\nFound {invitations.count()} orphaned invitation(s) for {email}")
                self.stdout.write("Deleting orphaned invitations...")
                invitations.delete()
                self.stdout.write(self.style.SUCCESS("Orphaned invitations deleted!"))

        self.stdout.write(self.style.SUCCESS("\nCleanup complete!"))

