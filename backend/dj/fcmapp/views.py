# notifications/views.py
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from firebase_admin import messaging

from django.contrib.auth.decorators import (
    login_required,
)  # ← only if you use session auth

from .models import FCMToken


def send_fcm_notification(user, title: str, body: str):
    tokens_qs = FCMToken.objects.filter(user=user).values_list("token", flat=True)
    tokens = list(tokens_qs)

    if not tokens:
        print(f"No FCM tokens found for user {user}")
        return False

    notifee_payload = {
        "id": f"fcm-{int(messaging.datetime.now().timestamp())}",
        "title": title,
        "body": body,
        "channelId": "default",
    }

    success_count = 0
    for token in tokens:
        message = messaging.Message(
            token=token, data={"notifee": json.dumps(notifee_payload)}
        )
        try:
            response = messaging.send(message)
            print(f"✅ FCM sent to {token[:20]}... → {response}")
            success_count += 1
        except Exception as e:
            error_str = str(e).lower()
            print(f"❌ FCM failed for token: {error_str}")
            if "not registered" in error_str or "invalid" in error_str:
                FCMToken.objects.filter(token=token).delete()  # clean up bad token
    return success_count > 0


@csrf_exempt
# @login_required   # ← remove / replace with your real auth (see note below)
def save_fcm_token(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST method required"}, status=405)

    try:
        data = json.loads(request.body)
        token = data.get("token")

        if not token:
            return JsonResponse({"error": "token is required"}, status=400)

        # ── Authentication check ──
        # Make sure request.user is set by your auth system
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)

        # Update or create (supports multi-device: same user can have many tokens)
        FCMToken.objects.update_or_create(token=token, defaults={"user": request.user})

        return JsonResponse({"status": "success", "message": "FCM token saved/updated"})

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


# ── TEST VIEW (hit from browser/Postman) ──
@csrf_exempt
def test_send_fcm(request):
    if request.method == "POST":
        token = request.POST.get("token") or request.GET.get("token")
        title = request.POST.get("title", "Test FCM")
        body = request.POST.get("body", "Hello from Django FCM!")

        if not token:
            return JsonResponse({"error": "Missing token"}, status=400)

        success = send_fcm_notification(token, title, body)
        return JsonResponse({"status": "sent" if success else "failed"})
    return JsonResponse({"info": "POST token, title, body"})
