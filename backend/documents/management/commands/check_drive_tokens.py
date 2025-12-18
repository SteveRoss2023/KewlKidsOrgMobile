from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from documents.models import OneDriveSync, GoogleDriveSync


class Command(BaseCommand):
    help = "Inspect OneDrive and Google Drive OAuth tokens for a given user."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            type=int,
            required=True,
            help="ID of the user to inspect",
        )

    def handle(self, *args, **options):
        user_id = options["user_id"]
        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"User {user_id} not found"))
            return

        self.stdout.write(self.style.MIGRATE_HEADING(f"Inspecting drive tokens for user {user_id} ({user.email})"))

        onedrive_qs = OneDriveSync.objects.filter(member__user=user)
        googledrive_qs = GoogleDriveSync.objects.filter(member__user=user)

        self.stdout.write(self.style.HTTP_INFO("\nOneDriveSync records:"))
        if not onedrive_qs.exists():
            self.stdout.write("  (none)")
        for s in onedrive_qs:
            self.stdout.write(
                f"  id={s.id}, is_active={s.is_active}, "
                f"has_refresh_token={bool(s.refresh_token_encrypted)}, "
                f"connected_at={s.connected_at}, updated_at={s.updated_at}"
            )

        self.stdout.write(self.style.HTTP_INFO("\nGoogleDriveSync records:"))
        if not googledrive_qs.exists():
            self.stdout.write("  (none)")
        for s in googledrive_qs:
            self.stdout.write(
                f"  id={s.id}, is_active={s.is_active}, "
                f"has_refresh_token={bool(s.refresh_token_encrypted)}, "
                f"connected_at={s.connected_at}, updated_at={s.updated_at}"
            )


