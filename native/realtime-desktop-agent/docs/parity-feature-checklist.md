# macOS Parity Feature Checklist

Date: 2026-07-13
Scope: `native/realtime-desktop-agent`
Source of truth: root Cooper web app, read-only for this workstream

Status legend:

- Done: implemented in the macOS app and smoke-checked
- Partial: visible implementation exists but does not yet match the web lifecycle
- Planned: intentionally not implemented yet
- Blocked: needs a web contract, connector decision, or external setup first

## Sprint 0 Guardrails

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Web app remains read-only during macOS parity work | Done | Roadmap working rule and native README contribution scope |
| Gap analysis exists under native app | Done | `docs/macos-web-parity-roadmap.md` |
| Feature inventory checklist exists under native app | Done | This file |
| Web routes/APIs/tools are treated as reference | Done | `docs/web-reference-snapshot.md` records the web route/tool/runtime surface; native broker `/api/manifest` exposes capability, route, tool, connector, and security metadata for drift checks |

## Sprint 1: Native Session OS Shell

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| App launches to Today | Done | `Resources/Web/app.js` initializes to `home` unless QA canvas mode is set |
| Today keeps a free-flow Start call button | Done | `homeStartCall` enters call with `autoStart: true` |
| Top-level route/state model exists | Done | `state.view`, `shellDestinations`, `shellViewIds`, `navigate`, and `showView` |
| Today, Sessions, Projects, Library, Settings destinations reachable | Done | Shared `[data-nav-view]` navigation in native web shell |
| Empty states for Sessions, Projects, Library, Settings | Done | `shellDestinations` panels render honest planned-state messaging |
| Detail page links to call | Done | Primary detail action starts call with selected item context |
| Detail page links to sessions/projects | Done | Secondary detail action routes to Sessions for meetings, Projects for tasks |
| Detail page links to library | Done | Detail document chips route to Library |
| Topbar follows AIRES Session OS language | Done | Topbar route navigation is paired with a native Session OS sidebar/rail for shell destinations, local broker posture, approval-gated status, and responsive collapse |

## Sprint 2: Native Data Store And Session Model

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Versioned local store | Done | Broker-backed JSON store at `~/Library/Application Support/RealtimeDesktopAgent/store.json`; schema documented in `docs/native-store-schema.md` |
| Persist ended calls | Done | `endCall` snapshots the active session into `/api/store` |
| Restore transcripts and canvas cards | Done | Sessions view can reopen a saved session into transcript and canvas state |
| Sessions search/detail | Done | Sessions route has search across metadata/transcripts/cards, selected detail drill-in, transcript/card previews, restore, and follow-up actions |
| Corrupt-store fallback | Done | Broker renames corrupt store files and returns a recovered empty store |
| Import/export debug action | Done | Settings exposes store export/import controls; broker smoke round-trips `GET /api/store` payloads through `PUT /api/store` |

## Sprint 3: Projects And Context Ingestion

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Project cards | Done | Projects route renders seeded/stored project records from the native store |
| Paste/Markdown/TXT ingestion | Done | Projects route supports pasted sources and `.md`/`.txt` file text ingestion |
| PDF ingestion | Done | Projects route sends selected PDFs to `/api/project-sources/extract-pdf`; broker uses macOS PDFKit, persists extracted text/status metadata, and smoke tests a generated PDF extraction |
| Context packet builder | Done | `buildProjectContextPacket` compacts selected project sources for Realtime |
| Attach project context to call start | Done | Client sends `X-Cooper-Project-*` headers and broker folds context into Realtime instructions |

## Sprint 4: Canvas And Artifact Parity

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Unified card stream | Done | Current canvas cards use one source payload plus metadata |
| Per-card render mode dropdown | Done | Text, HTML, Mermaid, Embed modes through renderer registry |
| Strict HTML sanitization | Done | `sanitizeHTML`, safe URLs, blocked tags, event-handler stripping |
| Allowlisted embeds | Done | `allowedEmbedURL` and iframe sandboxing |
| Durable artifact model | Done | Native store normalizes saved artifact records and schema docs cover artifact shape |
| Artifact Library view | Done | Library route lists saved artifacts, previews selected artifacts, and can add artifacts back to canvas |
| Artifact reader tabs | Done | Library artifact detail provides Preview, Source, and Metadata tabs, with raw source escaped and metadata including provider/model/request/job/session/project fields |
| Post-call artifact jobs | Done | Library job queue attempts broker-backed Responses generation for Markdown, HTML, Mermaid, and AIRES requirements, saves local fallback artifacts when the API key is missing or generation fails, exposes Retry Responses for eligible fallback/failed jobs, and `scripts/responses-artifact-smoke.mjs` passed credentialed live Responses verification; MCP App preview artifacts remain local and inert |
| MCP App artifact preview | Done | Library can generate `mcp_app` JSON manifests and render an inert escaped preview of app metadata, tools, resources, approvals, and source JSON |

## Sprint 5: Realtime Behavior And Post-Call Workflow

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Free-flow Start call | Done | Home and shell actions start the live call |
| Manual Ask Cooper mode | Done | Mode picker persists `free`/`manual`/`wake`; broker disables automatic responses in manual and wake modes, and client exposes Ask Cooper |
| Wake phrase / silence policy parity | Done | Wake phrase mode keeps Realtime silent by default, detects the Cooper wake phrase from completed input transcription, and sends `response.create`; Ask Cooper remains a manual override |
| Call metadata display | Done | Call panel shows mode, timer, model, workspace, microphone, and estimated cost |
| Approximate cost display | Done | Client updates a local estimated cost during active calls and stores it on session snapshots |
| Post-call save/generate actions | Done | End call saves session, adds a post-call next-actions card, and exposes Markdown/HTML/Library actions |

## Sprint 6: Settings, Secrets, And Connector Auth

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Settings route exists | Done | Shell Settings destination |
| Broker/API-key status visible | Done | Settings reads `/api/settings` and `/health` for runtime, key presence, model, workspace, and store path |
| Local product lock | Done | `/api/lock` stores salted scrypt lock config outside store export, Settings can enable/update/disable/lock, locked broker returns 423 for protected APIs, and smoke tests lock/unlock/bad-password behavior |
| Keychain write/update/delete UI | Done | Settings posts to `/api/settings/openai-key`; broker writes/deletes `RealtimeDesktopAgent.OPENAI_API_KEY` without returning the secret, and `scripts/keychain-smoke.mjs` verifies save/update/delete through a temporary Keychain service/account |
| Workspace allowlist UI | Done | Settings persists roots and broker local file tools load the allowlist for search/read with realpath enforcement |
| Arcade/Notion auth status | Done | Native Settings exposes Arcade status, discovery, service connect, mapped tool authorize/authorize-all/check flows, dynamic `@arcadeai/arcadejs` loading, persisted non-secret authorization records, and approval-gated mapped tool execution; direct Notion search/fetch remains available behind local token gates |
| Tool approval audit trail | Done | Local file tools, external URL opens, and Notion connector tools require visible approval or rejection; connector approval prompts include status/risk/auth/scopes/tool IDs, all outcomes persist to `toolAudit`, and static/broker smokes pin the flow |

## Sprint 7: External Data And AIRES Tools

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Notion search/fetch | Done | Native broker exposes `notion.search` and `notion.fetch_page` behind Settings authorization and `NOTION_API_KEY`/`NOTION_TOKEN`; recoverable connector cards and approval audit cover missing auth/token cases |
| AIRES requirements framework | Done | Library exposes list, explain, workshop, interview, and queue artifact modes with durable `mode` metadata; Workshop/Interview can also start manual-mode Realtime facilitation calls with an AIRES context packet and seeded canvas guide |
| GStack/advisory tools | Done | Native broker bundles the adapted GStack prompts, exposes `run_gstack_skill` through Realtime tool execution, uses OpenAI Responses for structured advisory JSON, renders result/error canvas cards, and marks the tool advisory-only in the capability manifest |
| Connector error cards | Done | Recoverable broker connector errors render as canvas cards and persist audit events |

## Sprint 8: Operator, Computer Use, And Push-To-Talk

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Operator workspace | Done | Native Operator route has queue, visible approval, logs, plan artifacts, cancel, stop-all controls, notifications, and persisted `operatorTasks`; Computer Use execution remains tracked separately |
| Computer Use workspace | Done | Native broker exposes approval-gated deterministic Computer Use tools for Chrome tabs, web search, vision click, local apps, web apps, Finder, and Terminal; Operator approval executes inferred Computer Use tasks through `/api/tools/execute`; dry-run broker smoke verifies allowed app, blocked app, allowlisted Finder, and blocked outside-path behavior |
| Push-to-talk helper integration | Done | Native broker exposes `/api/push-to-talk/config` and `/api/push-to-talk/utterance`; helper audio is token/unlock gated, transcribed, discarded, and persisted as approval-gated Operator/Computer Use tasks with stop-command routing |
| Native notifications | Done | Swift WKWebView notification bridge requests macOS notification permission, reports permission/status back to Settings, and emits approval, Operator, artifact, call-ended, and call-failure notifications |

## Sprint 9: Zoom, Presentation Runtime, And Release Hardening

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Zoom meeting path | Done | Meeting detail cards expose confirmed/audited external Zoom/Meet launch URLs while the Cooper Realtime call path remains available as a separate Join with Cooper action |
| Presentation/playbook runtime | Done | Library artifacts can launch a safe in-app presentation overlay with generated slides, keyboard navigation, previous/next/close controls, and sanitized Markdown rendering from canonical artifact source |
| Signed release build | Partial | `docs/release-checklist.md` and `scripts/release-preflight.mjs` define and verify parser checks, smokes, Debug/Release builds, Release `.app` resource presence, local codesign validity, and hardened runtime metadata; Apple team/profile, Developer ID signing, notarization, and stapling still require external distribution setup |
| Crash/log diagnostics | Done | `/api/diagnostics`, Settings export, broker crash/rejection reports at `Diagnostics/broker-crashes.jsonl`, native Swift exception/signal reports at `Diagnostics/native-crashes.jsonl`, and Swift host `latest-host.log` copy/reveal provide user-safe diagnostics |
| Native design system contract | Done | `Resources/Web/design-tokens.json` and `docs/native-design-system.md` define AIRES native tokens/component inventory; `scripts/web-ui-smoke.mjs` verifies token CSS variables and UI markers |
| UI smoke suite | Done | `scripts/broker-smoke.mjs` covers broker health, diagnostics, settings, security gates, connector errors, and static UI markers; `scripts/web-ui-smoke.mjs` checks static nav/call/settings/canvas/artifact contracts; `scripts/wkwebview-smoke.swift` loads the actual WKWebView surface with stubbed broker endpoints and verifies shell navigation/rendering |
