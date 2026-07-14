# Cooper iOS Parity Roadmap

Status: active implementation plan<br>
Baseline date: 2026-07-14

## Repository Context

The iOS workstream is based on three distinct local states. They must remain separate while parity work continues:

1. Committed `main` at `2540c06` is the shared baseline.
2. The checked-out `main` worktree contains a large uncommitted Session OS expansion. It is the most complete product reference: Today, Calendar and Notion aggregation, Arcade authorization, session resume, context checkpoints, daily brief, and the completed macOS parity implementation.
3. The clean detached worktree at `.claude/worktrees/nifty-yalow-783daa` points to `a39d775`. It adds the `chat-with-plan` skill, a loopback/token-protected plan-ingest endpoint, and a call deep link. Its changes overlap `server.js` and `src/main.jsx` with the uncommitted Session OS work and therefore require a manual contract-level reconciliation later.

The iOS app must not copy either browser UI or the macOS WKWebView shell. It is a native SwiftUI client of the existing Cooper server contracts and should preserve the same nouns and lifecycle.

## Product Contract

- A Session is the durable center of the product.
- Today combines Calendar meetings, active Notion sprint work, projects, and resumable sessions.
- Arcade owns provider discovery, OAuth connection state, and mapped tool authorization.
- The iOS app stores no provider API keys. It communicates with a user-configured Cooper host over authenticated HTTP and follows authorization URLs in the system browser.
- iOS presentation is native and adaptive; data and workflow parity matter more than pixel-level cloning.
- Server writes continue to use the existing approval and authorization gates.

## Milestone 0 — Context and Foundation

Deliverables:

- Worktree comparison and parity contract.
- Independent `native/ios-app` Xcode project.
- SwiftUI app shell with per-tab navigation and injected app model.
- Configurable Cooper host, cookie-backed login, loading, error, and preview states.
- Simulator build-and-run verification.

Acceptance:

- No existing web or macOS source is modified to scaffold iOS.
- The app launches on the current iPhone simulator without compiler errors.
- Preview data is enabled only by the explicit `--preview-data` launch argument.

## Milestone 1 — Connected Today, Arcade, Notion, and Sessions

Deliverables:

- Authenticated `/api/today` client.
- Google Calendar meetings and source health.
- Notion sprint tasks and source health.
- Saved `/api/calls` session list and transcript detail.
- `/api/tools/arcade/status` and `/api/tools/arcade/discovery` surfaces.
- Provider connection and mapped-tool authorization handoff to the system browser.

Acceptance:

- A signed-in user can refresh Today and see independent Calendar/Notion failures without losing saved sessions.
- Sessions render from persisted server records and expose transcript detail.
- Notion and Google Calendar connection state is visible, and a valid Arcade authorization URL opens outside the app.
- Missing host, password, provider configuration, or authorization produces actionable UI.

## Milestone 2 — Live Voice Sessions

Deliverables:

- Native microphone and playback audio session.
- WebRTC/OpenAI Realtime connection through the existing `/session` broker contract.
- Free-flow, Ask Cooper, and wake/silence modes.
- Live transcript, mute, interrupt, elapsed time, cost, reconnect, and end flow.
- Persisted session creation, transcript append, end, and resume packet support.

Acceptance:

- A call can start, survive interruption/reconnect handling, end, and reappear in Sessions.
- Manual/wake modes never create an automatic response without the corresponding user action.
- Audio permissions and failures are recoverable and clearly explained.

## Milestone 3 — Context Checkpoint and Projects

Deliverables:

- Meeting/task/session start checkpoint.
- Notion primary-source locking and explicit supporting sources.
- Project browsing, creation, paste, Markdown/text/PDF ingestion, and active context.
- Session continuation from the server resume packet.

Acceptance:

- The evidence packet shown before a call matches the packet sent to Realtime.
- A selected Notion task remains the primary source; related context is explicit.
- Project context can be created on iOS and reused by web/macOS clients.

## Milestone 4 — Canvas and Library

Deliverables:

- Native card stream for text, tables, Mermaid fallback, sanitized HTML, and approved external content.
- Durable Library browsing and artifact reader.
- Build, Context, Templates, and Activity session surfaces where they fit iOS.
- Safe sharing and handoff actions.

Acceptance:

- Existing session artifacts open safely on iPhone and iPad.
- Unsafe HTML, URLs, scripts, or embeds never execute outside the established allowlists.

## Milestone 5 — Document and Artifact Generation

Deliverables:

- Post-session and custom artifact recipes.
- Job progress, retry, completion notifications, and document previews.
- AIRES requirements, Markdown, HTML, Mermaid, and presentation outputs.

Acceptance:

- Generated documents use the shared server job model rather than an iOS-only fork.
- Jobs remain observable after app suspension or relaunch.

## Milestone 6 — Operator, Computer Use, and Distribution

Deliverables:

- Approval queue and task observation for Operator and Computer Use.
- Push notifications and deep links into sessions, approvals, and completed artifacts.
- iPad adaptation, accessibility, performance, offline/cache policy, privacy review, signing, and release automation.
- Reconciliation of the detached `chat-with-plan` deep-link contract with the current Session OS APIs.

Acceptance:

- Remote or desktop-affecting actions preserve visible approval and audit behavior.
- Release builds pass simulator/device tests and have an explicit App Store/privacy posture.

## Current Implementation Boundary

Milestones 0 and the initial vertical slice of Milestone 1 are implemented under `native/ios-app`. Live voice, context creation, document generation, and mutation-heavy agent workflows remain intentionally outside the first slice.
