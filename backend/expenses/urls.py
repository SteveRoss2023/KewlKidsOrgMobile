"""
URLs for expenses app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'expense-categories', views.ExpenseCategoryViewSet, basename='expensecategory')
router.register(r'expenses', views.ExpenseViewSet, basename='expense')
router.register(r'expense-tags', views.ExpenseTagViewSet, basename='expensetag')
router.register(r'budgets', views.BudgetViewSet, basename='budget')
router.register(r'recurring-expenses', views.RecurringExpenseViewSet, basename='recurringexpense')
router.register(r'receipts', views.ReceiptViewSet, basename='receipt')

urlpatterns = [
    path('', include(router.urls)),
]
