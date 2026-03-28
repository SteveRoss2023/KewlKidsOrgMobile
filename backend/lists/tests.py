"""Tests for lists app."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from families.models import Family, Member
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

        child = new_items.get(name='Child')
        self.assertIsNotNone(child.parent_id)
        parent = new_items.get(name='Item one')
        self.assertEqual(child.parent_id, parent.id)

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
