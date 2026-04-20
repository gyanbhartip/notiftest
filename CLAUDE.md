# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo with two independent apps that talk over WebSocket:

- `frontend/` — Expo (SDK 54) / React Native 0.81 / React 19 client. Uses `pnpm` (lockfile: `pnpm-lock.yaml`). Bare workflow (`android/` is committed); push notifications via `@react-native-firebase/messaging` + local display via `@notifee/react-native`.
- `backend/fast/` — FastAPI server managed by `uv` (Python 3.14 pinned via `.python-version`). Exposes the WebSocket + test REST endpoint the client connects to.
- `backend/dj/` — Django backend scaffold. Currently only a `.venv`; no source yet. Do not assume it is runnable — confirm before touching.

The frontend connects to the backend via a single env var `EXPO_PUBLIC_WS_URL` (read in `frontend/App.tsx`, set in `frontend/.env.local`). Anything that changes the WS URL shape must be updated in both places.

## Commands

### Frontend (run from `frontend/`)

- `pnpm install` — install deps (use pnpm, not npm/yarn; the lockfile is pnpm's).
- `pnpm start` — Metro bundler / Expo dev server.
- `pnpm android` / `pnpm ios` — native build + run (these use `expo run:*`, NOT Expo Go, because Firebase + Notifee require native modules).
- `pnpm web` — web preview.

Because this is a bare Expo project with native modules, Expo Go will not work — always use a dev client build (`pnpm android` / `pnpm ios`) after changing `app.json`, adding plugins, or pulling new native deps.

### Backend (run from `backend/fast/`)

- `uv sync` — install/refresh deps from `uv.lock`.
- `uv run fastapi dev main.py` — dev server (reload enabled; listens on `127.0.0.1:8000` by default).
- `uv run fastapi run main.py` — production-style serve.
- `uv run ruff check .` / `uv run ruff format .` — lint / format (ruff is the only dev tool declared).

No test suite exists yet in either app. If you add tests, wire the commands back into this file.

## Architecture (the non-obvious parts)

### WebSocket fan-out via `ConnectionManager`

`backend/fast/routers/notifications.py` is the core integration point. A single in-memory `ConnectionManager` keeps a `dict[user_id, WebSocket]`. The flow:

1. Client opens `ws://<host>/api/ws/notifications?user_id=<id>` → `connect()` stores the socket keyed by `user_id`.
2. Anything (typically `POST /api/test/send-ws-notification?user_id=...`) calls `manager.send_to_user(user_id, payload)` to push JSON down that specific socket.
3. `WebSocketDisconnect` clears the entry.

Implications:

- State is process-local. Multi-worker / multi-replica deployments will break silently — only the worker that holds the socket can deliver to it. If you add workers, you must introduce a broker (Redis pub/sub, etc.) before that is safe.
- One `user_id` = one active socket. A second connect for the same user overwrites the previous one (the old socket is orphaned, not closed). Be explicit if you change that semantics.
- Router is mounted with prefix `/api`, so all paths above are served at `/api/...`. Keep client URLs in sync when editing `main.py`.

### CORS is wide open

`main.py` sets `allow_origins=["*"]` with credentials. Fine for a local test harness, not for anything shared. Tighten before deploying.

### Frontend WS lifecycle

`App.tsx` opens the socket inside `useEffect(..., [])` with no cleanup and no reconnect — expected for a throwaway harness, but don't copy this pattern into production code without adding `ws.close()` on unmount and a reconnect strategy.

### Notifee + Maven repo wiring

`app.json` adds an `extraMavenRepos` entry pointing at `../../node_modules/@notifee/react-native/android/libs` through `expo-build-properties`. This is required for Android builds to resolve Notifee's AAR — if you restructure `node_modules` location (e.g., workspace hoisting) or change package managers, this relative path will break the Android build. Firebase is wired through `google-services.json` at `frontend/google-services.json`; package id is `com.gb.notiftest`.

## Conventions specific to this repo

- **Backend imports**: `main.py` uses `from routers.notifications import ...` (not `from .routers...`). The server must be launched from inside `backend/fast/` so that `routers/` is on `sys.path`. Don't "fix" this to a package-relative import without also restructuring launch.
- **Python version**: 3.14 is pinned. `uv` will refuse to run on older interpreters — install via `uv python install 3.14` if missing.
- **TypeScript**: `strict: true` via `expo/tsconfig.base`. Don't loosen.
- **Env vars on the client**: Only `EXPO_PUBLIC_*` variables are exposed to RN code. Anything without that prefix will be `undefined` at runtime.

## Deployment model

Local-only. This repo is a notification test harness — it is not deployed and is not intended to be. That means:

- Don't suggest hardening CORS, adding Redis/pub-sub for the `ConnectionManager`, switching to multi-worker uvicorn, or adding auth to the WebSocket. Those are correct concerns for production but out of scope here.
- Single-process, single-dev-machine assumptions are fine. The in-memory `ConnectionManager` is the intended design for this harness.
- Prioritise iteration speed and readable test flows over robustness or scalability.
