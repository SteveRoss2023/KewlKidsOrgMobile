"""Viewsets for money app."""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from families.models import Family, Member

from .models import Account, AccountSnapshot, IncomeOccurrence, IncomeStream
from .occurrence_gen import iter_due_dates
from .serializers import (
    AccountSerializer,
    AccountSnapshotSerializer,
    IncomeOccurrenceSerializer,
    IncomeStreamSerializer,
)


def _parse_date(value):
    if not value:
        return None
    return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()


def _apply_family_query_scope(queryset, request, view=None):
    """Scope membership queryset to ?family=. List requires family (else empty)."""
    family_raw = request.query_params.get('family')
    if family_raw not in (None, ''):
        try:
            return queryset.filter(family_id=int(family_raw))
        except (ValueError, TypeError):
            return queryset.none()
    action = getattr(view, 'action', None) if view is not None else None
    if action == 'list':
        return queryset.none()
    return queryset


def _member_for(user, family: Family):
    return Member.objects.filter(user=user, family=family).first()


def _money_equal(a, b) -> bool:
    try:
        return Decimal(str(a)) == Decimal(str(b))
    except (InvalidOperation, ValueError, TypeError):
        return str(a) == str(b)


def _has_actual_amount(occ: IncomeOccurrence) -> bool:
    val = occ.actual_amount
    return val is not None and str(val).strip() != ''


def _sync_estimated_occurrences(stream: IncomeStream) -> int:
    """Push stream.default_estimate onto unpaid estimated pay rows (This month uses these)."""
    estimate = stream.default_estimate
    updated = 0
    for occ in IncomeOccurrence.objects.filter(stream=stream, status='estimated'):
        if _has_actual_amount(occ):
            continue
        if _money_equal(occ.estimated_amount, estimate):
            continue
        occ.estimated_amount = estimate
        # Full save — EncryptedCharField can miss updates with update_fields.
        occ.save()
        updated += 1
    return updated


class IncomeStreamViewSet(viewsets.ModelViewSet):
    serializer_class = IncomeStreamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = IncomeStream.objects.filter(family__members__user=user)
        return _apply_family_query_scope(qs, self.request, self)

    def perform_create(self, serializer):
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        member = _member_for(self.request.user, family)
        serializer.save(family=family, created_by=member)

    def perform_update(self, serializer):
        stream = serializer.save()
        # This month / calendar read occurrence rows, not the stream default alone.
        _sync_estimated_occurrences(stream)

    @action(detail=True, methods=['post'])
    def generate_occurrences(self, request, pk=None):
        """Create missing occurrences from stream.start through until (or stream.end)."""
        stream = self.get_object()
        until_raw = request.data.get('until') or request.query_params.get('until')
        until = _parse_date(until_raw)
        if stream.frequency == 'one_time':
            until = stream.start_date
        else:
            if not until:
                # Open-ended streams: fill a few years ahead so year nav is not empty.
                until = stream.end_date or date(date.today().year + 5, 12, 31)
            if stream.end_date and until > stream.end_date:
                until = stream.end_date

        created = 0
        estimate = stream.default_estimate
        for due in iter_due_dates(stream.start_date, until, stream.frequency):
            _, was_created = IncomeOccurrence.objects.get_or_create(
                stream=stream,
                due_date=due,
                defaults={
                    'family': stream.family,
                    'estimated_amount': estimate,
                    'status': 'estimated',
                },
            )
            if was_created:
                created += 1

        updated = _sync_estimated_occurrences(stream)

        # Clients only need counts; skip serializing every occurrence (large/slow).
        return Response(
            {
                'created': created,
                'updated': updated,
                'occurrences': [],
            }
        )


class IncomeOccurrenceViewSet(viewsets.ModelViewSet):
    serializer_class = IncomeOccurrenceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = IncomeOccurrence.objects.filter(family__members__user=user).select_related('stream')
        qs = _apply_family_query_scope(qs, self.request, self)
        stream_id = self.request.query_params.get('stream')
        if stream_id:
            try:
                qs = qs.filter(stream_id=int(stream_id))
            except (ValueError, TypeError):
                pass
        start = _parse_date(self.request.query_params.get('start_date'))
        end = _parse_date(self.request.query_params.get('end_date'))
        if start:
            qs = qs.filter(due_date__gte=start)
        if end:
            qs = qs.filter(due_date__lte=end)
        return qs

    def perform_create(self, serializer):
        stream_id = self.request.data.get('stream')
        stream = get_object_or_404(
            IncomeStream, id=stream_id, family__members__user=self.request.user
        )
        serializer.save(family=stream.family, stream=stream)

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.actual_amount and instance.status == 'estimated':
            instance.status = 'received'
            instance.save(update_fields=['status', 'updated_at'])


class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Account.objects.filter(family__members__user=user).prefetch_related('snapshots')
        return _apply_family_query_scope(qs, self.request, self)

    def perform_create(self, serializer):
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        serializer.save(family=family)


class AccountSnapshotViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSnapshotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = AccountSnapshot.objects.filter(family__members__user=user).select_related('account')
        qs = _apply_family_query_scope(qs, self.request, self)
        account_id = self.request.query_params.get('account')
        if account_id:
            try:
                qs = qs.filter(account_id=int(account_id))
            except (ValueError, TypeError):
                pass
        return qs

    def create(self, request, *args, **kwargs):
        """Upsert by (account, as_of_date) — validate after finding an existing row."""
        account_id = request.data.get('account')
        account = get_object_or_404(
            Account, id=account_id, family__members__user=request.user
        )
        as_of = _parse_date(request.data.get('as_of_date'))
        existing = (
            AccountSnapshot.objects.filter(account=account, as_of_date=as_of).first()
            if as_of
            else None
        )
        if existing:
            # Update path so UniqueTogetherValidator excludes this instance.
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save(family=account.family, account=account)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(family=account.family, account=account)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
