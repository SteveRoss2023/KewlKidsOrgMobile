from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
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
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/verify-email/', views.EmailVerificationView.as_view(), name='verify_email'),
    path('auth/resend-verification/', views.ResendVerificationEmailView.as_view(), name='resend_verification'),
    path('auth/exchange-temp-token/', views.ExchangeTempTokenView.as_view(), name='exchange_temp_token'),
    
    # Recipe endpoints
    path('recipes/import/', views.RecipeImportView.as_view(), name='recipe-import'),
    path('recipes/<int:pk>/add-to-list/', views.recipe_add_to_list, name='recipe-add-to-list'),
    
    # Router URLs (includes /users/me/profile/ and /users/me/profile/photo/)
    path('', include(router.urls)),
]


