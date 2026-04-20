from django.db import models


class FCMToken(models.Model):
    device_id = models.CharField(max_length=128, unique=True)
    token = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.device_id} - {self.token[:30]}..."
