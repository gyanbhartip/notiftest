from django.apps import AppConfig


class FcmappConfig(AppConfig):
    name = "fcmapp"

    def ready(self) -> None:
        from .libs import fcm  # noqa: F401  # initializes firebase_admin
