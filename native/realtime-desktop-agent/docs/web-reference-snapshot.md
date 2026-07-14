# Web Reference Snapshot

Date: 2026-07-13
Scope: root Cooper web app as read-only reference for the macOS parity workstream

This snapshot is not a second product spec. It records the web routes, tools, and runtime surfaces the native app compares itself against while keeping root web files read-only.

## Primary Web Runtime

- `POST /session`: OpenAI Realtime WebRTC session creation.
- `GET /api/state`: full app state snapshot.
- `GET /api/events`: Server-Sent Events for state/job updates.
- `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout`: password-gated web session.
- `GET /api/calls`, `GET /api/calls/:id`, `POST /api/calls`, `PATCH /api/calls/:id`, `POST /api/calls/:id/transcript`, `POST /api/calls/:id/end`: call lifecycle and transcripts.
- `POST /api/calls/:id/artifacts`, `GET /api/artifacts/:id/content`, `POST /api/jobs/:id/retry`: artifact/job lifecycle.
- `POST /api/projects`, `PATCH /api/projects/:id`, `GET /api/projects/:id/context`, `POST /api/projects/:id/sources`, `POST /api/projects/:id/uploads`: project context ingestion.

## External And Agent Tools

- `POST /api/tools/execute`: web tool execution gateway.
- Arcade auth/status: `/api/tools/arcade/status`, `/discovery`, `/connect`, `/authorize`, `/authorize-all`, `/check`.
- Notion tools: `search_notion_workspace`, `fetch_notion_page`, with Arcade mapping when configured and direct Notion fallback.
- Operator: `/api/operator/state`, `/api/operator/tasks`, `/approve`, `/cancel`, `/stop-all`.
- Computer Use: `/api/computer-use/tool`, `/api/computer-use/tool-log`.
- Push-to-talk: `/api/push-to-talk/config`, `/api/push-to-talk/utterance`.
- AIRES examples: `/api/aires/examples`, `/api/aires/examples/:id`.
- GStack/advisory skills: `server/tools/runGstackSkill.js` and `server/gstack-skills/*`.
- Zoom: `/api/zoom/config`, `/api/zoom/signature`, plus `@zoom/meetingsdk` embedded client in the web UI.

## Native Parity Contract

The native broker exposes `/api/manifest` so parity drift can be inspected without scraping the app:

- Routes: health, local lock, diagnostics, manifest, store import/export, settings, PDF extraction, artifact generation, Realtime session, tool execution, Arcade status/discovery/connect/authorize/check.
- Tools: canvas card/table, local file search/read, Arcade mapped workspace/Notion/customer/engineering/follow-up tools, Notion search/fetch, app URL/clipboard actions.
- Connectors: local Notion status/direct fallback, Arcade OAuth/pre-authorization status with non-secret authorization records, AIRES Requirements local capability.
- Security: local lock, Keychain write-only secret handling, file allowlist, renderer sanitization, embed allowlist, connector/operator approval gates.

## Known Intentional Gaps

- Web password cookie auth is represented natively by the local product lock instead of shared cookies.
- Web SSE is represented natively by local store writes and smokeable diagnostics; no remote multi-client sync exists.
- Arcade OAuth/pre-authorization is native now, but real provider completion depends on `ARCADE_API_KEY`, mapped tool env vars, and `@arcadeai/arcadejs` being available to the broker runtime.
- Push-to-talk helper ingestion and deterministic Computer Use execution are native now; longer-running arbitrary desktop automation remains future connector work.
- GStack/advisory tools are native now through bundled adapted prompts plus the advisory-only `run_gstack_skill` broker tool.
- Embedded Zoom Meeting SDK remains web-only; native meeting cards use confirmed external URL handoff.
- Signing/notarization require Apple Developer account setup outside the repository.
