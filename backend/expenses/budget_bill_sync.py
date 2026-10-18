"""Keep a repeating budget and one seasonal bill on the same amount and months.

Other bills in the category are left alone. A year-round monthly bill stops
creating unpaid rows in months the repeating budget covers. Paid rows stay.
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.db.models import Max
from django.utils import timezone

from .budget_windows import budget_covers_month
from .recurring_sync import _parse_amount, iter_recurring_occurrence_dates, recurring_due_in_window


def year_round_month_is_replaced(bill, on_date: date) -> bool:
    """True when a repeating budget owns this month for a year-round monthly bill."""
    from .models import Budget

    if getattr(bill, 'is_seasonal', False) or getattr(bill, 'frequency', None) != 'monthly':
        return False
    covers = Budget.objects.filter(
        family_id=bill.family_id,
        category_id=bill.category_id,
        is_active=True,
        is_seasonal=True,
        period='monthly',
    )
    return any(budget_covers_month(budget, on_date.year, on_date.month) for budget in covers)


def other_bills_due_amount(budget, year: int, month: int) -> Decimal:
    """Bills still due that month besides this repeating budget's own bill.

    The year-round bill is already absent from the due total in a covered month.
    """
    if not getattr(budget, 'seasonal_bill_id', None):
        return Decimal('0')
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    due = recurring_due_in_window(budget.family_id, budget.category_id, start, end)
    linked = budget.seasonal_bill
    linked_due = Decimal('0')
    for occ in iter_recurring_occurrence_dates(linked, end):
        if start <= occ <= end:
            linked_due += _parse_amount(linked.amount)
    extra = due - linked_due
    return extra if extra > 0 else Decimal('0')


def push_linked_bill_onto_budgets(bill):
    """An edit of the linked seasonal bill updates the repeating budget."""
    budgets = list(bill.repeating_budgets.all())
    for budget in budgets:
        budget.amount = str(bill.amount) if bill.amount is not None else budget.amount
        budget.is_seasonal = bool(bill.is_seasonal)
        budget.season_start_month = bill.season_start_month
        budget.season_end_month = bill.season_end_month
        if bill.start_date:
            budget.start_date = bill.start_date
        budget.end_date = bill.end_date
        budget.save(update_fields=[
            'amount', 'is_seasonal', 'season_start_month', 'season_end_month',
            'start_date', 'end_date', 'updated_at',
        ])


def reconcile_category(family, category, member):
    """Create or update one seasonal bill per repeating budget, then fix unpaid rows."""
    from .models import Budget, RecurringExpense

    repeating = list(
        Budget.objects.filter(
            family=family,
            category=category,
            is_active=True,
            is_seasonal=True,
            period='monthly',
        )
    )
    retired = list(
        Budget.objects.filter(
            family=family,
            category=category,
            seasonal_bill__isnull=False,
        ).exclude(pk__in=[b.pk for b in repeating])
    )
    for budget in retired:
        bill = budget.seasonal_bill
        budget.seasonal_bill = None
        budget.save(update_fields=['seasonal_bill', 'updated_at'])
        _retire_bill(bill)

    year_round = _single_year_round_bill(family, category)
    for budget in repeating:
        if year_round is None and budget.seasonal_bill_id is None and _year_round_count(family, category) > 1:
            continue
        if _year_round_count(family, category) > 1 and budget.seasonal_bill_id is None:
            continue
        _ensure_linked_bill(budget, year_round, member)

    if not repeating and not retired:
        return
    through = _horizon(category)
    for budget in repeating:
        budget.refresh_from_db()
        if budget.seasonal_bill_id:
            _refresh_rows(budget.seasonal_bill, member, through, skip_paid_on=year_round)
    if year_round is not None:
        _refresh_rows(year_round, member, through, skip_paid_on=None)


def _year_round_count(family, category) -> int:
    from .models import RecurringExpense
    return RecurringExpense.objects.filter(
        family=family,
        category=category,
        is_active=True,
        frequency='monthly',
        is_seasonal=False,
    ).count()


def _single_year_round_bill(family, category):
    from .models import RecurringExpense
    bills = list(
        RecurringExpense.objects.filter(
            family=family,
            category=category,
            is_active=True,
            frequency='monthly',
            is_seasonal=False,
        )
    )
    if len(bills) == 1:
        return bills[0]
    return None


def _ensure_linked_bill(budget, year_round, member):
    from .models import RecurringExpense

    day = year_round.start_date.day if year_round and year_round.start_date else budget.start_date.day
    first = _first_due_date(budget, day)
    if budget.seasonal_bill_id:
        bill = budget.seasonal_bill
        bill.amount = str(budget.amount)
        bill.frequency = 'monthly'
        bill.is_seasonal = True
        bill.season_start_month = budget.season_start_month
        bill.season_end_month = budget.season_end_month
        bill.start_date = first
        bill.end_date = budget.end_date
        bill.is_active = True
        bill.next_due_date = first
        bill.save()
        return bill

    description = year_round.description if year_round else budget.category.name
    payment = year_round.payment_method if year_round else 'credit_card'
    bill = RecurringExpense.objects.create(
        family=budget.family,
        created_by=member or (year_round.created_by if year_round else None),
        category=budget.category,
        amount=str(budget.amount),
        description=description,
        notes='',
        frequency='monthly',
        start_date=first,
        end_date=budget.end_date,
        next_due_date=first,
        is_active=True,
        is_seasonal=True,
        season_start_month=budget.season_start_month,
        season_end_month=budget.season_end_month,
        payment_method=payment,
    )
    budget.seasonal_bill = bill
    budget.save(update_fields=['seasonal_bill', 'updated_at'])
    return bill


def _first_due_date(budget, day: int) -> date:
    year = budget.start_date.year
    month = budget.start_date.month
    for _ in range(36):
        if budget_covers_month(budget, year, month):
            last = monthrange(year, month)[1]
            return date(year, month, min(int(day), last))
        month += 1
        if month == 13:
            month = 1
            year += 1
    return budget.start_date


def _horizon(category) -> date:
    from .models import Expense
    today = timezone.now().date()
    latest = Expense.objects.filter(category=category, is_paid=False).aggregate(
        last=Max('expense_date')
    )['last']
    year = today.year
    if latest is not None:
        year = max(year, latest.year)
    return date(year, 12, 31)


def _refresh_rows(bill, member, through: date, skip_paid_on):
    from .models import Expense

    expected = set(iter_recurring_occurrence_dates(bill, through))
    amount = str(bill.amount) if bill.amount is not None else '0'
    unpaid = list(Expense.objects.filter(recurring_expense=bill, is_paid=False))
    for expense in unpaid:
        if expense.expense_date in expected:
            if str(expense.amount or '') != amount or expense.description != bill.description:
                expense.amount = amount
                expense.description = bill.description
                expense.save(update_fields=['amount', 'description', 'updated_at'])
        elif expense.expense_date <= through:
            expense.delete()

    if member is None:
        return
    skip_months = set()
    if skip_paid_on is not None:
        for paid in Expense.objects.filter(recurring_expense=skip_paid_on, is_paid=True):
            skip_months.add((paid.expense_date.year, paid.expense_date.month))
    existing = set(
        Expense.objects.filter(recurring_expense=bill).values_list('expense_date', flat=True)
    )
    for occ in expected:
        if occ in existing or (occ.year, occ.month) in skip_months:
            continue
        Expense.objects.create(
            family=bill.family,
            created_by=member,
            category=bill.category,
            amount=amount,
            description=bill.description,
            notes=bill.notes,
            expense_date=occ,
            payment_method=bill.payment_method,
            is_recurring=True,
            is_paid=False,
            recurring_expense=bill,
        )


def _retire_bill(bill):
    from .models import Expense
    if bill is None:
        return
    Expense.objects.filter(recurring_expense=bill, is_paid=False).delete()
    if Expense.objects.filter(recurring_expense=bill, is_paid=True).exists():
        bill.is_active = False
        bill.end_date = timezone.now().date()
        bill.save(update_fields=['is_active', 'end_date', 'updated_at'])
    else:
        bill.delete()
