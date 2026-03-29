"""Tests for lists app."""
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from zoneinfo import ZoneInfo

from events.models import Event
from families.models import Family, Member
from lists.checklist_calendar_sync import (
    build_event_notes,
    sync_checklist_section_calendar,
    upsert_checklist_event_content,
)
from lists.models import List, ListItem, ListSection

User = get_user_model()


class CopyChecklistTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='copytest@example.com', password='testpass123')
        self.family = Family.objects.create(name='TestFam')
        self.family.owner = self.user
        self.family.save()
        self.member = Member.objects.create(user=self.user, family=self.family, role='owner')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.source = List.objects.create(
            family=self.family,
            created_by=self.member,
            name='Source Checklist',
            description='Desc',
            list_type='checklist',
            color='#10b981',
        )
        self.sec1 = ListSection.objects.create(
            list=self.source,
            order=0,
            section_date=date.today() - timedelta(days=5),
            title='Section A',
            bullet_style='number',
        )
        self.sec2 = ListSection.objects.create(
            list=self.source,
            order=1,
            section_date=date.today() - timedelta(days=1),
            title='Section B',
            bullet_style='dot',
        )
        self.item1 = ListItem.objects.create(
            list=self.source,
            created_by=self.member,
            section=self.sec1,
            name='Item one',
            notes='N1',
            order=0,
            completed=True,
        )
        self.item2 = ListItem.objects.create(
            list=self.source,
            created_by=self.member,
            section=self.sec1,
            parent=self.item1,
            name='Child',
            order=1,
            indent_level=1,
            completed=True,
        )
        ListItem.objects.create(
            list=self.source,
            created_by=self.member,
            section=self.sec2,
            name='In B',
            order=0,
        )

    def test_copy_checklist_creates_new_list_and_preserves_source(self):
        url = reverse('list-copy', kwargs={'pk': self.source.pk})
        res = self.client.post(url, {'name': 'My Duplicate'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data.get('calendar_updated'))
        new_id = res.data['id']
        self.assertNotEqual(new_id, self.source.pk)

        new_list = List.objects.get(pk=new_id)
        self.assertEqual(new_list.name, 'My Duplicate')
        self.assertEqual(new_list.list_type, 'checklist')

        # Source unchanged
        self.source.refresh_from_db()
        self.assertEqual(ListSection.objects.filter(list=self.source).count(), 2)
        self.assertEqual(ListItem.objects.filter(list=self.source).count(), 3)

        new_sections = list(ListSection.objects.filter(list=new_list).order_by('order'))
        self.assertEqual(len(new_sections), 2)
        for s in new_sections:
            self.assertEqual(s.section_date, date.today())

        new_items = ListItem.objects.filter(list=new_list)
        self.assertEqual(new_items.count(), 3)
        self.assertFalse(new_items.filter(completed=True).exists())

        # EncryptedCharField: do not use queryset .get(name=...) — DB cannot match plaintext.
        new_items_list = list(new_items)
        by_id = {i.id: i for i in new_items_list}
        nested = [i for i in new_items_list if i.parent_id is not None]
        self.assertEqual(len(nested), 1)
        child = nested[0]
        self.assertEqual(child.name, 'Child')
        parent = by_id[child.parent_id]
        self.assertEqual(parent.name, 'Item one')

    def test_copy_rejects_non_checklist(self):
        other = List.objects.create(
            family=self.family,
            created_by=self.member,
            name='Todo',
            list_type='todo',
            color='#fff',
        )
        url = reverse('list-copy', kwargs={'pk': other.pk})
        res = self.client.post(url, {'name': 'X'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class ChecklistCalendarSyncTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='calsync@example.com', password='testpass123')
        self.family = Family.objects.create(name='CalFam')
        self.family.owner = self.user
        self.family.save()
        self.member = Member.objects.create(user=self.user, family=self.family, role='owner')
        self.today = date.today()
        self.checklist = List.objects.create(
            family=self.family,
            created_by=self.member,
            name='Trip',
            list_type='checklist',
            color='#10b981',
        )

    def test_three_sections_same_day_stack_hours_from_eight(self):
        s1 = ListSection.objects.create(
            list=self.checklist, order=0, section_date=self.today, title='Pack', bullet_style='number'
        )
        s2 = ListSection.objects.create(
            list=self.checklist, order=1, section_date=self.today, title='Go', bullet_style='number'
        )
        s3 = ListSection.objects.create(
            list=self.checklist, order=2, section_date=self.today, title='Done', bullet_style='number'
        )
        for s in (s1, s2, s3):
            sync_checklist_section_calendar(s, self.member)

        events = list(
            Event.objects.filter(family=self.family, list_section__isnull=False).order_by('starts_at')
        )
        self.assertEqual(len(events), 3)
        tz = ZoneInfo(settings.CHECKLIST_CALENDAR_TIME_ZONE)
        for i, ev in enumerate(events):
            local = ev.starts_at.astimezone(tz)
            self.assertEqual(local.hour, 8 + i)
            self.assertEqual(local.minute, 0)

    def test_item_change_updates_event_notes(self):
        section = ListSection.objects.create(
            list=self.checklist,
            order=0,
            section_date=self.today,
            title='Groceries',
            bullet_style='dot',
        )
        sync_checklist_section_calendar(section, self.member)
        item = ListItem.objects.create(
            list=self.checklist,
            created_by=self.member,
            section=section,
            name='Milk',
            order=0,
        )
        upsert_checklist_event_content(section, self.member)
        ev = Event.objects.get(list_section=section)
        self.assertIn('Milk', ev.notes)
        item.name = 'Oat milk'
        item.save(update_fields=['name'])
        upsert_checklist_event_content(section, self.member)
        ev.refresh_from_db()
        self.assertIn('Oat milk', ev.notes)

    def test_build_event_notes_includes_list_name(self):
        section = ListSection.objects.create(
            list=self.checklist,
            order=0,
            section_date=self.today,
            title='S',
            bullet_style='number',
        )
        text = build_event_notes(section)
        self.assertIn('Trip', text)
