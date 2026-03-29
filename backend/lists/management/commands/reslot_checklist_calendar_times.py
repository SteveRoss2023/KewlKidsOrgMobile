"""
Recompute starts_at / ends_at for all checklist-backed calendar events using the current
CHECKLIST_CALENDAR_TIME_ZONE (8am stack per section_date).

Run after changing CHECKLIST_CALENDAR_TIME_ZONE or fixing timezone defaults so existing rows
match local 8am instead of e.g. 8am UTC. Re-push to Outlook afterward if you use checklist sync.

Usage:
  python manage.py reslot_checklist_calendar_times
  python manage.py reslot_checklist_calendar_times --family=1
  python manage.py reslot_checklist_calendar_times --dry-run
"""
from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand

from families.models import Family
from lists.checklist_calendar_sync import reslot_checklist_events_for_date
from lists.models import ListSection


class Command(BaseCommand):
    help = (
        'Reslot all in-app checklist calendar events to 8:00 in CHECKLIST_CALENDAR_TIME_ZONE '
        '(per family + section_date). Does not create missing events; use backfill_checklist_calendar_events for that.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--family',
            type=int,
            default=None,
            help='Only process this family ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List (family_id, date) pairs that would be reslotted without saving',
        )

    def handle(self, *args, **options):
        family_id = options.get('family')
        dry_run = options['dry_run']

        qs = ListSection.objects.filter(list__archived=False).select_related('list', 'list__family')
        if family_id is not None:
            qs = qs.filter(list__family_id=family_id)

        pairs: set[tuple[int, date]] = set()
        for sec in qs:
            if sec.list.list_type != 'checklist':
                continue
            pairs.add((sec.list.family_id, sec.section_date))

        if not pairs:
            self.stdout.write(self.style.WARNING('No checklist sections found.'))
            return

        sorted_pairs = sorted(pairs, key=lambda x: (x[0], x[1]))
        self.stdout.write(
            f'CHECKLIST_CALENDAR_TIME_ZONE (effective): using reslot for {len(sorted_pairs)} '
            f'family+date group(s).'
        )

        for fid, d in sorted_pairs:
            if dry_run:
                self.stdout.write(f'  [dry-run] family_id={fid} section_date={d}')
            else:
                family = Family.objects.get(pk=fid)
                reslot_checklist_events_for_date(family, d)

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f'DRY RUN: would reslot {len(sorted_pairs)} group(s). '
                    f'Run without --dry-run to apply.'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Reslotted checklist calendar events for {len(sorted_pairs)} family+date group(s). '
                    f'Push to Outlook again if you sync checklist events externally.'
                )
            )
