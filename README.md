# Cooper

Cooper is a local React + Express progressive web app with a native SwiftUI iOS client for an AIRES executive session assistant. It uses OpenAI Realtime 2 over WebRTC for live meeting audio and streamed OpenAI Responses for microphone-independent session chat and generated work.

## Setup

```bash
npm install
cp .env.example .env
```

Add your OpenAI API key and a long private app password to `.env`:

```bash
OPENAI_API_KEY=sk-your-key-here
COOPER_APP_PASSWORD=use-a-long-random-password
COOPER_SESSION_SECRET=use-a-different-long-random-secret
```

Optional Arcade MCP/tool hub settings:

```bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=michael@example.com
ARCADE_MCP_GATEWAY_URL=https://api.arcade.dev/mcp/cooper-app
ARCADE_SEARCH_WORKSPACE_TOOL=YourSearchTool.QualifiedName
ARCADE_NOTION_SEARCH_TOOL=YourNotionSearchTool.QualifiedName
ARCADE_NOTION_FETCH_PAGE_TOOL=YourNotionFetchPageTool.QualifiedName
ARCADE_CUSTOMER_CONTEXT_TOOL=YourCustomerTool.QualifiedName
ARCADE_ENGINEERING_CONTEXT_TOOL=YourEngineeringTool.QualifiedName
ARCADE_CREATE_FOLLOWUP_TOOL=YourFollowupTool.QualifiedName
COOPER_ENABLE_ARCADE_WRITES=false
COOPER_MCP_APP_SERVERS={"mcpServers":{"Cooper":{"url":"https://api.arcade.dev/mcp/cooper-app"}}}
```

Arcade write tools are blocked by default. Keep `COOPER_ENABLE_ARCADE_WRITES=false` until the confirmation UI is ready.

After the app is running, open **Settings** and pre-authorize mapped Arcade tools before using them during a call. Web and native iOS support individual authorization plus an explicit authorize-all flow that keeps every provider-consent link visible. Cooper will not execute Arcade-backed voice tools until their Settings authorization status is `Connected`.

Starting a Cooper session opens a context checkpoint. Notion and GitHub picker searches run through the mapped, pre-authorized Arcade tools; past call notes, pasted text, Markdown, text, and PDF uploads are resolved server-side into one bounded packet. The packet is persisted with the call and included in both Realtime session creation and the browser `session.update`.

When a session starts from a Notion-backed Sprint task on Today, that ticket is automatically preselected as the locked primary source. Cooper resolves the current ticket properties and page blocks before entering the room; the Today summary remains supporting context rather than the source of truth. Related pages, PRs, and meeting notes remain explicit optional sources so the evidence packet does not silently crawl the workspace.

Daily Catch Up uses the same Arcade Calendar and active-sprint Notion sources as Today. It refreshes whenever the server starts, at 7:00 a.m. in the configured local timezone while the server is running, and whenever **Latest data** is pressed:

```bash
COOPER_TIME_ZONE=America/Vancouver
COOPER_DAILY_BRIEF_HOUR=7
COOPER_DAILY_BRIEF_ASSIGNEES=Michael Moll,michael@aires.ai,michael
```

The brief is persisted in `data/cooper.json`. If the local server is off at 7:00 a.m., the startup refresh prepares the current day when the server next launches.

`COOPER_MCP_APP_SERVERS` accepts either the MCP Apps shape above or an array such as `[{"type":"http","url":"http://localhost:3108/mcp","serverId":"local-mcp-apps"}]`. Cooper can render a `ui://` resource from a configured HTTP MCP server into the call canvas, or render a small inline AG-UI/MCP App preview when no resource URI is available.

Optional direct Notion read fallback:

```bash
NOTION_API_KEY=secret_your-notion-integration-token
NOTION_VERSION=2026-03-11
NOTION_SEARCH_LIMIT=5
NOTION_BLOCK_LIMIT=50
```

Direct Notion access is read-only in Cooper and only sees pages/databases shared with the Notion integration. If Arcade Notion mappings are configured, Cooper prefers Arcade so OAuth and audit behavior stay centralized.

Optional embedded Zoom meeting support:

```bash
ZOOM_SDK_KEY=your-zoom-meeting-sdk-client-id
ZOOM_SDK_SECRET=your-zoom-meeting-sdk-client-secret
ZOOM_ENABLE_HOST_ROLE=false
```

Cooper exposes the Zoom Meeting SDK for Web Component View in every session canvas. Calendar-backed Zoom sessions prefill the meeting number and passcode; any session can also accept them manually. Meetings hosted in the SDK app owner's Zoom account can use a server-generated Meeting SDK JWT for participant join. Zoom now requires a reviewed app plus ZAK or OBF user attribution for meetings hosted outside that account. Starting as host is intentionally disabled until a ZAK OAuth flow is added; keep `ZOOM_ENABLE_HOST_ROLE=false` with the current implementation.

Optional settings:

```bash
COOPER_SESSION_TTL_HOURS=168
COOPER_WORK_MODEL=gpt-5.4
COOPER_FALLBACK_WORK_MODEL=
COOPER_CHAT_MODEL=
COOPER_CHAT_MAX_OUTPUT_TOKENS=1800
COOPER_CHAT_MAX_TOOL_ROUNDS=8
COOPER_GSTACK_MODEL=gpt-5.4
COOPER_GSTACK_MAX_OUTPUT_TOKENS=2200
COOPER_GSTACK_INPUT_MAX_CHARS=32000
COOPER_GSTACK_CONTEXT_MAX_CHARS=24000
COOPER_JOB_DELAY_MS=15000
COOPER_JOB_MAX_ATTEMPTS=3
COOPER_JOB_MAX_OUTPUT_TOKENS=6500
COOPER_PROJECT_CONTEXT_CHARS=18000
COOPER_PROJECT_SOURCE_MAX_CHARS=250000
COOPER_PROJECT_UPLOAD_MAX_MB=20
COOPER_CONTEXT_PACKET_MAX_CHARS=36000
COOPER_CONTEXT_SEARCH_LIMIT=50
COOPER_INGEST_TOKEN=replace-with-a-long-random-local-token
COOPER_PLAN_INGEST_MAX_CHARS=120000
COOPER_PTT_TOKEN=replace-with-a-long-random-local-token
COOPER_PTT_MAX_AUDIO_MB=18
COOPER_PTT_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
COOPER_PTT_RESPONSE_MAX_OUTPUT_TOKENS=1200
COOPER_PTT_HOTKEY=control+option+space
COOPER_VISION_CLICK_MODEL=gpt-5.4
COOPER_COMPUTER_USE_ALLOWED_APPS=Spotify,Claude,Claude Code,Google Chrome,Safari,Slack,Notion,Finder,Terminal,Visual Studio Code,Codex
```

Optional macOS global push-to-talk:

```bash
npm run ptt:build
mkdir -p ~/.cooper
cp native/push-to-talk/push-to-talk.example.json ~/.cooper/push-to-talk.json
npm run ptt:run
```

Set the same long random `COOPER_PTT_TOKEN` in `.env` and in `~/.cooper/push-to-talk.json`. The helper uses macOS `RegisterEventHotKey`, not a global event tap, captures microphone audio only while the configured key is held, shows a top-center HUD, and posts the completed utterance to the local Cooper server after release.

## Run

```bash
npm run dev
```

Open `http://localhost:5000`.

### Chat with an implementation plan

The checked-in [`chat-with-plan`](integrations/chat-with-plan/README.md) integration can send a local Markdown plan into the same durable context-packet and session model used by web and iOS. Its endpoint is loopback-only and uses a separate bearer token; it never accepts the normal app cookie as an ingest credential.

```bash
integrations/chat-with-plan/install.sh
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs setup --voice-dir "$PWD"
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs send --plan-file /tmp/plan.md --repo Codex-voice --target both
```

The web client opens the exact imported session through `?call=<id>`. A booted iOS Simulator receives the matching `cooper://sessions/<id>` route. Resuming from either client retains the bounded original context packet even when a later checkpoint adds more evidence.

### Native iOS device readiness

The SwiftUI app exposes **Settings → Device readiness**, backed by authenticated `/api/mobile-readiness`. The response reports only safe configuration facts: OpenAI availability, public APNs status, universal-link association state, and Zoom integration boundaries. It never returns API keys, APNs private-key material, or Zoom secrets.

The checklist deliberately separates Simulator evidence from release evidence. This repository includes APNs registration/delivery plumbing, external meeting handoff, live voice transport, app-link routing, and Dynamic Type/VoiceOver semantics, but end-to-end release proof still needs an Apple Team/App ID, a provisioned physical iPhone, the deployed host's APNs `.p8` credentials, a final HTTPS associated domain in the signed entitlement, and device audio/notification testing. Native embedded Zoom remains a later product/SDK decision; iOS currently opens the decoded conference URL in the installed meeting app or browser.

### Shared document generation

`PDF brief`, `Word brief`, `PowerPoint decision deck`, and `Excel action register` are first-class shared artifact recipes. Each starts with bounded session evidence and the existing observable job/retry contract. The Cooper host renders the final binary once, stores it with exact MIME and extension metadata, and serves the same authenticated bytes to every client.

PDF opens inline on web and through Quick Look on iOS. Word, PowerPoint, and Excel are generated as editable Office Open XML (`.docx`, `.pptx`, and `.xlsx`), appear as direct authenticated web downloads, and open through native Quick Look and the share sheet on iPhone. PowerPoint uses a four-slide decision narrative; Excel opens on a formula-backed summary and includes an editable action register with frozen headers, status/priority validation, conditional state styling, source lineage, and bounded formulas. The checked-in iOS fixtures are generated by `native/ios-app/scripts/GeneratePreviewDocx.mjs` and `native/ios-app/scripts/GeneratePreviewOffice.mjs`; they are real Office packages used only for deterministic Simulator proof.

## Test

```bash
npm test
```

The test suite locks Cooper's wake phrase behavior so direct invitations and non-negated mentions wake him, while explicit suppressions such as “don't ask Cooper” remain silent on both web and native iOS.

## Planning Docs

- [Product documentation index](docs/product/README.md)
- [Product Requirements Document](docs/product/cooper-prd.md)
- [Functional Requirements Document](docs/product/cooper-frd.md)
- [Key user flows](docs/product/cooper-user-flows.md)
- [Site map](docs/product/cooper-sitemap.md)
- [Page and component inventory](docs/product/cooper-page-component-list.md)
- [Technical overview](docs/01-technical-overview.md)
- [Visual collaboration canvas plan](docs/canvas-collaboration-plan.md)
- [Operator agent factory plan](docs/06-operator-agent-factory-plan.md)
- [Cooper Operator OpenAI tool stack](docs/09-openai-tool-stack-operator-plan.md)

## What Is Included

- Splash entry and mobile-first Cooper workspace.
- Persisted Daily Catch Up built from today’s Google Calendar and Michael’s current-sprint Notion work, with startup/7 a.m./manual refresh, slide presentation, and a one-click spoken Cooper walkthrough.
- Password gate backed by `COOPER_APP_PASSWORD` and an HTTP-only signed session cookie.
- Project workspaces for sprint tickets, feature epics, agent output, PRDs, and implementation notes.
- Project context ingestion from pasted text, Markdown/text uploads, and PDF uploads.
- Token-authenticated local plan ingest with exact web, universal-link, and iOS session destinations.
- First-class typed session chat on web and native iOS, available before microphone permission and backed by the same transcript, context, recorded tools, write approvals, jobs, artifacts, and later Realtime voice handoff.
- Live call context ingestion from pasted notes or uploaded Markdown/text/PDF files, with the active Realtime session refreshed after new context is added.
- Full-screen WebRTC call mode with microphone input, model audio output, and animated waveform.
- Live collaboration canvas during calls for Mermaid diagrams, UI wireframes, HTML prototypes, running jobs, and completed visual artifacts.
- Embedded Zoom tab in the Cooper call canvas, backed by server-side Meeting SDK JWT signing so Zoom SDK secrets never ship to the browser.
- AIRES design-system treatment across the app: soft-black chrome, warm-grey canvas, sharp cards, sparse Volt accents, and document-style artifact previews.
- Server-side Realtime session endpoint using `/v1/realtime/calls` with multipart `FormData` fields named `sdp` and `session`.
- `oai-events` data channel plus a sample `check_calendar(date, time)` function tool registered through `session.update`.
- Semantic VAD is enabled with automatic responses disabled; Cooper only speaks after a Cooper wake phrase or the manual **Ask Cooper** action.
- Cooper-owned Realtime function tools for workspace search, customer context, engineering context, and follow-up actions.
- Cooper can queue live canvas artifacts with `create_canvas_artifact` while the conversation continues.
- Cooper can render MCP Apps and AG-UI-style visual surfaces with `render_mcp_app`, including sandboxed iframe app previews, `ui://` resource metadata, state snapshots, and AG-UI event history in the call canvas.
- Cooper can invoke the AIRES Requirements Framework with `run_aires_requirements_framework` to explain every framework document, workshop a selected document against provided context/drafts, interview for missing context, or queue an AIRES-branded scoped requirements artifact.
- Cooper can search and fetch Notion context with `search_notion_workspace` and `fetch_notion_page`, using Arcade when mapped/pre-authorized or direct Notion API reads when `NOTION_API_KEY` is configured.
- GStack-inspired advisory skill tool for CEO review, engineering review, code review, QA review, spec drafting, office hours, and design critique.
- Cooper Operator workspace with explicit OpenAI tool lanes for artifact generation, supervised Computer Use browser/desktop work, Codex app-server/CLI bridging, Codex MCP/Agents SDK orchestration, and OpenAI tool-stack planning.
- Optional macOS push-to-talk helper with a configurable global hotkey, native HUD, local-only idle behavior, transcription after release, and command routing into Cooper Computer Use.
- Cooper Computer Use deterministic local tools:
  - `open_chrome_tab` opens a fresh Chrome tab.
  - `search_web` opens Chrome or Safari, types the query into the address/search bar, and presses Enter.
  - `click_link_with_vision` takes a screenshot, asks a vision-capable OpenAI model to locate the described link/result/button, and clicks it.
  - `open_local_app`, `open_web_app`, `open_finder_location`, and `open_terminal_workspace` cover repeatable Mac app, Google workspace, Finder, and Terminal workflows.
- Settings page for pre-authorizing mapped Arcade tools before Cooper can use them in live calls.
- Backend Arcade router at `/api/tools/execute` that proxies pre-authorized Cooper tool calls through Arcade, logs tool activity, returns tool results into the same Realtime session, and requires confirmation for write actions.
- Backend GStack skill runner at `/api/tools/execute` that calls the OpenAI Responses API, returns structured JSON into the same Realtime session, and logs only metadata such as skill, status, timestamps, lengths, and errors.
- Saved local call library with transcripts in `data/cooper.json`.
- Transcript capture for microphone/user turns and Cooper's spoken output transcript events.
- Post-call suggestions for work: post-call kit, execution plan, PRD, HTML prototype, follow-up summary, and code sketch.
- Rate-limited server-side job loop that calls `/v1/responses` one step at a time, retries transient/rate-limit failures, and writes artifacts to `data/artifacts`.
- Five-stage document pipeline for Capture, Shape, Generate, Validate, and Publish, with source manifests, public activity events, priority ordering, restart recovery, pause/resume/cancel controls, deterministic quality scoring, and one bounded repair pass.
- First-class session document tool for hands-free PRDs, execution plans, QA checklists, architecture decision records, sprint recaps, decision logs, release briefs, executive reports, Word briefs, PowerPoint decks, and Excel action registers.
- Versioned artifact revisions preserve lineage between published versions and keep quality/source metadata visible in the Work inspector.
- HTML prototype artifacts are standalone inline HTML/CSS/JS and render in a sandboxed Work preview with Mobile and Desktop viewport toggles.
- MCP App artifacts persist as JSON-backed call artifacts and restore as sandboxed iframe canvas apps with App and Metadata tabs.
- Mermaid artifacts render as readable Markdown with live Mermaid diagrams in both Work and the call canvas.
- Shared PDF, editable Word, PowerPoint, and Excel recipes persist real binary files; web uses format-specific preview/download surfaces and iOS uses the same authenticated bytes in Quick Look and the system share sheet.
- Live execution feedback through `/api/events` plus persisted per-job activity logs.
- Browser/PWA notifications when Cooper finishes queued work, plus manual retry for failed jobs.
- PWA manifest and service worker for installable mobile/browser use.

## Notes

- `COOPER_APP_PASSWORD` is required before Cooper API routes or Realtime sessions will run.
- `ARCADE_API_KEY`, `ARCADE_USER_ID`, `ARCADE_*_TOOL` mappings, and Settings pre-authorization are required before Arcade-backed Cooper tools can execute.
- `NOTION_API_KEY` is optional for direct Notion reads; Notion pages must be explicitly shared with the integration.
- `data/` is ignored by git because it contains local transcripts and generated artifacts.
- Project source text is stored locally in `data/cooper.json`; Cooper receives a compact active-project context packet at call start.
- GStack skill prompts live in `server/gstack-skills/` and are adapted from GStack under the MIT License. They are advisory-only and cannot mutate code, deploy, create PRs, or access private repo files.
- Cooper remains silent by default during meetings. He speaks when clearly addressed by a Cooper wake phrase, when you press **Ask Cooper**, or when you submit a prompt.
- The macOS push-to-talk helper is local-first: no microphone audio is streamed or sent while idle. OpenAI transcription/Responses requests happen only after you release the configured hotkey.
- Every Computer Use tool call is printed to the local server terminal as `[cooper-tool:...]`.
- Browser typing/clicking uses macOS automation. If Chrome/Safari search or vision-click fails, enable Accessibility permission for Terminal or the built helper in System Settings.

## Docs Used

- [Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)
- [Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Responses API reference](https://platform.openai.com/docs/api-reference/responses)
- [gpt-realtime-2 model](https://developers.openai.com/api/docs/models/gpt-realtime-2)
- [Arcade custom app tool calling](https://docs.arcade.dev/en/guides/tool-calling/custom-apps)
- [Arcade authorized tool calling](https://docs.arcade.dev/en/guides/tool-calling/custom-apps/auth-tool-calling)
- [Arcade MCP gateways](https://docs.arcade.dev/en/guides/mcp-gateways)
- [Notion API search](https://developers.notion.com/reference/post-search)
- [Notion block children](https://developers.notion.com/reference/get-block-children)
- [Zoom Meeting SDK for Web](https://developers.zoom.us/docs/meeting-sdk/web/)
- [Zoom Meeting SDK authorization](https://developers.zoom.us/docs/meeting-sdk/auth/)
- [Zoom Meeting SDK Web get started](https://developers.zoom.us/docs/meeting-sdk/web/get-started/)
- [AG-UI introduction](https://docs.ag-ui.com/introduction)
- [CopilotKit MCP Apps with AG-UI](https://www.copilotkit.ai/blog/bring-mcp-apps-into-your-own-app-with-copilotkit-and-ag-ui)
