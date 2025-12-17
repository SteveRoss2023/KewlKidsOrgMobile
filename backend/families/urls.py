"""
URLs for families app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'families', views.FamilyViewSet, basename='family')
router.register(r'invitations', views.InvitationViewSet, basename='invitation')

urlpatterns = [
    path('invitations/accept/', views.AcceptInvitationView.as_view(), name='accept_invitation'),
    path('', include(router.urls)),
]

