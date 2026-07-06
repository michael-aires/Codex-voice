# Cooper Functional Requirements Document

## 1. Purpose

This FRD translates the Cooper PRD into functional requirements for engineering, QA, and design. It describes the expected behavior of the current application and the near-term system boundaries.

## 2. Functional Area Index

- FA-1 Authentication and sessions
- FA-2 Workspace selection and app shell
- FA-3 Home dashboard
- FA-4 Projects and context ingestion
- FA-5 Live Cooper call
- FA-6 Live canvas and templates
- FA-7 Calls library
- FA-8 Work artifact library
- FA-9 Artifact generation jobs
- FA-10 Operator workspace
- FA-11 Computer Use workspace
- FA-12 Settings and tool authorization
- FA-13 Notifications and PWA
- FA-14 Observability, logs, and cost

## 3. Functional Requirements

### FA-1: Authentication and Sessions

| ID | Requirement | Priority |
| --- | --- | --- |
| AUTH-1 | The app shall require a configured `COOPER_APP_PASSWORD` before protected routes can be used. | Must |
| AUTH-2 | The app shall expose a password login screen for unauthenticated users. | Must |
| AUTH-3 | The server shall compare submitted passwords using timing-safe comparison. | Must |
| AUTH-4 | The server shall issue an HTTP-only signed session cookie after successful login. | Must |
| AUTH-5 | The app shall expose logout and clear the session cookie and local workspace state. | Must |
| AUTH-6 | The server shall reject `/api/*` and `/session` requests without a valid session. | Must |

### FA-2: Workspace Selection and App Shell

| ID | Requirement | Priority |
| --- | --- | --- |
| SHELL-1 | The user shall choose between Cooper, Operator, and Computer Use after entering the app. | Must |
| SHELL-2 | The selected workspace shall persist in local storage. | Must |
| SHELL-3 | The app shell shall provide navigation for Home, Projects, Calls, Work, Operator, Computer Use, and Settings where applicable. | Must |
| SHELL-4 | The app shall use a minimal floating light UI with reduced dashboard chrome. | Should |
| SHELL-5 | The layout shall avoid horizontal overflow on desktop and mobile widths. | Must |

### FA-3: Home Dashboard

| ID | Requirement | Priority |
| --- | --- | --- |
| HOME-1 | Home shall show the primary action to start a new call. | Must |
| HOME-2 | Home shall show recent calls. | Must |
| HOME-3 | Home shall show operating context or recent decision signals. | Should |
| HOME-4 | Home shall show recent/generated artifacts. | Must |
| HOME-5 | Home shall avoid exposing secondary implementation metrics unless needed. | Should |

### FA-4: Projects and Context Ingestion

| ID | Requirement | Priority |
| --- | --- | --- |
| PROJECT-1 | The user shall create a project with title and optional description. | Must |
| PROJECT-2 | The user shall paste text context into a selected project. | Must |
| PROJECT-3 | The user shall upload Markdown, text, or PDF files into a selected project. | Must |
| PROJECT-4 | The server shall extract PDF text before storing project context. | Must |
| PROJECT-5 | The server shall store project sources with preview, character counts, source type, and truncation status. | Must |
| PROJECT-6 | The system shall build a compact active project context packet for calls and artifact jobs. | Must |
| PROJECT-7 | The user shall start a Cooper call from a selected project. | Must |
| PROJECT-8 | The future Notion selector shall allow selecting pages/databases as call context. | Should |

### FA-5: Live Cooper Call

| ID | Requirement | Priority |
| --- | --- | --- |
| CALL-1 | The user shall start a Realtime call from the browser. | Must |
| CALL-2 | The client shall request microphone access only when joining a call. | Must |
| CALL-3 | The client shall create an `RTCPeerConnection` and post the browser SDP to `/session`. | Must |
| CALL-4 | The server shall post the SDP to `/v1/realtime/calls` using multipart `FormData` fields named `sdp` and `session`. | Must |
| CALL-5 | The client shall play model audio output through an audio element. | Must |
| CALL-6 | The client shall open an `oai-events` data channel. | Must |
| CALL-7 | The Realtime session shall use `gpt-realtime-2`. | Must |
| CALL-8 | Cooper shall remain silent unless invoked by name or manually asked. | Must |
| CALL-9 | Cooper shall wake when the transcript includes "Cooper" in a request context. | Must |
| CALL-10 | The call UI shall include a large, readable listening/speaking state. | Should |
| CALL-11 | The user shall be able to end the call and persist duration, transcript, and usage. | Must |

### FA-6: Live Canvas and Templates

| ID | Requirement | Priority |
| --- | --- | --- |
| CANVAS-1 | The call canvas shall include Preview, Build, Context, Templates, and Activity sections. | Must |
| CANVAS-2 | The Preview section shall show the selected artifact or an empty canvas state. | Must |
| CANVAS-3 | The Build section shall generate Diagram, Wireframe, Prototype, and Requirements artifacts. | Must |
| CANVAS-4 | Typed build context shall be treated as primary source context. | Must |
| CANVAS-5 | The Context section shall allow pasted text and file upload during a call. | Must |
| CANVAS-6 | The Templates section shall list AIRES HTML templates and preview selected examples. | Must |
| CANVAS-7 | The Activity section shall show call-linked work jobs and retry options. | Must |
| CANVAS-8 | Cooper shall be able to queue canvas artifacts through Realtime tool calls. | Must |
| CANVAS-9 | Generated HTML/MCP app previews shall render in sandboxed iframes. | Must |

### FA-7: Calls Library

| ID | Requirement | Priority |
| --- | --- | --- |
| CALLS-1 | The Calls page shall list saved calls. | Must |
| CALLS-2 | Selecting a call shall show title, status, date, duration, model, artifact count, usage/tokens, and cost where available. | Must |
| CALLS-3 | The selected call shall show transcript entries with speaker attribution. | Must |
| CALLS-4 | The selected call shall show call-generated artifacts. | Must |
| CALLS-5 | The selected call shall expose artifact-generation suggestions. | Should |
| CALLS-6 | Search/filter controls may be present but should not dominate the page. | Could |

### FA-8: Work Artifact Library

| ID | Requirement | Priority |
| --- | --- | --- |
| WORK-1 | The Work page shall list generated artifacts. | Must |
| WORK-2 | Selecting an artifact shall display its rendered preview. | Must |
| WORK-3 | Markdown artifacts shall offer Read and Markdown tabs. | Must |
| WORK-4 | HTML artifacts shall offer Preview and HTML tabs. | Must |
| WORK-5 | HTML prototypes shall support mobile and desktop viewport toggles where applicable. | Must |
| WORK-6 | AIRES document artifacts shall fill the preview container width. | Must |
| WORK-7 | The user shall be able to copy source content. | Must |
| WORK-8 | The user shall be able to open artifact content directly from API route. | Should |

### FA-9: Artifact Generation Jobs

| ID | Requirement | Priority |
| --- | --- | --- |
| JOB-1 | Artifact generation shall run server-side. | Must |
| JOB-2 | The job queue shall persist queued, running, completed, and failed jobs. | Must |
| JOB-3 | Jobs shall expose progress, step index, logs, retry count, and API status. | Must |
| JOB-4 | Jobs shall use configured model, output token budget, retry limit, and delay settings. | Must |
| JOB-5 | Rate-limit and transient failures shall be retried with visible feedback. | Must |
| JOB-6 | Failed jobs shall expose manual retry. | Must |
| JOB-7 | Completed jobs shall create durable artifacts. | Must |
| JOB-8 | The app shall notify the client through SSE when state changes. | Must |

### FA-10: Operator Workspace

| ID | Requirement | Priority |
| --- | --- | --- |
| OP-1 | Operator shall provide a Realtime voice call separate from Cooper calls. | Must |
| OP-2 | Operator shall start supervised tasks from voice or manual command. | Must |
| OP-3 | Operator shall show Watch, Command, Task, Activity, and Artifacts tabs. | Must |
| OP-4 | Operator shall show a replayable worker viewport or browser/task preview. | Must |
| OP-5 | Operator shall support task approval and cancellation. | Must |
| OP-6 | Operator shall expose generated artifacts from delegated tasks. | Must |
| OP-7 | Operator shall keep the UI minimal by hiding secondary runtime/capability metrics unless needed. | Should |

### FA-11: Computer Use Workspace

| ID | Requirement | Priority |
| --- | --- | --- |
| CU-1 | Computer Use shall provide a Realtime voice call dedicated to local computer control. | Must |
| CU-2 | Computer Use shall expose deterministic local tools for opening Chrome tabs, web search, vision click, local apps, web apps, Finder, and Terminal. | Must |
| CU-3 | Computer Use shall print every tool call to the local server terminal. | Must |
| CU-4 | Computer Use shall start supervised longer-running tasks through the Operator runtime. | Must |
| CU-5 | Computer Use shall support stop/cancel/status commands. | Must |
| CU-6 | Computer Use shall enforce an allowed app list through configuration. | Should |
| CU-7 | Computer Use shall keep idle state low-cost, especially when used with push-to-talk. | Should |

### FA-12: Settings and Tool Authorization

| ID | Requirement | Priority |
| --- | --- | --- |
| SETTINGS-1 | Settings shall show Arcade configuration status. | Must |
| SETTINGS-2 | Settings shall list mapped Arcade tools and authorization status. | Must |
| SETTINGS-3 | The user shall authorize one tool or all mapped tools. | Must |
| SETTINGS-4 | The user shall check tool authorization status. | Must |
| SETTINGS-5 | Settings shall show push-to-talk helper configuration. | Should |
| SETTINGS-6 | Settings shall expose recent tool calls for audit. | Should |
| SETTINGS-7 | Write tools shall remain disabled unless the server explicitly enables them and the user confirms. | Must |

### FA-13: Notifications and PWA

| ID | Requirement | Priority |
| --- | --- | --- |
| PWA-1 | The app shall include a manifest and service worker. | Must |
| PWA-2 | The app shall be installable in supported browsers. | Should |
| PWA-3 | The app shall request notification permission only through user action. | Must |
| PWA-4 | The app shall notify when background work completes when permission is granted. | Should |

### FA-14: Observability, Logs, and Cost

| ID | Requirement | Priority |
| --- | --- | --- |
| OBS-1 | The server shall persist tool-call records. | Must |
| OBS-2 | The server shall persist job logs and API status. | Must |
| OBS-3 | The app shall expose recent events in relevant views without overwhelming the UI. | Should |
| OBS-4 | The system shall capture Realtime usage when available. | Must |
| OBS-5 | The call library shall distinguish actual usage/cost from estimated fallback values. | Must |
| OBS-6 | Computer Use tool calls shall be printed to the local terminal. | Must |

## 4. Non-Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-1 | Protected APIs must require authentication. | Must |
| NFR-2 | Stored local data must not be committed to git. | Must |
| NFR-3 | The app must be usable on mobile and desktop. | Must |
| NFR-4 | Long-running jobs must not block the UI. | Must |
| NFR-5 | Generated HTML must render in a sandboxed iframe. | Must |
| NFR-6 | The app should avoid horizontal overflow across common viewports. | Must |
| NFR-7 | UI controls should use accessible labels and semantic roles where possible. | Should |
| NFR-8 | External writes must require confirmation. | Must |
| NFR-9 | Idle push-to-talk must not stream microphone audio to the cloud. | Must |

## 5. Acceptance Criteria Samples

### Live Call

Given the user is authenticated and starts a Cooper call,
When microphone permission is granted and the Realtime SDP exchange succeeds,
Then the call enters a listening state, the waveform is visible, and the `oai-events` data channel opens.

### Wake Word

Given a Cooper call is active,
When the transcript includes a direct Cooper invocation,
Then the app sends a Realtime response request and Cooper speaks.

### Context-Grounded Artifact

Given the user enters typed context in the canvas Build tab,
When the user clicks Generate,
Then the generated artifact prompt uses the typed context as primary source context and does not silently prefer stale project context.

### Operator Approval

Given an Operator task reaches a write-risk action,
When the task requires approval,
Then the UI shows an approval gate and the task does not continue until approved or cancelled.

### Computer Use Search

Given the Computer Use voice session is active,
When the user asks Cooper to search the web,
Then Cooper calls the local search tool, the tool call is printed to the terminal, and Chrome or Safari performs the search.

