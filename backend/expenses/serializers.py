"""
Serializers for expenses app.
"""
from django.conf import settings
from rest_framework import serializers
from decimal import Decimal, InvalidOperation
from .models import ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt, ExpenseLineItem


def _absolute_media_url(file_field, request=None) -> str | None:
    """Build a client-reachable media URL (prefer API_PUBLIC_BASE_URL over loopback)."""
    if not file_field:
        return None
    path = file_field.url
    if not path.startswith('/'):
        path = '/' + path
    public_base = getattr(settings, 'API_PUBLIC_BASE_URL', '') or ''
    if public_base:
        return f'{public_base.rstrip("/")}{path}'
    if request:
        return request.build_absolute_uri(path)
    return path


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
            return _absolute_media_url(obj.file, self.context.get('request'))
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
        read_only_fields = ['id', 'created_at', 'updated_at', 'receipt_url', 'uploaded_by_username', 'file_size']


def _enc_money_str(value) -> str | None:
    if value is None or value == '':
        return None
    try:
        return str(Decimal(str(value)).quantize(Decimal('0.01')))
    except (InvalidOperation, ValueError):
        raise serializers.ValidationError('Invalid money amount')


def _dec_money(value) -> float | None:
    if value is None or value == '':
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


class ExpenseLineItemSerializer(serializers.ModelSerializer):
    """Line item on an expense (manual entry / future OCR)."""
    quantity = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()
    quantity_input = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    unit_price_input = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    line_total_input = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    def get_quantity(self, obj):
        return _dec_money(obj.quantity)

    def get_unit_price(self, obj):
        return _dec_money(obj.unit_price)

    def get_line_total(self, obj):
        return _dec_money(obj.line_total)

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'quantity' in data and 'quantity_input' not in data:
            data['quantity_input'] = data.pop('quantity')
        if 'unit_price' in data and 'unit_price_input' not in data:
            data['unit_price_input'] = data.pop('unit_price')
        if 'line_total' in data and 'line_total_input' not in data:
            data['line_total_input'] = data.pop('line_total')
        return super().to_internal_value(data)

    def create(self, validated_data):
        q = validated_data.pop('quantity_input', None)
        up = validated_data.pop('unit_price_input', None)
        lt = validated_data.pop('line_total_input', None)
        validated_data['quantity'] = _enc_money_str(q) if q not in (None, '') else None
        validated_data['unit_price'] = _enc_money_str(up) if up not in (None, '') else None
        validated_data['line_total'] = _enc_money_str(lt) if lt not in (None, '') else None
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'quantity_input' in validated_data:
            q = validated_data.pop('quantity_input')
            instance.quantity = _enc_money_str(q) if q not in (None, '') else None
        if 'unit_price_input' in validated_data:
            up = validated_data.pop('unit_price_input')
            instance.unit_price = _enc_money_str(up) if up not in (None, '') else None
        if 'line_total_input' in validated_data:
            lt = validated_data.pop('line_total_input')
            instance.line_total = _enc_money_str(lt) if lt not in (None, '') else None
        return super().update(instance, validated_data)

    class Meta:
        model = ExpenseLineItem
        fields = [
            'id', 'expense', 'name', 'quantity', 'unit_price', 'line_total',
            'quantity_input', 'unit_price_input', 'line_total_input',
            'order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'quantity', 'unit_price', 'line_total']


class ExpenseSerializer(serializers.ModelSerializer):
    """Expense serializer."""
    category_name = serializers.SerializerMethodField()
    tag_names = serializers.SerializerMethodField()
    receipt_url = serializers.SerializerMethodField()
    receipt_id = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    # Amount - use CharField for writing (maps to EncryptedCharField), SerializerMethodField for reading
    amount = serializers.SerializerMethodField()
    amount_input = serializers.CharField(write_only=True, required=False, source='amount')
    line_items = ExpenseLineItemSerializer(many=True, required=False, read_only=True)
    line_items_input = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
    )

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
            return _absolute_media_url(obj.receipt_file.file, self.context.get('request'))
        return None

    def get_receipt_id(self, obj):
        if hasattr(obj, 'receipt_file') and obj.receipt_file:
            return obj.receipt_file.id
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

    def _sync_line_items(self, expense, items_data):
        if items_data is None:
            return
        expense.line_items.all().delete()
        for idx, raw in enumerate(items_data):
            name = (raw.get('name') or '').strip()
            if not name:
                continue
            qty = raw.get('quantity')
            unit = raw.get('unit_price')
            total = raw.get('line_total')
            ExpenseLineItem.objects.create(
                expense=expense,
                name=name[:200],
                quantity=_enc_money_str(qty) if qty not in (None, '') else None,
                unit_price=_enc_money_str(unit) if unit not in (None, '') else None,
                line_total=_enc_money_str(total) if total not in (None, '') else None,
                order=raw.get('order', idx),
            )

    def create(self, validated_data):
        items = validated_data.pop('line_items_input', None)
        validated_data.pop('line_items', None)
        tags = validated_data.pop('tags', None)
        expense = super().create(validated_data)
        if tags is not None:
            expense.tags.set(tags)
        self._sync_line_items(expense, items)
        return expense

    def update(self, instance, validated_data):
        items = validated_data.pop('line_items_input', None)
        validated_data.pop('line_items', None)
        tags = validated_data.pop('tags', None)
        expense = super().update(instance, validated_data)
        if tags is not None:
            expense.tags.set(tags)
        if items is not None:
            self._sync_line_items(expense, items)
        return expense

    class Meta:
        model = Expense
        fields = [
            'id', 'family', 'created_by', 'created_by_username', 'category', 'category_name',
            'amount', 'amount_input', 'description', 'notes', 'expense_date', 'payment_method', 'tags', 'tag_names',
            'receipt_url', 'receipt_id', 'is_recurring', 'is_paid', 'recurring_expense', 'line_items', 'line_items_input',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'category_name', 'tag_names', 'receipt_url', 'receipt_id',
            'created_by_username', 'amount', 'line_items',
        ]


class BudgetSerializer(serializers.ModelSerializer):
    """Budget serializer."""
    spent_amount = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()
    percentage_used = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    base_amount = serializers.SerializerMethodField()

    def _reference_date(self):
        """Use as_of from context when provided (for month navigation)."""
        from django.utils import timezone
        as_of = self.context.get('as_of')
        if as_of is not None:
            return as_of
        return timezone.now().date()

    def _period_window(self, obj):
        from datetime import timedelta
        # Optional override (e.g. full calendar year for expenses year view)
        override = self.context.get('period_window')
        if override is not None:
            return override

        ref = self._reference_date()
        if obj.period == 'daily':
            return ref, ref
        if obj.period == 'weekly':
            start = ref - timedelta(days=ref.weekday())
            return start, start + timedelta(days=6)
        if obj.period == 'monthly':
            start = ref.replace(day=1)
            if ref.month == 12:
                end = ref.replace(day=31)
            else:
                end = (ref.replace(month=ref.month + 1, day=1) - timedelta(days=1))
            return start, end
        # yearly
        return ref.replace(month=1, day=1), ref.replace(month=12, day=31)

    @staticmethod
    def _months_spanned(start, end) -> int:
        return max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1)

    def _base_amount(self, obj) -> Decimal:
        try:
            return Decimal(str(obj.amount or '0'))
        except (ValueError, InvalidOperation, TypeError):
            return Decimal('0.00')

    def _effective_amount(self, obj) -> Decimal:
        """Period-aware budget limit.

        Categories with active recurring templates: sum amounts due in the viewed window
        (so future-start items like Shaw in Apr 2027 don't inflate Oct; year view sums
        all dues in that year).
        Categories without recurring (manual / expense-analysis): stored monthly amount
        × months in the window (1 for month view, 12 for year view).
        """
        from .recurring_sync import recurring_due_in_window, category_has_active_recurring
        base = self._base_amount(obj)
        start, end = self._period_window(obj)
        months = self._months_spanned(start, end)

        if obj.period != 'monthly':
            return base

        recurring_due_map = self.context.get('recurring_due_by_category')
        recurring_cats = self.context.get('recurring_categories')
        if recurring_due_map is not None and recurring_cats is not None:
            if obj.category_id in recurring_cats:
                return Decimal(str(recurring_due_map.get(obj.category_id, 0)))
            return base * Decimal(months)

        if category_has_active_recurring(obj.family_id, obj.category_id):
            return recurring_due_in_window(obj.family_id, obj.category_id, start, end)
        return base * Decimal(months)

    def get_base_amount(self, obj):
        return float(self._base_amount(obj))

    def get_spent_amount(self, obj):
        """Calculate total spent for this budget period."""
        spent_map = self.context.get('spent_by_category')
        if spent_map is not None:
            return float(spent_map.get(obj.category_id, 0) or 0)

        start, end = self._period_window(obj)

        expenses = Expense.objects.filter(
            family=obj.family,
            category=obj.category,
            expense_date__gte=start,
            expense_date__lte=end,
            is_paid=True,
        )

        total = Decimal('0.00')
        for expense in expenses:
            try:
                total += Decimal(str(expense.amount or '0'))
            except (ValueError, InvalidOperation, TypeError):
                continue

        return float(total)

    def get_remaining_amount(self, obj):
        spent = self.get_spent_amount(obj)
        return float(self._effective_amount(obj)) - spent

    def get_percentage_used(self, obj):
        spent = self.get_spent_amount(obj)
        limit = float(self._effective_amount(obj))
        if limit > 0:
            return round((spent / limit) * 100, 2)
        return 0.0

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Expose month-aware limit as amount (yearly only in its due month)
        data['amount'] = float(self._effective_amount(instance))
        return data

    class Meta:
        model = Budget
        fields = [
            'id', 'family', 'category', 'category_name', 'amount', 'base_amount', 'period', 'start_date', 'end_date',
            'alert_threshold', 'is_active', 'spent_amount', 'remaining_amount', 'percentage_used',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'spent_amount', 'remaining_amount', 'percentage_used',
            'category_name', 'base_amount',
        ]


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
