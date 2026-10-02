"""Keep generated Expense rows aligned with their RecurringExpense templates."""
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation


def sync_generated_expense_fields(expense, recurring, tag_ids=None):
    """Copy template-owned fields onto a generated expense. Returns True if anything changed.

    Paid expenses are left alone — actual billed amounts must not be overwritten by the template.
    """
    if getattr(expense, 'is_paid', False):
        return False

    changed = False
    updates = {}
    if expense.category_id != recurring.category_id:
        updates['category_id'] = recurring.category_id
    amount = str(recurring.amount) if recurring.amount else '0.00'
    if str(expense.amount or '') != amount:
        updates['amount'] = amount
    if expense.description != recurring.description:
        updates['description'] = recurring.description
    if (expense.notes or None) != (recurring.notes or None):
        updates['notes'] = recurring.notes
    if expense.payment_method != recurring.payment_method:
        updates['payment_method'] = recurring.payment_method
    if updates:
        for key, value in updates.items():
            setattr(expense, key, value)
        expense.save(update_fields=[*updates.keys(), 'updated_at'])
        changed = True

    if tag_ids is None:
        tag_ids = list(recurring.tags.values_list('id', flat=True))
    current_tag_ids = set(expense.tags.values_list('id', flat=True))
    desired_tag_ids = set(tag_ids)
    if current_tag_ids != desired_tag_ids:
        expense.tags.set(desired_tag_ids)
        changed = True
    return changed


def sync_all_generated_from_template(recurring):
    """Sync all generated expenses for a recurring template. Returns count synced."""
    tag_ids = list(recurring.tags.values_list('id', flat=True))
    synced = 0
    for expense in recurring.generated_expenses.all():
        if sync_generated_expense_fields(expense, recurring, tag_ids=tag_ids):
            synced += 1
    return synced


def _add_one_year(d: date) -> date:
    try:
        return date(d.year + 1, d.month, d.day)
    except ValueError:
        # Feb 29 → Feb 28 next year
        last = monthrange(d.year + 1, d.month)[1]
        return date(d.year + 1, d.month, last)


def iter_yearly_occurrence_dates(start_date: date, end_bound: date, template_end=None):
    """Yield yearly occurrence dates from start_date while <= end_bound."""
    if start_date is None:
        return
    current = start_date
    for _ in range(100):
        if template_end and current > template_end:
            break
        if current > end_bound:
            break
        yield current
        current = _add_one_year(current)


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def _next_occurrence(current: date, frequency: str) -> date:
    if frequency == 'daily':
        return current + timedelta(days=1)
    if frequency == 'weekly':
        return current + timedelta(weeks=1)
    if frequency == 'yearly':
        return _add_one_year(current)
    # monthly
    return _add_months(current, 1)


def iter_occurrence_dates(start_date: date, frequency: str, end_bound: date, template_end=None):
    """Yield occurrence dates from start_date while <= end_bound."""
    if start_date is None:
        return
    current = start_date
    for _ in range(2000):
        if template_end and current > template_end:
            break
        if current > end_bound:
            break
        yield current
        current = _next_occurrence(current, frequency)


def _parse_amount(raw) -> Decimal:
    try:
        return Decimal(str(raw or '0'))
    except (ValueError, InvalidOperation, TypeError):
        return Decimal('0.00')


def recurring_due_in_window(family_id: int, category_id: int, window_start: date, window_end: date) -> Decimal:
    """Sum active recurring amounts with at least one due date in the window."""
    from .models import RecurringExpense

    total = Decimal('0.00')
    qs = RecurringExpense.objects.filter(
        family_id=family_id,
        category_id=category_id,
        is_active=True,
    )
    for recurring in qs:
        amount = _parse_amount(recurring.amount)
        for occ in iter_occurrence_dates(
            recurring.start_date,
            recurring.frequency,
            window_end,
            template_end=recurring.end_date,
        ):
            if window_start <= occ <= window_end:
                total += amount
    return total


def yearly_recurring_due_in_window(family_id: int, category_id: int, window_start: date, window_end: date) -> Decimal:
    """Sum active yearly recurring amounts whose due date falls in [window_start, window_end]."""
    from .models import RecurringExpense

    total = Decimal('0.00')
    qs = RecurringExpense.objects.filter(
        family_id=family_id,
        category_id=category_id,
        is_active=True,
        frequency='yearly',
    )
    for recurring in qs:
        amount = _parse_amount(recurring.amount)
        for occ in iter_yearly_occurrence_dates(
            recurring.start_date, window_end, template_end=recurring.end_date
        ):
            if window_start <= occ <= window_end:
                total += amount
    return total


def category_has_active_recurring(family_id: int, category_id: int) -> bool:
    from .models import RecurringExpense
    return RecurringExpense.objects.filter(
        family_id=family_id,
        category_id=category_id,
        is_active=True,
    ).exists()


def build_budget_period_caches(family_id: int, window_start: date, window_end: date) -> dict:
    """Precompute spent + recurring-due maps for all categories in one pass.

    Used by BudgetSerializer list to avoid N+1 decrypt/query per budget.
    """
    from .models import Expense, RecurringExpense

    spent_by_category: dict[int, Decimal] = defaultdict(lambda: Decimal('0.00'))
    for expense in Expense.objects.filter(
        family_id=family_id,
        expense_date__gte=window_start,
        expense_date__lte=window_end,
        is_paid=True,
    ).only('id', 'category_id', 'amount'):
        if expense.category_id is None:
            continue
        spent_by_category[expense.category_id] += _parse_amount(expense.amount)

    recurring_due_by_category: dict[int, Decimal] = defaultdict(lambda: Decimal('0.00'))
    recurring_categories: set[int] = set()
    for recurring in RecurringExpense.objects.filter(
        family_id=family_id,
        is_active=True,
    ).only('id', 'category_id', 'amount', 'frequency', 'start_date', 'end_date'):
        if recurring.category_id is None:
            continue
        recurring_categories.add(recurring.category_id)
        amount = _parse_amount(recurring.amount)
        for occ in iter_occurrence_dates(
            recurring.start_date,
            recurring.frequency,
            window_end,
            template_end=recurring.end_date,
        ):
            if window_start <= occ <= window_end:
                recurring_due_by_category[recurring.category_id] += amount

    return {
        'spent_by_category': dict(spent_by_category),
        'recurring_due_by_category': dict(recurring_due_by_category),
        'recurring_categories': recurring_categories,
    }
