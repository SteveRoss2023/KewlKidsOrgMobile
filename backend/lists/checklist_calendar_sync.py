"""
Keep in-app family calendar events in sync with checklist sections.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Dict, List as TypingList
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from events.models import Event
from families.models import Member

from .models import ListItem, ListSection


def build_event_notes(section: ListSection) -> str:
    lines = [f"List: {section.list.name}"]
    items = list(
        ListItem.objects.filter(list=section.list, section=section).order_by('order', 'id')
    )
    by_parent: Dict[int | None, TypingList[ListItem]] = {}
    for it in items:
        by_parent.setdefault(it.parent_id, []).append(it)

    def walk(parent_id: int | None, depth: int) -> None:
        for it in by_parent.get(parent_id, []):
            indent = '  ' * depth
            mark = '[x] ' if it.completed else '• '
            lines.append(f"{indent}{mark}{it.name}")
            walk(it.id, depth + 1)

    walk(None, 0)
    return '\n'.join(lines)


def _checklist_calendar_tz():
    return ZoneInfo(settings.CHECKLIST_CALENDAR_TIME_ZONE)


def _placeholder_slot(section: ListSection) -> tuple[datetime, datetime]:
    tz = _checklist_calendar_tz()
    d = section.section_date
    start = timezone.make_aware(datetime.combine(d, time(8, 0)), tz)
    end = start + timedelta(hours=1)
    return start, end


def reslot_checklist_events_for_date(family, d) -> None:
    """Stack 1-hour blocks from 08:00 in CHECKLIST_CALENDAR_TIME_ZONE for all checklist-backed events on that day."""
    qs = (
        Event.objects.filter(
            family=family,
            list_section__isnull=False,
            list_section__section_date=d,
        )
        .select_related('list_section', 'list_section__list')
    )
    events = list(qs)
    events.sort(
        key=lambda ev: (
            str(ev.list_section.list.name),
            ev.list_section.order,
            ev.list_section.id,
        )
    )
    tz = _checklist_calendar_tz()
    base = timezone.make_aware(datetime.combine(d, time(8, 0)), tz)
    for i, ev in enumerate(events):
        slot_start = base + timedelta(hours=i)
        slot_end = slot_start + timedelta(hours=1)
        sec = ev.list_section
        ev.starts_at = slot_start
        ev.ends_at = slot_end
        ev.title = sec.title
        ev.notes = build_event_notes(sec)
        ev.is_all_day = False
        ev.save(
            update_fields=[
                'starts_at',
                'ends_at',
                'title',
                'notes',
                'is_all_day',
                'updated_at',
            ]
        )


def ensure_checklist_event(section: ListSection, member: Member) -> Event:
    """Create or refresh the linked Event; then reslot that section_date for the family."""
    if section.list.list_type != 'checklist':
        raise ValueError('Section must belong to a checklist list')

    placeholder_start, placeholder_end = _placeholder_slot(section)
    event, created = Event.objects.get_or_create(
        list_section=section,
        defaults={
            'family': section.list.family,
            'created_by': member,
            'title': section.title,
            'notes': build_event_notes(section),
            'starts_at': placeholder_start,
            'ends_at': placeholder_end,
            'is_all_day': False,
            'color': section.list.color or '#10b981',
        },
    )
    if not created:
        event.title = section.title
        event.notes = build_event_notes(section)
        if section.list.color:
            event.color = section.list.color
        event.save(update_fields=['title', 'notes', 'color', 'updated_at'])

    reslot_checklist_events_for_date(section.list.family, section.section_date)
    return event


def sync_checklist_section_calendar(section: ListSection, member: Member) -> None:
    if section.list.list_type != 'checklist':
        return
    ensure_checklist_event(section, member)


def upsert_checklist_event_content(section: ListSection, member: Member) -> None:
    """Update notes/title for checklist section's event; create + reslot if missing."""
    if section.list.list_type != 'checklist':
        return
    placeholder_start, placeholder_end = _placeholder_slot(section)
    event, created = Event.objects.get_or_create(
        list_section=section,
        defaults={
            'family': section.list.family,
            'created_by': member,
            'title': section.title,
            'notes': build_event_notes(section),
            'starts_at': placeholder_start,
            'ends_at': placeholder_end,
            'is_all_day': False,
            'color': section.list.color or '#10b981',
        },
    )
    if created:
        reslot_checklist_events_for_date(section.list.family, section.section_date)
    else:
        event.title = section.title
        event.notes = build_event_notes(section)
        event.save(update_fields=['title', 'notes', 'updated_at'])


def after_checklist_list_item_change(item: ListItem, user, old_section_id: int | None = None) -> None:
    if item.list.list_type != 'checklist':
        return
    member = Member.objects.filter(user=user, family=item.list.family).first()
    if not member:
        return
    sids = {item.section_id, old_section_id} - {None}
    for sid in sids:
        sec = ListSection.objects.filter(pk=sid, list_id=item.list_id).first()
        if sec:
            upsert_checklist_event_content(sec, member)


def after_checklist_list_item_deleted(list_id: int, section_id: int | None, user) -> None:
    if not section_id:
        return
    from .models import List

    list_obj = List.objects.filter(pk=list_id).first()
    if not list_obj or list_obj.list_type != 'checklist':
        return
    member = Member.objects.filter(user=user, family=list_obj.family).first()
    if not member:
        return
    sec = ListSection.objects.filter(pk=section_id, list_id=list_id).first()
    if sec:
        upsert_checklist_event_content(sec, member)
