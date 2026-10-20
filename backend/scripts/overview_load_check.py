"""Read-only check for the Expense Overview load.

Compares today's 12-pass budget board with a one-pass build, and times the
four server calls Overview waits on. Does not save, and rolls the transaction
back. Does not change views, serializers, or the mobile app.
"""
import os
import sys
import time
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django

django.setup()

from django.db import transaction
from django.db.models import Count
from django.test import RequestFactory
from rest_framework.request import Request

from expenses.models import Budget, Expense, ExpenseLineItem, RecurringExpense
from expenses.recurring_sync import _parse_amount, iter_recurring_occurrence_dates
from expenses.serializers import (
    ExpenseCategorySerializer,
    ExpenseSerializer,
    ExpenseTagSerializer,
    RecurringExpenseSerializer,
)
from expenses.views import BudgetViewSet, ExpenseCategoryViewSet, ExpenseTagViewSet, RecurringExpenseViewSet
from families.models import Member
from money.models import IncomeOccurrence, IncomeStream
from money.serializers import IncomeOccurrenceSerializer, IncomeStreamSerializer


def month_window(year: int, month: int):
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1).fromordinal(date(year, month + 1, 1).toordinal() - 1)
    return start, end


def counts():
    return {
        'expenses': Expense.objects.count(),
        'line_items': ExpenseLineItem.objects.count(),
        'budgets': Budget.objects.count(),
        'recurring': RecurringExpense.objects.count(),
        'streams': IncomeStream.objects.count(),
        'occurrences': IncomeOccurrence.objects.count(),
    }


def pick_family(year: int, family_id: int | None) -> int:
    if family_id:
        return family_id
    row = (
        Expense.objects.filter(expense_date__year=year)
        .values('family_id')
        .annotate(n=Count('id'))
        .order_by('-n')
        .first()
    )
    if not row:
        raise SystemExit(f'No expenses in {year}. Pass --family.')
    return row['family_id']


def member_user(family_id: int):
    member = Member.objects.filter(family_id=family_id).select_related('user').first()
    if member is None:
        raise SystemExit(f'Family {family_id} has no member.')
    return member.user


def budget_view(user, params: dict) -> BudgetViewSet:
    django_request = RequestFactory().get('/api/budgets/year_board/', params)
    request = Request(django_request)
    request.user = user
    view = BudgetViewSet()
    view.request = request
    view.format_kwarg = None
    view.action = 'year_board'
    view.kwargs = {}
    return view


def rows_with_cache(view: BudgetViewSet, budgets, as_of: date, cache: dict):
    from expenses.budget_windows import pick_budgets_for_month

    picked = pick_budgets_for_month(budgets, as_of.year, as_of.month)
    start, end = view._monthly_window_for_as_of(as_of)
    context = dict(view.get_serializer_context())
    context['as_of'] = as_of
    context['period_window'] = (start, end)
    context.update(cache)
    serializer = view.get_serializer(picked, many=True, context=context)
    return [
        row for row in serializer.data
        if float(row.get('amount') or 0) > 0 or float(row.get('spent_amount') or 0) > 0
    ]


def one_pass_caches(family_id: int, year: int) -> dict[int, dict]:
    paid = list(
        Expense.objects.filter(
            family_id=family_id,
            expense_date__gte=date(year, 1, 1),
            expense_date__lte=date(year, 12, 31),
            is_paid=True,
        ).only('id', 'category_id', 'amount', 'expense_date')
    )
    parsed_paid = []
    for expense in paid:
        if expense.category_id is None:
            continue
        parsed_paid.append((expense.expense_date, expense.category_id, _parse_amount(expense.amount)))

    recurrings = list(
        RecurringExpense.objects.filter(family_id=family_id, is_active=True).only(
            'id', 'category_id', 'amount', 'frequency', 'start_date', 'end_date',
            'is_seasonal', 'season_start_month', 'season_end_month',
        )
    )
    parsed_recurring = []
    for recurring in recurrings:
        if recurring.category_id is None:
            continue
        parsed_recurring.append((recurring, _parse_amount(recurring.amount)))

    caches = {}
    for month in range(1, 13):
        start, end = month_window(year, month)
        spent = defaultdict(lambda: Decimal('0.00'))
        for expense_date, category_id, amount in parsed_paid:
            if start <= expense_date <= end:
                spent[category_id] += amount
        due = defaultdict(lambda: Decimal('0.00'))
        categories = set()
        for recurring, amount in parsed_recurring:
            categories.add(recurring.category_id)
            for occ in iter_recurring_occurrence_dates(recurring, end):
                if start <= occ <= end:
                    due[recurring.category_id] += amount
        caches[month] = {
            'spent_by_category': dict(spent),
            'recurring_due_by_category': dict(due),
            'recurring_categories': categories,
        }
    return caches


def comparable(rows) -> list[tuple]:
    out = []
    for row in rows:
        out.append((
            int(row['category']),
            round(float(row.get('amount') or 0), 2),
            round(float(row.get('spent_amount') or 0), 2),
            round(float(row.get('remaining_amount') or 0), 2),
        ))
    return sorted(out)


def bind_view(view, user, method, path, params=None, body=None):
    factory = RequestFactory()
    if method == 'post':
        raw = factory.post(path, data=body or {}, content_type='application/json')
    else:
        raw = factory.get(path, params or {})
    request = Request(raw)
    request.user = user
    if method == 'post':
        import json
        request._full_data = json.loads(raw.body.decode() or '{}')
    view.request = request
    view.format_kwarg = None
    view.kwargs = {}
    return view


def timed(label: str, fn):
    started = time.perf_counter()
    value = fn()
    elapsed = time.perf_counter() - started
    return label, elapsed, value


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Read-only Overview load check')
    parser.add_argument('--year', type=int, default=date.today().year)
    parser.add_argument('--family', type=int, default=None)
    args = parser.parse_args()
    year = args.year
    family_id = pick_family(year, args.family)
    user = member_user(family_id)
    start_date = date(year, 1, 1)
    end_date = date(year, 12, 31)

    before = counts()
    print(f'family={family_id} year={year} user_id={user.id}')
    print(f'rows before: {before}')

    with transaction.atomic():
        view = budget_view(user, {'family': str(family_id), 'year': str(year), 'is_active': 'true'})
        budgets = list(view.filter_queryset(view.get_queryset()))

        _, board_today_s, today_response = timed(
            'budget_board_today',
            lambda: view.year_board(view.request),
        )
        today_board = today_response.data

        def build_one_pass():
            caches = one_pass_caches(family_id, year)
            board = {}
            for month in range(1, 13):
                key = f'{year}-{month:02d}'
                board[key] = rows_with_cache(view, budgets, date(year, month, 1), caches[month])
            return board

        _, board_proposed_s, proposed_board = timed('budget_board_proposed', build_one_pass)

        diffs = []
        for month in range(1, 13):
            key = f'{year}-{month:02d}'
            left = comparable(today_board.get(key) or [])
            right = comparable(proposed_board.get(key) or [])
            if left != right:
                diffs.append((key, left, right))

        expense_qs = Expense.objects.filter(
            family_id=family_id,
            expense_date__gte=start_date,
            expense_date__lte=end_date,
        )
        expense_count = expense_qs.count()
        line_count = ExpenseLineItem.objects.filter(expense__in=expense_qs).count()

        def load_expenses_full():
            qs = expense_qs.select_related('category', 'recurring_expense').prefetch_related('tags', 'line_items')
            return ExpenseSerializer(list(qs), many=True, context={'request': view.request}).data

        def load_expenses_slim():
            qs = expense_qs.select_related('category')
            rows = []
            for expense in qs:
                amount = 0.0
                if expense.amount:
                    try:
                        amount = float(Decimal(str(expense.amount)))
                    except Exception:
                        amount = 0.0
                rows.append({
                    'id': expense.id,
                    'category': expense.category_id,
                    'category_name': expense.category.name if expense.category_id else None,
                    'amount': amount,
                    'description': expense.description or '',
                    'expense_date': expense.expense_date.isoformat() if expense.expense_date else None,
                    'is_paid': expense.is_paid,
                })
            return rows

        _, expenses_today_s, full_rows = timed('expenses_today', load_expenses_full)
        _, expenses_proposed_s, slim_rows = timed('expenses_proposed', load_expenses_slim)

        def load_streams():
            qs = IncomeStream.objects.filter(family_id=family_id)
            return IncomeStreamSerializer(list(qs), many=True).data

        def load_occurrences():
            qs = IncomeOccurrence.objects.filter(
                family_id=family_id,
                due_date__gte=start_date,
                due_date__lte=end_date,
            ).select_related('stream')
            return IncomeOccurrenceSerializer(list(qs), many=True).data

        _, streams_s, streams = timed('streams', load_streams)
        _, occurrences_s, occurrences = timed('occurrences', load_occurrences)

        recurring_view = RecurringExpenseViewSet()
        bind_view(
            recurring_view,
            user,
            'post',
            '/api/recurring-expenses/ensure_year/',
            body={'family': family_id, 'through_year': year, 'dry_run': True},
        )
        recurring_view.action = 'ensure_year'

        def run_ensure_year():
            return recurring_view.ensure_year(recurring_view.request)

        _, ensure_s, ensure_response = timed('ensure_year', run_ensure_year)

        cat_view = ExpenseCategoryViewSet()
        bind_view(cat_view, user, 'get', '/api/expense-categories/', {'family': str(family_id)})
        cat_view.action = 'list'

        def load_categories():
            return ExpenseCategorySerializer(list(cat_view.get_queryset()), many=True).data

        _, categories_s, categories = timed('categories', load_categories)

        tag_view = ExpenseTagViewSet()
        bind_view(tag_view, user, 'get', '/api/expense-tags/', {'family': str(family_id)})
        tag_view.action = 'list'

        def load_tags():
            return ExpenseTagSerializer(list(tag_view.get_queryset()), many=True).data

        _, tags_s, tags = timed('tags', load_tags)

        today = date.today()
        view_month = today.month if year == today.year else 1
        month_start, month_end = month_window(year, view_month)

        def load_month_expenses():
            qs = Expense.objects.filter(
                family_id=family_id,
                expense_date__gte=month_start,
                expense_date__lte=month_end,
            ).select_related('category', 'recurring_expense').prefetch_related('tags', 'line_items')
            return ExpenseSerializer(list(qs), many=True, context={'request': view.request}).data

        _, month_expenses_s, month_expenses = timed('month_expenses', load_month_expenses)

        month_budget_view = budget_view(user, {
            'family': str(family_id),
            'is_active': 'true',
            'as_of': month_start.isoformat(),
            'budget_period': 'month',
        })
        month_budget_view.action = 'list'

        def load_month_budgets():
            return month_budget_view.list(month_budget_view.request).data

        _, month_budgets_s, month_budgets = timed('month_budgets', load_month_budgets)

        list_recurring = RecurringExpenseViewSet()
        bind_view(list_recurring, user, 'get', '/api/recurring-expenses/', {'family': str(family_id)})
        list_recurring.action = 'list'

        def load_recurring():
            return RecurringExpenseSerializer(list(list_recurring.get_queryset()), many=True).data

        _, recurring_s, recurring_rows = timed('recurring', load_recurring)

        inside = counts()
        transaction.set_rollback(True)

    after = counts()

    print()
    print('BUDGET BOARD FIGURES')
    if not diffs:
        print('match')
    else:
        print(f'differ: {len(diffs)} month(s)')
        for key, left, right in diffs:
            print(f'  {key} today={len(left)} proposed={len(right)}')
            left_map = {row[0]: row for row in left}
            right_map = {row[0]: row for row in right}
            for category_id in sorted(set(left_map) | set(right_map)):
                if left_map.get(category_id) != right_map.get(category_id):
                    print(f'    category {category_id} today={left_map.get(category_id)} proposed={right_map.get(category_id)}')

    print()
    print('OVERVIEW SERVER TIME (seconds)')
    print(f'  expenses in year: {expense_count}  receipt lines: {line_count}')
    print(f'  income streams: {len(streams)}  occurrences: {len(occurrences)}  slim expenses: {len(slim_rows)}  full expenses: {len(full_rows)}')
    print(f'  streams                  {streams_s:.3f}   (same either way)')
    print(f'  occurrences              {occurrences_s:.3f}   (same either way)')
    print(f'  expenses full            {expenses_today_s:.3f}   today')
    print(f'  expenses summary         {expenses_proposed_s:.3f}   proposed')
    print(f'  budget board 12-pass     {board_today_s:.3f}   today')
    print(f'  budget board one-pass    {board_proposed_s:.3f}   proposed')
    today_page = max(streams_s, occurrences_s, expenses_today_s, board_today_s)
    proposed_page = max(streams_s, occurrences_s, expenses_proposed_s, board_proposed_s)
    print(f'  page server time today     {today_page:.3f}   (slowest of the four)')
    print(f'  page server time proposed  {proposed_page:.3f}   (slowest of the four)')
    overview_sum = streams_s + occurrences_s + expenses_today_s + board_today_s
    print(f'  if the server runs one at a time  {overview_sum:.3f}')

    expenses_lists = categories_s + tags_s + month_expenses_s + month_budgets_s + recurring_s
    expenses_slowest = max(categories_s, tags_s, month_expenses_s, month_budgets_s, recurring_s)
    budgets_sum = board_today_s + expenses_today_s
    budgets_max = max(board_today_s, expenses_today_s)
    preview = ensure_response.data if hasattr(ensure_response, 'data') else {}

    print()
    print('TAB SEQUENCES THE SPINNER WAITS ON (seconds)')
    print(f'  Overview calls, overlapping     {today_page:.3f}')
    print(f'  Overview calls, one at a time   {overview_sum:.3f}')
    print(f'    streams {streams_s:.3f}  occurrences {occurrences_s:.3f}  expenses {expenses_today_s:.3f}  budget board {board_today_s:.3f}')
    print(f'  Budgets calls, overlapping      {budgets_max:.3f}')
    print(f'  Budgets calls, one at a time    {budgets_sum:.3f}')
    print(f'    budget board {board_today_s:.3f}  year expenses {expenses_today_s:.3f}')
    print(f'  Expenses bill preview           {ensure_s:.3f}   (this finishes before the other Expenses calls start)')
    print(f'    preview result {preview}')
    print(f'  Expenses lists, overlapping     {expenses_slowest:.3f}')
    print(f'  Expenses lists, one at a time   {expenses_lists:.3f}')
    print(f'    categories {categories_s:.3f} ({len(categories)})  tags {tags_s:.3f} ({len(tags)})  month expenses {month_expenses_s:.3f} ({len(month_expenses)})  month budgets {month_budgets_s:.3f}  recurring {recurring_s:.3f} ({len(recurring_rows)})')
    print(f'  Expenses spinner, overlapping   {ensure_s + expenses_slowest:.3f}')
    print(f'  Expenses spinner, one at a time {ensure_s + expenses_lists:.3f}')
    print(f'  month window {month_start.isoformat()} to {month_end.isoformat()}')

    print()
    print('DATABASE')
    print(f'  rows inside transaction: {inside}')
    print(f'  rows after rollback:     {after}')
    print(f'  unchanged: {before == after}')
    if before != after:
        raise SystemExit('Row counts changed. This script must not write.')


if __name__ == '__main__':
    main()
