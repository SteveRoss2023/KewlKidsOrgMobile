"""
Backfill in-app calendar events for checklist sections created before sync existed.

Usage:
  python manage.py backfill_checklist_calendar_events
  python manage.py backfill_checklist_calendar_events --family=1
  python manage.py backfill_checklist_calendar_events --dry-run
"""
from django.core.management.base import BaseCommand

from families.models import Member
from lists.checklist_calendar_sync import sync_checklist_section_calendar
from lists.models import List


class Command(BaseCommand):
    help = (
        'Create/update family calendar events for all checklist sections '
        '(same logic as API sync; use for existing data after enabling integration).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--family',
            type=int,
            default=None,
            help='Only process lists belonging to this family ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print sections that would be synced without writing to the database',
        )

    def handle(self, *args, **options):
        family_id = options.get('family')
        dry_run = options['dry_run']

        lists_qs = List.objects.filter(archived=False).select_related('family')
        if family_id is not None:
            lists_qs = lists_qs.filter(family_id=family_id)

        # list_type is encrypted — filter in Python
        checklist_lists = [lst for lst in lists_qs if lst.list_type == 'checklist']

        if not checklist_lists:
            self.stdout.write(self.style.WARNING('No checklist lists found.'))
            return

        sections_synced = 0
        sections_skipped = 0

        for lst in checklist_lists:
            member = lst.created_by
            if member is None:
                member = (
                    Member.objects.filter(family=lst.family).order_by('id').first()
                )
            sections = list(lst.sections.order_by('section_date', 'order', 'id'))

            if not member:
                self.stdout.write(
                    self.style.WARNING(
                        f'List id={lst.id}: no list.created_by and no family members; '
                        f'skipping {len(sections)} section(s).'
                    )
                )
                sections_skipped += len(sections)
                continue

            for section in sections:
                if dry_run:
                    title_preview = str(section.title)[:60]
                    self.stdout.write(
                        f'  [dry-run] section id={section.id} list_id={lst.id} '
                        f'date={section.section_date} title={title_preview!r}'
                    )
                else:
                    sync_checklist_section_calendar(section, member)
                sections_synced += 1

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f'DRY RUN: would sync {sections_synced} section(s) '
                    f'across {len(checklist_lists)} checklist list(s).'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Synced {sections_synced} checklist section(s) '
                    f'across {len(checklist_lists)} list(s) to the in-app calendar.'
                )
            )
        if sections_skipped:
            self.stdout.write(
                self.style.WARNING(f'Skipped {sections_skipped} section(s) (no member to set as created_by).')
            )
