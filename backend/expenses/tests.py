"""Repeating budget windows: which row covers a month, and which rows conflict."""
from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase

from expenses.budget_windows import (
    budget_covers_month,
    budgets_overlap,
    pick_budgets_for_month,
    season_months,
)


def row(**fields):
    defaults = dict(
        category_id=1,
        is_active=True,
        is_seasonal=False,
        season_start_month=None,
        season_end_month=None,
        start_date=date(2026, 1, 1),
        end_date=None,
    )
    defaults.update(fields)
    return SimpleNamespace(**defaults)


class SeasonMonthsTests(SimpleTestCase):
    def test_wraps_across_year(self):
        self.assertEqual(season_months(10, 4), {10, 11, 12, 1, 2, 3, 4})

    def test_same_month(self):
        self.assertEqual(season_months(5, 5), {5})


class CoverAndPickTests(SimpleTestCase):
    def test_open_ended_covers_every_month_after_start(self):
        standing = row(amount='200')
        self.assertTrue(budget_covers_month(standing, 2027, 4))
        self.assertFalse(budget_covers_month(standing, 2025, 12))

    def test_seasonal_wins_only_in_its_months(self):
        standing = row()
        summer = row(
            is_seasonal=True,
            season_start_month=5,
            season_end_month=9,
            start_date=date(2027, 5, 1),
        )
        winter = row(
            is_seasonal=True,
            season_start_month=10,
            season_end_month=4,
            start_date=date(2027, 10, 1),
        )
        april_2027 = pick_budgets_for_month([standing, summer, winter], 2027, 4)
        self.assertEqual(april_2027, [standing])
        may_2027 = pick_budgets_for_month([standing, summer, winter], 2027, 5)
        self.assertEqual(may_2027, [summer])
        april_2028 = pick_budgets_for_month([standing, summer, winter], 2028, 4)
        self.assertEqual(april_2028, [winter])
        may_2028 = pick_budgets_for_month([standing, summer, winter], 2028, 5)
        self.assertEqual(may_2028, [summer])

    def test_inactive_rows_are_skipped(self):
        standing = row(is_active=False)
        self.assertEqual(pick_budgets_for_month([standing], 2026, 6), [])


class OverlapTests(SimpleTestCase):
    def test_seasonal_may_sit_on_an_open_ended_row(self):
        standing = row()
        summer = row(
            is_seasonal=True,
            season_start_month=5,
            season_end_month=9,
            start_date=date(2027, 5, 1),
        )
        self.assertFalse(budgets_overlap(standing, summer))

    def test_two_seasonal_ranges_that_share_a_month_conflict(self):
        summer = row(
            is_seasonal=True,
            season_start_month=5,
            season_end_month=9,
            start_date=date(2027, 5, 1),
        )
        also_summer = row(
            is_seasonal=True,
            season_start_month=9,
            season_end_month=11,
            start_date=date(2027, 9, 1),
        )
        self.assertTrue(budgets_overlap(summer, also_summer))

    def test_adjacent_seasonal_ranges_do_not_conflict(self):
        summer = row(
            is_seasonal=True,
            season_start_month=5,
            season_end_month=9,
            start_date=date(2027, 5, 1),
        )
        winter = row(
            is_seasonal=True,
            season_start_month=10,
            season_end_month=4,
            start_date=date(2027, 10, 1),
        )
        self.assertFalse(budgets_overlap(summer, winter))

    def test_two_open_ended_rows_conflict(self):
        self.assertTrue(budgets_overlap(row(), row(start_date=date(2028, 1, 1))))


class RepeatingBudgetBillSyncTests(TestCase):
    def setUp(self):
        from api.models import User
        from families.models import Family, Member
        from expenses.models import Budget, Expense, ExpenseCategory, RecurringExpense

        self.user = User.objects.create_user(email='sync@example.com', password='test-pass-123')
        self.family = Family.objects.create(name='Sync Family', owner=self.user)
        self.member = Member.objects.create(family=self.family, user=self.user, role='owner')
        self.category = ExpenseCategory.objects.create(family=self.family, name='Utilities')
        self.year_round = RecurringExpense.objects.create(
            family=self.family,
            created_by=self.member,
            category=self.category,
            amount='200.00',
            description='EPCOR',
            frequency='monthly',
            start_date=date(2026, 1, 14),
            next_due_date=date(2026, 2, 14),
            is_active=True,
            is_seasonal=False,
        )
        self.propane = RecurringExpense.objects.create(
            family=self.family,
            created_by=self.member,
            category=self.category,
            amount='150.00',
            description='Propane',
            frequency='monthly',
            start_date=date(2026, 4, 1),
            next_due_date=date(2026, 5, 1),
            is_active=True,
            is_seasonal=True,
            season_start_month=4,
            season_end_month=9,
        )
        self.Expense = Expense
        self.Budget = Budget
        for when, bill, amount in (
            (date(2026, 10, 14), self.year_round, '200.00'),
            (date(2026, 11, 14), self.year_round, '200.00'),
            (date(2027, 4, 14), self.year_round, '200.00'),
            (date(2027, 10, 14), self.year_round, '200.00'),
            (date(2027, 4, 1), self.propane, '150.00'),
        ):
            Expense.objects.create(
                family=self.family,
                created_by=self.member,
                category=self.category,
                amount=amount,
                description=bill.description,
                expense_date=when,
                is_recurring=True,
                is_paid=False,
                recurring_expense=bill,
            )

    def test_repeating_budget_replaces_year_round_unpaid_and_leaves_other_bills(self):
        from expenses.budget_bill_sync import reconcile_category

        budget = self.Budget.objects.create(
            family=self.family,
            category=self.category,
            amount='50',
            period='monthly',
            origin='manual',
            start_date=date(2027, 10, 1),
            is_seasonal=True,
            season_start_month=10,
            season_end_month=3,
            is_active=True,
        )
        reconcile_category(self.family, self.category, self.member)

        oct_2026 = self.Expense.objects.get(recurring_expense=self.year_round, expense_date=date(2026, 10, 14))
        self.assertEqual(str(oct_2026.amount), '200.00')
        self.assertFalse(oct_2026.is_paid)
        apr = self.Expense.objects.get(recurring_expense=self.year_round, expense_date=date(2027, 4, 14))
        self.assertEqual(str(apr.amount), '200.00')
        self.assertFalse(
            self.Expense.objects.filter(recurring_expense=self.year_round, expense_date=date(2027, 10, 14)).exists()
        )
        budget.refresh_from_db()
        winter = self.Expense.objects.get(recurring_expense=budget.seasonal_bill, expense_date=date(2027, 10, 14))
        self.assertEqual(str(winter.amount), '50')
        propane = self.Expense.objects.get(recurring_expense=self.propane, expense_date=date(2027, 4, 1))
        self.assertEqual(str(propane.amount), '150.00')
        self.assertTrue(self.propane.is_active)

    def test_paid_month_is_not_replaced(self):
        from expenses.budget_bill_sync import reconcile_category

        paid = self.Expense.objects.get(recurring_expense=self.year_round, expense_date=date(2027, 10, 14))
        paid.is_paid = True
        paid.amount = '129.24'
        paid.save(update_fields=['is_paid', 'amount', 'updated_at'])
        self.Budget.objects.create(
            family=self.family,
            category=self.category,
            amount='50',
            period='monthly',
            origin='manual',
            start_date=date(2027, 10, 1),
            is_seasonal=True,
            season_start_month=10,
            season_end_month=3,
            is_active=True,
        )
        reconcile_category(self.family, self.category, self.member)
        paid.refresh_from_db()
        self.assertTrue(paid.is_paid)
        self.assertEqual(str(paid.amount), '129.24')
        self.assertFalse(
            self.Expense.objects.filter(
                expense_date__year=2027, expense_date__month=10, is_paid=False, description='EPCOR'
            ).exists()
        )

    def test_two_year_round_bills_are_not_split(self):
        from expenses.models import RecurringExpense
        from expenses.budget_bill_sync import reconcile_category

        RecurringExpense.objects.create(
            family=self.family,
            created_by=self.member,
            category=self.category,
            amount='10.00',
            description='Other',
            frequency='monthly',
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 2, 1),
            is_active=True,
        )
        budget = self.Budget.objects.create(
            family=self.family,
            category=self.category,
            amount='50',
            period='monthly',
            origin='manual',
            start_date=date(2027, 10, 1),
            is_seasonal=True,
            season_start_month=10,
            season_end_month=3,
            is_active=True,
        )
        reconcile_category(self.family, self.category, self.member)
        budget.refresh_from_db()
        self.assertIsNone(budget.seasonal_bill_id)
        self.assertTrue(
            self.Expense.objects.filter(recurring_expense=self.year_round, expense_date=date(2027, 10, 14)).exists()
        )
