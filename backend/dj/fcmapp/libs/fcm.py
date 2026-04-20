from pathlib import Path

import firebase_admin
from firebase_admin import credentials

_KEY_PATH = Path(__file__).resolve().parent / "serviceAccountKey.json"

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(str(_KEY_PATH)))
