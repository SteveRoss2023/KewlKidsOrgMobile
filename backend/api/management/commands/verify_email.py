from django.core.management.base import BaseCommand
from api.models import User, UserProfile


class Command(BaseCommand):
    help = 'Mark a user\'s email as verified'

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='Email address of the user to verify')

    def handle(self, *args, **options):
        email = options['email']
        
        try:
            user = User.objects.get(email=email)
            profile = UserProfile.get_or_create_profile(user)
            
            if profile.email_verified:
                self.stdout.write(self.style.WARNING(f'Email {email} is already verified.'))
            else:
                profile.email_verified = True
                profile.save()
                self.stdout.write(self.style.SUCCESS(f'Successfully verified email for {email}'))
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User with email {email} not found.'))











