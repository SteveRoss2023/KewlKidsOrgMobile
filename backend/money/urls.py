from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'income-streams', views.IncomeStreamViewSet, basename='incomestream')
router.register(r'income-occurrences', views.IncomeOccurrenceViewSet, basename='incomeoccurrence')
router.register(r'money-accounts', views.AccountViewSet, basename='moneyaccount')
router.register(r'account-snapshots', views.AccountSnapshotViewSet, basename='accountsnapshot')
router.register(
    r'retirement-estimates',
    views.RetirementEstimateViewSet,
    basename='retirementestimate',
)

urlpatterns = [
    path('', include(router.urls)),
]
