# Realtime Desktop Agent

Native macOS MVP shell for a realtime voice agent. The app is intentionally split into:

- SwiftUI macOS host
- WKWebView realtime client
- Local Node token broker
- Local workspace tool runtime

The broker uses the current OpenAI Realtime GA WebRTC flow: the client posts SDP to the local broker, and the broker forwards multipart `sdp` plus `session` fields to `https://api.openai.com/v1/realtime/calls`.

## Planning

- Web parity gap analysis and long-term macOS roadmap: [`docs/macos-web-parity-roadmap.md`](docs/macos-web-parity-roadmap.md)
- Trackable parity checklist: [`docs/parity-feature-checklist.md`](docs/parity-feature-checklist.md)
- Web reference snapshot for native parity checks: [`docs/web-reference-snapshot.md`](docs/web-reference-snapshot.md)
- Native store schema: [`docs/native-store-schema.md`](docs/native-store-schema.md)
- Native AIRES design system: [`docs/native-design-system.md`](docs/native-design-system.md)
- Release checklist: [`docs/release-checklist.md`](docs/release-checklist.md)

For parity work, this native app is the editable surface. Treat the root web app as read-only reference material unless a separate web-app task explicitly asks for changes there.

## Run

1. Export an OpenAI API key in the environment that launches Xcode:

```bash
export OPENAI_API_KEY="sk-..."
open native/realtime-desktop-agent/RealtimeDesktopAgent.xcodeproj
```

2. Select the `RealtimeDesktopAgent` scheme and run on My Mac.

The app starts a local Node broker on an available `127.0.0.1` port and loads the bundled web client into WKWebView.

The broker persists saved sessions to `~/Library/Application Support/RealtimeDesktopAgent/store.json` by default. Set `REALTIME_AGENT_DATA_DIR` to use a different local data directory during development or smoke tests.

Optional overrides:

```bash
export APPROVED_WORKSPACE="/Users/michaelmoll/Documents/aires-code-repos/Codex-voice"
export REALTIME_AGENT_DATA_DIR="/tmp/realtime-desktop-agent-data"
export REALTIME_AGENT_MODEL="gpt-realtime-2"
export REALTIME_VOICE="marin"
```

## Verification

Run the dependency-free native broker smoke before handoff:

```bash
node native/realtime-desktop-agent/scripts/broker-smoke.mjs
```

The smoke starts the broker against a temporary store and checks health, diagnostics, synthetic crash report redaction, store import/export round-tripping, allowlisted file reads, blocked outside-workspace reads, Notion connector gates, Arcade status/discovery/authorization gates, Operator task persistence, and static renderer/security markers.

For a fast static UI contract check:

```bash
node native/realtime-desktop-agent/scripts/web-ui-smoke.mjs
```

For the full local release preflight:

```bash
node native/realtime-desktop-agent/scripts/release-preflight.mjs
```

That preflight runs parser checks, native smokes, Debug/Release Xcode builds, Release bundle resource checks, hardened runtime metadata verification, and local codesign verification. Set `REALTIME_AGENT_REQUIRE_DISTRIBUTION_SIGNING=1` for a distribution candidate after Apple team/certificate setup.

For an actual WKWebView render/navigation smoke with broker endpoints stubbed:

```bash
swift native/realtime-desktop-agent/scripts/wkwebview-smoke.swift
```

For a live Keychain mutation smoke against a temporary Keychain service/account:

```bash
node native/realtime-desktop-agent/scripts/keychain-smoke.mjs
```

For a live OpenAI Responses artifact smoke, set `OPENAI_API_KEY` or save the key in the app Keychain item first. The script also accepts `REALTIME_AGENT_ARTIFACT_MODEL` to test a specific artifact model:

```bash
node native/realtime-desktop-agent/scripts/responses-artifact-smoke.mjs
```

For parser checks:

```bash
node --check native/realtime-desktop-agent/Resources/Broker/server.mjs
node --check native/realtime-desktop-agent/Resources/Web/app.js
```

The broker also exposes a protected capability manifest at `/api/manifest` and a user-safe diagnostics export at `/api/diagnostics`; the Settings screen shows the manifest summary and includes an **Export diagnostics** button that downloads the same JSON without secret values.

The broker writes redacted crash and unhandled rejection reports to `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/broker-crashes.jsonl`, and `/api/diagnostics` summarizes the latest entries. The Swift host writes native exception/signal reports to `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/native-crashes.jsonl` and keeps a redacted support log at `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/latest-host.log`. Use the native header or Agent menu to copy a diagnostics summary or reveal the log in Finder.

The WKWebView client can also ask the Swift host for local macOS notifications. The current notification triggers are approval-needed Operator tasks, Operator completion/block/stop, artifact completion/failure, call-ended status, and call-start failures.

## MVP Surface

- Start/end realtime voice call
- Confirmed/audited external Zoom/Meet launch from meeting detail cards
- Free-flow, Ask Cooper, and Wake phrase call modes
- Mute/unmute
- Interrupt response
- Live transcript
- Canvas cards and tables
- Visible tool activity log
- Local file search and file reads inside one approved workspace
- Searchable saved sessions with detail drill-in, transcript/card previews, projects, artifacts, jobs, settings, and Operator tasks
- Project source ingestion for paste, Markdown, TXT, and selectable-text PDFs through native PDFKit extraction
- Library artifacts for Markdown, HTML, Mermaid, AIRES requirements, and preview-only MCP App JSON manifests
- Safe in-app presentation overlay for saved Library artifacts
- Responses-backed artifact generation path with deterministic local fallback
- Advisory-only GStack skill runner for CEO, engineering, code, QA, spec, office-hours, and design review
- Broker-backed local product lock with password verification, unlock TTL, and Settings controls
- Settings-managed OpenAI key, workspace allowlist, connector status, audit trail, and diagnostics export
- Native Arcade status/discovery/connect/authorize/check endpoints with non-secret authorization persistence and approval-gated mapped tool execution
- Protected capability manifest for native route, tool, connector, and security parity checks
- Settings store import/export for local JSON debug and backup
- Operator queue with approval, logs, plan artifacts, deterministic Computer Use execution, and stop-all
- Approval-gated deterministic Computer Use tools for browser tabs, web search, local/web apps, Finder, Terminal, and vision click
- Native host diagnostics copy/reveal actions for broker launch and failure support
- Native Swift exception/signal crash reporter writing redacted diagnostics
- Native macOS notification bridge and Settings status controls for approval, task, artifact, and call status events

## Tool Mapping

Realtime function names are API-safe. The UI and agent prompt map them to the intended namespaced tool IDs:

| MVP tool ID | Function name |
| --- | --- |
| `canvas.show_card` | `canvas_show_card` |
| `canvas.show_table` | `canvas_show_table` |
| `local.search_files` | `local_search_files` |
| `local.read_file` | `local_read_file` |
| `search_workspace_context` | `search_workspace_context` |
| `search_notion_workspace` | `search_notion_workspace` |
| `fetch_notion_page` | `fetch_notion_page` |
| `get_customer_context` | `get_customer_context` |
| `inspect_engineering_context` | `inspect_engineering_context` |
| `create_followup_action` | `create_followup_action` |
| `notion.search` | `notion_search` |
| `notion.fetch_page` | `notion_fetch_page` |
| `run_gstack_skill` | `run_gstack_skill` |
| `open_chrome_tab` | `open_chrome_tab` |
| `search_web` | `search_web` |
| `click_link_with_vision` | `click_link_with_vision` |
| `open_local_app` | `open_local_app` |
| `open_web_app` | `open_web_app` |
| `open_finder_location` | `open_finder_location` |
| `open_terminal_workspace` | `open_terminal_workspace` |
| `app.open_url` | `app_open_url` |
| `app.copy_to_clipboard` | `app_copy_to_clipboard` |

## Security Notes

- The OpenAI API key is only read by the local broker.
- The WKWebView client never receives the standard API key.
- The local product lock stores a salted scrypt hash in `lock.json`, outside the exported JSON store.
- File tools are restricted to the Settings workspace allowlist; `APPROVED_WORKSPACE` is always included.
- External URL opens require confirmation.
- Tool calls are logged visibly in the app.
- Connector tools require local authorization state and explicit approval.
- Arcade stores only authorization IDs, URLs, provider IDs, scopes, status, and timestamps. Provider tokens stay with Arcade; actual use requires `ARCADE_API_KEY`, mapped tool env vars, and the Arcade SDK in the broker runtime.
- GStack advisory tools require explicit approval and cannot mutate files, deploy, create PRs, or call external systems beyond OpenAI Responses.
- Operator and Computer Use lanes require visible approval and provide stop controls.
- Push-to-talk uploads require either the local app to be unlocked or `COOPER_PTT_TOKEN`; audio is transcribed, discarded, and converted into an approval-gated Operator task.

## Current Limits

- This is a development build and expects Node.js on the Mac.
- The WKWebView path is the MVP bridge; native WebRTC can replace it later.
- Computer Use deterministic tools can run after approval. Longer-running supervised arbitrary desktop automation remains future connector work.
- Arcade provider completion depends on external Arcade credentials, mapped tool names, and bundling or installing `@arcadeai/arcadejs` for packaged builds.
