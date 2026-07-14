# macOS Web Parity Gap Analysis And Roadmap

Date: 2026-07-13
Owner: macOS branch/workstream
Reference app: the root Cooper web app
Target app: `native/realtime-desktop-agent`

## Working Rule

The web app is the dominant final form for Cooper. The macOS app should catch up to the web app's product model without changing the web app in this workstream.

For this macOS branch, treat these paths as editable:

- `native/realtime-desktop-agent/**`
- `native/push-to-talk/**` only when a sprint explicitly includes global push-to-talk or desktop command routing

Treat these paths as read-only reference material:

- `src/**`
- `server.js`
- `server/**`
- root `package.json` and lockfiles
- root `docs/**`, unless a separate web-app planning task explicitly asks for changes there

If the macOS app needs a web contract changed, file it as a dependency for the web-app workstream instead of editing it here.

## Source Basis

This document compares the native app against the current Cooper web application using:

- Root README and current server/client feature surface
- Current-state PRD in `docs/03-prd-current-state.md`
- Session OS production plan in `docs/11-session-os-production-plan.md`
- Component inventory in `docs/product/cooper-page-component-list.md`
- Floating canvas design system in `docs/10-floating-canvas-design-system.md`
- Native app source and README under `native/realtime-desktop-agent`
- Native-owned web reference snapshot in `docs/web-reference-snapshot.md`

## Current macOS App Shape

The native app is currently a local desktop shell:

- SwiftUI host window with a WKWebView front end
- Local Node broker bundled under `Resources/Broker`
- Realtime WebRTC call creation through OpenAI Realtime
- API key loaded from the process environment with Keychain fallback
- Today home screen with meetings, tasks, a detail view, external meeting launch, and a Start call path
- Call view with transcript, mute, interrupt, end call, and broker health status
- Sessions, Projects, Library, Settings, Operator, and Computer Use destinations in the native shell
- Versioned native JSON store for sessions, projects, artifacts, jobs, settings, and operator tasks
- Project source ingestion for paste, Markdown, TXT, and selectable-text PDFs through macOS PDFKit
- Local broker-backed product lock with password verification and unlock TTL
- Free-flow, Ask Cooper/manual, and Wake phrase call modes with silence-by-default handling
- Unified canvas stream with card/table tools
- Per-card render modes using one canonical payload: text, sanitized HTML, Mermaid, and allowlisted embeds
- Canvas layout, grouping, filtering, and selected render mode persistence
- Local deterministic tools for file search/read and simple app actions
- User-safe diagnostics export with broker crash/rejection summaries and a redacted Swift host lifecycle log

That is a good native MVP. The remaining work is mostly parity, persistence, connector depth, and operating-system polish.

## Web App Dominant Surface

The web app has become the full Cooper operating system:

- Splash, lock screen, password session cookie, and authenticated app shell
- Today, Sessions, Projects, Library, Settings, Operator, Computer Use, and live call views
- Project/workspace context ingestion from text, Markdown, TXT, and PDF
- Realtime voice with project context refresh, silence-by-default behavior, wake phrase/manual Ask Cooper, transcript capture, and call cost tracking
- Saved call library with transcripts and generated artifacts
- Live canvas with preview/build/context/templates/activity tabs
- Artifact generation jobs through Responses API, including Markdown, HTML, Mermaid, AIRES requirements, and MCP App outputs
- Sandboxed HTML preview with viewport controls
- Arcade and Notion authorization/settings flow
- Direct Notion fallback, GStack advisory tools, AIRES requirements framework tools
- Operator workspace and Computer Use task runtime
- Zoom Meeting SDK support
- SSE events, PWA notifications, service worker, and push-to-talk helper integration
- AIRES floating canvas design language and Session OS direction

The macOS app should not become an independent fork of this product. It should become the native desktop expression of the same product model.

## Gap Matrix

| Area | Web app state | macOS state | Gap | Priority |
| --- | --- | --- | --- | --- |
| Product shell and navigation | Full app shell with Today, Sessions, Projects, Library, Settings, Operator, Computer Use, and call routes | Native Session OS shell exposes Today, Sessions, Projects, Library, Operator, Settings, detail, and call surfaces | Remaining divergence is native presentation rather than missing nouns | P0 |
| Authentication and local lock | Password gate, signed session cookie, configurable TTL | Native local lock with salted scrypt hash, unlock TTL, protected broker APIs, and Settings controls | Shared web auth/session-cookie parity remains out of scope for local native shell | P1 |
| Session persistence | Calls, transcripts, artifacts, jobs, and state persisted under `data/` | Broker-backed native JSON store persists sessions, transcripts, canvas cards, artifacts, jobs, projects, settings, and operator tasks | Cross-device/web sync remains out of scope for local native shell | P0 |
| Projects and context | Project list, workspace notes, file uploads, PDF extraction, active context refresh | Native Projects view, stored sources, paste/Markdown/TXT/PDFKit text extraction, and Realtime context packet headers | OCR/scanned PDFs and deeper web connector-backed context refresh remain | P0 |
| Realtime call behavior | WebRTC call mode, wake/manual modes, silence policy, transcript, cost, post-call suggestions | Native free-flow, Ask Cooper/manual, Wake phrase, transcript, cost, context, and post-call workflow | Custom wake phrase configuration and deeper reconnect behavior remain | P1 |
| Canvas and cards | Full live canvas with artifacts, preview/build/context/templates/activity | Unified card/table stream with render mode dropdowns, safe renderers, saved artifacts, job-backed generation, Library reader tabs, and activity/audit surfaces | Remaining differences are native presentation choices rather than missing core card lifecycle | P0 |
| Artifact system | Responses jobs create saved Markdown, HTML, Mermaid, AIRES requirements, MCP App artifacts | Durable Library, job queue, safe previews, source/metadata reader tabs, local MCP App previews, broker-backed Responses attempts with fallback, retry, and live Responses smoke | Needs web-compatible MCP App generation if required | P0 |
| Settings and tool auth | Arcade pre-authorization, status checking, mapped tools, app settings | Settings covers broker/key status, Keychain, lock, allowlist, connectors, manifest, audit, diagnostics, local Notion auth state, and Arcade status/discovery/connect/authorize/check flows | Real provider completion requires `ARCADE_API_KEY`, mapped tool env vars, and bundled/installed `@arcadeai/arcadejs` in the native runtime | P1 |
| Notion and external data | Arcade Notion tools plus direct Notion fallback | Direct Notion search/fetch works behind local authorization and token gates; Arcade mapped Notion/workspace tools are broker-gated, pre-authorized from Settings, and approval-gated per call | Deeper connector-backed context quality depends on configured provider mappings rather than missing native plumbing | P1 |
| AIRES/GStack tools | AIRES requirements framework, advisory skills, template generation | AIRES artifact modes and advisory-only `run_gstack_skill` are native | Template-generation depth can continue after core parity | P2 |
| Operator workspace | Local Operator task queue, approvals, logs, artifact creation | Native Operator queue has approvals, logs, plan artifacts, deterministic Computer Use execution, cancel, stop-all, notifications, and persistence | Longer-running supervised workers remain future connector work | P2 |
| Computer Use | Local computer tools, push-to-talk routing, task stop controls | Approval-gated deterministic local computer tools plus Operator execution and push-to-talk task routing | Longer-running supervised arbitrary desktop automation remains future connector work | P2 |
| Zoom | Meeting SDK signature route and embedded Zoom tab | Meeting detail cards open Zoom/Meet URLs through a confirmed native browser handoff, with audit trail | Embedded Meeting SDK remains web-only unless the native product later needs it | P3 |
| Presentation/playbooks | Roadmapped in web docs as source bundles, artifact graph, narrated runtime | Library artifacts can present as safe in-app slide overlays derived from canonical source | Narrated/exportable runtime should still follow web contracts | P3 |
| Notifications | PWA/service worker notification path | Swift notification bridge reports permission/status and emits approval, task, artifact, and call notifications | Remote/service-worker semantics remain web-only | P2 |
| Design system | AIRES floating canvas plus Session OS direction | Today-inspired native screen, canvas styling, token JSON, CSS token parity checks, and `docs/native-design-system.md` component inventory | Continued polish is design evolution rather than a parity blocker | P0 |
| Test and release | Node tests, Vite build, browser QA patterns | Native parser checks, broker/static UI/WKWebView/Keychain/Responses smokes, one-command release preflight, Release `.app` resource verification, local codesign verification, hardened runtime verification, release checklist, broker crash/rejection diagnostics, native Swift exception/signal diagnostics | External distribution still needs Apple team/certificate, Developer ID signing, notarization, and stapling | P1 |

## Product Strategy

The macOS app should catch up in layers:

1. Shared product model first: sessions, projects, artifacts, tools, approvals.
2. Native shell second: menus, windowing, Keychain, notifications, global push-to-talk.
3. Connector parity third: Notion, Arcade, AIRES requirements, Operator, Computer Use.
4. Specialized native advantage last: local file context, desktop automation, deep links, menu bar presence.

Avoid copying the web UI one-to-one. The target is feature and workflow parity, not visual cloning. The native app should feel like Cooper on macOS while using the same nouns and lifecycle as the web app.

## Priority Backlog

### P0: Foundation Parity

- Session OS native shell with Today, Sessions, Projects, Library, Settings, and Call destinations
- Durable local data store for sessions, transcripts, canvas cards, artifacts, jobs, projects, and settings
- Shared card/artifact model that keeps the current canonical-source renderer registry
- Project context ingestion for paste, Markdown, TXT, and PDF
- Native design token file and component inventory aligned to AIRES floating canvas (`Resources/Web/design-tokens.json`, `docs/native-design-system.md`)
- Verification checklist proving no root web app edits in this branch

### P1: Operating Parity

- Lock screen and settings for API key, broker status, connector status, and local workspace allowlist
- Realtime call modes: free-flow Start call, Ask Cooper/manual mode, wake phrase/silence policy, call metadata, and post-call save flow
- Artifact job queue and saved Library view
- Arcade/Notion authorization state and approval-gated connector execution
- Native smoke tests for broker, renderer security, WKWebView rendering, and core navigation

### P2: Capability Parity

- AIRES requirements framework tool flow
- Operator task queue with approvals, logs, generated artifacts, and cancel/stop controls
- Computer Use workspace for local desktop tasks with strong approvals
- Native notifications for job completion, approval needed, and call/session status
- Push-to-talk helper integration as a first-class native input path

### P3: Advanced Parity

- Native browser handoff for Zoom/Meet meeting links; embedded Meeting SDK remains deferred to web unless required
- Safe in-app presentation overlay for saved Library artifacts; narrated/exportable runtime follows web contracts later
- Signed distribution, auto-update plan, release channels, and continued crash/log review as native surfaces expand
- Cross-device sync strategy if the web app becomes remotely hosted

## Multi-Sprint Roadmap

### Sprint 0: Baseline And Guardrails

Goal: Freeze the parity target and protect the web app from accidental edits in this workstream.

Deliverables:

- This gap analysis and roadmap under the native app folder
- Native-only contribution rule documented in the macOS README
- Feature inventory spreadsheet or Markdown checklist derived from the web component list
- Read-only baseline notes for web routes, APIs, tools, and data stores

Acceptance gates:

- `git diff --name-only` for sprint work only includes `native/realtime-desktop-agent/**`
- Native docs identify every P0/P1 web capability that is absent from macOS
- `/api/manifest` lists native capabilities, protected routes, tool metadata, connector requirements, and security posture for parity drift checks
- `docs/web-reference-snapshot.md` records the current web route/tool/runtime surface used for native drift review
- Any requested web-app contract change is captured as a dependency, not implemented here

### Sprint 1: Native Session OS Shell

Goal: Give the macOS app the same top-level nouns as the web app.

Deliverables:

- Native route/state model for Today, Sessions, Projects, Library, Settings, and Call
- Topbar/sidebar design that follows AIRES Session OS language without copying the browser layout exactly
- Today home remains first screen and keeps a Start call button for free-flow sessions
- Detail pages link into sessions, projects, and calls
- Empty states for future Sessions, Projects, Library, and Settings views

Acceptance gates:

- App launches to Today
- Start call remains available from Today
- All top-level destinations are reachable without breaking the current call flow
- No connector or persistence work is hidden inside the shell implementation

### Sprint 2: Native Data Store And Session Model

Goal: Persist the core objects that make Cooper feel continuous.

Deliverables:

- Local data store for sessions, transcript turns, canvas cards, artifacts, jobs, projects, and settings
- Migration-safe schema versioning
- Import/export debug action for local JSON
- Saved Sessions view with search and detail drill-in
- Call end flow that writes a session record

Acceptance gates:

- Ended calls survive app relaunch
- Transcript and canvas cards are restored for a saved session
- Store schema is documented and does not depend on root web server files
- Corrupt store fallback does not prevent the app from starting

### Sprint 3: Projects And Context Ingestion

Goal: Bring the web app's project context model to macOS.

Deliverables:

- Projects view with project cards, descriptions, tags, and last activity
- Source ingestion for paste, Markdown, TXT, and PDF
- Local source library per project
- Context packet builder for Realtime calls
- Call start can attach selected project context

Acceptance gates:

- A project can be created, populated, searched, and attached to a call
- PDF and text sources have visible extraction status
- Realtime session instructions include the selected project packet
- File access remains allowlisted and visible in Settings

### Sprint 4: Canvas And Artifact Parity

Goal: Turn the current renderer foundation into the same durable work surface as the web app.

Deliverables:

- Artifact model for Markdown, sanitized HTML, Mermaid, MCP App JSON, and AIRES requirements
- Library view for saved artifacts
- Artifact detail view with safe preview and source/fallback tabs
- Job queue for post-call and canvas-triggered artifact generation, including Responses-backed attempts with local fallback
- Canvas tabs for Preview, Build, Context, Templates, and Activity where they make sense natively

Acceptance gates:

- A call can generate and save at least one Markdown artifact and one HTML artifact
- HTML preview blocks scripts, unsafe URLs, inline event handlers, and disallowed embeds
- Mermaid failures fall back to text with a visible error
- Artifacts can be reopened after app relaunch

### Sprint 5: Realtime Behavior And Post-Call Workflow

Goal: Match the web app's call lifecycle, not just its call connection.

Deliverables:

- Free-flow Start call button remains primary on Today
- Ask Cooper/manual mode and silence-by-default policy
- Wake phrase handling if it remains part of the web product contract
- Call status, elapsed time, approximate cost, and active project context display
- Post-call save, summarize, generate artifact, and open Library actions

Acceptance gates:

- User can choose free-flow or manual call mode before joining
- Post-call flow creates a saved session with transcript and suggested next actions
- Call controls remain responsive across mute, interrupt, reconnect failure, and end states
- Failed Realtime session creation gives a useful local error

### Sprint 6: Settings, Secrets, And Connector Auth

Goal: Make macOS safe and inspectable as a local agent shell.

Deliverables:

- Settings view for OpenAI key status, broker status, model settings, local workspace allowlist, and connector status
- Keychain write/update/delete path
- Arcade and Notion authorization status screens, including Arcade discovery, mapped tool pre-authorization, status checks, and non-secret authorization persistence
- Tool approval log and local audit trail
- Environment diagnostics export

Acceptance gates:

- API key can be managed without editing shell profile files
- Missing or invalid key is visible before starting a call
- Connector tools cannot run before authorization and approval gates pass
- Settings changes persist across relaunch

### Sprint 7: External Data And AIRES Tools

Goal: Add the high-value web tools that make Cooper useful beyond local files.

Deliverables:

- Notion search and fetch, through Arcade where authorized or direct Notion fallback where configured
- AIRES requirements framework flows for list, explain, workshop, interview, and queue artifact modes
- GStack advisory tool integration through bundled adapted prompts and the advisory-only native broker runner
- Tool result cards that use the unified renderer registry
- Connector errors shown as recoverable canvas/activity events

Acceptance gates:

- Notion search/fetch can add context to a session
- AIRES requirements output can create a durable artifact
- Tool calls are recorded with inputs, approvals, result summaries, and errors
- No unsafe connector output can execute in a card or artifact preview

### Sprint 8: Operator, Computer Use, And Push-To-Talk

Goal: Bring in the desktop-agent capabilities after the core product model is stable.

Deliverables:

- Operator workspace with task queue, approvals, logs, artifacts, cancel, and stop all
- Computer Use workspace for local desktop automation with explicit user approval
- Push-to-talk helper integration through the native broker with token/unlock gating, transcription, Operator/Computer Use queueing, and stop-command routing
- Native notifications for approval needed, task complete, and task failed
- Hard stop path that terminates active local automation

Acceptance gates:

- Automation cannot begin without visible approval
- Active Operator/Computer Use tasks can be stopped from the app and push-to-talk helper
- Logs and artifacts persist to the native session store
- The app communicates clearly when a task is queued, running, blocked, stopped, failed, or complete

### Sprint 9: Zoom, Presentation Runtime, And Release Hardening

Goal: Finish parity edges and make the app shippable.

Deliverables:

- Confirmed/audited native browser handoff for Zoom/Meet meeting links
- Safe Library artifact presentation reader; narrated/exportable playbooks after web source bundle contracts stabilize
- Native notification permissions and fallback UI
- Xcode signing profile, packaging plan, and release checklist
- Broker crash/rejection capture, Swift exception/signal capture, Swift host logs, and user-safe diagnostics
- Native UI smoke test suite and broker security regression tests

Acceptance gates:

- Release build can be produced from Xcode without manual resource fixes, and `scripts/release-preflight.mjs` verifies the built `.app` resources, hardened runtime metadata, and local codesign validity
- Broker and renderer security tests run in CI or a documented local script
- Native app can be installed, launched, connected, used for a call, and relaunched with state intact
- Known parity exceptions are documented with owners and target sprints

## Design System Update Plan

The macOS app should carry the AIRES design system as native tokens and components:

- Token source: color, type, spacing, radius, border, focus, and elevation values documented in native docs
- Token contract: `Resources/Web/design-tokens.json` mirrors the CSS custom properties in `Resources/Web/styles.css`
- Components: AppShell, Topbar, SessionSidebar, SegmentedFilter, TodayRow, TaskRow, MeetingRow, DetailHeader, CallControls, TranscriptTurn, CanvasCard, RenderModeMenu, ArtifactPreview, SettingsRow, ApprovalRow
- Interaction patterns: icon buttons for compact actions, segmented controls for filters, menus for render modes, toggles for binary settings, sliders/inputs for numeric settings
- Card model: keep one card per source payload, allow render mode selection per card, persist selected mode, and reset to default
- Security: all HTML and embed renderers stay deny-by-default with explicit allowlists

The visual target is not a marketing page. It should feel like a focused, native executive workspace: quiet, readable, fast to scan, and strongly organized around active work.

## Technical Architecture Direction

Recommended native layers:

- Swift host: windowing, menus, Keychain, notifications, file permissions, process lifecycle
- Local broker: OpenAI Realtime calls, connector calls, local tool execution, event stream
- Web front end: rapid UI iteration inside WKWebView, canvas/artifact renderers, session views
- Local store: versioned JSON or SQLite, with a stable schema that can later sync to web
- Renderer registry: extensible map of render modes so new modes do not change the card model
- Tool registry and `/api/manifest`: explicit metadata for tool name, approval need, connector need, risk level, result renderer, route auth, and native capability status

Do not bind the macOS app directly to root web implementation files. Prefer shared contracts, copied snapshots, generated schema files, or API boundaries when parity requires reuse.

## Security Requirements

Minimum security rules for the macOS parity effort:

- API keys live in Keychain, not in source files or browser storage
- Local file tools only operate inside allowlisted roots
- HTML rendering strips scripts, event handlers, unsafe URLs, forms, and active embeds
- Embeds use a strict host allowlist and iframe sandboxing
- Connector writes require explicit approval
- Computer Use and Operator actions require visible approval plus a stop path
- Every tool execution records a local audit event
- Renderer failure falls back to text rather than a blank or unsafe view

## Verification Contract

Each sprint should end with:

- Native-only diff check: no web app source edits
- Broker syntax check for `Resources/Broker/server.mjs`
- Web resource smoke check for `Resources/Web/app.js`
- Xcode build or documented reason it could not run
- Manual launch smoke: Today loads, Start call is visible, Settings can show broker/key status, existing call flow still works
- Security smoke: script HTML is stripped, unsafe URL is blocked, failed Mermaid renders as text with an error
- Roadmap update: completed parity items checked off, new gaps added explicitly

Suggested commands:

```sh
git diff --name-only
node --check native/realtime-desktop-agent/Resources/Broker/server.mjs
node --check native/realtime-desktop-agent/Resources/Web/app.js
node native/realtime-desktop-agent/scripts/release-preflight.mjs
xcodebuild -project native/realtime-desktop-agent/RealtimeDesktopAgent.xcodeproj -scheme RealtimeDesktopAgent -configuration Debug build
```

## Open Decisions

- Should macOS persist data in JSON first for speed, or move directly to SQLite?
- Should connector auth remain native broker-first, or share authorization records with the web app when both shells are running?
- Should Zoom be implemented as embedded web, native browser handoff, or delayed until the web source stabilizes?
- Should Operator and Computer Use run fully local on macOS, or call into the web server when available?
- Which artifact schema should become the canonical cross-platform contract?

## Immediate Next Step

Start Sprint 0 by adding a feature checklist under `native/realtime-desktop-agent/docs/` and linking this roadmap from the native README. Then Sprint 1 can implement the Session OS shell without touching the root web app.
