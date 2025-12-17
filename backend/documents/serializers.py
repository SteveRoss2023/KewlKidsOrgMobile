"""
Serializers for documents app.
"""
from rest_framework import serializers
from .models import Document, Folder


class FolderSerializer(serializers.ModelSerializer):
    """Folder serializer."""
    subfolders_count = serializers.SerializerMethodField()
    documents_count = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = [
            'id', 'name', 'description', 'parent_folder', 'family',
            'created_at', 'updated_at', 'subfolders_count', 'documents_count'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'subfolders_count', 'documents_count']

    def get_subfolders_count(self, obj):
        return obj.get_subfolders_count()

    def get_documents_count(self, obj):
        return obj.get_documents_count()


class DocumentSerializer(serializers.ModelSerializer):
    """Document serializer."""
    uploaded_by_username = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    # Explicitly define name as required field
    name = serializers.CharField(max_length=200, required=True)
    file = serializers.FileField(required=True)

    class Meta:
        model = Document
        fields = [
            'id', 'name', 'description', 'file', 'file_url', 'file_size', 'mime_type',
            'parent_folder', 'folder', 'family', 'is_encrypted', 'uploaded_by',
            'uploaded_by_username', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'file_size', 'mime_type', 'created_at', 'updated_at', 'uploaded_by_username', 'file_url']

    def get_uploaded_by_username(self, obj):
        return obj.uploaded_by_username

    def get_file_url(self, obj):
        """Return the full URL for the file."""
        if obj.file:
            request = self.context.get('request')
            if request:
                url = request.build_absolute_uri(obj.file.url)
                # Normalize ngrok URLs to use https
                if 'ngrok.app' in url and url.startswith('http://'):
                    url = url.replace('http://', 'https://', 1)
                return url
            return obj.file.url if obj.file else None
        return None

    def create(self, validated_data):
        """Create document and set file_size and mime_type."""
        file = validated_data.get('file')
        if file:
            validated_data['file_size'] = file.size
            validated_data['mime_type'] = file.content_type or 'application/octet-stream'

        # Set folder from parent_folder if provided
        # parent_folder might be in initial_data (from FormData) or validated_data
        parent_folder_id = validated_data.pop('parent_folder', None)
        if parent_folder_id is None and 'parent_folder' in self.initial_data:
            parent_folder_value = self.initial_data.get('parent_folder')
            if parent_folder_value and parent_folder_value != '' and parent_folder_value != 'null':
                try:
                    parent_folder_id = int(parent_folder_value)
                except (ValueError, TypeError):
                    parent_folder_id = None

        if parent_folder_id:
            validated_data['folder_id'] = parent_folder_id
        else:
            validated_data['folder'] = None

        return super().create(validated_data)

    def update(self, instance, validated_data):
        """Update document and handle file replacement."""
        file = validated_data.get('file')
        if file:
            # Delete old file
            if instance.file:
                instance.file.delete(save=False)
            validated_data['file_size'] = file.size
            validated_data['mime_type'] = file.content_type or 'application/octet-stream'

        # Handle parent_folder update
        # parent_folder might be in initial_data (from FormData) or validated_data
        parent_folder_id = validated_data.pop('parent_folder', None)
        if parent_folder_id is None and 'parent_folder' in self.initial_data:
            parent_folder_value = self.initial_data.get('parent_folder')
            if parent_folder_value == '' or parent_folder_value == 'null':
                parent_folder_id = None
            elif parent_folder_value:
                try:
                    parent_folder_id = int(parent_folder_value)
                except (ValueError, TypeError):
                    parent_folder_id = None

        if parent_folder_id is not None:
            if parent_folder_id:
                validated_data['folder_id'] = parent_folder_id
            else:
                validated_data['folder'] = None

        return super().update(instance, validated_data)
