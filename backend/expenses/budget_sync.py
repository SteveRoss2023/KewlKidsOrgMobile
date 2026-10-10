"""Keep category Budget rows aligned with active RecurringExpense (bill) templates."""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional


def _parse_amount(raw) -> Decimal:
    try:
        return Decimal(str(raw or '0'))
    except (ValueError, InvalidOperation, TypeError):
        return Decimal('0.00')


def _normalize_to_monthly(amount: Decimal, frequency: str) -> Decimal:
    if frequency == 'daily':
        return amount * Decimal('30.44')
    if frequency == 'weekly':
        return amount * Decimal('4.33')
    if frequency == 'yearly':
        return Decimal('0')
    return amount


def active_bills_for_category(family_id: int, category_id: int):
    from .models import RecurringExpense

    return list(
        RecurringExpense.objects.filter(
            family_id=family_id,
            category_id=category_id,
            is_active=True,
        ).select_related('category')
    )


def bills_monthly_amount(bills) -> Decimal:
    total = Decimal('0')
    for bill in bills:
        total += _normalize_to_monthly(_parse_amount(bill.amount), bill.frequency)
    return total.quantize(Decimal('0.01'))


def bills_desired_start(bills) -> Optional[date]:
    starts = [b.start_date for b in bills if b.start_date]
    return min(starts) if starts else None


def bills_desired_end(bills) -> Optional[date]:
    end_dates = [b.end_date for b in bills]
    if end_dates and all(e is not None for e in end_dates):
        return max(end_dates)
    return None


def sync_category_budget_from_bills(family, category_id: int) -> Optional[dict]:
    """Upsert the monthly budget for a category from its active bills.

    - Amount from monthly-normalized bill totals (keep higher existing amount).
    - Start = earliest bill start in the category.
    - End = latest bill end if every bill has an end; else open-ended.
    - If no active bills remain, leave the budget alone (full sync may deactivate).

    Returns a small result dict, or None if nothing to do.
    """
    from .models import Budget

    bills = active_bills_for_category(family.id, category_id)
    if not bills:
        return None

    target = bills_monthly_amount(bills)
    desired_start = bills_desired_start(bills)
    desired_end = bills_desired_end(bills)
    if desired_start is None:
        return None

    existing = Budget.objects.filter(
        family=family,
        category_id=category_id,
        period='monthly',
        is_active=True,
    ).first()
    if not existing:
        existing = (
            Budget.objects.filter(
                family=family,
                category_id=category_id,
                period='monthly',
            )
            .order_by('-updated_at')
            .first()
        )

    if existing:
        old_amount = _parse_amount(existing.amount)
        keep_higher = old_amount > target + Decimal('0.005')
        new_amount = old_amount if keep_higher else target
        update_fields = ['updated_at', 'is_active']
        existing.is_active = True
        if not keep_higher and abs(old_amount - target) >= Decimal('0.005'):
            existing.amount = target
            update_fields.append('amount')
        if desired_start and (
            existing.start_date is None or existing.start_date > desired_start
        ):
            existing.start_date = desired_start
            update_fields.append('start_date')
        if existing.end_date != desired_end:
            existing.end_date = desired_end
            update_fields.append('end_date')
        existing.save(update_fields=update_fields)
        return {
            'action': 'updated',
            'budget_id': existing.id,
            'category_id': category_id,
            'amount': float(new_amount),
            'start_date': existing.start_date.isoformat() if existing.start_date else None,
            'end_date': existing.end_date.isoformat() if existing.end_date else None,
        }

    budget = Budget.objects.create(
        family=family,
        category_id=category_id,
        amount=target,
        period='monthly',
        start_date=desired_start,
        end_date=desired_end,
        alert_threshold=80,
        is_active=True,
    )
    return {
        'action': 'created',
        'budget_id': budget.id,
        'category_id': category_id,
        'amount': float(target),
        'start_date': desired_start.isoformat(),
        'end_date': desired_end.isoformat() if desired_end else None,
    }
