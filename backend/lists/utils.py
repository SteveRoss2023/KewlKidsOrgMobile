"""
Utility functions for grocery list categorization.
"""
from .models import GroceryCategory


# Default categories to create for each family
DEFAULT_CATEGORIES = [
    {'name': 'Produce', 'description': 'Fruits & Vegetables', 'order': 1},
    {'name': 'Meat & Seafood', 'description': '', 'order': 2},
    {'name': 'Dairy & Eggs', 'description': '', 'order': 3},
    {'name': 'Pantry Staples', 'description': 'Dry Goods', 'order': 4},
    {'name': 'Frozen Foods', 'description': '', 'order': 5},
    {'name': 'Bakery', 'description': '', 'order': 6},
    {'name': 'Snacks & Packaged Goods', 'description': '', 'order': 7},
    {'name': 'Beverages', 'description': '', 'order': 8},
    {'name': 'Household & Miscellaneous', 'description': '', 'order': 9},
]


def ensure_default_categories(family):
    """
    Ensure that default categories exist for a family.
    Creates any missing default categories.

    Args:
        family: The Family instance
    """
    existing_category_names = set(
        GroceryCategory.objects.filter(family=family).values_list('name', flat=True)
    )

    for category_data in DEFAULT_CATEGORIES:
        if category_data['name'] not in existing_category_names:
            # Get keywords from CATEGORY_KEYWORDS if available
            keywords = CATEGORY_KEYWORDS.get(category_data['name'], [])
            GroceryCategory.objects.create(
                family=family,
                name=category_data['name'],
                description=category_data['description'],
                order=category_data['order'],
                is_default=True,
                keywords=keywords if keywords else []
            )


# Keyword mappings for default categories
CATEGORY_KEYWORDS = {
    'Produce': [
        'apple', 'apples', 'banana', 'bananas', 'lettuce', 'tomato', 'tomatoes',
        'onion', 'onions', 'garlic', 'herb', 'herbs', 'fruit', 'fruits',
        'vegetable', 'vegetables', 'produce', 'carrot', 'carrots', 'potato',
        'potatoes', 'pepper', 'peppers', 'cucumber', 'cucumbers', 'spinach',
        'broccoli', 'cauliflower', 'celery', 'corn', 'peas', 'beans', 'green beans'
    ],
    'Meat & Seafood': [
        'chicken', 'beef', 'pork', 'salmon', 'shrimp', 'fish', 'meat', 'seafood',
        'turkey', 'bacon', 'sausage', 'steak', 'ground', 'tuna', 'cod', 'tilapia',
        'crab', 'lobster', 'mussels', 'clams', 'ham', 'ribs'
    ],
    'Dairy & Eggs': [
        'milk', 'cheese', 'yogurt', 'butter', 'egg', 'eggs', 'dairy', 'cream',
        'sour cream', 'cottage cheese', 'mozzarella', 'cheddar', 'swiss',
        'parmesan', 'ricotta', 'feta', 'greek yogurt'
    ],
    'Pantry Staples': [
        'rice', 'pasta', 'flour', 'sugar', 'bean', 'beans', 'spice', 'spices',
        'oil', 'oils', 'canned', 'salt', 'pepper', 'pepper', 'vinegar',
        'soy sauce', 'olive oil', 'vegetable oil', 'canola oil', 'baking powder',
        'baking soda', 'yeast', 'breadcrumbs', 'cereal', 'oatmeal', 'quinoa',
        'barley', 'lentils', 'chickpeas', 'black beans', 'kidney beans'
    ],
    'Frozen Foods': [
        'frozen', 'pizza', 'ice cream', 'berries', 'frozen vegetables',
        'frozen fruit', 'frozen meals', 'frozen chicken', 'frozen fish',
        'frozen berries', 'frozen peas', 'frozen corn', 'frozen broccoli'
    ],
    'Bakery': [
        'bread', 'bagel', 'bagels', 'tortilla', 'tortillas', 'pastry', 'pastries',
        'bakery', 'roll', 'rolls', 'bun', 'buns', 'croissant', 'muffin', 'muffins',
        'donut', 'donuts', 'cake', 'cakes', 'cookie', 'cookies'
    ],
    'Snacks & Packaged Goods': [
        'chips', 'crackers', 'granola', 'nuts', 'snacks', 'pretzels', 'popcorn',
        'trail mix', 'almonds', 'walnuts', 'peanuts', 'cashews', 'pistachios',
        'cookies', 'candy', 'chocolate', 'bars', 'granola bars', 'energy bars'
    ],
    'Beverages': [
        'coffee', 'tea', 'juice', 'soda', 'water', 'beverages', 'beer', 'wine',
        'sparkling water', 'lemonade', 'iced tea', 'sports drink', 'energy drink',
        'hot chocolate', 'cocoa', 'milk', 'almond milk', 'soy milk', 'oat milk'
    ],
    'Household & Miscellaneous': [
        'cleaning', 'paper towels', 'toiletries', 'household', 'toilet paper',
        'soap', 'shampoo', 'conditioner', 'toothpaste', 'detergent', 'laundry',
        'dish soap', 'sponges', 'trash bags', 'ziploc', 'aluminum foil',
        'plastic wrap', 'batteries', 'light bulbs'
    ]
}


def suggest_category_for_item(item_name, family):
    """
    Suggest a category for an item based on keyword matching.

    Args:
        item_name: The name of the item to categorize
        family: The Family instance to get categories from

    Returns:
        GroceryCategory instance or None if no match found
    """
    if not item_name:
        return None

    item_name_lower = item_name.lower().strip()

    # First, try to match against family's categories by name
    family_categories = GroceryCategory.objects.filter(family=family)
    for category in family_categories:
        category_name_lower = category.name.lower()
        # Check if item name contains category name or vice versa
        if category_name_lower in item_name_lower or item_name_lower in category_name_lower:
            return category

    # Then, try keyword matching against all categories using keywords from database
    for category in family_categories:
        # Get keywords from the category's keywords field
        keywords = category.keywords if category.keywords else []
        for keyword in keywords:
            if keyword.lower() in item_name_lower:
                return category

    # No match found
    return None


def assign_category_to_item(item, family):
    """
    Assign a category to an item using best guess.

    Args:
        item: The ListItem instance to assign category to
        family: The Family instance

    Returns:
        Tuple of (item, category_assigned: bool, category_name: str or None)
    """
    if not item or not item.name:
        return (item, False, None)

    suggested_category = suggest_category_for_item(item.name, family)

    if suggested_category:
        item.category = suggested_category
        item.save(update_fields=['category'])
        return (item, True, suggested_category.name)

    return (item, False, None)








