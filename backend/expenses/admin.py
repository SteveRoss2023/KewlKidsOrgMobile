"""
Admin configuration for expenses app.
"""
from django.contrib import admin
from .models import ExpenseCategory, Expense, ExpenseTag, Budget, RecurringExpense, Receipt


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'family', 'order', 'is_default', 'created_at']
    list_filter = ['is_default', 'created_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['id', 'description', 'category', 'amount', 'expense_date', 'payment_method', 'created_by', 'created_at']
    list_filter = ['payment_method', 'expense_date', 'category', 'created_at']
    search_fields = ['description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ExpenseTag)
class ExpenseTagAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'family', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ['id', 'category', 'amount', 'period', 'start_date', 'is_active', 'created_at']
    list_filter = ['period', 'is_active', 'start_date']
    search_fields = ['category__name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(admin.ModelAdmin):
    list_display = ['id', 'description', 'category', 'amount', 'frequency', 'next_due_date', 'is_active', 'created_at']
    list_filter = ['frequency', 'is_active', 'next_due_date']
    search_fields = ['description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ['id', 'expense', 'family', 'file_size', 'mime_type', 'uploaded_by', 'created_at']
    list_filter = ['mime_type', 'created_at']
    search_fields = ['expense__description']
    readonly_fields = ['created_at', 'updated_at']
