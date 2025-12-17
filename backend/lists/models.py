"""
List and ListItem models for shopping and todo lists with encrypted fields.
"""
from django.db import models
from django.contrib.auth import get_user_model
from encrypted_model_fields.fields import EncryptedCharField, EncryptedTextField
from families.models import Family, Member

User = get_user_model()


class GroceryCategory(models.Model):
    """Category for organizing grocery list items."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='grocery_categories')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True, help_text="Icon name from react-icons (e.g., 'FaApple', 'FaBreadSlice')")
    order = models.IntegerField(default=0)
    is_default = models.BooleanField(default=False)
    keywords = models.JSONField(default=list, blank=True, help_text="List of keywords for automatic categorization")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name_plural = "grocery categories"
        indexes = [
            models.Index(fields=['family', 'order']),
        ]

    def __str__(self):
        return f"{self.name} ({self.family.name})"


class List(models.Model):
    """Shopping or todo list."""
    LIST_TYPE_CHOICES = [
        ('shopping', 'Shopping List'),
        ('grocery', 'Grocery List'),
        ('todo', 'To-Do List'),
        ('other', 'Other'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='lists')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_lists')

    # Encrypted fields
    name = EncryptedCharField(max_length=200)
    description = EncryptedTextField(blank=True, null=True)
    list_type = EncryptedCharField(max_length=20, choices=LIST_TYPE_CHOICES, default='shopping')

    # Public fields
    color = models.CharField(max_length=7, default='#10b981')  # Hex color code

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        # Note: Can't index encrypted fields, so removed list_type from index
        indexes = [
            models.Index(fields=['family']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_list_type_display()})"


class ListItem(models.Model):
    """Item in a list."""
    list = models.ForeignKey(List, on_delete=models.CASCADE, related_name='items')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_items')
    assigned_to = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_items')

    # Encrypted fields
    name = EncryptedCharField(max_length=200)
    notes = EncryptedTextField(blank=True, null=True)

    # Encrypted fields
    quantity = EncryptedCharField(max_length=50, blank=True, null=True)

    # Category (for grocery lists)
    category = models.ForeignKey(GroceryCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')

    # Public fields
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_items')

    # Ordering
    order = models.IntegerField(default=0)

    # Due date (for todo lists)
    due_date = models.DateField(null=True, blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']
        indexes = [
            models.Index(fields=['list', 'completed']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return f"{self.name} - {self.list.name}"


class CompletedGroceryItem(models.Model):
    """History of completed grocery list items."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='completed_grocery_items')
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='completed_grocery_items')
    
    # Encrypted fields
    list_name = EncryptedCharField(max_length=200)
    item_name = EncryptedCharField(max_length=200)
    quantity = EncryptedCharField(max_length=50, blank=True, null=True)
    recipe_name = EncryptedCharField(max_length=200, blank=True, null=True)
    
    # Public fields
    category_name = models.CharField(max_length=100, blank=True, null=True)
    completed_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-completed_date']
        indexes = [
            models.Index(fields=['user', 'completed_date']),
            models.Index(fields=['family', 'completed_date']),
            models.Index(fields=['completed_date']),
        ]
        verbose_name = "Completed Grocery Item"
        verbose_name_plural = "Completed Grocery Items"
    
    def __str__(self):
        return f"{self.item_name} - {self.completed_date.date()}"
