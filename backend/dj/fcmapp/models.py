from django.db import models
from django.contrib.auth.models import User


class FCMToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="fcm_tokens")
    token = models.TextField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user.username} – {self.token[:30]}..."
