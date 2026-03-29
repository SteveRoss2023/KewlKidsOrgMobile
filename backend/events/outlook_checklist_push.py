"""
Push checklist-linked in-app events to Outlook via Microsoft Graph (on-demand).
"""
from __future__ import annotations

import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

import requests
from django.conf import settings
from django.utils import timezone

from events.models import CalendarSync, Event

logger = logging.getLogger(__name__)

GRAPH = 'https://graph.microsoft.com/v1.0'


def _refresh_microsoft_token(refresh_token: str) -> dict:
    tenant = 'consumers'
    token_url = f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
    data = {
        'client_id': settings.MICROSOFT_CLIENT_ID,
        'client_secret': settings.MICROSOFT_CLIENT_SECRET,
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token',
        'redirect_uri': settings.MICROSOFT_REDIRECT_URI,
    }
    response = requests.post(token_url, data=data, timeout=30)
    response.raise_for_status()
    return response.json()


def _event_graph_payload(ev: Event) -> dict:
    tz_name = settings.CHECKLIST_CALENDAR_TIME_ZONE
    z = ZoneInfo(tz_name)
    start = ev.starts_at.astimezone(z)
    end_at = ev.ends_at or (ev.starts_at + timedelta(hours=1))
    end = end_at.astimezone(z)
    return {
        'subject': str(ev.title),
        'body': {'contentType': 'text', 'content': str(ev.notes or '')},
        'start': {'dateTime': start.strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': tz_name},
        'end': {'dateTime': end.strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': tz_name},
    }


def push_checklist_events_to_outlook(
    *,
    sync_record: CalendarSync,
    user_key: bytes,
    family,
    list_id: int | None = None,
) -> dict:
    """
    Create or update Outlook events for all checklist-backed Event rows in the family.
    Returns counts: created, updated, failed, errors (list of str).
    """
    access_token, refresh_token = sync_record.decrypt_tokens(user_key=user_key)
    calendar_id = sync_record.calendar_id

    def do_request(method: str, url: str, **kwargs):
        nonlocal access_token, refresh_token
        headers = kwargs.pop('headers', {})
        headers.setdefault('Authorization', f'Bearer {access_token}')
        if 'json' in kwargs:
            headers.setdefault('Content-Type', 'application/json')
        r = requests.request(method, url, headers=headers, timeout=60, **kwargs)
        if r.status_code == 401 and refresh_token:
            try:
                td = _refresh_microsoft_token(refresh_token)
                access_token = td['access_token']
                if 'refresh_token' in td:
                    refresh_token = td['refresh_token']
                sync_record.update_tokens(access_token, refresh_token, user_key=user_key)
            except Exception as e:
                logger.exception('Outlook token refresh failed: %s', e)
                raise
            headers['Authorization'] = f'Bearer {access_token}'
            r = requests.request(method, url, headers=headers, timeout=60, **kwargs)
        return r

    qs = Event.objects.filter(
        family=family,
        list_section__isnull=False,
    ).select_related('list_section__list')
    if list_id is not None:
        qs = qs.filter(list_section__list_id=list_id)

    created = 0
    updated = 0
    failed = 0
    errors: list[str] = []

    for ev in qs:
        payload = _event_graph_payload(ev)
        try:
            if ev.external_calendar_id and ev.external_calendar_type == 'outlook':
                url = f'{GRAPH}/me/events/{ev.external_calendar_id}'
                headers = {}
                if ev.external_calendar_etag:
                    headers['If-Match'] = ev.external_calendar_etag
                resp = do_request('PATCH', url, json=payload, headers=headers)
                if resp.status_code == 412:
                    resp = do_request('PATCH', url, json=payload)
                resp.raise_for_status()
                data = resp.json() if resp.content else {}
                etag = resp.headers.get('ETag') or data.get('@odata.etag')
                ev.external_calendar_etag = etag or ev.external_calendar_etag
                ev.last_synced_at = timezone.now()
                ev.save(
                    update_fields=['external_calendar_etag', 'last_synced_at', 'updated_at']
                )
                updated += 1
            else:
                url = f'{GRAPH}/me/calendars/{calendar_id}/events'
                resp = do_request('POST', url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                ev.external_calendar_id = data.get('id', '')
                ev.external_calendar_type = 'outlook'
                ev.external_calendar_etag = resp.headers.get('ETag') or data.get('@odata.etag', '')
                ev.last_synced_at = timezone.now()
                ev.save(
                    update_fields=[
                        'external_calendar_id',
                        'external_calendar_type',
                        'external_calendar_etag',
                        'last_synced_at',
                        'updated_at',
                    ]
                )
                created += 1
        except requests.HTTPError as ex:
            failed += 1
            body = ''
            if ex.response is not None:
                try:
                    body = (ex.response.text or '')[:500]
                except Exception:
                    body = str(ex)
            errors.append(f'Event {ev.pk}: {body or str(ex)}')
            logger.warning('Outlook push HTTP error for event %s: %s', ev.pk, body)
        except Exception as ex:
            failed += 1
            errors.append(f'Event {ev.pk}: {ex!s}')
            logger.exception('Outlook push failed for event %s', ev.pk)

    return {
        'created': created,
        'updated': updated,
        'failed': failed,
        'errors': errors,
    }
