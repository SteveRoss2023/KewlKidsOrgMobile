"""
Rebuild monthly budgets from active bills (clean From-bills model).

Deletes or deactivates existing Budget rows, then recreates one monthly
budget per category that still has active bills (origin=bills).

Usage:
  python manage.py rebuild_budgets_from_bills
  python manage.py rebuild_budgets_from_bills --family=9
  python manage.py rebuild_budgets_from_bills --dry-run
  python manage.py rebuild_budgets_from_bills --keep-orphans-as-manual
  python manage.py rebuild_budgets_from_bills --hard-delete
"""
from django.core.management.base import BaseCommand

from expenses.budget_sync import active_bills_for_category, sync_category_budget_from_bills
from expenses.models import Budget, Family, RecurringExpense


class Command(BaseCommand):
    help = 'Wipe budgets and recreate From-bills rows from active recurring templates'

    def add_arguments(self, parser):
        parser.add_argument(
            '--family',
            type=int,
            default=None,
            help='Only rebuild budgets for this family ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would happen without writing',
        )
        parser.add_argument(
            '--keep-orphans-as-manual',
            action='store_true',
            help='Keep budgets with no active bills as origin=manual instead of removing them',
        )
        parser.add_argument(
            '--hard-delete',
            action='store_true',
            help='Hard-delete budgets instead of deactivating (default: deactivate)',
        )

    def handle(self, *args, **options):
        family_id = options.get('family')
        dry_run = options['dry_run']
        keep_orphans = options['keep_orphans_as_manual']
        hard_delete = options['hard_delete']

        families = Family.objects.all()
        if family_id is not None:
            families = families.filter(id=family_id)

        total_removed = 0
        total_kept_manual = 0
        total_created = 0

        for family in families:
            self.stdout.write(self.style.NOTICE(f'Family {family.id}'))
            budgets = list(
                Budget.objects.filter(family=family).select_related('category')
            )
            bill_cat_ids = set(
                RecurringExpense.objects.filter(
                    family=family, is_active=True
                ).values_list('category_id', flat=True)
            )

            orphans = []
            bill_backed = []
            for b in budgets:
                if b.category_id in bill_cat_ids:
                    bill_backed.append(b)
                else:
                    orphans.append(b)

            for b in orphans:
                amt = str(b.amount)
                name = b.category.name if b.category else str(b.category_id)
                if keep_orphans:
                    self.stdout.write(
                        f'  keep orphan as manual: {name} ${amt} (id={b.id})'
                    )
                    if not dry_run:
                        b.origin = 'manual'
                        b.is_active = True
                        b.save(update_fields=['origin', 'is_active', 'updated_at'])
                    total_kept_manual += 1
                else:
                    self.stdout.write(
                        f'  remove orphan: {name} ${amt} (id={b.id})'
                    )
                    if not dry_run:
                        if hard_delete:
                            b.delete()
                        else:
                            b.is_active = False
                            b.save(update_fields=['is_active', 'updated_at'])
                    total_removed += 1

            for b in bill_backed:
                name = b.category.name if b.category else str(b.category_id)
                self.stdout.write(
                    f'  clear bill-backed: {name} ${b.amount} (id={b.id})'
                )
                if not dry_run:
                    if hard_delete:
                        b.delete()
                    else:
                        b.is_active = False
                        b.save(update_fields=['is_active', 'updated_at'])
                total_removed += 1

            for category_id in sorted(bill_cat_ids):
                bills = active_bills_for_category(family.id, category_id)
                if not bills:
                    continue
                cat_name = bills[0].category.name if bills[0].category else str(category_id)
                if dry_run:
                    self.stdout.write(f'  would recreate From bills: {cat_name}')
                    total_created += 1
                    continue
                result = sync_category_budget_from_bills(family, category_id)
                if result:
                    self.stdout.write(
                        f'  {result.get("action")}: {cat_name} '
                        f'${result.get("amount")} origin={result.get("origin")}'
                    )
                    if result.get('action') == 'created':
                        total_created += 1

        verb = 'Would' if dry_run else 'Did'
        self.stdout.write(
            self.style.SUCCESS(
                f'{verb}: removed/cleared={total_removed}, '
                f'kept_manual={total_kept_manual}, created={total_created}'
            )
        )
