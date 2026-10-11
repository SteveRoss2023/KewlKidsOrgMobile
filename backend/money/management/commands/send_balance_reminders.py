"""
Email family members to update Money account balances (intended for the 1st).

  python manage.py send_balance_reminders
  python manage.py send_balance_reminders --force          # any day
  python manage.py send_balance_reminders --dry-run
  python manage.py send_balance_reminders --email you@x.com
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.core.management.base import BaseCommand
from django.conf import settings

from families.models import Member
from money.balance_reminder_email import build_balance_reminder_email
from money.models import Account

User = get_user_model()


class Command(BaseCommand):
    help = 'Send HTML emails reminding users to update Money account balances on the 1st.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Send even when today is not the 1st of the month.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print who would be emailed without sending.',
        )
        parser.add_argument(
            '--email',
            type=str,
            default='',
            help='Only send to this email address (for testing).',
        )

    def handle(self, *args, **options):
        today = date.today()
        if today.day != 1 and not options['force']:
            self.stdout.write(
                self.style.WARNING(
                    f'Today is day {today.day}, not the 1st. Use --force to send anyway.'
                )
            )
            return

        as_of = today.replace(day=1)
        only_email = (options.get('email') or '').strip().lower()

        # Active accounts → family ids
        family_ids = list(
            Account.objects.filter(is_active=True)
            .values_list('family_id', flat=True)
            .distinct()
        )
        if not family_ids:
            self.stdout.write('No active money accounts; nothing to send.')
            return

        members = (
            Member.objects.filter(family_id__in=family_ids, user__isnull=False)
            .select_related('user', 'family')
        )
        if only_email:
            members = members.filter(user__email__iexact=only_email)

        # user_id -> list of {family_name, accounts[]}
        by_user: dict[int, dict] = {}
        for member in members:
            user = member.user
            if not user or not user.email:
                continue
            accounts = list(
                Account.objects.filter(family_id=member.family_id, is_active=True).order_by(
                    'account_type', 'id'
                )
            )
            if not accounts:
                continue
            entry = by_user.setdefault(
                user.id,
                {'user': user, 'blocks': [], 'family_ids': set()},
            )
            if member.family_id in entry['family_ids']:
                continue
            entry['family_ids'].add(member.family_id)
            entry['blocks'].append(
                {
                    'family_name': member.family.name if member.family_id else 'Family',
                    'accounts': [a.name for a in accounts],
                }
            )

        sent = 0
        failed = 0
        for data in by_user.values():
            user = data['user']
            display = ''
            try:
                profile = getattr(user, 'profile', None)
                if profile and getattr(profile, 'display_name', None):
                    display = profile.display_name
            except Exception:
                display = ''
            if not display:
                display = user.email.split('@')[0] if user.email else 'there'
            subject, text_body, html_body = build_balance_reminder_email(
                display_name=display,
                family_blocks=data['blocks'],
                as_of=as_of,
            )
            if options['dry_run']:
                self.stdout.write(
                    f"[dry-run] {user.email} — {len(data['blocks'])} family block(s)"
                )
                sent += 1
                continue
            try:
                msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text_body,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[user.email],
                )
                msg.attach_alternative(html_body, 'text/html')
                msg.send(fail_silently=False)
                sent += 1
                self.stdout.write(self.style.SUCCESS(f'Sent to {user.email}'))
            except Exception as exc:
                failed += 1
                self.stderr.write(self.style.ERROR(f'Failed {user.email}: {exc}'))

        self.stdout.write(
            self.style.SUCCESS(f'Done. sent={sent} failed={failed} as_of={as_of.isoformat()}')
        )
