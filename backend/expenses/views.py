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
from .recurring_sync import sync_all_generated_from_template, sync_generated_expense_fields
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
        queryset = Expense.objects.filter(family__members__user=user).select_related(
            'category', 'recurring_expense'
        ).prefetch_related('tags', 'line_items')

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

    def get_serializer_context(self):
        context = super().get_serializer_context()
        as_of_raw = self.request.query_params.get('as_of')
        if as_of_raw:
            try:
                context['as_of'] = date.fromisoformat(as_of_raw[:10])
            except (ValueError, TypeError):
                pass
        return context

    def _monthly_window_for_as_of(self, as_of: date):
        start = as_of.replace(day=1)
        if as_of.month == 12:
            end = as_of.replace(day=31)
        else:
            end = (as_of.replace(month=as_of.month + 1, day=1) - timedelta(days=1))
        return start, end

    def list(self, request, *args, **kwargs):
        """Hide empty placeholder budgets; batch spent/limit calcs for month or year."""
        from .recurring_sync import build_budget_period_caches

        queryset = self.filter_queryset(self.get_queryset())
        context = self.get_serializer_context()
        as_of = context.get('as_of') or timezone.now().date()
        budget_period = (request.query_params.get('budget_period') or 'month').lower()

        if budget_period == 'year':
            start = date(as_of.year, 1, 1)
            end = date(as_of.year, 12, 31)
        else:
            start, end = self._monthly_window_for_as_of(as_of)
        context['period_window'] = (start, end)

        family_ids = set(queryset.values_list('family_id', flat=True))
        if len(family_ids) == 1:
            family_id = next(iter(family_ids))
            caches = build_budget_period_caches(family_id, start, end)
            context.update(caches)

        serializer = self.get_serializer(queryset, many=True, context=context)
        data = [
            row for row in serializer.data
            if float(row.get('amount') or 0) > 0 or float(row.get('spent_amount') or 0) > 0
        ]
        return Response(data)

    def perform_create(self, serializer):
        """Create budget with family validation."""
        family_id = self.request.data.get('family')
        family = get_object_or_404(Family, id=family_id, members__user=self.request.user)
        serializer.save(family=family)

    @staticmethod
    def _normalize_recurring_to_monthly(amount: Decimal, frequency: str) -> Decimal:
        """Convert recurring amount to a standing monthly budget contribution.

        Yearly items are NOT amortized here — they only count in their due month
        via BudgetSerializer effective amount.
        """
        if frequency == 'daily':
            return amount * Decimal('30.44')
        if frequency == 'weekly':
            return amount * Decimal('4.33')
        if frequency == 'yearly':
            return Decimal('0')
        return amount  # monthly

    @action(detail=False, methods=['post'])
    def create_from_recurring(self, request):
        """Create/update/deactivate monthly budgets from current recurring (+ optional expense analysis).

        Re-run after fixing recurring/expense categories to resync budgets.
        Stale category budgets with no remaining source are deactivated.

        Body: { family, dry_run?: bool, analyze_expenses?: bool }
        """
        family_id = request.data.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        dry_run_raw = request.data.get('dry_run', False)
        dry_run = str(dry_run_raw).lower() in ('1', 'true', 'yes') if not isinstance(dry_run_raw, bool) else dry_run_raw
        analyze_raw = request.data.get('analyze_expenses', False)
        analyze_expenses = (
            str(analyze_raw).lower() in ('1', 'true', 'yes') if not isinstance(analyze_raw, bool) else analyze_raw
        )

        family = get_object_or_404(Family, id=family_id, members__user=request.user)
        today = timezone.now().date()

        # recurring → monthly totals by category (yearly contributes 0 to standing monthly)
        recurring_by_cat: dict[int, dict] = {}
        yearly_only_cats: dict[int, dict] = {}
        for recurring in RecurringExpense.objects.filter(family=family, is_active=True).select_related('category'):
            try:
                amount = Decimal(str(recurring.amount or '0'))
            except (ValueError, InvalidOperation, TypeError):
                amount = Decimal('0')
            cat_id = recurring.category_id
            cat_name = recurring.category.name if recurring.category else None
            monthly = self._normalize_recurring_to_monthly(amount, recurring.frequency)

            if recurring.frequency == 'yearly':
                if cat_id not in yearly_only_cats:
                    yearly_only_cats[cat_id] = {
                        'category_id': cat_id,
                        'category_name': cat_name,
                        'recurring_ids': [],
                    }
                yearly_only_cats[cat_id]['recurring_ids'].append(recurring.id)

            if cat_id not in recurring_by_cat:
                recurring_by_cat[cat_id] = {
                    'category_id': cat_id,
                    'category_name': cat_name,
                    'amount': Decimal('0'),
                    'recurring_ids': [],
                }
            if monthly > 0:
                recurring_by_cat[cat_id]['amount'] += monthly
                recurring_by_cat[cat_id]['recurring_ids'].append(recurring.id)

        # Drop empty recurring buckets that only existed as placeholders
        recurring_by_cat = {
            cid: data for cid, data in recurring_by_cat.items()
            if data['amount'] > 0 or cid in yearly_only_cats
        }

        # expense analysis → avg monthly by category (last 12 months)
        expense_by_cat: dict[int, dict] = {}
        if analyze_expenses:
            window_start = (today.replace(day=1) - timedelta(days=365))
            expenses = Expense.objects.filter(
                family=family,
                expense_date__gte=window_start,
                expense_date__lte=today,
            ).select_related('category')

            accum: dict[int, dict] = {}
            for expense in expenses:
                cat_id = expense.category_id
                if cat_id is None:
                    continue
                try:
                    amt = Decimal(str(expense.amount or '0'))
                except (ValueError, InvalidOperation, TypeError):
                    continue
                if cat_id not in accum:
                    accum[cat_id] = {
                        'total': Decimal('0'),
                        'months': set(),
                        'category_name': expense.category.name if expense.category else None,
                    }
                accum[cat_id]['total'] += amt
                accum[cat_id]['months'].add(
                    f'{expense.expense_date.year}-{expense.expense_date.month:02d}'
                )

            for cat_id, data in accum.items():
                months = max(len(data['months']), 1)
                expense_by_cat[cat_id] = {
                    'category_id': cat_id,
                    'category_name': data['category_name'],
                    'amount': (data['total'] / Decimal(months)).quantize(Decimal('0.01')),
                }

        # merge suggestions — include yearly-only categories so a budget row exists for due months
        all_cat_ids = set(recurring_by_cat.keys()) | set(expense_by_cat.keys()) | set(yearly_only_cats.keys())
        suggestions = []
        for cat_id in all_cat_ids:
            rec = recurring_by_cat.get(cat_id)
            exp = expense_by_cat.get(cat_id)
            yearly_meta = yearly_only_cats.get(cat_id)
            rec_amt = rec['amount'].quantize(Decimal('0.01')) if rec and rec['amount'] > 0 else Decimal('0')
            exp_amt = exp['amount'] if exp else Decimal('0')
            if rec_amt > 0 and exp_amt > 0:
                amount = max(rec_amt, exp_amt)
                sources = 'both'
            elif rec_amt > 0:
                amount = rec_amt
                sources = 'recurring'
            elif exp_amt > 0:
                amount = exp_amt
                sources = 'expenses'
            elif yearly_meta:
                # Placeholder budget (standing monthly = 0); due-month amount comes from serializer
                amount = Decimal('0')
                sources = 'recurring'
            else:
                continue

            category_name = (
                (rec or {}).get('category_name')
                or (exp or {}).get('category_name')
                or (yearly_meta or {}).get('category_name')
            )
            suggestions.append({
                'category_id': cat_id,
                'category_name': category_name,
                'amount': float(amount),
                'recurring_amount': float(rec_amt),
                'expense_avg': float(exp_amt),
                'sources': sources,
                'has_yearly': bool(yearly_meta),
            })

        suggestions.sort(key=lambda s: (s['category_name'] or '').lower())

        created_count = 0
        updated_count = 0
        skipped_count = 0
        deactivated_count = 0
        by_category = []
        suggested_cat_ids = {s['category_id'] for s in suggestions}

        for suggestion in suggestions:
            cat_id = suggestion['category_id']
            existing = Budget.objects.filter(
                family=family,
                category_id=cat_id,
                period='monthly',
                is_active=True,
            ).first()
            # Also revive inactive budget for this category if present
            if not existing:
                existing = Budget.objects.filter(
                    family=family,
                    category_id=cat_id,
                    period='monthly',
                ).order_by('-updated_at').first()

            item = {
                **suggestion,
                'period': 'monthly',
            }

            if existing and existing.is_active:
                old_amount = float(existing.amount)
                item['old_amount'] = old_amount
                item['budget_id'] = existing.id

                # Expense analysis must never overwrite an existing budget
                if suggestion['sources'] == 'expenses':
                    item['action'] = 'skipped'
                    item['reason'] = 'keeping existing budget (expense analysis does not overwrite)'
                    item['amount'] = old_amount
                    skipped_count += 1
                else:
                    # For recurring/both, only sync the recurring side — never lower a higher manual amount
                    target = float(suggestion.get('recurring_amount') or suggestion['amount'])
                    if suggestion['sources'] == 'both':
                        target = float(suggestion.get('recurring_amount') or 0)
                    item['amount'] = target
                    if abs(old_amount - target) < 0.005:
                        item['action'] = 'skipped'
                        item['reason'] = 'amount unchanged'
                        skipped_count += 1
                    elif old_amount > target + 0.005:
                        item['action'] = 'skipped'
                        item['reason'] = 'keeping higher existing budget'
                        item['amount'] = old_amount
                        skipped_count += 1
                    elif dry_run:
                        item['action'] = 'would_update'
                        updated_count += 1
                    else:
                        existing.amount = Decimal(str(target))
                        existing.save(update_fields=['amount', 'updated_at'])
                        item['action'] = 'updated'
                        updated_count += 1
            elif existing and not existing.is_active:
                old_amount = float(existing.amount)
                item['old_amount'] = old_amount
                item['budget_id'] = existing.id
                if dry_run:
                    item['action'] = 'would_reactivate'
                    updated_count += 1
                else:
                    existing.amount = Decimal(str(suggestion['amount']))
                    existing.is_active = True
                    existing.start_date = existing.start_date or today.replace(day=1)
                    existing.save(update_fields=['amount', 'is_active', 'start_date', 'updated_at'])
                    item['action'] = 'reactivated'
                    updated_count += 1
            else:
                item['old_amount'] = None
                if dry_run:
                    item['action'] = 'would_create'
                    created_count += 1
                else:
                    budget = Budget.objects.create(
                        family=family,
                        category_id=cat_id,
                        amount=Decimal(str(suggestion['amount'])),
                        period='monthly',
                        start_date=today.replace(day=1),
                        end_date=None,
                        alert_threshold=80,
                        is_active=True,
                    )
                    item['action'] = 'created'
                    item['budget_id'] = budget.id
                    created_count += 1

            by_category.append(item)

        # Deactivate stale budgets no longer backed by recurring/expenses
        stale_qs = Budget.objects.filter(
            family=family,
            period='monthly',
            is_active=True,
        ).exclude(category_id__in=suggested_cat_ids)
        for stale in stale_qs.select_related('category'):
            stale_item = {
                'category_id': stale.category_id,
                'category_name': stale.category.name if stale.category else None,
                'amount': float(stale.amount),
                'recurring_amount': 0.0,
                'expense_avg': 0.0,
                'sources': 'none',
                'period': 'monthly',
                'budget_id': stale.id,
                'old_amount': float(stale.amount),
                'action': 'would_deactivate' if dry_run else 'deactivated',
                'reason': 'no longer in recurring or expense analysis',
            }
            by_category.append(stale_item)
            deactivated_count += 1
            if not dry_run:
                stale.is_active = False
                stale.save(update_fields=['is_active', 'updated_at'])

        by_category.sort(key=lambda s: (s.get('category_name') or '').lower())

        verb = 'Would apply' if dry_run else 'Applied'
        extras = []
        if skipped_count:
            extras.append(f'{skipped_count} unchanged')
        if deactivated_count:
            extras.append(
                f'{deactivated_count} {"would deactivate" if dry_run else "deactivated"}'
            )
        message = (
            f'{verb} {created_count} new and {updated_count} updated monthly budgets'
            + (f' ({", ".join(extras)})' if extras else '')
        )

        return Response(
            {
                'dry_run': dry_run,
                'analyze_expenses': analyze_expenses,
                'period': 'monthly',
                'message': message,
                'created_count': created_count,
                'updated_count': updated_count,
                'skipped_count': skipped_count,
                'deactivated_count': deactivated_count,
                'by_category': by_category,
            },
            status=status.HTTP_200_OK,
        )

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
                expense_date__lte=end,
                is_paid=True,
            )

            total = Decimal('0.00')
            for expense in expenses:
                try:
                    amount_decimal = Decimal(str(expense.amount)) if expense.amount else Decimal('0.00')
                    total += amount_decimal
                except (ValueError, InvalidOperation):
                    pass

            percentage = (float(total) / float(budget.amount)) * 100 if budget.amount > 0 else 0

            if percentage > 100:
                alerts.append({
                    'budget_id': budget.id,
                    'category_name': budget.category.name if budget.category else None,
                    'status': 'exceeded',
                    'percentage': round(percentage, 2),
                    'spent': float(total),
                    'limit': float(budget.amount)
                })
            elif abs(percentage - 100) < 0.01:
                alerts.append({
                    'budget_id': budget.id,
                    'category_name': budget.category.name if budget.category else None,
                    'status': 'on_budget',
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

    def _sync_generated_expense_fields(self, expense, recurring, tag_ids=None):
        """Copy template-owned fields onto a generated expense. Returns True if anything changed."""
        return sync_generated_expense_fields(expense, recurring, tag_ids=tag_ids)

    def _sync_all_generated_from_template(self, recurring):
        """Sync all generated expenses for a recurring template to match its current fields."""
        return sync_all_generated_from_template(recurring)

    def _generate_expenses_for_recurring(self, recurring, member, end_date=None, start_date=None, dry_run=False):
        """
        Generate expenses for a recurring expense from start_date to end_date.

        Args:
            recurring: RecurringExpense instance
            member: Member instance (creator)
            end_date: Optional end date (defaults to end of current year)
            start_date: Optional start date (defaults to recurring.start_date)
            dry_run: If True, do not create expenses or update next_due_date

        Returns:
            dict with generated_count, skipped_count, updated_count, created[], skipped[], updated[]
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
        logger.info(f"_generate_expenses_for_recurring: recurring.start_date={recurring.start_date} (day={recurring.start_date.day}), start_date param={start_date} (day={start_date.day if start_date else 'None'}), dry_run={dry_run}")

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

        empty_result = {
            'generated_count': 0,
            'skipped_count': 0,
            'updated_count': 0,
            'created': [],
            'skipped': [],
            'updated': [],
        }

        # If start_date is after end_date, nothing to generate
        if start_date > end_date:
            logger.warning(f"start_date ({start_date}) is after end_date ({end_date}) for recurring expense {recurring.id} - {recurring.description}")
            return empty_result

        current_date = start_date
        generated_count = 0
        skipped_count = 0
        updated_count = 0
        created_items = []
        skipped_items = []
        updated_items = []
        tag_ids = list(recurring.tags.values_list('id', flat=True))

        try:
            amount_val = float(Decimal(str(recurring.amount))) if recurring.amount else 0.0
        except (ValueError, InvalidOperation, TypeError):
            amount_val = 0.0

        category_name = recurring.category.name if recurring.category else None

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
            ).first()

            item = {
                'recurring_id': recurring.id,
                'description': recurring.description,
                'category_name': category_name,
                'amount': amount_val,
                'expense_date': current_date.isoformat(),
                'frequency': recurring.frequency,
            }

            if not existing:
                if dry_run:
                    item['action'] = 'would_create'
                    created_items.append(item)
                    generated_count += 1
                else:
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
                        is_paid=False,
                        recurring_expense=recurring
                    )
                    logger.info(f"Created expense {expense.id} with expense_date={expense.expense_date}")
                    expense.tags.set(tag_ids)
                    item['action'] = 'created'
                    item['expense_id'] = expense.id
                    created_items.append(item)
                    generated_count += 1
            else:
                # Keep existing rows aligned with the template (category etc. can drift after edits)
                if dry_run:
                    needs_sync = (
                        existing.category_id != recurring.category_id
                        or str(existing.amount or '') != (str(recurring.amount) if recurring.amount else '0.00')
                        or existing.description != recurring.description
                        or (existing.notes or None) != (recurring.notes or None)
                        or existing.payment_method != recurring.payment_method
                        or set(existing.tags.values_list('id', flat=True)) != set(tag_ids)
                    )
                    if needs_sync:
                        item['action'] = 'would_update'
                        item['expense_id'] = existing.id
                        updated_items.append(item)
                        updated_count += 1
                    else:
                        item['action'] = 'skipped'
                        item['reason'] = 'already exists'
                        item['expense_id'] = existing.id
                        skipped_items.append(item)
                        skipped_count += 1
                elif self._sync_generated_expense_fields(existing, recurring, tag_ids=tag_ids):
                    item['action'] = 'updated'
                    item['expense_id'] = existing.id
                    updated_items.append(item)
                    updated_count += 1
                else:
                    item['action'] = 'skipped'
                    item['reason'] = 'already exists'
                    item['expense_id'] = existing.id
                    skipped_items.append(item)
                    skipped_count += 1

            # Move to next period based on frequency (daily, weekly, monthly, or yearly)
            next_date = self._get_next_date(current_date, recurring.frequency)
            logger.info(f"Date progression for {recurring.id}: {current_date} (day={current_date.day}) -> {next_date} (day={next_date.day}) (frequency: {recurring.frequency})")
            current_date = next_date

            # Safety check to prevent infinite loops
            if generated_count + skipped_count + updated_count > 1000:
                logger.error(f"Too many iterations in expense generation for {recurring.id} - breaking loop")
                break

        # Update next_due_date only when actually generating
        if not dry_run and generated_count > 0:
            last_generated_expense = Expense.objects.filter(
                family=recurring.family,
                recurring_expense=recurring,
                expense_date__lte=end_date,
                expense_date__gte=start_date
            ).order_by('-expense_date').first()

            if last_generated_expense:
                calculated_next_due = self._get_next_date(last_generated_expense.expense_date, recurring.frequency)
            else:
                last_occurrence = start_date
                temp_date = start_date
                while temp_date <= end_date:
                    last_occurrence = temp_date
                    temp_date = self._get_next_date(temp_date, recurring.frequency)
                calculated_next_due = self._get_next_date(last_occurrence, recurring.frequency)

            if recurring.end_date and calculated_next_due > recurring.end_date:
                recurring.is_active = False
            else:
                logger.info(f"Updating next_due_date from {recurring.next_due_date} to {calculated_next_due} for {recurring.id}")
                recurring.next_due_date = calculated_next_due

            recurring.save()

        return {
            'generated_count': generated_count,
            'skipped_count': skipped_count,
            'updated_count': updated_count,
            'created': created_items,
            'skipped': skipped_items,
            'updated': updated_items,
        }

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
            logger.info(f"Auto-generated {count.get('generated_count', 0) if isinstance(count, dict) else count} expenses for recurring expense {recurring.id}")
        except Exception as e:
            logger.error(f"Error auto-generating expenses for recurring expense {recurring.id}: {str(e)}", exc_info=True)
            # Don't fail the creation if generation fails, but log the error

    def _expected_occurrence_dates(self, recurring, end_date):
        """Return the set of occurrence dates from recurring.start_date through end_date."""
        dates = set()
        if not recurring.start_date or recurring.start_date > end_date:
            return dates
        current = recurring.start_date
        for _ in range(1000):
            if recurring.end_date and current > recurring.end_date:
                break
            if current > end_date:
                break
            dates.add(current)
            current = self._get_next_date(current, recurring.frequency)
        return dates

    def _reconcile_generated_schedule(self, recurring, member):
        """Align unpaid generated expenses with the template schedule.

        - Deletes unpaid rows whose date is not on the new schedule
        - Creates missing schedule dates through year-end / end_date
        Paid expenses are left alone.
        """
        import logging
        logger = logging.getLogger(__name__)

        today = timezone.now().date()
        current_year_end = date(today.year, 12, 31)
        gen_end = (
            recurring.end_date
            if recurring.end_date and recurring.end_date <= current_year_end
            else current_year_end
        )
        expected = self._expected_occurrence_dates(recurring, gen_end)

        unpaid = list(
            Expense.objects.filter(recurring_expense=recurring, is_paid=False)
        )
        orphan_ids = [e.id for e in unpaid if e.expense_date not in expected]
        if orphan_ids:
            deleted, _ = Expense.objects.filter(id__in=orphan_ids).delete()
            logger.info(
                f"Recurring {recurring.id}: removed {deleted} unpaid expenses off-schedule "
                f"(expected {sorted(expected)[:5]}{'...' if len(expected) > 5 else ''})"
            )

        if member is None:
            logger.warning(f"No member to regenerate expenses for recurring {recurring.id}")
            return {'removed': len(orphan_ids), 'generated_count': 0}

        if recurring.start_date and recurring.start_date <= gen_end:
            result = self._generate_expenses_for_recurring(
                recurring,
                member,
                end_date=gen_end,
                start_date=recurring.start_date,
            )
            return {
                'removed': len(orphan_ids),
                'generated_count': result.get('generated_count', 0),
                'updated_count': result.get('updated_count', 0),
            }
        return {'removed': len(orphan_ids), 'generated_count': 0}

    def perform_update(self, serializer):
        """Update recurring expense, sync fields, and realign unpaid generated expense dates."""
        import logging
        logger = logging.getLogger(__name__)

        recurring = serializer.save()

        # Always recalculate next_due_date from start_date + frequency
        recurring.next_due_date = self._get_next_date(recurring.start_date, recurring.frequency)
        recurring.save(update_fields=['next_due_date', 'updated_at'])

        # Keep category/amount/description/etc. aligned
        self._sync_all_generated_from_template(recurring)

        member = recurring.created_by
        if member is None:
            member = Member.objects.filter(
                family_id=recurring.family_id, user=self.request.user
            ).first()

        # Always reconcile unpaid schedule (covers start/end/frequency changes and drift)
        result = self._reconcile_generated_schedule(recurring, member)

        # next_due_date = day after the latest generated occurrence (or start+frequency)
        last_expense = (
            Expense.objects.filter(recurring_expense=recurring)
            .order_by('-expense_date')
            .first()
        )
        if last_expense:
            recurring.next_due_date = self._get_next_date(
                last_expense.expense_date, recurring.frequency
            )
        else:
            recurring.next_due_date = self._get_next_date(
                recurring.start_date, recurring.frequency
            )
        if recurring.end_date and recurring.next_due_date > recurring.end_date:
            recurring.is_active = False
        recurring.save(update_fields=['next_due_date', 'is_active', 'updated_at'])

        logger.info(
            f"Recurring {recurring.id} schedule reconcile: removed={result.get('removed')} "
            f"created={result.get('generated_count')} updated={result.get('updated_count')} "
            f"next_due={recurring.next_due_date}"
        )

    @action(detail=True, methods=['post'])
    def toggle_paid(self, request, pk=None):
        """Mark the generated expense for a given occurrence date as paid or unpaid.

        Body: { expense_date: "YYYY-MM-DD", is_paid?: bool }
        If the expense row does not exist yet, creates it (unpaid first, then applies is_paid).
        If is_paid is omitted, flips the current value.
        """
        recurring = self.get_object()
        family = get_object_or_404(Family, id=recurring.family_id, members__user=request.user)
        member = get_object_or_404(Member, user=request.user, family=family)

        date_raw = request.data.get('expense_date')
        if not date_raw:
            return Response({'error': 'expense_date is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            expense_date = date.fromisoformat(str(date_raw)[:10])
        except ValueError:
            return Response({'error': 'Invalid expense_date'}, status=status.HTTP_400_BAD_REQUEST)

        expense = Expense.objects.filter(
            family=family,
            recurring_expense=recurring,
            expense_date=expense_date,
        ).first()

        if not expense:
            expense = Expense.objects.create(
                family=family,
                created_by=member,
                category=recurring.category,
                amount=str(recurring.amount) if recurring.amount else '0.00',
                description=recurring.description,
                notes=recurring.notes,
                expense_date=expense_date,
                payment_method=recurring.payment_method,
                is_recurring=True,
                is_paid=False,
                recurring_expense=recurring,
            )
            expense.tags.set(recurring.tags.all())

        if 'is_paid' in request.data:
            raw = request.data.get('is_paid')
            expense.is_paid = str(raw).lower() in ('1', 'true', 'yes') if not isinstance(raw, bool) else raw
        else:
            expense.is_paid = not expense.is_paid
        expense.save(update_fields=['is_paid', 'updated_at'])

        serializer = ExpenseSerializer(expense, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def generate_expenses(self, request):
        """Generate expenses from recurring expense templates for all active recurring expenses.

        Pass dry_run=true to preview what would be created without writing anything.
        """
        family_id = request.data.get('family')
        if not family_id:
            return Response({'error': 'family is required'}, status=status.HTTP_400_BAD_REQUEST)

        dry_run_raw = request.data.get('dry_run', False)
        dry_run = str(dry_run_raw).lower() in ('1', 'true', 'yes') if not isinstance(dry_run_raw, bool) else dry_run_raw

        family = get_object_or_404(Family, id=family_id, members__user=request.user)
        member = get_object_or_404(Member, user=request.user, family=family)

        recurring_expenses = RecurringExpense.objects.filter(
            family=family,
            is_active=True
        )

        generated_count = 0
        skipped_count = 0
        updated_count = 0
        created_items = []
        skipped_items = []
        updated_items = []
        by_recurring = []
        today = timezone.now().date()
        current_year = today.year
        current_year_start = date(current_year, 1, 1)
        current_year_end = date(current_year, 12, 31)
        errors = []

        import logging
        logger = logging.getLogger(__name__)

        for recurring in recurring_expenses:
            try:
                # For manual generation, generate expenses for the current year
                generation_start = recurring.start_date

                logger.info(f"Processing recurring expense {recurring.id}: start_date={recurring.start_date}, dry_run={dry_run}")

                if generation_start.year < current_year:
                    if recurring.frequency == 'daily':
                        generation_start = current_year_start
                    elif recurring.frequency == 'weekly':
                        days_since_start = (current_year_start - recurring.start_date).days
                        weeks_to_add = (days_since_start + 6) // 7
                        generation_start = recurring.start_date + timedelta(weeks=weeks_to_add)
                        if generation_start < current_year_start:
                            generation_start = generation_start + timedelta(weeks=1)
                    elif recurring.frequency == 'monthly':
                        from calendar import monthrange
                        start_day = recurring.start_date.day
                        for month in range(1, 13):
                            last_day = monthrange(current_year, month)[1]
                            if start_day <= last_day:
                                generation_start = date(current_year, month, start_day)
                                break
                    elif recurring.frequency == 'yearly':
                        from calendar import monthrange
                        last_day = monthrange(current_year, recurring.start_date.month)[1]
                        safe_day = min(recurring.start_date.day, last_day)
                        generation_start = date(current_year, recurring.start_date.month, safe_day)

                if generation_start < recurring.start_date:
                    generation_start = recurring.start_date

                if recurring.start_date.year == current_year:
                    generation_start = recurring.start_date

                if recurring.end_date and recurring.end_date <= current_year_end:
                    end_date = recurring.end_date
                else:
                    end_date = current_year_end

                result = self._generate_expenses_for_recurring(
                    recurring,
                    member,
                    end_date=end_date,
                    start_date=generation_start,
                    dry_run=dry_run,
                )
                generated_count += result['generated_count']
                skipped_count += result['skipped_count']
                updated_count += result.get('updated_count', 0)
                created_items.extend(result['created'])
                skipped_items.extend(result['skipped'])
                updated_items.extend(result.get('updated', []))
                by_recurring.append({
                    'recurring_id': recurring.id,
                    'description': recurring.description,
                    'category_name': recurring.category.name if recurring.category else None,
                    'frequency': recurring.frequency,
                    'generation_start': generation_start.isoformat(),
                    'generation_end': end_date.isoformat(),
                    'generated_count': result['generated_count'],
                    'skipped_count': result['skipped_count'],
                    'updated_count': result.get('updated_count', 0),
                    'created': result['created'],
                    'skipped': result['skipped'],
                    'updated': result.get('updated', []),
                })
            except Exception as e:
                logger.error(f"Error generating expenses for {recurring.description}: {str(e)}", exc_info=True)
                errors.append(f"Error generating expenses for {recurring.description}: {str(e)}")

        verb = 'Would generate' if dry_run else 'Generated'
        update_verb = 'would update' if dry_run else 'updated'
        extras = []
        if skipped_count:
            extras.append(f'{skipped_count} already matched')
        if updated_count:
            extras.append(f'{updated_count} {update_verb}')
        response_data = {
            'dry_run': dry_run,
            'message': f'{verb} {generated_count} expenses from recurring templates'
                       + (f' ({", ".join(extras)})' if extras else ''),
            'generated_count': generated_count,
            'skipped_count': skipped_count,
            'updated_count': updated_count,
            'recurring_count': recurring_expenses.count(),
            'created': created_items,
            'skipped': skipped_items,
            'updated': updated_items,
            'by_recurring': by_recurring,
        }

        if errors:
            response_data['errors'] = errors

        logger.info(
            f"Generate expenses response: dry_run={dry_run} generated={generated_count} "
            f"skipped={skipped_count} updated={updated_count}"
        )

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
        uploaded = self.request.FILES.get('file')
        extra = {'uploaded_by': member, 'family': family}
        if uploaded is not None:
            extra['file_size'] = getattr(uploaded, 'size', 0) or 0
            if not serializer.validated_data.get('mime_type'):
                extra['mime_type'] = getattr(uploaded, 'content_type', None) or 'application/octet-stream'
        expense_id = self.request.data.get('expense')
        if expense_id:
            expense = get_object_or_404(
                Expense,
                id=expense_id,
                family=family,
            )
            extra['expense'] = expense
        serializer.save(**extra)

    @action(detail=True, methods=['post'], url_path='parse')
    def parse(self, request, pk=None):
        """Run free Tesseract OCR on this receipt; return merchant/date/total/line-item suggestions."""
        receipt = self.get_object()
        if not receipt.file:
            return Response({'error': 'Receipt file not found'}, status=status.HTTP_404_NOT_FOUND)

        from .receipt_ocr import parse_receipt_file

        try:
            path = receipt.file.path
            result = parse_receipt_file(path)
            return Response(result, status=status.HTTP_200_OK)
        except RuntimeError as e:
            return Response(
                {
                    'error': str(e),
                    'ocr_available': False,
                    'merchant': None,
                    'expense_date': None,
                    'total': None,
                    'line_items': [],
                    'raw_text': '',
                    'found': {
                        'merchant': False,
                        'expense_date': False,
                        'total': False,
                        'total_labeled': False,
                        'line_items': False,
                        'line_item_count': 0,
                    },
                    'confidence': 'low',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception('Receipt OCR failed: %s', e)
            return Response(
                {
                    'error': 'Failed to parse receipt. You can enter details manually.',
                    'line_items': [],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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
