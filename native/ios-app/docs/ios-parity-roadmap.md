# Cooper iOS Parity Roadmap

Status: active implementation plan<br>
Baseline date: 2026-07-14

## Repository Context

The iOS workstream began from three distinct local states. They must remain separate while parity work continues:

1. The initial committed baseline was `main` at `2540c06`.
2. The initial checked-out `main` worktree contained a large uncommitted Session OS expansion: Today, Calendar and Notion aggregation, Arcade authorization, session resume, context checkpoints, daily brief, and the completed macOS parity implementation.
3. The clean detached worktree at `.claude/worktrees/nifty-yalow-783daa` points to `a39d775`. It adds the `chat-with-plan` skill, a loopback/token-protected plan-ingest endpoint, and a call deep link. Its changes overlap `server.js` and `src/main.jsx` with the Session OS work, so its feature contract was manually reconciled instead of merging the stale branch wholesale.

While Milestone 0 was being built, `main` advanced: `62eec95` committed the Session OS expansion and `c840ace` committed the initial iOS project, models, API client, Info.plist, and roadmap. The current comparison baseline is therefore `main`/`origin/main` at `c840ace`; the detached worktree diverges from merge base `769c639` with its plan-ingest feature.

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

Milestones 0 and 1 are implemented under `native/ios-app`, along with an initial Milestone 2 vertical slice:

- Native call creation, continuation entry points, full-screen session controls, live transcript presentation, mute, manual Ask Cooper, interrupt, and end flow.
- A headless same-origin `WKWebView` WebRTC transport that uses the existing authenticated `/session` broker without exposing provider credentials. Visible session UI remains native SwiftUI.
- Realtime transcript persistence and Arcade tool execution through the existing server authorization boundary.
- Explicit microphone usage disclosure and trusted-host media-capture permission handling.
- Native voice-chat audio-session routing, bounded automatic reconnect attempts against the existing call, and manual recovery without discarding the saved transcript.
- Server-hydrated continuation packets from `/api/calls/:id/resume`, displayed in the native session and carried through the next call record.
- Realtime and transcription usage aggregation, live token/cost telemetry, and persisted `realtimeUsage` on session end for cross-client cost continuity.

The transport choice follows OpenAI's current recommendation to use WebRTC for mobile Realtime clients and Apple's WebKit media-capture permission API. Credentialed end-to-end microphone/audio validation remains the open Milestone 2 verification gate.

An initial Milestone 3 context-checkpoint slice is also implemented:

- Every native voice entry point passes through the checkpoint instead of bypassing the evidence boundary.
- Focused Notion sprint work is inserted as a locked primary source with full-page resolution delegated to the server.
- Native Notion database/page browsing, GitHub and meeting-note search, cross-search multi-select, pasted context, Markdown/text/PDF import, intent capture, and source removal.
- Persisted `/api/context-packets` creation and `contextPacketId` propagation into call creation and Realtime.
- Saved-session continuation refresh before launch, while preserving the same context-packet review step.
- Durable Projects tab with server-backed project creation, source browsing, pasted context, Markdown/text/PDF ingestion, refresh, and project-focused session launch through the same checkpoint.

The Milestone 4 Canvas and initial Milestone 5 generation slice are now implemented on the shared server contracts:

- The context checkpoint exposes the same four prepared-session recipes as web (Shared context brief, Decision map, Requirements first pass, and QA checklist), selected by default with a deliberate enter-without-prep path.
- Preparation creates the durable call first, queues bounded `session_preparation` jobs against that call, and hands the same call into Realtime so generated work, transcript, and continuity cannot split into separate sessions.
- A native Library browses persisted artifacts and job state from `/api/state`, polls active jobs, retries failed jobs, and queues any advertised recipe from saved session memory.
- Markdown renders as native block-level headings, prose, checklists, and readable code/Mermaid fallback. HTML runs in a non-persistent `WKWebView` with JavaScript disabled, restrictive CSP, blocked external navigation/resources, and source view; MCP-app JSON remains source-only.
- Manual generation refuses transcript-empty sessions unless the user supplies an explicit prompt.
- Saved and active calls open a native Session Canvas with Presentation, Overview, Preview, Build, Templates, Context, and Activity surfaces. A fixed section menu keeps every surface reachable on compact iPhones.
- Canvas presentation slides summarize the bounded session brief, evidence coverage, open questions, and recommended flow without inventing a second persistence model.
- Build mirrors the web artifact types and context modes, queues work against the exact open call with `workstream: "canvas"`, and switches to new artifacts as shared jobs complete.
- AIRES templates load from the server catalog, render through the same script-free HTML boundary, and can seed requirements generation. Context packets and their source status remain inspectable from the call that created them.
- The checkpoint launch footer remains visible above the safe area, so a long preparation list cannot hide the prepared or direct-entry actions on compact phones.

Credentialed remote-delivery verification and mutation-heavy agent workflows remain later milestones. PDF, Word, PowerPoint, and Excel generation are now implemented through shared host recipes. Credentialed end-to-end microphone/audio validation remains the open Milestone 2 verification gate.

An initial Milestone 6 Operator and Computer Use supervision slice is now implemented:

- The compact tab bar now exposes Operator directly while More keeps Library, Connections, and Settings one navigation step away without triggering the system overflow tab.
- Native Operator state loads and polls `/api/operator/state`, preserving the server as the source of truth for runtime capability, presets, active tasks, approval counts, budgets, checkpoints, logs, generated jobs, and generated artifacts.
- iOS can configure and queue any advertised Operator recipe, including document suites, AIRES generation, Codex bridges, and supervised browser or desktop Computer Use tasks. Goal, target URL, and allowed-domain boundaries are explicit before launch.
- Pending approvals remain visibly paused and require an explicit server-confirmed approval action. Individual cancellation and destructive stop-all retain the server's audit trail and cancel outstanding approvals.
- Operator-generated jobs and artifacts reuse the existing Library readers and safe HTML/Markdown boundary rather than creating a mobile-only result format.
- Simulator preview data exercises queued, running, approval-waiting, completed, generated-artifact, cancellation, and stop-all states without granting external action authority.

This native surface supervises the existing Cooper host runner; it does not execute browser, desktop, Codex, or external-write actions locally on the phone. Credentialed device audio and APNs verification, additional Office/presentation/spreadsheet generation, broader mutation-heavy workflows, and distribution hardening remain open.

A cross-client Daily Catch Up parity slice is now implemented:

- Native Today loads the persisted `/api/daily-brief` record and refreshes through `/api/daily-brief/refresh`; it does not rebuild Calendar/Notion conclusions in a second mobile-only model.
- The Today summary exposes the saved meeting, assigned-ticket, and slide counts plus the server's explicit assignment boundary, then opens the same overview, calendar, sprint, and focus deck used by web.
- The deck preserves the server's narration and transition cues. During a voice presentation it only advances forward when Cooper's transcript reaches the matching cue, including the same stable calendar, sprint, and focus fallbacks used for older saved briefs.
- Present with Cooper passes through the standard context checkpoint. The complete persisted brief and all four slide narratives are visible as a locked primary evidence source and are stored in the resulting context packet.
- Realtime presentation waits for `session.updated` before submitting the saved `voicePrompt`, keeps that orchestration prompt out of the visible user transcript, and keeps the slide deck available beside the live Session Canvas.
- Simulator preview data exercises the summary, four-slide deck, assignment boundary, context handoff, and cue-synchronized spoken playback without requiring provider credentials.

Credentialed APNs/device verification, binding the final associated domain, credentialed device audio, additional Office/presentation/spreadsheet generation, broader mutation-heavy workflows, and distribution hardening remain open.

An actionable app-link and local-alert slice is also implemented:

- A typed `CooperRoute` contract parses and generates `cooper://` destinations for Today, Daily Catch Up, Sessions, individual sessions, Projects, Operator, exact Operator tasks and approvals, Library, exact artifacts, Connections, and Settings.
- SwiftUI owns route handoff: links select the correct compact tab, hydrate a missing server record when needed, and push the existing native detail screen instead of presenting a parallel route-only UI.
- Operator approval links preserve supervision. They open the paused task with its pending approval visible, but never approve, cancel, or perform an external action from a URL or notification tap.
- Opt-in local alerts cover newly requested Operator approvals, Operator completion/failure, and artifact-job completion/failure. Taps carry only the typed route, and no provider credentials or document content are stored in the notification payload.
- Notification baselines suppress alerts for old state on first refresh and reset when the user signs out or changes Cooper hosts. Repeated polling of unchanged state does not duplicate alerts.
- Local alerts are deliberately limited to transitions observed while the app is running and refreshing the shared host. They remain the fallback until both the iPhone registration and Cooper host APNs configuration are active.
- Simulator contract coverage validates route parsing/generation and transition deduplication. The OS recognized the custom scheme and displayed its first-use handoff prompt; clean preview-route launches exercised exact session, artifact, brief, Settings, and approval destinations.

An initial native document-delivery slice is implemented:

- The artifact content endpoint sends raw bytes rather than coercing every saved file through UTF-8, preserving future PDF, Word, PowerPoint, Excel, image, and other binary outputs.
- iOS downloads through the authenticated Cooper session, keeps bytes in an in-memory cache, and materializes a sanitized, human-readable file only inside the app's temporary sandbox when preview or export requires it.
- PDF and Office-style files open through native Quick Look in both Library detail and Session Canvas. Markdown remains native, HTML remains inside the non-persistent script-disabled reader, and MCP-app JSON remains source-only.
- The system share sheet receives the actual named file URL rather than a plain-text copy of its contents. Export files are cleared when the user signs out or switches Cooper hosts.
- Simulator evidence includes generated PDF, Word, PowerPoint, and Excel files, exact artifact app-link routes, native Quick Look rendering, real `.pdf`/`.docx`/`.pptx`/`.xlsx` share targets, and file-type inspection confirming the exported payloads remain valid binary documents.

This slice makes existing and future document files safe to deliver. The dedicated shared PDF, Word, PowerPoint, and Excel recipes described below now generate four binary formats without creating mobile-only forks.

The remote-delivery infrastructure and universal-link host contract are also implemented:

- The app asks iOS to register for remote notifications on every authenticated launch after the user opts into alerts. It forwards the current APNs token to the Cooper host but does not persist or reuse that token locally; a separate stable installation identifier lets the host replace a rotated token and remove the installation on sign-out, alert disablement, or host change.
- The authenticated host registry stores device environment and bundle metadata without exposing raw tokens through public state. Shared Operator and artifact transitions produce a bounded, durable, deduplicated push outbox with exact task, approval, artifact, and Library routes.
- The host sends compact APNs HTTP/2 alert payloads with ES256 provider-token authentication, custom Cooper routing outside the `aps` dictionary, background content availability, collapse identifiers, bounded connection time, retry state, and invalid-token removal.
- Remote receipt triggers a background shared-state refresh before reporting fetch completion. When a fully configured remote registration is active, the same state transition does not also schedule a local alert; otherwise the local foreground planner remains available.
- `cooper://` continues to work independently. The host now also exposes configuration-gated `/.well-known/apple-app-site-association` metadata and safe `/open/*` HTTPS fallback pages that map to the same typed destinations. The app accepts those universal routes only from its configured Cooper host.
- Simulator contract coverage validates registration rotation, transition deduplication, APNs payload size and routing, server persistence, background reconciliation, and HTTPS-to-app route mapping. A simulator-injected remote payload was accepted by `simctl`, but alert authorization was off and the locked Mac prevented an OS banner/tap test; that is not recorded as end-to-end APNs proof.

A native device-readiness and accessibility-hardening slice is now implemented:

- Authenticated `/api/mobile-readiness` reports only safe deployment facts: OpenAI availability, the public APNs snapshot, host association-file configuration, and the existing web/native Zoom boundary. It does not return API keys, APNs signing material, or Zoom secrets.
- Settings opens a native grouped checklist for host transport, microphone permission, physical audio proof, notification authorization, device-token registration, APNs credentials/environment, universal-link host and signed-app halves, conference handoff, embedded-meeting status, Dynamic Type, and VoiceOver evidence.
- The checklist explicitly labels Simulator-only evidence and never promotes Simulator microphone or push behavior to physical-device proof. It reads microphone permission without prompting; Cooper still requests access only when the user enters Voice.
- APNs state now keeps successful device-token registration distinct from host credential readiness. A registered installation remains registered when the host lacks its `.p8`; Settings reports `Device registered · host pending` instead of collapsing both facts into a false local-only state.
- Shared status badges, headings, and primary Today, Sessions, Projects, Operator, Library, chat, voice, Canvas, and Daily Catch Up labels now use semantic system text styles instead of fixed display sizes. The readiness rows change from side-by-side evidence/results to a vertical layout at accessibility content sizes, and named controls remain visible to the semantic UI snapshot.
- Contract tests cover the safe readiness response, the native model/client/view path, external-gate wording, token-registration distinction, Dynamic Type branching, and accessibility identifiers. Simulator validation runs the checklist at both normal and accessibility text sizes.

Live APNs delivery remains a deployment verification gate: it requires an Apple Team/App ID with Push Notifications enabled, a real `.p8` signing key on the deployed Cooper host, a correctly provisioned physical-device build, and a final HTTPS associated domain added to the signed app entitlement. The repository intentionally does not invent those external identifiers or credentials.

A cross-client live-context mutation slice is now implemented:

- The active Session Canvas Context surface can paste bounded text or import Markdown, plain text, and PDF evidence without ending the call or creating a second session.
- If the call has no project, the Cooper host creates a durable `Live Cooper context` project and attaches it to the exact call. Existing project-backed calls reuse their project. The call exposes the project title immediately across iOS, web, and saved-session state.
- New project sources rebuild only active calls' project snapshots; ended sessions retain their historical snapshot. Initial context packets remain separate from project snapshots so the Realtime context composer does not duplicate packet evidence.
- The host returns the authoritative combined project, continuation, and context-packet evidence together with a complete Realtime session configuration. iOS sends that configuration through the existing open data channel, and the web client now consumes the same endpoint rather than rebuilding an in-memory-only variant.
- Source updates refresh the local project list and Canvas immediately. The original locked context packet stays visible below the mutable project section, keeping pre-session evidence distinguishable from context added during the conversation.
- Swift model decoding, host/web/iOS contract tests, and a direct simulator preview cover project attachment, source persistence, Realtime `session.update`, paste/upload controls, compact layout, and the no-second-call boundary.

The simulator remains open on this live Context surface. Credentialed Realtime mutation still shares the broader physical-device microphone/audio gate, but the persistence, routing, and session-update path is implemented and compiled.

A native Today action-parity slice is now implemented:

- iOS preserves the Calendar conference object returned by the shared Today feed instead of dropping it during decoding. Meeting cards keep `Start with Cooper` distinct from `Join Zoom` or another provider handoff, so the app never implies that opening the context checkpoint also joined the external room.
- Calendar and Notion source URLs accept only HTTP or HTTPS before becoming native links. Zoom meeting numbers and passcodes remain inside the bounded decoded meeting record; the app does not copy them into logs or notification payloads.
- Active projects are visible in Today and can either open the exact native project or seed a new context checkpoint. Recent sessions now open the exact saved session and can resume through the existing continuation-packet workflow rather than rendering as inert summary cards.
- Exact project destinations now use the same typed `cooper://projects/:id` and `/open/projects/:id` route family as sessions, Operator tasks, and artifacts. The Projects tab owns the destination view; Today only requests navigation to the shared record.
- Embedded Zoom remains a separate integration boundary. Web can use its configured Meeting SDK panel; iOS currently hands a decoded conference URL to the installed app or browser while Cooper preserves the meeting context. A native embedded room requires the final Zoom iOS SDK product decision, credentials, signing, and device audio coexistence validation.

The updated Today surface is compiled and running in Simulator. External conference handoff cannot be completed automatically while the Mac UI is locked, so simulator proof covers rendering and route wiring rather than a live Zoom join.

A first-class cross-client PDF generation slice is now implemented:

- `PDF brief` is a shared artifact recipe available from both native and web Session Canvas Build surfaces. It uses the same call, job, retry, progress, Library, notification, and deep-link records as Markdown and HTML generation.
- The model returns bounded semantic Markdown; the Cooper host renders and stores the actual PDF bytes with `application/pdf` metadata. PDFKit runs in the existing Node worker, so the result does not depend on a visible browser, client-side print dialog, external script, or iOS-only renderer.
- The renderer produces a portrait Letter document with AIRES/Cooper hierarchy, normalized typography, bounded code and quote treatments, multi-page flow, and stable footers/page numbering. Generated files have no JavaScript, forms, encryption, or external resources.
- iOS consumes the new artifact through its existing authenticated binary endpoint, temporary-file boundary, Quick Look reader, and share sheet. Web skips text decoding for PDF bytes and embeds the same authenticated content endpoint in a PDF frame with an explicit open action.
- Contract tests cover block parsing, binary signatures, text extraction, multi-page output, recipe advertisement, persistence metadata, and binary-safe readers. Poppler rendering was inspected page by page for clipping, overlap, hierarchy, spacing, and footer correctness.

The dedicated PDF recipe is complete. Word, PowerPoint, and Excel are implemented in the following format-specific slices so each preserves its native document semantics and receives format-specific render verification.

A first-class cross-client Word generation slice is now implemented:

- `Word brief` is advertised by the same server recipe catalog and native/web Session Canvas Build controls as PDF. It reuses the exact call, job, retry, progress, Library, notification, and deep-link records instead of introducing an iOS-only document path.
- The model returns bounded semantic Markdown and the Cooper host converts it to a real editable Office Open XML package. The stored artifact uses the `.docx` extension and `application/vnd.openxmlformats-officedocument.wordprocessingml.document` MIME type, and binary files are never passed through UTF-8 writes or client text decoding.
- The Word generator follows the standard business-brief layout: Letter portrait, one-inch margins, Calibri body text, semantic Word heading styles, real numbering definitions, editable checklists, quiet AIRES/Cooper running furniture, and dynamic page fields. Quotes, code, dividers, and bounded lists remain editable Word constructs.
- Web identifies Word metadata even on extension-only records and presents an honest authenticated download surface rather than trying to iframe or parse the ZIP package. iOS downloads the identical bytes, materializes a sanitized temporary filename, opens the file in Quick Look, and exports it through the system share sheet.
- Generator tests inspect the ZIP package, document/styles/numbering/footer/core XML, binary signature, page geometry, numbered lists, checklist glyphs, and page fields. The actual `.docx` was rendered through the document QA runtime and inspected page by page; Simulator then opened the generated fixture through native Quick Look with the share action present.

The Word milestone is complete. Physical-device Office handoff remains part of the broader signed-device gate.

A first-class cross-client PowerPoint and Excel generation slice is now implemented:

- `PowerPoint decision deck` and `Excel action register` are advertised by the same server recipe catalog and native/web Session Canvas Build controls as PDF and Word. Both reuse the exact call, job, retry, progress, Library, notification, deep-link, and authenticated binary-delivery records.
- The PowerPoint generator turns bounded semantic Markdown into a real four-slide `.pptx` package with an audience-facing outcome, three-stage evidence flow, readiness checklist, and decisive next move. It uses 16:9 layout, legible presentation type, restrained AIRES/Cooper furniture, and no external assets or client-side rendering dependency.
- The Excel generator creates a real `.xlsx` workbook that opens on a formula-backed Session Summary and includes an editable Action Register. The register preserves source section lineage, inferred owner/priority only when the source provides it, real dates, frozen headers, a structured table, status and priority validation, and conditional state styling. Summary formulas use bounded ranges and recalculate from the editable register.
- Web detects extension-only or typed PowerPoint/Excel records, skips text decoding, and presents honest authenticated Office downloads. iOS downloads the identical bytes, materializes sanitized `.pptx` or `.xlsx` filenames, opens them through Quick Look, and exports them through the system share sheet.
- Package tests inspect ZIP signatures, core OOXML parts, slide count and narrative, workbook sheet order, table rows, validation, formulas, and error tokens. All four final slides were rendered and inspected individually; both workbook sheets were imported, inspected, formula-scanned, error-scanned, and rendered with the bundled artifact tooling. Overflow checks pass, formula-error matching returns zero entries, and the Simulator opened and shared both accepted native packages.

The PowerPoint and Excel milestone is complete and the Simulator remains open on the Excel Session Summary Quick Look proof. Signed physical-device handoff remains the external release gate.

The detached `chat-with-plan` contract and shared-session context lineage are now reconciled:

- The current host exposes an unauthenticated readiness probe and a separate loopback-only, bearer-token-protected plan-ingest endpoint. The normal app cookie does not authorize plan ingest, and the ingest token does not replace the app session.
- An imported Markdown plan is bounded, persisted as one primary locked context source, wrapped in the normal context-packet model, and attached to one saved call. The response returns exact web, universal-link, and `cooper://sessions/:id` destinations for that same record.
- The web shell consumes `?call=:id` after authentication, enters the Cooper workspace, and selects the exact Library session. iOS uses its existing typed session route and native session detail, where imported-plan provenance and source count are visible.
- Continuations retain a deduplicated, six-packet maximum lineage. When a later context checkpoint is selected, the host gives each retained packet a bounded share of the Realtime context budget rather than silently dropping the original plan or allowing unbounded context growth.
- Initial web Realtime configuration now comes from `/api/calls/:id/live-context`, matching iOS and the `/session` broker. Live mutations continue to refresh that same host-authored session configuration.
- The updated integration is checked in under `integrations/chat-with-plan`, defaults to this app's port 5000, and can open web, a booted iOS Simulator, or both.
- Pure contract tests cover title/size normalization, explicit loopback acceptance, primary/locked persistence, context lineage, global context bounds, host/web/iOS routing, and the integration command. An isolated live-host proof returned 401 for a bad ingest token, persisted two real context packets, created a continuation with both packet IDs, and returned Realtime instructions containing both the original plan and current checkpoint evidence.

The plan-handoff milestone is complete. Credentialed Realtime audio remains a physical-device gate, but plan persistence, exact routing, bounded continuation context, and cross-client presentation no longer depend on that credentialed audio path.

A microphone-independent shared-session chat slice is now implemented across host, web, and native iOS:

- `POST /api/calls/:id/chat` streams public Responses events over authenticated SSE. It persists Michael's typed turn before generation and Cooper's completed public reply afterward, with idempotent message IDs and one active typed response per call.
- Responses receives a bounded view of the same persisted transcript and host-authored project, continuation, and context-packet evidence used by Realtime. Tool calls route through the exact recorded Cooper executor used by voice, retaining tool audit state, Arcade authorization, write confirmation, background job, and artifact behavior.
- The current active typed transcript is included in `/api/calls/:id/live-context`. When voice joins the call later, Realtime receives those public turns and the native/web transcript is seeded instead of reset or overwritten.
- Web enables its session composer before `getUserMedia`, streams Cooper text, shows live tool and approval activity, and offers voice as an optional addition. Connecting voice reuses the active call and its transcript.
- Native iOS adds Chat/Voice selection to the context checkpoint, a full-screen SwiftUI chat with a keyboard-safe bottom composer, inline tool/activity/job/artifact cards, saved-session Chat entry, Session Canvas access, and one-tap voice handoff. The chat view imports no audio or WebKit transport APIs.
- Isolated production-host evidence used a fresh temporary database and real streamed Responses turn. The model invoked `check_calendar`, the host recorded it as an executed read tool, persisted both typed turns and Responses usage, and returned a Realtime configuration containing both turns under `Current session transcript`.
- Simulator evidence used explicit preview launch arguments, sent a typed turn, received the reply, selected Add Voice, and confirmed that exact typed turn remained visible in the voice transcript. The app remains open in Simulator; physical-device credentials and live audio remain a later verification gate.

This completes the current shared session-chat parity milestone. Richer AG-UI/MCP micro-surfaces can extend the typed event protocol later without replacing the durable session, tool, or artifact contracts.

## Current-Source Parity Completion Audit

The completion audit was rerun against `main`/`origin/main` at `c840ace`, the active uncommitted implementation, the detached `a39d775` plan-ingest worktree, the Cooper PRD/FRD/site map, and the finished macOS parity checklist. The detached branch remains one unique stale feature commit while current `main` is ten commits ahead; its plan-ingest behavior is already reconciled in the active host, web, and iOS source and must not be merged wholesale.

Repository-owned native workflow parity is now present for the agreed iOS contract:

- Today, Calendar, Notion, Daily Catch Up, Projects, resumable Sessions, typed Chat, wake-gated Voice, Context Checkpoint, live context mutation, Canvas, Library, Operator/Computer Use supervision, notifications/app links, and PDF/Word/PowerPoint/Excel delivery all use shared Cooper host records.
- Native wake detection now matches the web negation boundary, so direct invitations wake Cooper while explicit phrases such as “don’t ask Cooper” remain silent. Failed transcription events return the session to listening rather than leaving it stuck in a processing state.
- Connections now supports both individual authorization and the shared `/api/tools/arcade/authorize-all` flow. Multiple provider-consent URLs stay individually visible instead of being opened or approved implicitly.
- Settings now shows the host-authored recent tool-call audit trail with risk/result state and names the current repository-versus-deployment boundary accurately.
- The focused native contracts, executable Swift model smoke, complete JavaScript suite, production web build, Xcode Simulator build, semantic UI checks, and current Simulator screenshots are the repository verification boundary.

The remaining items are not hidden implementation claims: physical-device microphone/audio proof, live APNs delivery, final signed associated-domain entitlement, Developer/App Store distribution setup, and a product decision plus credentials for a native embedded Zoom SDK. Calendar conference URLs already use the safe external iOS handoff. Operator and Computer Use execution intentionally remains on the supervised Cooper host; the phone observes, starts, approves, cancels, and inspects that work rather than trying to execute macOS/browser control locally.

References:

- [OpenAI Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Apple WebKit media-capture permission API](https://developer.apple.com/documentation/webkit/wkuidelegate/webview%28_%3Arequestmediacapturepermissionfor%3Ainitiatedbyframe%3Atype%3Adecisionhandler%3A%29)
- [Apple: Register your app with APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)
- [Apple: Set up a remote notification server](https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server)
- [Apple: Generate a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification)
- [Apple: Establish a token-based APNs connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
- [Apple: Push background updates](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)
- [PDFKit: Getting Started](https://pdfkit.org/docs/getting_started.html)
