# Native Store Schema

Date: 2026-07-13
Scope: `native/realtime-desktop-agent`

The macOS app persists local product state through the bundled Node broker. The WKWebView client reads and writes the store through `/api/store`; it does not write directly to the filesystem.

## Location

Default path:

```text
~/Library/Application Support/RealtimeDesktopAgent/store.json
```

Override for smoke tests or development:

```sh
REALTIME_AGENT_DATA_DIR=/tmp/realtime-desktop-agent-data
```

The broker writes atomically through a temporary file and rename. If `store.json` cannot be parsed, the broker renames it to `store.corrupt-<timestamp>.json` and returns an empty store with a `recovery` note so the app can still launch.

## Top-Level Shape

```json
{
  "schemaVersion": 1,
  "sessions": [],
  "projects": [],
  "artifacts": [],
  "jobs": [],
  "operatorTasks": [],
  "arcadeAuthorizations": [],
  "settings": {
    "workspaceAllowlist": [
      "/Users/michaelmoll/Documents/aires-code-repos/Codex-voice"
    ],
    "connectors": [],
    "toolAudit": []
  },
  "updatedAt": "2026-07-13T00:00:00.000Z"
}
```

## Session

```json
{
  "id": "session-...",
  "title": "Scope requirements for first-touch logging",
  "context": "Scope requirements for first-touch logging",
  "projectId": "project-rep-velocity",
  "projectContextPacket": "Project: Rep velocity\n\nSources:\n...",
  "callMode": "manual",
  "estimatedCost": "$0.02 est",
  "status": "ended",
  "startedAt": "2026-07-13T00:00:00.000Z",
  "endedAt": "2026-07-13T00:15:00.000Z",
  "updatedAt": "2026-07-13T00:15:00.000Z",
  "transcriptTurns": [],
  "canvasCards": [],
  "cardModes": {},
  "summary": "Short saved-session summary"
}
```

Allowed `status` values:

- `active`
- `ended`
- `restored`

## Project

```json
{
  "id": "project-rep-velocity",
  "title": "Rep velocity",
  "summary": "Working context for first-touch logging and rep velocity.",
  "tags": ["rep", "velocity"],
  "status": "active",
  "createdAt": "2026-07-13T00:00:00.000Z",
  "updatedAt": "2026-07-13T00:10:00.000Z",
  "sources": []
}
```

The web client seeds initial project cards from Today tasks when the store has no projects yet.

## Project Source

```json
{
  "id": "source-...",
  "title": "Scoped requirements v2",
  "kind": "markdown",
  "status": "ready",
  "content": "Canonical text or Markdown context",
  "fileName": "requirements.md",
  "byteLength": 1420,
  "extractor": "",
  "error": "",
  "truncated": false,
  "createdAt": "2026-07-13T00:05:00.000Z"
}
```

Known `kind` values today:

- `paste`
- `markdown`
- `txt`
- `pdf`
- `note`

Known `status` values today:

- `ready`
- `pending_pdf_extraction`
- `extraction_empty`
- `extraction_failed`

PDF files selected in the Projects view are sent to the local broker, extracted with macOS PDFKit, and saved as normal source text when selectable text is available. Image-only/scanned PDFs currently save an `extraction_empty` or `extraction_failed` source record instead of entering the Realtime context packet.

## Transcript Turn

```json
{
  "id": "turn-...",
  "kind": "assistant",
  "speaker": "Agent",
  "text": "Here is the next requirement slice.",
  "createdAt": "2026-07-13T00:10:00.000Z"
}
```

Known `kind` values today:

- `user`
- `assistant`
- `tool`

Known session `callMode` values today:

- `free`
- `manual`
- `wake`

## Canvas Card

Canvas cards keep one canonical source payload and render through the client-side renderer registry.

```json
{
  "id": "card-...",
  "title": "Renderer Pipeline",
  "tags": ["diagram", "canvas"],
  "type": "diagram",
  "source": {
    "format": "markdown",
    "value": "```mermaid\nflowchart LR\n  Source --> Registry\n```",
    "ast": null
  },
  "defaultMode": "text",
  "supportedModes": ["text", "html", "mermaid"],
  "lastEdited": "2026-07-13T00:10:00.000Z"
}
```

Supported render modes today:

- `text`
- `html`
- `mermaid`
- `embed`

## Artifact

```json
{
  "id": "artifact-...",
  "title": "Rep velocity Markdown",
  "kind": "markdown",
  "mode": "",
  "outputType": "markdown",
  "sessionId": "session-...",
  "projectId": "project-rep-velocity",
  "tags": ["library", "markdown"],
  "source": {
    "format": "markdown",
    "value": "# Rep velocity\n\nSaved artifact body",
    "ast": null
  },
  "createdAt": "2026-07-13T00:15:00.000Z",
  "updatedAt": "2026-07-13T00:15:00.000Z",
  "summary": "Markdown generated from native Cooper context.",
  "jobId": "job-...",
  "generationProvider": "local",
  "responseModel": "",
  "responseRequestId": "",
  "responseUsage": null
}
```

Known `kind` values today:

- `markdown`
- `html`
- `mermaid`
- `mcp_app`
- `aires_requirements`

The native Library attempts broker-backed OpenAI Responses generation for Markdown, HTML, Mermaid, and AIRES requirements artifacts, then saves a deterministic local fallback when the API key is missing or generation fails. MCP App preview artifacts remain local and inert. HTML previews are sanitized by the renderer registry before display.

Responses-backed artifacts may set `generationProvider: "openai_responses"`, `responseModel`, `responseRequestId`, and `responseUsage`. Local fallback artifacts set `generationProvider: "local"` and leave response fields empty.

AIRES requirements artifacts use `kind: "aires_requirements"` and `source.format: "html"`. The optional `mode` field records the flow used to generate the artifact. Supported native modes are `list`, `explain`, `workshop`, `interview`, and `queue`. Each mode adds a focused opening section while preserving the scoped requirements contract: problem and goal, users/stakeholders, current-to-desired state, scope, data/edge cases/constraints, MoSCoW, vertical INVEST slices, Given/When/Then criteria, Definition of Ready, and explicit assumptions.

MCP App preview artifacts use `kind: "mcp_app"` and `source.format: "json"`. The JSON manifest is rendered as an inert Library preview with escaped text, declared tools/resources, and approval boundaries; it does not execute remote apps, grant connector permissions, or load scripts.

## Artifact Job

```json
{
  "id": "job-...",
  "title": "Markdown artifact",
  "kind": "markdown",
  "mode": "",
  "status": "completed",
  "progress": "Saved to Library",
  "artifactId": "artifact-...",
  "error": "",
  "logs": ["Queued from native Library", "Saved Rep velocity Markdown"],
  "provider": "local",
  "responseModel": "",
  "responseRequestId": "",
  "retryCount": 0,
  "createdAt": "2026-07-13T00:15:00.000Z",
  "updatedAt": "2026-07-13T00:15:01.000Z"
}
```

Allowed job `status` values:

- `queued`
- `running`
- `completed`
- `failed`

Non-MCP artifact jobs that saved a local fallback and have no `responseRequestId` can be retried from the Library. A successful retry saves a new Responses-backed artifact, updates `provider`, `responseModel`, `responseRequestId`, and increments `retryCount`. A failed retry leaves the previous artifact untouched and records the retry error on the job.

## Operator Task

```json
{
  "id": "operator-...",
  "title": "Review current session and propose next actions",
  "kind": "operator",
  "status": "approval_required",
  "risk": "medium",
  "summary": "Requires approval before local operator work can begin.",
  "approvedAt": "",
  "completedAt": "",
  "stoppedAt": "",
  "error": "",
  "logs": [
    {
      "id": "oplog-...",
      "level": "approval",
      "message": "Queued and waiting for approval.",
      "createdAt": "2026-07-13T00:30:00.000Z"
    }
  ],
  "artifacts": [],
  "createdAt": "2026-07-13T00:30:00.000Z",
  "updatedAt": "2026-07-13T00:30:00.000Z"
}
```

Known operator `kind` values:

- `operator`
- `computer_use`
- `push_to_talk`

Allowed operator `status` values:

- `queued`
- `approval_required`
- `running`
- `blocked`
- `stopped`
- `failed`
- `completed`

Operator tasks are approval-gated. Local Operator tasks can create a Markdown plan artifact after approval. Push-to-talk utterances can enter this same queue through the native broker after token/unlock validation and transcription. Computer Use desktop commands can execute deterministic local tools after approval; longer-running arbitrary desktop automation remains future connector work.

## Settings

```json
{
  "workspaceAllowlist": [
    "/Users/michaelmoll/Documents/aires-code-repos/Codex-voice",
    "/Users/michaelmoll/Documents/aires-code-repos/Codex-voice/native"
  ],
  "connectors": [
    {
      "id": "notion",
      "label": "Notion",
      "status": "authorized",
      "risk": "medium",
      "authMode": "env_token",
      "scopes": ["search", "read_page"],
      "toolIds": ["notion.search", "notion.fetch_page"],
      "note": "Marked authorized locally. Native execution still requires the connector token.",
      "updatedAt": "2026-07-13T00:20:00.000Z"
    },
    {
      "id": "arcade",
      "label": "Arcade",
      "status": "pending",
      "risk": "medium",
      "authMode": "arcade_oauth",
      "scopes": ["pre_authorization", "tool_execution"],
      "toolIds": ["search_workspace_context", "search_notion_workspace", "fetch_notion_page"],
      "note": "Tokens stay with Arcade. Cooper stores only authorization metadata.",
      "updatedAt": "2026-07-13T00:20:00.000Z"
    }
  ],
  "toolAudit": [
    {
      "id": "audit-...",
      "kind": "tool",
      "title": "Tool returned",
      "detail": "app_search_files",
      "createdAt": "2026-07-13T00:21:00.000Z"
    }
  ]
}
```

## Arcade Authorizations

Arcade pre-authorization records live at the top level so they can be shared by Settings, `/api/tools/execute`, diagnostics, and store import/export without mutating connector rows.

```json
{
  "id": "arcade-auth-...",
  "toolName": "search_workspace_context",
  "arcadeToolName": "NotionToolkit.SearchByTitle",
  "userId": "michael",
  "authorizationId": "auth_...",
  "authorizationUrl": "https://...",
  "providerId": "notion",
  "scopes": ["read"],
  "status": "pending",
  "error": null,
  "createdAt": "2026-07-13T00:20:00.000Z",
  "updatedAt": "2026-07-13T00:20:00.000Z",
  "lastCheckedAt": "2026-07-13T00:20:00.000Z"
}
```

These records are intentionally non-secret. Provider access tokens remain with Arcade and are never stored in `store.json`. Unsafe authorization URLs are dropped during normalization.

Known connector `status` values:

- `not_configured`
- `pending`
- `authorized`
- `error`
- `local_only`

The OpenAI API key is intentionally excluded from the store. The Settings API reports only `runtime.hasApiKey` and the configured Keychain service/account. Key saves and deletes are routed through `/api/settings/openai-key`, which updates process state and the macOS Keychain service `RealtimeDesktopAgent.OPENAI_API_KEY`.

The local product lock is also excluded from the exported store. Its broker-owned config lives at `~/Library/Application Support/RealtimeDesktopAgent/lock.json` and stores only a salted scrypt hash, salt, algorithm label, TTL, and update timestamp. The UI uses `/api/lock` to configure, lock, unlock, and disable the local lock. When enabled and expired, protected broker APIs such as `/api/store`, `/api/settings`, `/api/tools/execute`, `/api/project-sources/extract-pdf`, and `/session` return HTTP 423 until the password is verified.

Workspace allowlist entries are persisted for the native Settings surface and loaded by broker file tools on each execution. The primary `APPROVED_WORKSPACE` root is always included. Additional roots can be searched and read when approved in the client, and the broker checks the resolved real path before returning file content so symlink escapes outside the allowlist are rejected.

Connector status is local state, not a secret store. Notion connector execution additionally requires `NOTION_API_KEY` or `NOTION_TOKEN` in the broker environment. Arcade connector execution requires `ARCADE_API_KEY`, mapped tool environment variables such as `ARCADE_SEARCH_WORKSPACE_TOOL`, and an available `@arcadeai/arcadejs` runtime. When a connector is not authorized, unmapped, missing a token/key, or missing its SDK, broker tools return a recoverable connector error that the client can render as a canvas card and audit event.

Connector metadata is also local and non-secret. `risk`, `authMode`, `scopes`, and `toolIds` are normalized by the broker and exposed through `/api/manifest`, Settings connector rows, diagnostics summaries, and recoverable connector error cards.

Connector tool execution is still approval-gated in the client. Notion search/fetch and Arcade mapped tool prompts include connector status, risk, auth mode, scopes, and tool IDs; approvals, rejections, recoverable connector errors, and tool outcomes are persisted to `settings.toolAudit`.

AIRES requirements artifacts use the same artifact/job schema with `kind: "aires_requirements"` and a durable `mode` such as `list`, `explain`, `workshop`, `interview`, or `queue`. Live Workshop and Interview facilitation calls build a temporary AIRES context packet from the active session/project, pass it to the Realtime call headers, and seed the canvas with the facilitation guide without changing the artifact model.

Presentation mode does not add a separate persisted model. The Library presentation overlay derives slides from each artifact's canonical `source`, renders through the same safe Markdown/HTML sanitization path, and records an audit event when opened.

## Diagnostics

The broker exposes `GET /api/diagnostics` for user-safe support exports. The response includes runtime metadata, store counts, connector states, static resource presence, broker crash/rejection report summaries, and security capability flags. It reports secret presence as booleans only, for example `hasOpenAIKey`, `hasNotionToken`, and `hasArcadeKey`; it never returns API key values. Broker crash and unhandled rejection reports are written to `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/broker-crashes.jsonl` after secret redaction and are summarized in the diagnostics payload.

The Swift host also writes native exception/signal reports to `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/native-crashes.jsonl` and a redacted process lifecycle log to `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/latest-host.log`. The native header and Agent menu can copy a host diagnostics summary or reveal that diagnostics folder without exposing API key values.

The Settings surface can export the broker payload from `GET /api/store` and import either that payload shape or a raw store object through `PUT /api/store`. Imports are normalized by the broker before they replace the local store.

## Current Limits

- Store writes replace the full JSON document.
- The broker keeps the most recent 100 sessions, 500 transcript turns per session, and 250 canvas cards per session.
- The broker keeps up to 100 projects and 80 sources per project.
- The broker keeps up to 250 artifacts and 250 artifact jobs.
- The broker keeps up to 250 operator tasks, 80 logs per task, and 20 artifact refs per task.
- The broker keeps up to 200 tool audit events.
- The first implementation is JSON-backed; SQLite remains an open option if the store needs querying, concurrent writes, or larger artifact indexes.
