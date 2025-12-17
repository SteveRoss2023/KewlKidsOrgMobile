"""
URLs for lists app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'lists', views.ListViewSet, basename='list')
router.register(r'list-items', views.ListItemViewSet, basename='listitem')
router.register(r'grocery-categories', views.GroceryCategoryViewSet, basename='grocerycategory')
router.register(r'completed-grocery-items', views.CompletedGroceryItemViewSet, basename='completedgroceryitem')

urlpatterns = [
    path('', include(router.urls)),
]

