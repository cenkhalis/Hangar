from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("aircraft-models", views.AircraftModelViewSet)
router.register("aircraft", views.AircraftViewSet)
router.register("component-types", views.ComponentTypeViewSet)
router.register("life-limits", views.ComponentLifeLimitViewSet)
router.register("components", views.ComponentViewSet)

urlpatterns = router.urls
