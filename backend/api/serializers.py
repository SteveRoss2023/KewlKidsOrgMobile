from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.conf import settings
from .models import UserProfile
from meals.models import Recipe, MealPlan

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    """User profile serializer for viewing and editing profile."""
    email = serializers.EmailField(source='user.email', read_only=True)
    date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['id', 'email', 'display_name', 'photo', 'photo_url', 'email_verified', 
                  'date_joined', 'created_at', 'updated_at']
        read_only_fields = ['id', 'email', 'email_verified', 'date_joined', 'created_at', 'updated_at']

    def get_photo_url(self, obj):
        """Return the full URL for the photo (decrypted)."""
        if obj.photo:
            request = self.context.get('request')
            # Use a special endpoint that decrypts the photo on-the-fly
            if request:
                url = request.build_absolute_uri(f'/api/users/{obj.user.id}/photo/')
                # Normalize ngrok URLs to use https to prevent CORS preflight redirect issues
                # Ngrok free tier requires HTTPS, so we should always use https for ngrok domains
                if 'ngrok.app' in url and url.startswith('http://'):
                    url = url.replace('http://', 'https://', 1)
                return url
            return f'/api/users/{obj.user.id}/photo/'
        return None

    def update(self, instance, validated_data):
        """Update profile and encrypt photo if provided."""
        photo = validated_data.get('photo')
        import logging
        import os

        logger = logging.getLogger(__name__)

        # Store reference to old photo path before updating (in case we need to delete it after successful upload)
        old_photo_path = None
        if photo and instance.photo:
            # Store the old photo file path before it gets replaced
            # Get the path from the storage
            old_photo_path = instance.photo.name if hasattr(instance.photo, 'name') and instance.photo.name else None
            if old_photo_path:
                logger.info(f'Storing old photo path for deletion: {old_photo_path} for user {instance.user.id}')

        # If a new photo is being uploaded, encrypt it before saving
        if photo:
            from django.core.files.uploadedfile import InMemoryUploadedFile, TemporaryUploadedFile
            from django.core.files.base import ContentFile

            # Check if it's a new file upload
            if isinstance(photo, (InMemoryUploadedFile, TemporaryUploadedFile)) or (hasattr(photo, 'read') and not hasattr(photo, 'storage')):
                try:
                    # Read the file data
                    photo.seek(0)
                    file_data = photo.read()

                    # Encrypt the file data
                    encrypted_data = instance._encrypt_file_data(file_data)

                    # Get original filename
                    original_name = getattr(photo, 'name', None)
                    if not original_name:
                        original_name = 'photo.jpg'

                    # Extract just the filename if it's a full path
                    if original_name:
                        original_name = os.path.basename(original_name)
                        if not os.path.splitext(original_name)[1]:
                            original_name = 'photo.jpg'

                    # Create a new ContentFile with encrypted data
                    encrypted_file = ContentFile(encrypted_data, name=original_name)
                    validated_data['photo'] = encrypted_file
                except Exception as e:
                    logger.error(f'Error encrypting photo in serializer: {str(e)}', exc_info=True)
                    raise

        # Call parent update method to save the new photo
        updated_instance = super().update(instance, validated_data)

        # After successful update, delete the old photo file if it existed
        if old_photo_path:
            try:
                # Refresh the instance to get the latest photo field
                updated_instance.refresh_from_db()
                
                # Get the storage - try multiple methods
                storage = None
                if updated_instance.photo and hasattr(updated_instance.photo, 'storage'):
                    storage = updated_instance.photo.storage
                elif hasattr(updated_instance.photo.field, 'storage'):
                    storage = updated_instance.photo.field.storage
                else:
                    from django.core.files.storage import default_storage
                    storage = default_storage
                
                logger.info(f'Attempting to delete old photo: {old_photo_path} for user {updated_instance.user.id}')
                logger.info(f'Storage type: {type(storage)}')
                logger.info(f'Storage exists check: {storage.exists(old_photo_path) if storage else "No storage"}')
                
                if storage and storage.exists(old_photo_path):
                    storage.delete(old_photo_path)
                    logger.info(f'Successfully deleted old photo file: {old_photo_path} for user {updated_instance.user.id}')
                else:
                    logger.warning(f'Old photo file does not exist or storage unavailable: {old_photo_path} for user {updated_instance.user.id}')
                    # Try alternative: delete all files in the user's photo directory except the current one
                    if updated_instance.photo and hasattr(updated_instance.photo, 'name'):
                        current_photo_name = updated_instance.photo.name
                        logger.info(f'Current photo name: {current_photo_name}')
                        # Try to delete old files in the directory
                        try:
                            import os
                            from django.conf import settings
                            user_photo_dir = os.path.join(settings.MEDIA_ROOT, 'user_photos', str(updated_instance.user.id))
                            if os.path.exists(user_photo_dir):
                                current_filename = os.path.basename(current_photo_name) if current_photo_name else None
                                for filename in os.listdir(user_photo_dir):
                                    if filename != current_filename:
                                        old_file_path = os.path.join(user_photo_dir, filename)
                                        try:
                                            os.remove(old_file_path)
                                            logger.info(f'Deleted old photo file via os.remove: {old_file_path}')
                                        except Exception as e:
                                            logger.warning(f'Could not delete {old_file_path}: {str(e)}')
                        except Exception as e:
                            logger.warning(f'Error in alternative deletion method: {str(e)}')
            except Exception as e:
                logger.warning(f'Error deleting old photo file {old_photo_path} for user {updated_instance.user.id}: {str(e)}', exc_info=True)
                # Don't raise - the new photo is already saved, this is just cleanup

        return updated_instance


class RecipeSerializer(serializers.ModelSerializer):
    """Recipe serializer."""
    created_by_username = serializers.SerializerMethodField()
    ingredients = serializers.JSONField(required=False, allow_null=True)
    instructions = serializers.JSONField(required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()  # Override to return either stored image URL or original URL

    def get_created_by_username(self, obj):
        if obj.created_by and obj.created_by.user and hasattr(obj.created_by.user, 'profile') and obj.created_by.user.profile:
            return obj.created_by.user.profile.display_name or obj.created_by.user.email
        return obj.created_by.user.email if obj.created_by and obj.created_by.user else None

    def get_image_url(self, obj):
        """Return the image URL - prefer stored image, fall back to original URL."""
        if obj.image and obj.image.name:
            # Return full URL to stored image
            request = self.context.get('request')
            if request:
                # Get the actual host from the request
                # request.get_host() returns the Host header, which should be correct
                host = request.get_host()
                scheme = request.scheme
                
                # Build the media URL manually to ensure we use the correct host
                media_path = obj.image.url
                # Ensure media_path starts with /media/
                if not media_path.startswith('/'):
                    media_path = '/' + media_path
                if not media_path.startswith('/media/'):
                    media_path = '/media/' + media_path.lstrip('/')
                
                image_url = f'{scheme}://{host}{media_path}'
                
                # Log for debugging
                import logging
                logger = logging.getLogger(__name__)
                logger.debug(f"Built image URL: {image_url} from request host: {host}, scheme: {scheme}")
                
                return image_url
            else:
                # Fallback: construct URL from settings
                # This should rarely happen as request should always be in context
                media_url = settings.MEDIA_URL
                if not media_url.startswith('http'):
                    # Use first allowed host or default to localhost
                    if settings.ALLOWED_HOSTS and settings.ALLOWED_HOSTS[0] != '*':
                        host = settings.ALLOWED_HOSTS[0]
                        # Add port if not present and not a special host
                        if ':' not in host and host not in ['localhost', '127.0.0.1']:
                            host = f'{host}:8900'
                    else:
                        host = 'localhost:8900'
                    return f'http://{host}{media_url}{obj.image.name}'
                return f'{media_url}{obj.image.name}'
        # Fall back to original external URL (for backward compatibility)
        return obj.image_url if hasattr(obj, 'image_url') else None

    class Meta:
        model = Recipe
        fields = [
            'id', 'family', 'created_by', 'created_by_username', 'title', 'notes',
            'ingredients', 'instructions', 'servings', 'prep_time_minutes', 'cook_time_minutes',
            'image', 'image_url', 'source_url', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        """Create recipe with encrypted JSON fields."""
        ingredients = validated_data.pop('ingredients', [])
        instructions = validated_data.pop('instructions', [])
        recipe = Recipe.objects.create(**validated_data)
        recipe.ingredients = ingredients
        recipe.instructions = instructions
        recipe.save()
        return recipe

    def update(self, instance, validated_data):
        """Update recipe with encrypted JSON fields."""
        ingredients = validated_data.pop('ingredients', None)
        instructions = validated_data.pop('instructions', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if ingredients is not None:
            instance.ingredients = ingredients
        if instructions is not None:
            instance.instructions = instructions

        instance.save()
        return instance


class MealPlanSerializer(serializers.ModelSerializer):
    """MealPlan serializer."""
    created_by_username = serializers.SerializerMethodField()
    meals = serializers.JSONField(required=False, allow_null=True)

    def get_created_by_username(self, obj):
        if obj.created_by and obj.created_by.user and hasattr(obj.created_by.user, 'profile') and obj.created_by.user.profile:
            return obj.created_by.user.profile.display_name or obj.created_by.user.email
        return obj.created_by.user.email if obj.created_by and obj.created_by.user else None

    class Meta:
        model = MealPlan
        fields = [
            'id', 'family', 'created_by', 'created_by_username', 'notes',
            'week_start_date', 'meals', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        """Create meal plan with encrypted JSON field."""
        meals = validated_data.pop('meals', {})
        meal_plan = MealPlan.objects.create(**validated_data)
        meal_plan.meals = meals
        meal_plan.save()
        return meal_plan

    def update(self, instance, validated_data):
        """Update meal plan with encrypted JSON field."""
        meals = validated_data.pop('meals', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if meals is not None:
            instance.meals = meals

        instance.save()
        return instance

