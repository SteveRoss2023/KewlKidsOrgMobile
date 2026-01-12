"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.http import HttpResponse

# Customize admin site
admin.site.site_header = "KewlKids Organizer Admin"
admin.site.site_title = "KewlKids Admin"
admin.site.index_title = "Welcome to KewlKids Organizer Administration"

# Simple view to handle favicon.ico requests (prevents 500 errors)
def favicon_view(request):
    # Return 204 No Content to stop browser from requesting it
    return HttpResponse(status=204)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/', include('families.urls')),
    path('api/', include('lists.urls')),
    path('api/', include('expenses.urls')),
    # Handle favicon.ico requests to prevent 500 errors
    path('favicon.ico', favicon_view, name='favicon'),
]

# Serve static and media files in development
if settings.DEBUG:
    # Use staticfiles URL patterns (automatically finds files in app static/ directories)
    urlpatterns += staticfiles_urlpatterns()
    # Serve media files
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

