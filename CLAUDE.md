# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo with two independent apps that talk over WebSocket:

- `frontend/` — Expo (SDK 54) / React Native 0.81 / React 19 client. Uses `pnpm` (lockfile: `pnpm-lock.yaml`). Bare workflow (`android/` is committed). Entry: `index.ts` → `App.tsx`. Notification plumbing lives under `frontend/src/service/` (`websocket.ts`, `fcm.ts`, `notifications.ts`); UI debug surface in `frontend/src/components/ws.tsx`.
- `backend/fast/` — FastAPI server managed by `uv` (Python 3.14 pinned via `.python-version`). Owns the WebSocket primary path + a test REST endpoint.
- `backend/dj/` — Django app (`fcmapp`) that receives FCM tokens from the client and (intended) sends push via Firebase for the fallback path. Project dir `fcmtest/`, app dir `fcmapp/` (views/urls/models/migrations). `fcmapp/libs/` is untracked vendored SDK material — keep it out of commits.

Client → backend env vars (both in `frontend/.env.local`, both need the `EXPO_PUBLIC_` prefix):

- `EXPO_PUBLIC_WS_URL` — FastAPI WebSocket endpoint (read in `src/service/websocket.ts` _and_ `src/components/ws.tsx`; changes must update both).
- `EXPO_PUBLIC_API_URL` — Django base URL, used by `src/service/fcm.ts` to POST the FCM token to `/fcm-token/`.

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

### Dual notification path (WS primary, FCM fallback)

The harness deliberately runs two delivery routes:

1. **Primary — WebSocket via FastAPI.** `src/service/websocket.ts` opens a persistent socket and calls `notifee.displayNotification(...)` directly on each message. Works only while the app is foregrounded and the socket is alive.
2. **Fallback — FCM via Django.** On mount, `src/service/fcm.ts` registers with FCM, grabs the token, and POSTs it to Django at `${EXPO_PUBLIC_API_URL}/fcm-token/`. Django is expected to push via FCM when WS isn't viable (background/quit). Foreground + background handlers are registered at module import time in `fcm.ts`.

If you change message shape, update both `websocket.ts` (direct Notifee payload) and the FCM payload Django sends — they must produce equivalent Notifee output.

### Two WebSockets open per run (intentional footgun)

`App.tsx` calls `connectWebSocket(...)` from `src/service/websocket.ts` _and_ renders `<WS />` from `src/components/ws.tsx`, which opens its _own_ separate socket for on-screen status display. Result: two connections, two random `user_id`s per launch. Fine for the test harness; do not copy into production. Also: `App.tsx` currently passes `token`/`userId` that are not defined in scope — known rough edge, expect the WS call to throw until wired.

### Frontend WS lifecycle

Both `src/service/websocket.ts` (module-level `socket` singleton) and `src/components/ws.tsx` (component-local) open sockets with no cleanup and no reconnect. Expected for the harness; don't copy without adding `ws.close()` on unmount and a reconnect strategy.

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

<!-- code-review-graph MCP tools -->

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

Tool names carry a `_tool` suffix (e.g. `detect_changes_tool`); under the full MCP prefix they appear as `mcp__code-review-graph__<name>`.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool                             | Use when                                               |
| -------------------------------- | ------------------------------------------------------ |
| `detect_changes_tool`            | Reviewing code changes — gives risk-scored analysis    |
| `get_review_context_tool`        | Need source snippets for review — token-efficient      |
| `get_impact_radius_tool`         | Understanding blast radius of a change                 |
| `get_affected_flows_tool`        | Finding which execution paths are impacted             |
| `query_graph_tool`               | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool`     | Finding functions/classes by name or keyword           |
| `get_architecture_overview_tool` | Understanding high-level codebase structure            |
| `refactor_tool`                  | Planning renames, finding dead code                    |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
