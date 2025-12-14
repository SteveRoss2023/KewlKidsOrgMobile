"""
Management command to ensure default grocery categories exist for families
that have grocery lists but no categories yet.
"""
from django.core.management.base import BaseCommand
from lists.models import List, GroceryCategory
from lists.utils import ensure_default_categories, CATEGORY_KEYWORDS
from families.models import Family


class Command(BaseCommand):
    help = 'Ensure default grocery categories exist for families with grocery lists and populate keywords'

    def handle(self, *args, **options):
        """Create default categories for families that have grocery lists and populate keywords."""
        self.stdout.write('Checking for families with grocery lists...')

        # Find families with grocery lists (list_type is encrypted, so we need to check after fetching)
        families_with_grocery_lists = []
        for family in Family.objects.all():
            grocery_lists = [l for l in family.lists.filter(archived=False) if l.list_type == 'grocery']
            if grocery_lists:
                families_with_grocery_lists.append(family)

        if not families_with_grocery_lists:
            self.stdout.write(self.style.SUCCESS('No families with grocery lists found.'))
            return

        self.stdout.write(f'Found {len(families_with_grocery_lists)} families with grocery lists.')

        for family in families_with_grocery_lists:
            before_count = GroceryCategory.objects.filter(family=family).count()

            # Ensure default categories exist
            ensure_default_categories(family)

            after_count = GroceryCategory.objects.filter(family=family).count()
            created_count = after_count - before_count

            if created_count > 0:
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Created {created_count} default categories for family "{family.name}"'
                    )
                )
            else:
                self.stdout.write(
                    f'Family "{family.name}" already has default categories.'
                )

            # Update keywords for existing categories
            categories = GroceryCategory.objects.filter(
                family=family,
                is_default=True
            )
            updated_keywords = 0
            for category in categories:
                if category.name in CATEGORY_KEYWORDS:
                    expected_keywords = CATEGORY_KEYWORDS[category.name]
                    current_keywords = category.keywords if category.keywords else []
                    # Only update if keywords are missing or different
                    if set(current_keywords) != set(expected_keywords):
                        category.keywords = expected_keywords
                        category.save(update_fields=['keywords'])
                        updated_keywords += 1

            if updated_keywords > 0:
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Updated keywords for {updated_keywords} categories in family "{family.name}"'
                    )
                )

        self.stdout.write(self.style.SUCCESS('All families with grocery lists already have default categories with keywords.'))




