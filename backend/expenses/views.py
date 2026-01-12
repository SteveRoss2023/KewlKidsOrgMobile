"""
Views for expenses app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Sum, Count, Q, Max, F
from django.http import HttpResponse, FileResponse
from django.conf import settings
from decimal import Decimal, InvalidOperation
from .models import ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt
from .serializers import (
    ExpenseCategorySerializer, ExpenseSerializer, ExpenseTagSerializer,
    BudgetSerializer, RecurringExpenseSerializer, ReceiptSerializer
)
from families.models import Family, Member
from datetime import datetime, timedelta, date
from decimal import Decimal
import os


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """ExpenseCategory viewset."""
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return categories for families the user belongs to."""
        user = self.request.user
        queryset = ExpenseCategory.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                family_id = int(family_id)
                # Get the family first to ensure user has access
                try:
                    family = Family.objects.get(id=family_id, members__user=user)
                    # Ensure default categories exist for this family
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
            max_order = ExpenseCategory.objects.filter(family=family).aggregate(
                max_order=Max('order')
            )['max_order'] or 0
            requested_order = max_order + 1

        # Shift existing categories to make room for the new one
        ExpenseCategory.objects.filter(
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

        # Renumber all remaining categories sequentially
        remaining_categories = ExpenseCategory.objects.filter(
            family=family
        ).order_by('order', 'name')

        for index, category in enumerate(remaining_categories, start=1):
            if category.order != index:
                category.order = index
                category.save(update_fields=['order'])

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Reorder categories."""
        category_ids = request.data.get('category_ids', [])
        if not category_ids:
            return Response({'error': 'category_ids is required'}, status=status.HTTP_400_BAD_REQUEST)

        family_id = request.data.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)

        # Update order for each category
        for index, category_id in enumerate(category_ids, start=1):
            try:
                category = ExpenseCategory.objects.get(id=category_id, family=family)
                category.order = index
                category.save(update_fields=['order'])
            except ExpenseCategory.DoesNotExist:
                pass

        return Response({'message': 'Categories reordered successfully'}, status=status.HTTP_200_OK)


class ExpenseTagViewSet(viewsets.ModelViewSet):
    """ExpenseTag viewset."""
    serializer_class = ExpenseTagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return tags for families the user belongs to."""
        user = self.request.user
        queryset = ExpenseTag.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                queryset = queryset.filter(family_id=int(family_id))
            except (ValueError, TypeError):
                pass

        return queryset.order_by('name')

    def perform_create(self, serializer):
        """Create tag with family validation."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        serializer.save(family=family)


class ExpenseViewSet(viewsets.ModelViewSet):
    """Expense viewset."""
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return expenses for families the user belongs to."""
        user = self.request.user
        queryset = Expense.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                queryset = queryset.filter(family_id=int(family_id))
            except (ValueError, TypeError):
                pass

        # Filter by category if provided
        category_id = self.request.query_params.get('category')
        if category_id:
            try:
                queryset = queryset.filter(category_id=int(category_id))
            except (ValueError, TypeError):
                pass

        # Filter by date range if provided
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            try:
                queryset = queryset.filter(expense_date__gte=start_date)
            except (ValueError, TypeError):
                pass
        if end_date:
            try:
                queryset = queryset.filter(expense_date__lte=end_date)
            except (ValueError, TypeError):
                pass

        # Filter by payment method if provided
        payment_method = self.request.query_params.get('payment_method')
        if payment_method:
            queryset = queryset.filter(payment_method=payment_method)

        return queryset

    def get_serializer_context(self):
        """Add request to serializer context for building absolute URLs."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        """Create expense with creator as created_by."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        member = get_object_or_404(Member, user=self.request.user, family=family)
        serializer.save(created_by=member, family=family)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get spending statistics."""
        family_id = request.query_params.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)

        # Get period (default to monthly)
        period = request.query_params.get('period', 'monthly')
        today = timezone.now().date()

        # Calculate date range based on period
        if period == 'daily':
            start_date = today
            end_date = today
        elif period == 'weekly':
            start_date = today - timedelta(days=today.weekday())
            end_date = start_date + timedelta(days=6)
        elif period == 'monthly':
            start_date = today.replace(day=1)
            if today.month == 12:
                end_date = today.replace(day=31)
            else:
                end_date = (today.replace(month=today.month + 1, day=1) - timedelta(days=1))
        else:  # yearly
            start_date = today.replace(month=1, day=1)
            end_date = today.replace(month=12, day=31)

        # Get expenses in date range
        expenses = Expense.objects.filter(
            family=family,
            expense_date__gte=start_date,
            expense_date__lte=end_date
        )

        # Calculate statistics
        total_expenses = expenses.count()
        total_amount = Decimal('0.00')
        for expense in expenses:
            try:
                amount_decimal = Decimal(str(expense.amount)) if expense.amount else Decimal('0.00')
                total_amount += amount_decimal
            except (ValueError, InvalidOperation):
                pass

        # Average expense
        avg_expense = float(total_amount / total_expenses) if total_expenses > 0 else 0.0

        # Expenses by category
        category_stats = {}
        for expense in expenses:
            category_name = expense.category.name if expense.category else 'Uncategorized'
            if category_name not in category_stats:
                category_stats[category_name] = {'count': 0, 'amount': Decimal('0.00')}
            category_stats[category_name]['count'] += 1
            try:
                amount_decimal = Decimal(str(expense.amount)) if expense.amount else Decimal('0.00')
                category_stats[category_name]['amount'] += amount_decimal
            except (ValueError, InvalidOperation):
                pass

        # Convert to float for JSON serialization
        category_stats_float = {}
        for cat, stats in category_stats.items():
            category_stats_float[cat] = {
                'count': stats['count'],
                'amount': float(stats['amount'])
            }

        return Response({
            'period': period,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'total_expenses': total_expenses,
            'total_amount': float(total_amount),
            'average_expense': avg_expense,
            'by_category': category_stats_float
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Group expenses by category."""
        family_id = request.query_params.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)

        # Get date range if provided
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        today = timezone.now().date()

        if not start_date:
            start_date = today.replace(day=1)  # Start of current month
        if not end_date:
            end_date = today

        expenses = Expense.objects.filter(
            family=family,
            expense_date__gte=start_date,
            expense_date__lte=end_date
        )

        # Group by category
        category_data = {}
        for expense in expenses:
            category_id = expense.category.id if expense.category else None
            category_name = expense.category.name if expense.category else 'Uncategorized'

            if category_id not in category_data:
                category_data[category_id] = {
                    'category_id': category_id,
                    'category_name': category_name,
                    'count': 0,
                    'total_amount': Decimal('0.00'),
                    'expenses': []
                }

            category_data[category_id]['count'] += 1
            try:
                amount_decimal = Decimal(str(expense.amount)) if expense.amount else Decimal('0.00')
                category_data[category_id]['total_amount'] += amount_decimal
            except (ValueError, InvalidOperation):
                pass

            # Add expense details (using serializer for proper formatting)
            serializer = ExpenseSerializer(expense, context={'request': request})
            category_data[category_id]['expenses'].append(serializer.data)

        # Convert to list and format amounts
        result = []
        for cat_data in category_data.values():
            result.append({
                'category_id': cat_data['category_id'],
                'category_name': cat_data['category_name'],
                'count': cat_data['count'],
                'total_amount': float(cat_data['total_amount']),
                'expenses': cat_data['expenses']
            })

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def by_period(self, request):
        """Group expenses by time period."""
        family_id = request.query_params.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)

        period_type = request.query_params.get('period_type', 'day')  # day, week, month, year
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not start_date or not end_date:
            # Default to last 30 days
            end_date = timezone.now().date()
            start_date = end_date - timedelta(days=30)

        expenses = Expense.objects.filter(
            family=family,
            expense_date__gte=start_date,
            expense_date__lte=end_date
        )

        # Group by period
        period_data = {}
        for expense in expenses:
            if period_type == 'day':
                key = expense.expense_date.isoformat()
            elif period_type == 'week':
                # Get week start (Monday)
                week_start = expense.expense_date - timedelta(days=expense.expense_date.weekday())
                key = week_start.isoformat()
            elif period_type == 'month':
                key = expense.expense_date.strftime('%Y-%m')
            else:  # year
                key = str(expense.expense_date.year)

            if key not in period_data:
                period_data[key] = {
                    'period': key,
                    'count': 0,
                    'total_amount': Decimal('0.00')
                }

            period_data[key]['count'] += 1
            try:
                amount_decimal = Decimal(str(expense.amount)) if expense.amount else Decimal('0.00')
                period_data[key]['total_amount'] += amount_decimal
            except (ValueError, InvalidOperation):
                pass

        # Convert to list and format
        result = []
        for period, data in sorted(period_data.items()):
            result.append({
                'period': period,
                'count': data['count'],
                'total_amount': float(data['total_amount'])
            })

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Search expenses."""
        family_id = request.query_params.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)

        query = request.query_params.get('q', '')
        if not query:
            return Response({'error': 'q (query) parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Search in description and notes (encrypted fields, so we need to fetch and filter)
        expenses = Expense.objects.filter(family=family)
        results = []
        query_lower = query.lower()

        for expense in expenses:
            description = expense.description.lower() if expense.description else ''
            notes = expense.notes.lower() if expense.notes else ''
            if query_lower in description or query_lower in notes:
                serializer = ExpenseSerializer(expense, context={'request': request})
                results.append(serializer.data)

        return Response(results, status=status.HTTP_200_OK)


class BudgetViewSet(viewsets.ModelViewSet):
    """Budget viewset."""
    serializer_class = BudgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return budgets for families the user belongs to."""
        user = self.request.user
        queryset = Budget.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                queryset = queryset.filter(family_id=int(family_id))
            except (ValueError, TypeError):
                pass

        # Filter by active status if provided
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        return queryset

    def perform_create(self, serializer):
        """Create budget with family validation."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        serializer.save(family=family)

    @action(detail=False, methods=['get'])
    def check_budgets(self, request):
        """Check if budgets are exceeded or approaching threshold."""
        family_id = request.query_params.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)

        budgets = Budget.objects.filter(family=family, is_active=True)
        alerts = []

        for budget in budgets:
            # Calculate spent amount (same logic as serializer)
            today = timezone.now().date()
            if budget.period == 'daily':
                start = today
                end = today
            elif budget.period == 'weekly':
                start = today - timedelta(days=today.weekday())
                end = start + timedelta(days=6)
            elif budget.period == 'monthly':
                start = today.replace(day=1)
                if today.month == 12:
                    end = today.replace(day=31)
                else:
                    end = (today.replace(month=today.month + 1, day=1) - timedelta(days=1))
            else:  # yearly
                start = today.replace(month=1, day=1)
                end = today.replace(month=12, day=31)

            expenses = Expense.objects.filter(
                family=family,
                category=budget.category,
                expense_date__gte=start,
                expense_date__lte=end
            )

            total = Decimal('0.00')
            for expense in expenses:
                try:
                    amount_decimal = Decimal(str(expense.amount)) if expense.amount else Decimal('0.00')
                    total += amount_decimal
                except (ValueError, InvalidOperation):
                    pass

            percentage = (float(total) / float(budget.amount)) * 100 if budget.amount > 0 else 0

            if percentage >= 100:
                alerts.append({
                    'budget_id': budget.id,
                    'category_name': budget.category.name if budget.category else None,
                    'status': 'exceeded',
                    'percentage': round(percentage, 2),
                    'spent': float(total),
                    'limit': float(budget.amount)
                })
            elif percentage >= budget.alert_threshold:
                alerts.append({
                    'budget_id': budget.id,
                    'category_name': budget.category.name if budget.category else None,
                    'status': 'warning',
                    'percentage': round(percentage, 2),
                    'spent': float(total),
                    'limit': float(budget.amount)
                })

        return Response({'alerts': alerts}, status=status.HTTP_200_OK)


class RecurringExpenseViewSet(viewsets.ModelViewSet):
    """RecurringExpense viewset."""
    serializer_class = RecurringExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return recurring expenses for families the user belongs to."""
        user = self.request.user
        queryset = RecurringExpense.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                queryset = queryset.filter(family_id=int(family_id))
            except (ValueError, TypeError):
                pass

        # Filter by active status if provided
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        return queryset.order_by('next_due_date')

    def _get_next_date(self, current_date, frequency):
        """Calculate the next date based on frequency."""
        if frequency == 'daily':
            return current_date + timedelta(days=1)
        elif frequency == 'weekly':
            return current_date + timedelta(weeks=1)
        elif frequency == 'monthly':
            # Add one month, preserving the day if possible
            # If the day doesn't exist in the next month (e.g., Jan 31 -> Feb), use the last day of the month
            if current_date.month == 12:
                next_year = current_date.year + 1
                next_month = 1
            else:
                next_year = current_date.year
                next_month = current_date.month + 1

            # Try to preserve the day, but if it doesn't exist in the next month, use the last day
            try:
                # Explicitly preserve the day
                return current_date.replace(year=next_year, month=next_month, day=current_date.day)
            except ValueError:
                # Day doesn't exist in next month (e.g., Jan 31 -> Feb 31)
                # Use the last day of the next month
                from calendar import monthrange
                last_day = monthrange(next_year, next_month)[1]
                return current_date.replace(year=next_year, month=next_month, day=last_day)
        else:  # yearly
            return current_date.replace(year=current_date.year + 1)

    def _generate_expenses_for_recurring(self, recurring, member, end_date=None, start_date=None):
        """
        Generate expenses for a recurring expense from start_date to end_date.

        Args:
            recurring: RecurringExpense instance
            member: Member instance (creator)
            end_date: Optional end date (defaults to end of current year)
            start_date: Optional start date (defaults to recurring.start_date)

        Returns:
            int: Number of expenses generated
        """
        import logging
        logger = logging.getLogger(__name__)

        # Start from provided start_date or recurring.start_date (forward only, no backward generation)
        if start_date is None:
            start_date = recurring.start_date
        else:
            # Don't go back before the original start_date
            if start_date < recurring.start_date:
                start_date = recurring.start_date

        # Log the start_date being used
        logger.info(f"_generate_expenses_for_recurring: recurring.start_date={recurring.start_date} (day={recurring.start_date.day}), start_date param={start_date} (day={start_date.day if start_date else 'None'})")

        # Determine the end date: use provided end_date, or end of current year if None
        if end_date is None:
            # Default to end of current year
            today = timezone.now().date()
            current_year = today.year
            end_date = date(current_year, 12, 31)
        else:
            # Use the earlier of provided end_date or recurring.end_date
            if recurring.end_date and recurring.end_date < end_date:
                end_date = recurring.end_date

        # If start_date is after end_date, nothing to generate
        if start_date > end_date:
            logger.warning(f"start_date ({start_date}) is after end_date ({end_date}) for recurring expense {recurring.id} - {recurring.description}")
            return 0

        current_date = start_date
        generated_count = 0
        skipped_count = 0

        # Debug logging for date calculation
        logger.info(f"Starting expense generation for {recurring.id}: recurring.start_date={recurring.start_date}, start_date={start_date}, end_date={end_date}, frequency={recurring.frequency}")

        # Generate expenses for each period from start_date to end_date
        # Works for all frequencies: daily, weekly, monthly, yearly
        while current_date <= end_date:
            # Check if expense already exists for this recurring expense and date
            existing = Expense.objects.filter(
                family=recurring.family,
                recurring_expense=recurring,
                expense_date=current_date
            ).exists()

            if not existing:
                # Create expense (amount is already a string in recurring.amount)
                # Log before creating to verify the date
                logger.info(f"Creating expense for {recurring.id} on date {current_date} (day={current_date.day}, month={current_date.month}, year={current_date.year}, iso={current_date.isoformat()})")
                expense = Expense.objects.create(
                    family=recurring.family,
                    created_by=member,
                    category=recurring.category,
                    amount=str(recurring.amount) if recurring.amount else '0.00',
                    description=recurring.description,
                    notes=recurring.notes,
                    expense_date=current_date,
                    payment_method=recurring.payment_method,
                    is_recurring=True,
                    recurring_expense=recurring
                )
                # Log after creating to verify what was stored
                logger.info(f"Created expense {expense.id} with expense_date={expense.expense_date} (day={expense.expense_date.day}, month={expense.expense_date.month}, year={expense.expense_date.year}, iso={expense.expense_date.isoformat()})")

                # Copy tags
                expense.tags.set(recurring.tags.all())

                generated_count += 1
            else:
                skipped_count += 1

            # Move to next period based on frequency (daily, weekly, monthly, or yearly)
            next_date = self._get_next_date(current_date, recurring.frequency)
            logger.info(f"Date progression for {recurring.id}: {current_date} (day={current_date.day}) -> {next_date} (day={next_date.day}) (frequency: {recurring.frequency})")
            current_date = next_date

            # Safety check to prevent infinite loops
            if generated_count + skipped_count > 1000:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Too many iterations in expense generation for {recurring.id} - breaking loop")
                break

        # Update next_due_date to the next occurrence after the last generated expense
        # Only update if we actually generated expenses AND next_due_date needs updating
        # Don't update if user explicitly set next_due_date to match start_date pattern
        if generated_count > 0:
            # Find the last expense that was actually generated (or would have been generated)
            # This ensures we calculate from an actual occurrence, preserving the day pattern
            last_generated_expense = Expense.objects.filter(
                family=recurring.family,
                recurring_expense=recurring,
                expense_date__lte=end_date,
                expense_date__gte=start_date
            ).order_by('-expense_date').first()

            if last_generated_expense:
                # Calculate next_due_date from the last generated expense date
                # This preserves the exact day pattern (e.g., if expenses are on the 1st, next will be 1st)
                calculated_next_due = self._get_next_date(last_generated_expense.expense_date, recurring.frequency)
            else:
                # Fallback: calculate from the last occurrence we would have generated
                # This should rarely happen, but ensures we have a value
                last_occurrence = start_date
                temp_date = start_date
                while temp_date <= end_date:
                    last_occurrence = temp_date
                    temp_date = self._get_next_date(temp_date, recurring.frequency)
                calculated_next_due = self._get_next_date(last_occurrence, recurring.frequency)

            # Always update next_due_date to the next occurrence after the last generated expense
            # This ensures it's always calculated from the pattern, not manually set
            # Check if end_date is reached
            if recurring.end_date and calculated_next_due > recurring.end_date:
                recurring.is_active = False
            else:
                logger.info(f"Updating next_due_date from {recurring.next_due_date} to {calculated_next_due} for {recurring.id}")
                recurring.next_due_date = calculated_next_due

            recurring.save()

        return generated_count

    def perform_create(self, serializer):
        """Create recurring expense with creator as created_by and auto-generate expenses."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        member = get_object_or_404(Member, user=self.request.user, family=family)
        recurring = serializer.save(created_by=member, family=family)

        # Log the actual start_date that was saved
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Created recurring expense {recurring.id}: start_date={recurring.start_date} (day={recurring.start_date.day}, month={recurring.start_date.month}, year={recurring.start_date.year})")

        # next_due_date is always calculated from start_date + frequency
        # start_date is the first due date, next_due_date is the second occurrence
        recurring.next_due_date = self._get_next_date(recurring.start_date, recurring.frequency)
        recurring.save()

        # Automatically generate expenses from start_date to end of current year (or end_date if provided)
        # If end_date is provided, use it; otherwise generate for current year
        today = timezone.now().date()
        current_year = today.year
        current_year_end = date(current_year, 12, 31)

        if recurring.end_date and recurring.end_date <= current_year_end:
            end_date = recurring.end_date
        else:
            end_date = current_year_end

        # Use the exact start_date - don't recalculate if it's in the current year
        # This ensures we preserve the exact day (e.g., Jan 1 stays Jan 1, not Jan 3)
        generation_start_date = recurring.start_date

        try:
            logger.info(f"Auto-generating expenses for new recurring expense {recurring.id}: {recurring.description}, start_date={recurring.start_date} (day={recurring.start_date.day}), next_due_date={recurring.next_due_date}, end_date={end_date}, frequency={recurring.frequency}, generation_start_date={generation_start_date} (day={generation_start_date.day})")
            count = self._generate_expenses_for_recurring(recurring, member, end_date=end_date, start_date=generation_start_date)
            logger.info(f"Auto-generated {count} expenses for recurring expense {recurring.id}")
        except Exception as e:
            logger.error(f"Error auto-generating expenses for recurring expense {recurring.id}: {str(e)}", exc_info=True)
            # Don't fail the creation if generation fails, but log the error

    def perform_update(self, serializer):
        """Update recurring expense and recalculate next_due_date if start_date or frequency changed."""
        recurring = serializer.save()

        # Always recalculate next_due_date from start_date + frequency
        # This ensures it's always correct, even if user tried to set it manually
        recurring.next_due_date = self._get_next_date(recurring.start_date, recurring.frequency)
        recurring.save()

    @action(detail=False, methods=['post'])
    def generate_expenses(self, request):
        """Generate expenses from recurring expense templates for all active recurring expenses."""
        family_id = request.data.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        family = get_object_or_404(Family, id=family_id, members__user=request.user)
        member = get_object_or_404(Member, user=request.user, family=family)

        recurring_expenses = RecurringExpense.objects.filter(
            family=family,
            is_active=True
        )

        generated_count = 0
        today = timezone.now().date()
        current_year = today.year
        current_year_start = date(current_year, 1, 1)
        current_year_end = date(current_year, 12, 31)
        errors = []

        for recurring in recurring_expenses:
            try:
                # For manual generation, generate expenses for the current year
                # Start from the first occurrence in the current year (or start_date if later)
                # If start_date is in the current year, use it; otherwise find first occurrence in current year
                generation_start = recurring.start_date

                # Log the original start_date
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Processing recurring expense {recurring.id}: start_date={recurring.start_date} (day={recurring.start_date.day}, month={recurring.start_date.month}, year={recurring.start_date.year}), current_year={current_year}, current_year_start={current_year_start}")

                # If start_date is before current year, find the first occurrence in the current year
                # If start_date is in current year, we'll use it directly (generation_start is already set)
                if generation_start.year < current_year:
                    # Calculate first occurrence in current year based on frequency
                    if recurring.frequency == 'daily':
                        # For daily, just use current year start
                        generation_start = current_year_start
                    elif recurring.frequency == 'weekly':
                        # Find first occurrence on or after current year start, preserving day of week
                        days_since_start = (current_year_start - recurring.start_date).days
                        weeks_to_add = (days_since_start + 6) // 7  # Round up
                        generation_start = recurring.start_date + timedelta(weeks=weeks_to_add)
                        if generation_start < current_year_start:
                            generation_start = generation_start + timedelta(weeks=1)
                    elif recurring.frequency == 'monthly':
                        # Find first occurrence in current year, preserving the day
                        # Use the same day of month as start_date
                        from calendar import monthrange
                        start_day = recurring.start_date.day
                        # Find the first month in current year where this day exists
                        # Start from January
                        for month in range(1, 13):
                            last_day = monthrange(current_year, month)[1]
                            if start_day <= last_day:
                                generation_start = date(current_year, month, start_day)
                                break
                        # Log to debug
                        logger.info(f"Monthly frequency: start_date={recurring.start_date} (day={recurring.start_date.day}), current_year={current_year}, generation_start={generation_start} (day={generation_start.day})")
                    elif recurring.frequency == 'yearly':
                        # For yearly, use the same month/day in current year
                        from calendar import monthrange
                        last_day = monthrange(current_year, recurring.start_date.month)[1]
                        safe_day = min(recurring.start_date.day, last_day)
                        generation_start = date(current_year, recurring.start_date.month, safe_day)

                # Ensure generation_start is not before the original start_date
                if generation_start < recurring.start_date:
                    generation_start = recurring.start_date

                # If start_date is in the current year, use it directly to preserve the exact day
                # This is critical for monthly expenses - if start_date is Jan 1, we want Jan 1, not Jan 3
                if recurring.start_date.year == current_year:
                    generation_start = recurring.start_date
                    logger.info(f"start_date is in current year, using it directly: {generation_start} (day={generation_start.day})")

                # Log the final generation_start
                logger.info(f"Final generation_start for {recurring.id}: {generation_start} (day={generation_start.day}, month={generation_start.month}, year={generation_start.year})")

                # Determine end date: use recurring.end_date if provided and within current year, otherwise use current year end
                if recurring.end_date and recurring.end_date <= current_year_end:
                    end_date = recurring.end_date
                else:
                    end_date = current_year_end

                # Debug logging
                logger.info(f"Generating expenses for {recurring.description}: start_date={recurring.start_date}, generation_start={generation_start}, end_date={end_date}, frequency={recurring.frequency}")

                # Generate expenses from generation_start to end_date
                count = self._generate_expenses_for_recurring(recurring, member, end_date=end_date, start_date=generation_start)
                logger.info(f"Generated {count} expenses for {recurring.description}")
                generated_count += count
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error generating expenses for {recurring.description}: {str(e)}", exc_info=True)
                errors.append(f"Error generating expenses for {recurring.description}: {str(e)}")

        response_data = {
            'message': f'Generated {generated_count} expenses from recurring templates',
            'generated_count': generated_count,
            'recurring_count': recurring_expenses.count()
        }

        if errors:
            response_data['errors'] = errors

        # Log the response for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Generate expenses response: {response_data}")

        return Response(response_data, status=status.HTTP_200_OK)


class ReceiptViewSet(viewsets.ModelViewSet):
    """Receipt viewset."""
    serializer_class = ReceiptSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return receipts for families the user belongs to."""
        user = self.request.user
        queryset = Receipt.objects.filter(family__members__user=user)

        # Filter by family if provided
        family_id = self.request.query_params.get('family')
        if family_id:
            try:
                queryset = queryset.filter(family_id=int(family_id))
            except (ValueError, TypeError):
                pass

        # Filter by expense if provided
        expense_id = self.request.query_params.get('expense')
        if expense_id:
            try:
                queryset = queryset.filter(expense_id=int(expense_id))
            except (ValueError, TypeError):
                pass

        return queryset

    def get_serializer_context(self):
        """Add request to serializer context for building absolute URLs."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        """Create receipt with uploader as uploaded_by."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        member = get_object_or_404(Member, user=self.request.user, family=family)
        serializer.save(uploaded_by=member, family=family)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download receipt file."""
        receipt = self.get_object()
        if not receipt.file:
            return Response({'error': 'Receipt file not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            file_path = receipt.file.path
            if os.path.exists(file_path):
                response = FileResponse(open(file_path, 'rb'), content_type=receipt.mime_type or 'application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
                return response
            else:
                return Response({'error': 'File not found on server'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
