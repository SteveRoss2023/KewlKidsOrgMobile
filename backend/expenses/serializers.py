"""
Serializers for expenses app.
"""
from rest_framework import serializers
from decimal import Decimal, InvalidOperation
from .models import ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """ExpenseCategory serializer."""

    class Meta:
        model = ExpenseCategory
        fields = [
            'id', 'family', 'name', 'description', 'icon', 'color', 'order', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ExpenseTagSerializer(serializers.ModelSerializer):
    """ExpenseTag serializer."""

    class Meta:
        model = ExpenseTag
        fields = [
            'id', 'family', 'name', 'color', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ReceiptSerializer(serializers.ModelSerializer):
    """Receipt serializer."""
    receipt_url = serializers.SerializerMethodField()
    uploaded_by_username = serializers.SerializerMethodField()

    def get_receipt_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def get_uploaded_by_username(self, obj):
        if obj.uploaded_by and obj.uploaded_by.user and hasattr(obj.uploaded_by.user, 'profile') and obj.uploaded_by.user.profile:
            return obj.uploaded_by.user.profile.display_name or obj.uploaded_by.user.email
        return obj.uploaded_by.user.email if obj.uploaded_by and obj.uploaded_by.user else None

    class Meta:
        model = Receipt
        fields = [
            'id', 'expense', 'family', 'file', 'receipt_url', 'file_size', 'mime_type',
            'uploaded_by', 'uploaded_by_username', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'receipt_url', 'uploaded_by_username']


class ExpenseSerializer(serializers.ModelSerializer):
    """Expense serializer."""
    category_name = serializers.SerializerMethodField()
    tag_names = serializers.SerializerMethodField()
    receipt_url = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    # Amount - use CharField for writing (maps to EncryptedCharField), SerializerMethodField for reading
    amount = serializers.SerializerMethodField()
    amount_input = serializers.CharField(write_only=True, required=False, source='amount')

    def get_amount(self, obj):
        """Convert encrypted amount string to float for API response."""
        if obj.amount:
            try:
                return float(Decimal(str(obj.amount)))
            except (ValueError, InvalidOperation):
                return 0.0
        return 0.0

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_tag_names(self, obj):
        return [tag.name for tag in obj.tags.all()]

    def get_receipt_url(self, obj):
        if hasattr(obj, 'receipt_file') and obj.receipt_file and obj.receipt_file.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.receipt_file.file.url)
            return obj.receipt_file.file.url
        return None

    def get_created_by_username(self, obj):
        if obj.created_by and obj.created_by.user and hasattr(obj.created_by.user, 'profile') and obj.created_by.user.profile:
            return obj.created_by.user.profile.display_name or obj.created_by.user.email
        return obj.created_by.user.email if obj.created_by and obj.created_by.user else None

    def to_internal_value(self, data):
        """Convert amount to string before saving."""
        # Handle both 'amount' and 'amount_input' for backward compatibility
        amount_value = data.get('amount') or data.get('amount_input')
        if amount_value is not None:
            try:
                # Ensure amount is a string
                if isinstance(amount_value, (int, float)):
                    # Convert to string and store in amount_input field (which maps to amount)
                    data['amount_input'] = str(Decimal(str(amount_value)).quantize(Decimal('0.01')))
                elif isinstance(amount_value, str):
                    # Validate and format
                    data['amount_input'] = str(Decimal(amount_value).quantize(Decimal('0.01')))
                # Remove the original amount field since we're using amount_input
                data.pop('amount', None)
            except (ValueError, InvalidOperation):
                raise serializers.ValidationError({'amount': 'Invalid amount format'})
        return super().to_internal_value(data)

    class Meta:
        model = Expense
        fields = [
            'id', 'family', 'created_by', 'created_by_username', 'category', 'category_name',
            'amount', 'amount_input', 'description', 'notes', 'expense_date', 'payment_method', 'tags', 'tag_names',
            'receipt_url', 'is_recurring', 'recurring_expense', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'category_name', 'tag_names', 'receipt_url', 'created_by_username', 'amount']


class BudgetSerializer(serializers.ModelSerializer):
    """Budget serializer."""
    spent_amount = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()
    percentage_used = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()

    def get_spent_amount(self, obj):
        """Calculate total spent for this budget period."""
        from django.utils import timezone
        from datetime import timedelta
        from decimal import Decimal

        # Determine date range based on period
        today = timezone.now().date()
        if obj.period == 'daily':
            start = today
            end = today
        elif obj.period == 'weekly':
            start = today - timedelta(days=today.weekday())
            end = start + timedelta(days=6)
        elif obj.period == 'monthly':
            start = today.replace(day=1)
            if today.month == 12:
                end = today.replace(day=31)
            else:
                end = (today.replace(month=today.month + 1, day=1) - timedelta(days=1))
        else:  # yearly
            start = today.replace(month=1, day=1)
            end = today.replace(month=12, day=31)

        # Get expenses for this category in the date range
        expenses = Expense.objects.filter(
            family=obj.family,
            category=obj.category,
            expense_date__gte=start,
            expense_date__lte=end
        )

        total = Decimal('0.00')
        for expense in expenses:
            total += expense.amount

        return float(total)

    def get_remaining_amount(self, obj):
        spent = self.get_spent_amount(obj)
        return float(obj.amount) - spent

    def get_percentage_used(self, obj):
        spent = self.get_spent_amount(obj)
        if obj.amount > 0:
            return round((spent / float(obj.amount)) * 100, 2)
        return 0.0

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    class Meta:
        model = Budget
        fields = [
            'id', 'family', 'category', 'category_name', 'amount', 'period', 'start_date', 'end_date',
            'alert_threshold', 'is_active', 'spent_amount', 'remaining_amount', 'percentage_used',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'spent_amount', 'remaining_amount', 'percentage_used', 'category_name']


class RecurringExpenseSerializer(serializers.ModelSerializer):
    """RecurringExpense serializer."""
    category_name = serializers.SerializerMethodField()
    tag_names = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    # Amount - use CharField for writing (maps to EncryptedCharField), SerializerMethodField for reading
    amount = serializers.SerializerMethodField()
    amount_input = serializers.CharField(write_only=True, required=False, source='amount')

    def get_amount(self, obj):
        """Convert encrypted amount string to float for API response."""
        if obj.amount:
            try:
                return float(Decimal(str(obj.amount)))
            except (ValueError, InvalidOperation):
                return 0.0
        return 0.0

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_tag_names(self, obj):
        return [tag.name for tag in obj.tags.all()]

    def get_created_by_username(self, obj):
        if obj.created_by and obj.created_by.user and hasattr(obj.created_by.user, 'profile') and obj.created_by.user.profile:
            return obj.created_by.user.profile.display_name or obj.created_by.user.email
        return obj.created_by.user.email if obj.created_by and obj.created_by.user else None

    def to_internal_value(self, data):
        """Convert amount to string before saving."""
        # Handle both 'amount' and 'amount_input' for backward compatibility
        amount_value = data.get('amount') or data.get('amount_input')
        if amount_value is not None:
            try:
                # Ensure amount is a string
                if isinstance(amount_value, (int, float)):
                    # Convert to string and store in amount_input field (which maps to amount)
                    data['amount_input'] = str(Decimal(str(amount_value)).quantize(Decimal('0.01')))
                elif isinstance(amount_value, str):
                    # Validate and format
                    data['amount_input'] = str(Decimal(amount_value).quantize(Decimal('0.01')))
                # Remove the original amount field since we're using amount_input
                data.pop('amount', None)
            except (ValueError, InvalidOperation):
                raise serializers.ValidationError({'amount': 'Invalid amount format'})
        return super().to_internal_value(data)

    def create(self, validated_data):
        """Create recurring expense and calculate next_due_date from start_date and frequency."""
        from datetime import timedelta
        import logging

        # Calculate next_due_date from start_date and frequency
        start_date = validated_data.get('start_date')
        frequency = validated_data.get('frequency', 'monthly')

        # Log the start_date being used
        logger = logging.getLogger(__name__)
        if start_date:
            logger.info(f"Serializer create: start_date={start_date} (type={type(start_date)}, day={start_date.day}, month={start_date.month}, year={start_date.year})")

        if start_date:
            # Calculate next_due_date using the same logic as the view
            if frequency == 'daily':
                next_due_date = start_date + timedelta(days=1)
            elif frequency == 'weekly':
                next_due_date = start_date + timedelta(weeks=1)
            elif frequency == 'monthly':
                # Add one month, preserving the day
                if start_date.month == 12:
                    next_due_date = start_date.replace(year=start_date.year + 1, month=1, day=start_date.day)
                else:
                    try:
                        # Explicitly preserve the day
                        next_due_date = start_date.replace(month=start_date.month + 1, day=start_date.day)
                    except ValueError:
                        # Day doesn't exist in next month (e.g., Jan 31 -> Feb)
                        from calendar import monthrange
                        if start_date.month == 12:
                            next_year = start_date.year + 1
                            next_month = 1
                        else:
                            next_year = start_date.year
                            next_month = start_date.month + 1
                        last_day = monthrange(next_year, next_month)[1]
                        next_due_date = start_date.replace(year=next_year, month=next_month, day=min(start_date.day, last_day))
            else:  # yearly
                next_due_date = start_date.replace(year=start_date.year + 1)

            validated_data['next_due_date'] = next_due_date

        return super().create(validated_data)

    class Meta:
        model = RecurringExpense
        fields = [
            'id', 'family', 'created_by', 'created_by_username', 'category', 'category_name',
            'amount', 'amount_input', 'description', 'notes', 'frequency', 'start_date', 'end_date', 'next_due_date',
            'is_active', 'payment_method', 'tags', 'tag_names', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'category_name', 'tag_names', 'created_by_username', 'amount', 'next_due_date']
