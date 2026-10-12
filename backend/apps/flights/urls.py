from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("flights", views.FlightViewSet)
router.register("logs", views.FlightLogViewSet)

urlpatterns = router.urls
