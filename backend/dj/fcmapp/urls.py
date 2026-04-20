from django.urls import path
from .views import save_fcm_token, test_send_fcm

urlpatterns = [
    path("test/send-fcm/", test_send_fcm, name="test_send_fcm"),
    path("api/fcm-token/", save_fcm_token, name="save_fcm_token"),
]
