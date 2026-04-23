import json
import time

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from firebase_admin import messaging

from .models import FCMToken


def send_fcm_notification(device_id: str | None, title: str, body: str) -> int:
    qs = FCMToken.objects.all()
    if device_id:
        qs = qs.filter(device_id=device_id)
    tokens = list(qs.values_list("token", flat=True))

    if not tokens:
        print(f"No FCM tokens for device_id={device_id!r}")
        return 0

    notifee_payload = {
        "id": f"fcm-{int(time.time())}",
        "title": title,
        "body": body,
        "android": {
            "channelId": "default",
            "pressAction": {"id": "default"},
        },
    }

    sent = 0
    for token in tokens:
        message = messaging.Message(
            token=token,
            data={"notifee": json.dumps(notifee_payload)},
        )
        try:
            resp = messaging.send(message)
            print(f"✅ FCM sent to {token[:20]}… → {resp}")
            sent += 1
        except Exception as e:
            err = str(e).lower()
            print(f"❌ FCM failed: {err}")
            if "not registered" in err or "invalid" in err:
                FCMToken.objects.filter(token=token).delete()
    return sent


@csrf_exempt
@require_http_methods(["POST"])
def save_fcm_token(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    token = data.get("token")
    device_id = data.get("device_id")

    if not token or not device_id:
        return JsonResponse({"error": "token and device_id are required"}, status=400)

    FCMToken.objects.update_or_create(device_id=device_id, defaults={"token": token})
    return JsonResponse({"status": "saved", "device_id": device_id})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def test_send_fcm(request):
    if request.method == "GET":
        return JsonResponse({"info": "POST device_id (optional), title, body"})

    device_id = request.POST.get("device_id") or request.GET.get("device_id")
    title = request.POST.get("title", "Test FCM")
    body = request.POST.get("body", "Hello from Django FCM!")

    sent = send_fcm_notification(device_id, title, body)
    return JsonResponse({"status": "sent" if sent else "failed", "count": sent})


# --- offer push (data-only, Notifee renders locally) ---
from django.views.decorators.http import require_POST


@csrf_exempt
@require_POST
def send_fcm_offer(request):
    device_id = request.POST.get("device_id", "").strip()
    envelope_json = request.POST.get("envelope", "").strip()
    if not device_id or not envelope_json:
        return JsonResponse({"error": "device_id and envelope required"}, status=400)

    try:
        # Validate JSON shape — we re-stringify below for safety.
        envelope = json.loads(envelope_json)
    except json.JSONDecodeError:
        return JsonResponse({"error": "envelope is not valid json"}, status=400)

    try:
        token_row = FCMToken.objects.get(device_id=device_id)
    except FCMToken.DoesNotExist:
        return JsonResponse({"error": "device_id not registered"}, status=404)

    message = messaging.Message(
        token=token_row.token,
        data={
            "envelope": json.dumps(envelope),
            "v": "1",
        },
        android=messaging.AndroidConfig(
            priority="high",
        ),
    )
    try:
        response = messaging.send(message)
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({"error": "fcm_send_failed", "detail": str(exc)}, status=502)

    return JsonResponse({"ok": True, "message_id": response})
