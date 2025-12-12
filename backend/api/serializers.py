from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import UserProfile

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

