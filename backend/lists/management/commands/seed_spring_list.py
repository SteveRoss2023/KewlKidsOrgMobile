"""
Seed "Spring List (2026)" from Spring-list.txt at repo root.
Usage: python manage.py seed_spring_list --family=1
"""
import datetime
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from families.models import Family, Member
from lists.models import List, ListItem, ListSection


SECTION_HEADER_RE = re.compile(
    r'^(?P<title>1st|2nd|3rd|\d+th)\s+Trip\s*-\s*2026\s*-\s*(?P<daterest>.+)$',
    re.IGNORECASE,
)


def _parse_trip_daterest(daterest: str) -> datetime.date:
    daterest = daterest.strip()
    for fmt in ('%B %d-%Y', '%B %d, %Y', '%B %d %Y'):
        try:
            return datetime.datetime.strptime(daterest, fmt).date()
        except ValueError:
            continue
    return datetime.datetime.strptime(f'{daterest} 2026', '%B %d %Y').date()


def _parse_spring_list_file(path: Path):
    """Return [(section_title, section_date, [(name, indent_level), ...]), ...]."""
    text = path.read_text(encoding='utf-8')
    lines = text.splitlines()
    sections_out = []
    current_header = None
    current_date = None
    current_items = []

    def flush():
        nonlocal current_header, current_date, current_items
        if current_header is not None:
            sections_out.append((current_header, current_date, current_items))
        current_header = None
        current_date = None
        current_items = []

    for line in lines:
        m = SECTION_HEADER_RE.match(line.strip() if line.strip() else '')
        if m:
            flush()
            full_header = line.strip()
            current_header = full_header
            current_date = _parse_trip_daterest(m.group('daterest'))
            continue
        if current_header is None:
            continue
        if not line.strip():
            continue
        leading = len(line) - len(line.lstrip(' '))
        if leading < 4:
            continue
        name = line.strip()
        indent_level = max(0, (leading - 4) // 4)
        current_items.append((name, indent_level))

    flush()
    return sections_out


class Command(BaseCommand):
    help = 'Create Spring List (2026) checklist from Spring-list.txt'

    def add_arguments(self, parser):
        parser.add_argument('--family', type=int, help='Family ID (required unless --list-families)')
        parser.add_argument('--list-families', action='store_true', help='Print family IDs and exit')
        parser.add_argument('--dry-run', action='store_true', help='Parse file and print plan; no DB writes')
        parser.add_argument(
            '--file',
            type=str,
            default='',
            help='Path to Spring-list.txt (default: <repo root>/Spring-list.txt)',
        )

    def handle(self, *args, **options):
        if options.get('list_families'):
            families = Family.objects.all().order_by('id')
            if not families.exists():
                self.stdout.write(self.style.WARNING('No families found.'))
                return
            self.stdout.write('Family ID | Name')
            self.stdout.write('----------|------')
            for f in families:
                self.stdout.write(f'  {f.id}      | {f.name}')
            self.stdout.write('')
            self.stdout.write('Run: python manage.py seed_spring_list --family=<ID>')
            return

        file_arg = options.get('file') or ''
        if file_arg:
            path = Path(file_arg)
        else:
            path = Path(settings.BASE_DIR).parent / 'Spring-list.txt'

        if not path.is_file():
            self.stdout.write(self.style.ERROR(f'Spring list file not found: {path}'))
            return

        try:
            parsed = _parse_spring_list_file(path)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to parse {path}: {e}'))
            raise

        if not parsed:
            self.stdout.write(self.style.ERROR('No sections parsed from file.'))
            return

        if options['dry_run']:
            self.stdout.write('DRY RUN')
            self.stdout.write(f'File: {path}')
            for title, d, items in parsed:
                self.stdout.write(f'  Section: {title!r}  date={d}')
                for name, il in items:
                    self.stdout.write(f'    {"  " * il}- {name}')
            return

        family_id = options.get('family')
        if family_id is None:
            self.stdout.write(self.style.ERROR('Missing --family=<ID>. Use --list-families.'))
            return

        try:
            family = Family.objects.get(pk=family_id)
        except Family.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Family id={family_id} does not exist.'))
            return

        member = family.members.first()
        created_by = member if member else None
        list_name = 'Spring List (2026)'

        existing = [l for l in family.lists.filter(archived=False) if l.name == list_name]
        if existing:
            self.stdout.write(
                self.style.WARNING(
                    f'List {list_name!r} already exists for family {family.name!r} (id={existing[0].id}). Skipping.'
                )
            )
            return

        list_obj = List.objects.create(
            family=family,
            created_by=created_by,
            name=list_name,
            description='Spring trip packing checklist',
            list_type='checklist',
            color='#22c55e',
        )
        self.stdout.write(self.style.SUCCESS(f'Created list id={list_obj.id}'))

        sections = []
        for order, (title, section_date, _) in enumerate(parsed):
            sec = ListSection.objects.create(
                list=list_obj,
                order=order,
                title=title,
                bullet_style='number',
                section_date=section_date,
            )
            sections.append(sec)
        self.stdout.write(self.style.SUCCESS(f'Created {len(sections)} sections'))

        for sec, (_, _, items) in zip(sections, parsed):
            for i, (name, indent_level) in enumerate(items):
                ListItem.objects.create(
                    list=list_obj,
                    section=sec,
                    order=i,
                    indent_level=indent_level,
                    name=name,
                    created_by=created_by,
                )

        total = ListItem.objects.filter(list=list_obj).count()
        self.stdout.write(self.style.SUCCESS(f'Created {total} list items'))
        self.stdout.write(self.style.SUCCESS(f'{list_name} seeded successfully.'))
