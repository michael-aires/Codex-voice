# Cooper Product Requirements Document

## 1. Overview

Cooper is a private AIRES executive workspace for realtime voice collaboration, meeting memory, artifact generation, project context ingestion, and supervised operator/computer-use work.

The product serves a CTO/CPO who spends much of the day in calls, planning sessions, product reviews, engineering discussions, and workflow design conversations. Cooper is designed to listen quietly, participate only when called on, and help turn discussion into durable work output.

## 2. Product Vision

Cooper should feel like a real executive chief-of-staff and technical collaborator:

- Ambient during meetings.
- Strategic when invited.
- Capable of grounding answers in selected project context.
- Able to generate readable work artifacts during and after calls.
- Able to supervise longer-running work through Operator and Computer Use surfaces.
- Minimal enough that the interface gets out of the way of the conversation and the work.

## 3. Problem Statement

AIRES product and engineering work creates a large amount of unstructured context: calls, sprint tickets, feature epics, agent outputs, architecture decisions, customer feedback, and generated implementation plans. The user needs a way to discuss that context by voice, preserve it, and turn it into usable artifacts without leaving the flow of the meeting.

Current tools tend to split these jobs apart:

- Meeting tools capture transcripts but do not create high-quality product artifacts.
- Chat tools can generate documents but are disconnected from the live conversation.
- Automation tools can act but are not visible or easy to supervise.
- Generated work often disappears into threads rather than becoming a usable library.

Cooper combines the meeting, context, canvas, artifact library, and supervised work queue into one private workspace.

## 4. Goals

### Primary Goals

- Let the user start a live Realtime voice session with Cooper.
- Keep Cooper silent unless invoked by name or a manual ask action.
- Capture transcript turns from both the user/room and Cooper.
- Let the user attach project context before or during a call.
- Generate documents, diagrams, wireframes, prototypes, and AIRES requirement artifacts from typed context, project context, or live transcript.
- Show running background work with progress and activity.
- Store past calls and generated artifacts for later review.
- Support a separate Operator workspace for supervised delegated work.
- Support a separate Computer Use workspace for supervised desktop/browser/app tasks.
- Keep the UI minimal, light, and focused on conversation and output.

### Secondary Goals

- Pre-authorize external tools in Settings through Arcade or direct integrations.
- Read Notion context through configured Notion access.
- Render AG-UI/MCP app style visual surfaces in a sandboxed canvas.
- Support macOS push-to-talk for cost-free idle behavior.
- Provide real call and artifact cost visibility where usage is available.

## 5. Non-Goals

- Multi-tenant enterprise administration.
- Fully autonomous production write actions.
- Hidden browser or desktop control without user-visible state.
- Replacing a full project management system.
- Replacing source control, CI, or deployment approval workflows.
- General-purpose social chatbot behavior.
- Public anonymous access.

## 6. Target Users

| User | Need |
| --- | --- |
| AIRES CTO/CPO | Run calls, think through product and engineering work, produce artifacts, supervise work. |
| Product operator | Convert messy context into PRDs, scoped requirements, workflows, and decision records. |
| Engineering lead | Discuss architecture, inspect requirements, draft implementation plans, and queue prototypes. |
| AI agent operator | Paste or upload generated agent output, then discuss and refine it with Cooper. |
| Future collaborator | Review shared call records, artifacts, and project context once collaboration is expanded. |

## 7. Core Product Concepts

### Cooper Workspace

The main meeting assistant experience. It includes Home, Projects, Calls, Work, Settings, and live call mode.

### Live Call

A Realtime WebRTC voice session where Cooper listens, transcribes, speaks when invoked, and can use tools. The live call includes a visual canvas for artifacts and templates.

### Project Context

User-provided context from pasted text, Markdown, text files, PDFs, and future Notion selections. Project context is used to ground Cooper's voice answers and generated artifacts.

### Canvas

The live collaboration surface beside the call. It can show generated artifacts, build controls, context entry, templates, and work activity.

### Artifact

A durable generated output such as a PRD, execution plan, AIRES scoped requirements document, Mermaid diagram, HTML prototype, wireframe, code sketch, or summary.

### Operator Workspace

A supervised work delegation surface where Cooper can start tasks, show activity, ask for approval, and return artifacts.

### Computer Use Workspace

A voice-controlled supervised local computer surface for opening apps, searching the web, clicking visible page elements, launching Finder/Terminal/browser flows, and starting longer-running tasks.

## 8. Scope

### In Scope

- Password-gated single-user app.
- Workspace selection: Cooper, Operator, Computer Use.
- Navigation across Home, Projects, Calls, Work, Settings.
- Live Cooper call with WebRTC audio and data channel.
- Wake-by-Cooper behavior and manual ask button.
- Transcript persistence.
- Project creation and context ingestion.
- Live call canvas with preview, build, context, templates, and activity tabs.
- AIRES HTML template library and generation flows.
- Work artifact library with rendered/HTML/Markdown views.
- Operator task list, preview, command, task, activity, and artifacts views.
- Computer Use deterministic tools and task bridge.
- Settings for Arcade, Notion/direct context status, push-to-talk, and tool auth visibility.
- PWA shell and browser notifications.

### Out of Scope Now

- Multi-user account system.
- Role-based access control.
- Full cloud-hosted persistent database.
- Realtime collaborative editing.
- Production-grade remote browser streaming.
- Direct destructive actions.
- Fully general autonomous desktop operation.
- Billing dashboard.

### Non-Goals

- Cooper should not be a generic meeting note taker.
- Cooper should not interrupt meetings.
- Cooper should not fabricate requirements or customer commitments.
- Cooper should not execute write actions without approval.
- Cooper should not make the UI more important than the work output.

## 9. Success Metrics

| Metric | Target Direction |
| --- | --- |
| Time from call end to usable artifact | Down |
| Number of generated artifacts used after meetings | Up |
| Wake success rate when user says "Cooper" | Up |
| False wake interruptions | Down |
| Time to first visible work activity after request | Down |
| Failed or stuck work jobs without feedback | Down |
| Mobile call usability | Up |
| User trust in Operator/Computer Use work | Up |

## 10. Product Requirements

### PR-1: Private Access

Cooper must require a private password before allowing access to app routes, API routes, Realtime sessions, or stored work.

### PR-2: Workspace Selection

After unlocking, the user must be able to choose between Cooper, Operator, and Computer Use experiences.

### PR-3: Minimal App Shell

The app shell must use a light, floating, low-chrome design where the content and work output are more prominent than dashboards or status furniture.

### PR-4: Live Realtime Voice

The Cooper workspace must support a browser-based Realtime voice call using microphone input, model audio output, and the `oai-events` data channel.

### PR-5: Wake-Gated Participation

Cooper must listen continuously during an active call but only speak when invoked by name, manually asked, or explicitly prompted.

### PR-6: Transcript Capture

The system must store both user/room transcript turns and Cooper transcript turns with timestamps and speaker attribution.

### PR-7: Project Context

The user must be able to create projects and ingest context from pasted text, Markdown/text uploads, PDFs, and future Notion selections.

### PR-8: Context-Grounded Generation

Generated work must prioritize typed build context, then selected project context, then live transcript context. The app must avoid silently falling back to stale unrelated project context.

### PR-9: Live Canvas

During a call, Cooper must provide a canvas where the user can preview artifacts, request builds, add context, browse templates, and monitor activity without ending the call.

### PR-10: Artifact Generation

The app must generate and persist high-quality artifacts from call/project/context sources, including requirements, PRDs, execution plans, summaries, diagrams, prototypes, and code sketches.

### PR-11: Work Library

The app must provide a library of generated artifacts with rendered read views, Markdown/HTML source views, copy actions, and previews.

### PR-12: Past Calls

The app must provide a call library where each call can be reviewed with transcript, summary, generated artifacts, and cost/tokens where available.

### PR-13: Operator Work

The Operator workspace must let Cooper start, monitor, stop, approve, and inspect supervised work tasks.

### PR-14: Computer Use

The Computer Use workspace must expose voice and deterministic local tools for opening apps, opening browsers, searching, clicking visible links, opening Finder/Terminal, and starting supervised tasks.

### PR-15: Tool Authorization

External tools must be explicitly configured and pre-authorized before Cooper can use them in live calls.

### PR-16: Activity Feedback

Longer-running jobs must show useful progress, status, logs, and completion/failure state so the user does not feel stuck.

### PR-17: Notifications

The app should notify the user when background work completes, subject to browser permission.

### PR-18: Cost Visibility

Where usage is available, the app must display real or clearly estimated token/cost information for calls and generated artifacts.

## 11. Assumptions

- The primary user is Michael/AIRES for the current product phase.
- Local JSON/file persistence is acceptable for current private/local usage.
- Production deployment can use the same app model initially, with environment variables configured in Railway.
- Future Notion and Arcade integrations will remain approval- and authorization-gated.

## 12. Open Questions

- Should production remain single-user/password-gated or move to OAuth identity?
- Which Notion database/page types should be first-class call context sources?
- What artifact set should be considered the canonical AIRES product workflow set?
- Should Cooper support shared read-only links for calls and artifacts?
- What is the acceptable risk boundary for Computer Use write actions?
- Should full transcripts be retained indefinitely or summarized after a retention window?

