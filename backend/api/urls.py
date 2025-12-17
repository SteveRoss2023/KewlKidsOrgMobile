from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create router and register viewsets
router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'recipes', views.RecipeViewSet, basename='recipe')
router.register(r'meal-plans', views.MealPlanViewSet, basename='mealplan')

urlpatterns = [
    # Health check
    path('health/', views.health_check, name='health_check'),

    # Authentication endpoints
    path('auth/login/', views.EmailTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/refresh/', views.CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/verify-email/', views.EmailVerificationView.as_view(), name='verify_email'),
    path('auth/resend-verification/', views.ResendVerificationEmailView.as_view(), name='resend_verification'),
    path('auth/exchange-temp-token/', views.ExchangeTempTokenView.as_view(), name='exchange_temp_token'),

    # Recipe endpoints
    path('recipes/import/', views.RecipeImportView.as_view(), name='recipe-import'),
    path('recipes/<int:pk>/add-to-list/', views.recipe_add_to_list, name='recipe-add-to-list'),

    # Outlook Calendar OAuth endpoints
    path('calendar/outlook/oauth/initiate/', views.OutlookOAuthInitiateView, name='outlook-oauth-initiate'),
    path('calendar/outlook/oauth/callback/', views.OutlookOAuthCallbackView, name='outlook-oauth-callback'),
    path('calendar/outlook/connection/', views.OutlookConnectionView, name='outlook-connection'),

    # OneDrive OAuth endpoints
    path('onedrive/oauth/initiate/', views.OneDriveOAuthInitiateView, name='onedrive-oauth-initiate'),
    path('onedrive/oauth/callback/', views.OneDriveOAuthCallbackView, name='onedrive-oauth-callback'),
    path('onedrive/connection/', views.OneDriveConnectionView, name='onedrive-connection'),
    path('onedrive/disconnect/', views.OneDriveDisconnectView, name='onedrive-disconnect'),
    path('onedrive/files/', views.OneDriveListFilesView, name='onedrive-list-files'),
    path('onedrive/files/upload/', views.OneDriveUploadFileView, name='onedrive-upload-file'),
    path('onedrive/files/<str:item_id>/delete/', views.OneDriveDeleteItemView, name='onedrive-delete-item'),
    path('onedrive/folders/create/', views.OneDriveCreateFolderView, name='onedrive-create-folder'),

    # Google Drive OAuth endpoints
    path('googledrive/oauth/initiate/', views.GoogleDriveOAuthInitiateView, name='googledrive-oauth-initiate'),
    path('googledrive/oauth/callback/', views.GoogleDriveOAuthCallbackView, name='googledrive-oauth-callback'),
    path('googledrive/connection/', views.GoogleDriveConnectionView, name='googledrive-connection'),
    path('googledrive/disconnect/', views.GoogleDriveDisconnectView, name='googledrive-disconnect'),
    path('googledrive/files/', views.GoogleDriveListFilesView, name='googledrive-list-files'),
    path('googledrive/files/upload/', views.GoogleDriveUploadFileView, name='googledrive-upload-file'),
    path('googledrive/files/<str:item_id>/delete/', views.GoogleDriveDeleteItemView, name='googledrive-delete-item'),
    path('googledrive/folders/create/', views.GoogleDriveCreateFolderView, name='googledrive-create-folder'),

    # Google Photos OAuth endpoints
    path('googlephotos/oauth/initiate/', views.GooglePhotosOAuthInitiateView, name='googlephotos-oauth-initiate'),
    path('googlephotos/oauth/callback/', views.GooglePhotosOAuthCallbackView, name='googlephotos-oauth-callback'),
    path('googlephotos/connection/', views.GooglePhotosConnectionView, name='googlephotos-connection'),
    path('googlephotos/disconnect/', views.GooglePhotosDisconnectView, name='googlephotos-disconnect'),

    # App Documents endpoints
    path('documents/', views.DocumentListView, name='document-list'),
    path('documents/<int:pk>/', views.DocumentDetailView, name='document-detail'),
    path('documents/<int:pk>/download/', views.DocumentDownloadView, name='document-download'),
    path('documents/<int:pk>/view-token/', views.DocumentViewTokenView, name='document-view-token'),

    # App Folders endpoints
    path('folders/', views.FolderListView, name='folder-list'),
    path('folders/<int:pk>/', views.FolderDetailView, name='folder-detail'),

    # Router URLs (includes /users/me/profile/ and /users/me/profile/photo/)
    path('', include(router.urls)),
]
