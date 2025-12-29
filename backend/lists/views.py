"""
Views for lists.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Max, F
from .models import List, ListItem, GroceryCategory, CompletedListItem
from .serializers import ListSerializer, ListItemSerializer, GroceryCategorySerializer, CompletedListItemSerializer
from families.models import Family, Member
from django.contrib.auth import get_user_model
from datetime import datetime, timedelta

User = get_user_model()


class ListViewSet(viewsets.ModelViewSet):
    """List viewset."""
    serializer_class = ListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return lists for families the user belongs to."""
        user = self.request.user
        queryset = List.objects.filter(family__members__user=user, archived=False)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                queryset = queryset.filter(family_id=int(family_id))
            except (ValueError, TypeError):
                pass

        # Filter by list_type if provided (for shopping lists, etc.)
        # Note: list_type is encrypted, so we need to filter in Python after fetching
        list_type = self.request.query_params.get('type') or self.request.query_params.get('list_type')
        if list_type:
            # For encrypted fields, filtering at DB level can be unreliable
            # So we fetch all and filter in Python
            all_lists = list(queryset)
            filtered_lists = [l for l in all_lists if l.list_type == list_type]
            # Return a queryset-like object by filtering by IDs
            if filtered_lists:
                list_ids = [l.id for l in filtered_lists]
                queryset = queryset.filter(id__in=list_ids)
            else:
                # Return empty queryset
                queryset = queryset.none()

        return queryset

    def perform_create(self, serializer):
        """Create list with creator as created_by."""
        family = get_object_or_404(Family, id=self.request.data.get('family'))
        member = get_object_or_404(Member, user=self.request.user, family=family)
        list_obj = serializer.save(created_by=member)

        # If this is a grocery list, ensure default categories exist for the family
        if list_obj.list_type == 'grocery':
            from .utils import ensure_default_categories
            ensure_default_categories(family)


class GroceryCategoryViewSet(viewsets.ModelViewSet):
    """GroceryCategory viewset."""
    serializer_class = GroceryCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return categories for families the user belongs to."""
        user = self.request.user
        queryset = GroceryCategory.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                family_id = int(family_id)
                # Get the family first to ensure user has access
                try:
                    family = Family.objects.get(id=family_id, members__user=user)
                    # Ensure default categories exist for this family
                    # This is safe - ensure_default_categories only creates missing ones
                    from .utils import ensure_default_categories
                    ensure_default_categories(family)
                except Family.DoesNotExist:
                    pass

                # Filter queryset after ensuring categories exist
                queryset = queryset.filter(family_id=family_id)
            except (ValueError, TypeError):
                pass

        return queryset.order_by('order', 'name')

    def perform_create(self, serializer):
        """Create category with family validation and insert at specified order."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)

        # Get the requested order from the data
        requested_order = self.request.data.get('order')
        if requested_order is not None:
            try:
                requested_order = int(requested_order)
            except (ValueError, TypeError):
                requested_order = None

        # If no order provided, assign the next available order
        if requested_order is None:
            max_order = GroceryCategory.objects.filter(family=family).aggregate(
                max_order=Max('order')
            )['max_order'] or 0
            requested_order = max_order + 1

        # Shift existing categories to make room for the new one
        # Increment order for all categories with order >= requested_order
        GroceryCategory.objects.filter(
            family=family,
            order__gte=requested_order
        ).update(order=F('order') + 1)

        # Save with the requested order
        serializer.save(family=family, order=requested_order)

    def perform_destroy(self, instance):
        """Delete category and renumber remaining categories sequentially."""
        deleted_order = instance.order
        family = instance.family

        # Delete the category first
        instance.delete()

        # Get all remaining categories ordered by their current order
        remaining_categories = GroceryCategory.objects.filter(
            family=family
        ).order_by('order', 'name')

        # Renumber all remaining categories sequentially starting from 1
        for index, category in enumerate(remaining_categories, start=1):
            if category.order != index:
                category.order = index
                category.save(update_fields=['order'])


class ListItemViewSet(viewsets.ModelViewSet):
    """ListItem viewset."""
    serializer_class = ListItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return items for lists the user can access."""
        user = self.request.user
        queryset = ListItem.objects.filter(list__family__members__user=user)

        # Filter by list if provided
        list_id = self.request.query_params.get('list')
        if list_id:
            try:
                queryset = queryset.filter(list_id=int(list_id))
            except (ValueError, TypeError):
                pass

        return queryset

    def perform_create(self, serializer):
        """Create item with creator as created_by."""
        list_obj = get_object_or_404(List, id=self.request.data.get('list'))
        member = get_object_or_404(Member, user=self.request.user, family=list_obj.family)

        # Set default due_date for todo lists if not provided
        save_kwargs = {}
        if list_obj.list_type == 'todo':
            due_date = self.request.data.get('due_date')
            if not due_date:
                save_kwargs['due_date'] = timezone.now().date()
            elif due_date:
                save_kwargs['due_date'] = due_date

            # Set order to max + 1 for todo lists
            max_order = ListItem.objects.filter(list=list_obj).aggregate(Max('order'))['order__max']
            save_kwargs['order'] = (max_order + 1) if max_order is not None else 0

        item = serializer.save(created_by=member, **save_kwargs)

        # Auto-assign category for grocery lists
        if list_obj.list_type == 'grocery':
            from .utils import assign_category_to_item
            assign_category_to_item(item, list_obj.family)

    def update(self, request, *args, **kwargs):
        """Update item - special handling for list completion (all list types)."""
        instance = self.get_object()
        list_obj = instance.list

        # Check if this is a list item being completed (all list types now save to history)
        if request.data.get('completed') is True and not instance.completed:
            # Get the member for the current user
            member = get_object_or_404(Member, user=request.user, family=list_obj.family)

            # Extract recipe name from notes if present
            recipe_name = None
            notes = None
            if instance.notes:
                if instance.notes.startswith('From recipe: '):
                    recipe_name = instance.notes.replace('From recipe: ', '').strip()
                else:
                    notes = instance.notes

            # Get category name (for grocery lists)
            category_name = instance.category.name if instance.category else None

            # Create CompletedListItem
            CompletedListItem.objects.create(
                user=request.user,
                family=list_obj.family,
                list_name=list_obj.name,
                item_name=instance.name,
                list_type=list_obj.list_type,
                category_name=category_name,
                quantity=instance.quantity,
                recipe_name=recipe_name,
                notes=notes,
                due_date=instance.due_date,
            )

            # Delete the item instead of marking as completed
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # For uncompleting items, use default behavior
        return super().update(request, *args, **kwargs)


class CompletedListItemViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing completed list items history."""
    serializer_class = CompletedListItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return completed items for the current user."""
        user = self.request.user
        queryset = CompletedListItem.objects.filter(user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                # Verify user has access to this family
                family = get_object_or_404(Family, id=int(family_id), members__user=user)
                queryset = queryset.filter(family=family)
            except (ValueError, TypeError):
                pass

        # Filter by list_type if provided
        list_type = self.request.query_params.get('list_type')
        if list_type:
            queryset = queryset.filter(list_type=list_type)

        # Filter by date range if provided
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                queryset = queryset.filter(completed_date__gte=start_dt)
            except (ValueError, TypeError):
                pass

        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                # Add one day to include the entire end date
                end_dt = end_dt + timedelta(days=1)
                queryset = queryset.filter(completed_date__lt=end_dt)
            except (ValueError, TypeError):
                pass

        return queryset.order_by('-completed_date')

