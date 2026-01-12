"""
Utility functions for expense categories.
"""
from .models import ExpenseCategory


# Default expense categories to create for each family
DEFAULT_CATEGORIES = [
    {'name': 'Food & Dining', 'description': 'Restaurants, groceries, and food delivery', 'icon': 'utensils', 'color': '#f97316', 'order': 1},
    {'name': 'Transportation', 'description': 'Gas, public transit, parking, rideshare', 'icon': 'car', 'color': '#3b82f6', 'order': 2},
    {'name': 'Utilities', 'description': 'Electricity, water, gas, internet, phone', 'icon': 'bolt', 'color': '#eab308', 'order': 3},
    {'name': 'Shopping', 'description': 'General shopping and retail purchases', 'icon': 'shopping-bag', 'color': '#8b5cf6', 'order': 4},
    {'name': 'Entertainment', 'description': 'Movies, concerts, hobbies, subscriptions', 'icon': 'film', 'color': '#ec4899', 'order': 5},
    {'name': 'Healthcare', 'description': 'Medical expenses, prescriptions, insurance', 'icon': 'heartbeat', 'color': '#ef4444', 'order': 6},
    {'name': 'Education', 'description': 'Tuition, books, courses, supplies', 'icon': 'graduation-cap', 'color': '#06b6d4', 'order': 7},
    {'name': 'Home & Garden', 'description': 'Home improvement, furniture, maintenance', 'icon': 'home', 'color': '#10b981', 'order': 8},
    {'name': 'Personal Care', 'description': 'Haircuts, cosmetics, personal items', 'icon': 'user', 'color': '#f59e0b', 'order': 9},
    {'name': 'Travel', 'description': 'Hotels, flights, vacation expenses', 'icon': 'plane', 'color': '#6366f1', 'order': 10},
    {'name': 'Bills & Fees', 'description': 'Bank fees, service charges, subscriptions', 'icon': 'file-invoice-dollar', 'color': '#64748b', 'order': 11},
    {'name': 'Gifts & Donations', 'description': 'Gifts, charity, donations', 'icon': 'gift', 'color': '#f43f5e', 'order': 12},
    {'name': 'Other', 'description': 'Miscellaneous expenses', 'icon': 'ellipsis-h', 'color': '#94a3b8', 'order': 13},
]


def ensure_default_categories(family):
    """
    Ensure that default expense categories exist for a family.
    Creates any missing default categories.

    Args:
        family: The Family instance
    """
    existing_category_names = set(
        ExpenseCategory.objects.filter(family=family).values_list('name', flat=True)
    )

    for category_data in DEFAULT_CATEGORIES:
        if category_data['name'] not in existing_category_names:
            ExpenseCategory.objects.create(
                family=family,
                name=category_data['name'],
                description=category_data['description'],
                icon=category_data['icon'],
                color=category_data['color'],
                order=category_data['order'],
                is_default=True
            )
