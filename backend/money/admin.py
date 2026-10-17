from django.contrib import admin
from .models import Account, AccountSnapshot, IncomeOccurrence, IncomeStream, RetirementEstimate


@admin.register(IncomeStream)
class IncomeStreamAdmin(admin.ModelAdmin):
    list_display = ('id', 'family', 'stream_type', 'frequency', 'start_date', 'end_date', 'is_active')
    list_filter = ('stream_type', 'frequency', 'is_active')


@admin.register(IncomeOccurrence)
class IncomeOccurrenceAdmin(admin.ModelAdmin):
    list_display = ('id', 'stream', 'due_date', 'status', 'family')
    list_filter = ('status',)


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('id', 'family', 'account_type', 'is_active')
    list_filter = ('account_type', 'is_active')


@admin.register(RetirementEstimate)
class RetirementEstimateAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'updated_at')
    list_filter = ('user',)


@admin.register(AccountSnapshot)
class AccountSnapshotAdmin(admin.ModelAdmin):
    list_display = ('id', 'account', 'as_of_date', 'family')
