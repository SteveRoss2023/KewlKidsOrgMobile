"""
Seed "Coyote Fall Task List (2025)" checklist from plan data.
Usage: python manage.py seed_coyote_checklist --family=1
"""
import datetime

from django.core.management.base import BaseCommand
from lists.models import List, ListSection, ListItem
from families.models import Family, Member


class Command(BaseCommand):
    help = 'Create Coyote Fall Task List (2025) checklist with sections and items'

    def add_arguments(self, parser):
        parser.add_argument('--family', type=int, help='Family ID to create the list for (required unless --list-families)')
        parser.add_argument('--list-families', action='store_true', help='Print all family IDs and names, then exit')
        parser.add_argument('--dry-run', action='store_true', help='Print what would be created without writing')

    def handle(self, *args, **options):
        if options.get('list_families'):
            families = Family.objects.all().order_by('id')
            if not families.exists():
                self.stdout.write(self.style.WARNING('No families found in the database.'))
                return
            self.stdout.write('Family ID | Name')
            self.stdout.write('----------|------')
            for f in families:
                self.stdout.write(f'  {f.id}      | {f.name}')
            self.stdout.write('')
            self.stdout.write('Run: python manage.py seed_coyote_checklist --family=<ID>')
            return

        family_id = options.get('family')
        if family_id is None:
            self.stdout.write(self.style.ERROR('Missing --family=<ID>. Use --list-families to see available family IDs.'))
            return
        dry_run = options['dry_run']

        try:
            family = Family.objects.get(pk=family_id)
        except Family.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Family with id={family_id} does not exist.'))
            return

        member = family.members.first()
        created_by = member if member else None

        if dry_run:
            self.stdout.write('DRY RUN - no changes will be saved')
            self.stdout.write(f'Would create list "Coyote Fall Task List (2025)" for family "{family.name}"')
            return

        # Avoid duplicate: skip if list already exists
        existing = [l for l in family.lists.filter(archived=False) if l.name == 'Coyote Fall Task List (2025)']
        if existing:
            self.stdout.write(self.style.WARNING(f'List "Coyote Fall Task List (2025)" already exists for family "{family.name}" (id={existing[0].id}). Skipping.'))
            return

        list_obj = List.objects.create(
            family=family,
            created_by=created_by,
            name='Coyote Fall Task List (2025)',
            description='Fall move-out checklist',
            list_type='checklist',
            color='#10b981',
        )
        self.stdout.write(self.style.SUCCESS(f'Created list id={list_obj.id}'))

        # section_date drives sort (earliest first); order ties same-day sections
        sections_data = [
            (0, 'Put Shaw Direct on Pause (Sept 29, 2025 - Mar 31, 2026)', 'dot', datetime.date(2025, 9, 29)),
            (1, '1. Truck (Friday/Saturday) - Friday Sept 19/20 - Done', 'number', datetime.date(2025, 9, 19)),
            (2, '2. Pack Gazebo\'s - Saturday/Sunday Sept 20/21-', 'number', datetime.date(2025, 9, 20)),
            (3, '3. Trailer (Inside) - Saturday Sept 27th', 'number', datetime.date(2025, 9, 27)),
            (4, '4. Get Golf Cart ready - Saturday Sept 27th (After Golf or Early Sunday Morning)', 'number', datetime.date(2025, 9, 27)),
            (5, '5. Trailer (Outside) - Sunday Sept 28th', 'number', datetime.date(2025, 9, 28)),
            (6, '6. 1st Trip - Thursday September 25th, 2025', 'number', datetime.date(2025, 9, 25)),
            (7, '7. Final Trip - Sunday September 28th, 2025', 'number', datetime.date(2025, 9, 28)),
        ]
        sections = []
        for order, title, bullet_style, section_date in sections_data:
            sec = ListSection.objects.create(
                list=list_obj,
                order=order,
                title=title,
                bullet_style=bullet_style,
                section_date=section_date,
            )
            sections.append(sec)
        self.stdout.write(self.style.SUCCESS(f'Created {len(sections)} sections'))

        # Section 0 - no items
        # Section 1 - Truck
        s1 = sections[1]
        for i, name in enumerate([
            'Move truck beside shed (Leave room all the way around)',
            'Take Batteries Out',
            'Take Antena Off - Put in Shed.',
            'Put Cover on and secure.',
        ]):
            ListItem.objects.create(list=list_obj, section=s1, order=i, name=name, created_by=created_by)

        # Section 2 - Pack Gazebo's
        s2 = sections[2]
        for i, name in enumerate([
            'Take out trough',
            'Pack TV, Store Shaw box in trailer',
            'Cover on Blackstone',
            'Turn Off Propane',
            'Blackstone and Fire Tables',
            'Clean Fridges',
            'Leave Fridge Doors/covers open.',
            'Un-Plug Fridges',
            'Move Chairs and Fire Pit in.',
            'Pack Cushions',
            'Remove IceMaker',
            'Put covers on furniture/Tables',
            'Move Bin that covers were in into Gazebo',
            'Move Speaker into Trailer',
            'Put poles in',
            'Put Covers on and Lock Down',
        ]):
            ListItem.objects.create(list=list_obj, section=s2, order=i, name=name, created_by=created_by)

        # Section 3 - Trailer (Inside) - with nesting under "Pack Clothes for Edmonton"
        s3 = sections[3]
        s3_items = [
            ('Sweep and wash floors', 0),
            ('Empty & Clean Fridge (Night before leaving so can defrost) - Saturday Sept 27th', 0),
            ('Put in Baking Soda (Buy New if needed) - Saturday Sept 27th', 0),
            ('Turn Off Fridge - Saturday Sept 27th', 0),
            ('Pack Liquids/Kitchen Stuff from Pantry', 0),
            ('Pack Instapot - Thursday night', 0),
            ('Pack Ice Maker - Thursday night', 0),
            ('Pack Booze into cooler (Blue One), leave at back of trailer', 0),
            ('Pack Liquids from Island (Dish soap/End compartment) - Thursday night', 0),
            ('Pack Shaw Gear', 0),
            ('Remove bedding - Take pillow covers/sheets and duvet cover to wash - (Sunday AM)', 0),
            ('Take Bed Clips to Edmonton - (Sunday AM)', 0),
            ('Pack Red Comforter, sheets/Pillowcases- Thursday night', 0),
            ('Pack Pillows for Edmonton (3 or 4)- Thursday night', 0),
            ('Store Duvet/Pillows in big yellow bin - (Sunday AM)', 0),
            ('Take Passport, Put in Backpack', 0),
            ('Pack Clothes for Edmonton - Big Suitcase - Thursday night', 0),
            ('Only what is needed, leave the rest.', 1),
            ('Work Shirts/Pull Overs', 2),
            ('Golf Shirts/Shorts', 2),
            ('Pants', 2),
            ('Socks', 2),
            ('Belt', 2),
            ('Shoes', 2),
            ('Sweats', 2),
            ('Pack Bathroom stuff (Leave minimal for weekend) - Thursday night', 0),
            ('Clean bathroom, Shower, Toilet - Saturday Sept 27th', 0),
            ('Spare set of keys', 0),
            ('Air Fresheners', 0),
            ('Battery Charger', 0),
            ('Gloves', 0),
            ('Drone', 0),
            ('Pack Computers (Laptop/PC/Monitor) - Backpack - Thursday night (1st Load)', 0),
            ('Check Starlink position in trailer and ensure is working. - Sunday Sept 28th', 0),
            ('Pack Golf Clubs - (Speaker/Range Finder, Shoes) - Saturday Sept 27th', 0),
        ]
        for order, (name, indent) in enumerate(s3_items):
            ListItem.objects.create(list=list_obj, section=s3, order=order, indent_level=indent, name=name, created_by=created_by)

        # Section 4 - Get Golf Cart ready
        s4 = sections[4]
        for i, name in enumerate([
            'Fill Batteries',
            'Clean Batteries',
            'Fully Charge',
            'Plug In',
            'Put in Tow Mode',
            'Turn Key Off and put in Trailer',
            'Turn off USB',
            'Take out all liquids take to Edmonton.',
        ]):
            ListItem.objects.create(list=list_obj, section=s4, order=i, name=name, created_by=created_by)

        # Section 5 - Trailer (Outside)
        s5 = sections[5]
        for i, name in enumerate([
            'Remove Liquids from Storage compartments',
            'Un-hook Propane',
            'Winterize (King Kong/Blair/Steve) - Sunday Sept 28th.',
            'Turn Water Off',
            'Store Water Hose - storage compartment front',
            'Put lawn hose away (Back Shed)',
            'Take Water Splitter off and store (storage beside panel)',
            'Move garbage can to shed.',
            'Close Slides',
            'Lock Doors.',
        ]):
            ListItem.objects.create(list=list_obj, section=s5, order=i, name=name, created_by=created_by)

        # Section 6 - 1st Trip
        s6 = sections[6]
        for i, name in enumerate([
            'TV',
            'Table for Computer (Big One)',
            'Bedding/Pillows (Red Comforter)',
            'Shaw Gear',
            'Truck Batteries',
            'Laundry Bin (Small Blue One)',
            'Computers/Monitor/Passport/EPCOR Badge - (BackPack)',
            'Big Suit Case',
            'Work Clothes (Shoes, Jackets etc) - most all clothes, just need little left for the weekend',
            'Big Yellow Bin (Kitchen/Pantry stuff,)',
            'Insta-pot, Ice Maker, Chip Clips, Kitchen Liquids, Food, Chip Bag Clips)',
            'Dolly',
            'EPCOR Badge (In BackPack)',
            'Screw Driver (In Tv Box)',
            'Bathroom Stuff (Just need to leave min @ Trailer for weekend)',
            'Couple bars of Soap, Tums, Small Bin, Ibuprofin\'s, Shaving Cream',
            'Towels, Hand Towels.',
            'Bring back big yellow bin to trailer for anything remaining',
            'Leave Back Pack at Condo',
            'Bring Clock',
            'Big Garbage can',
        ]):
            ListItem.objects.create(list=list_obj, section=s6, order=i, name=name, created_by=created_by)

        # Section 7 - Final Trip
        s7 = sections[7]
        for i, name in enumerate([
            'Tablet and Phone/Tablet Chargers - Back Pack/Black Duffel',
            'Coffee Maker - Big Yellow Bin',
            'Bedding - take to wash (Leave Pillows), Put in Bag - Big Yellow Bin',
            'Golf Clubs - (Speaker/Range Finder, Shoes)',
            'Any remaining clothes - Travel Bag (Black Duffel style)',
            'bathroom stuff - minimal - backpack',
            'Big Garbage can.',
            'Clock',
            'Multi Plug outlets - need 2',
            'Paper Towels from basement',
            'Water Glass',
            'Water Jug',
            'Big Black/Yellow tub',
            'liquids (From shed too) -',
            'Food, can opener (Optional Check new Condo)',
            'bigger garbage can (Optional Check new Condo)',
        ]):
            ListItem.objects.create(list=list_obj, section=s7, order=i, name=name, created_by=created_by)

        total_items = ListItem.objects.filter(list=list_obj).count()
        self.stdout.write(self.style.SUCCESS(f'Created {total_items} list items'))
        self.stdout.write(self.style.SUCCESS('Coyote Fall Task List (2025) seeded successfully.'))
