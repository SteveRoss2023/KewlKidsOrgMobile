"""
Sync generated Expense rows to match their RecurringExpense templates.

Fixes category/amount/description drift after templates were edited
(e.g. MOV / Telus Mobility still showing an old category).

Usage:
  python manage.py sync_recurring_generated_expenses
  python manage.py sync_recurring_generated_expenses --family=1
  python manage.py sync_recurring_generated_expenses --dry-run
"""
from django.core.management.base import BaseCommand

from expenses.models import RecurringExpense
from expenses.recurring_sync import sync_all_generated_from_template


class Command(BaseCommand):
    help = 'Sync category/amount/description/etc. from recurring templates onto generated expenses'

    def add_arguments(self, parser):
        parser.add_argument(
            '--family',
            type=int,
            default=None,
            help='Only process recurring templates for this family ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report mismatches without writing',
        )

    def handle(self, *args, **options):
        family_id = options.get('family')
        dry_run = options['dry_run']

        qs = RecurringExpense.objects.select_related('category').prefetch_related('tags', 'generated_expenses')
        if family_id is not None:
            qs = qs.filter(family_id=family_id)

        templates = 0
        would_sync = 0
        synced = 0

        for recurring in qs:
            templates += 1
            tag_ids = set(recurring.tags.values_list('id', flat=True))
            amount = str(recurring.amount) if recurring.amount else '0.00'
            mismatches = []
            for expense in recurring.generated_expenses.select_related('category').all():
                reasons = []
                if expense.category_id != recurring.category_id:
                    reasons.append(
                        f"category {expense.category_id}:{getattr(expense.category, 'name', None)} "
                        f"-> {recurring.category_id}:{getattr(recurring.category, 'name', None)}"
                    )
                if str(expense.amount or '') != amount:
                    reasons.append('amount')
                if expense.description != recurring.description:
                    reasons.append('description')
                if (expense.notes or None) != (recurring.notes or None):
                    reasons.append('notes')
                if expense.payment_method != recurring.payment_method:
                    reasons.append('payment_method')
                if set(expense.tags.values_list('id', flat=True)) != tag_ids:
                    reasons.append('tags')
                if reasons:
                    mismatches.append((expense, reasons))

            if not mismatches:
                continue

            desc = str(recurring.description or '')[:60]
            self.stdout.write(
                f"R{recurring.id} '{desc}' — {len(mismatches)} generated expense(s) out of sync"
            )
            for expense, reasons in mismatches[:8]:
                self.stdout.write(
                    f"  E{expense.id} {expense.expense_date}: {', '.join(reasons)}"
                )
            if len(mismatches) > 8:
                self.stdout.write(f"  ... and {len(mismatches) - 8} more")

            would_sync += len(mismatches)
            if not dry_run:
                synced += sync_all_generated_from_template(recurring)

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"Dry run: {templates} templates checked, {would_sync} expenses would sync"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"Done: {templates} templates checked, {synced} expenses synced"
            ))
