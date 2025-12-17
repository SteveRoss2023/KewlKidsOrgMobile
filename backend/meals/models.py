"""
Meal planning and recipe models with encrypted fields.
"""
import json
import os
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.core.files.storage import default_storage
from encrypted_model_fields.fields import EncryptedCharField, EncryptedTextField
from families.models import Family, Member


def recipe_image_upload_path(instance, filename):
    """Generate upload path for recipe images."""
    # Use recipe ID if available, otherwise use a timestamp
    if instance.pk:
        recipe_id = instance.pk
    else:
        recipe_id = 'temp'
    # Get file extension
    ext = filename.split('.')[-1] if '.' in filename else 'jpg'
    # Return path like: recipes/images/recipe_123.jpg
    return f'recipes/images/recipe_{recipe_id}.{ext}'


class Recipe(models.Model):
    """Recipe with encrypted notes and URL import support."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='recipes')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_recipes')

    # Encrypted fields
    title = EncryptedCharField(max_length=200)
    notes = EncryptedTextField(blank=True, null=True)
    _ingredients_json = EncryptedTextField(blank=True, default='[]')  # Encrypted JSON string
    _instructions_json = EncryptedTextField(blank=True, default='[]')  # Encrypted JSON string

    # Image storage - actual file stored locally
    image = models.ImageField(upload_to=recipe_image_upload_path, blank=True, null=True)
    
    # Encrypted URL fields (kept for backward compatibility and original source URL)
    image_url = EncryptedCharField(max_length=500, blank=True, null=True)  # Original external URL (for reference)
    source_url = EncryptedCharField(max_length=500, blank=True, null=True)  # Original recipe URL

    # Public recipe data
    servings = models.IntegerField(null=True, blank=True)
    prep_time_minutes = models.IntegerField(null=True, blank=True)
    cook_time_minutes = models.IntegerField(null=True, blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['family']),
        ]

    @property
    def ingredients(self):
        """Get ingredients as a list."""
        if not self._ingredients_json:
            return []
        try:
            return json.loads(self._ingredients_json)
        except (json.JSONDecodeError, TypeError):
            return []

    @ingredients.setter
    def ingredients(self, value):
        """Set ingredients from a list."""
        if value is None:
            self._ingredients_json = '[]'
        else:
            self._ingredients_json = json.dumps(value) if not isinstance(value, str) else value

    @property
    def instructions(self):
        """Get instructions as a list."""
        if not self._instructions_json:
            return []
        try:
            return json.loads(self._instructions_json)
        except (json.JSONDecodeError, TypeError):
            return []

    @instructions.setter
    def instructions(self, value):
        """Set instructions from a list."""
        if value is None:
            self._instructions_json = '[]'
        else:
            self._instructions_json = json.dumps(value) if not isinstance(value, str) else value

    def __str__(self):
        return self.title


@receiver(post_delete, sender=Recipe)
def delete_recipe_image(sender, instance, **kwargs):
    """
    Delete the recipe image file when the recipe is deleted.
    """
    if instance.image and instance.image.name:
        try:
            # Delete the file from storage
            if default_storage.exists(instance.image.name):
                default_storage.delete(instance.image.name)
        except Exception as e:
            # Log the error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error deleting image file for recipe {instance.id}: {str(e)}")


class MealPlan(models.Model):
    """Weekly meal planning."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='meal_plans')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_meal_plans')

    # Encrypted fields
    notes = EncryptedTextField(blank=True, null=True)
    _meals_json = EncryptedTextField(blank=True, default='{}')  # Encrypted JSON string

    # Public fields
    week_start_date = models.DateField()

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-week_start_date']
        unique_together = ['family', 'week_start_date']

    @property
    def meals(self):
        """Get meals as a dictionary."""
        if not self._meals_json:
            return {}
        try:
            return json.loads(self._meals_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    @meals.setter
    def meals(self, value):
        """Set meals from a dictionary."""
        if value is None:
            self._meals_json = '{}'
        else:
            self._meals_json = json.dumps(value) if not isinstance(value, str) else value

    def __str__(self):
        return f"Meal Plan for week of {self.week_start_date}"
