# Cooper Page and Component Inventory

## 1. App Shell Components

| Component | Source | Purpose |
| --- | --- | --- |
| `App` | `src/main.jsx` | Top-level state, auth, workspace routing, Realtime connections, API calls, SSE, and view selection. |
| `Splash` | `src/main.jsx` | Workspace chooser and initial entry experience. |
| `LockScreen` | `src/main.jsx` | Password entry and authentication error state. |
| Topbar/nav markup | `src/main.jsx` | Cooper workspace navigation across Home, Projects, Calls, Work, Operator, Computer Use, and Settings. |
| `Metric` | `src/main.jsx` | Compact metric cell used in multiple pages. |
| Status helpers | `src/main.jsx` | Status labels, class names, date/time formatting, and display helpers. |

## 2. Cooper Workspace Pages

### Home

| Component | Purpose | Key UI |
| --- | --- | --- |
| `HomeView` | Minimal command center for recent calls, context, and work. | Hero, New call, Projects, Notify me, recent calls, operating context, generated artifacts. |
| `CallRow` | Recent call row. | Title, date, duration, turn count. |
| `JobList` | Work/job summaries where visible. | Status, progress, retry, artifact open. |
| `ActivityStream` | Background work activity. | Time-stamped job logs. |

### Projects

| Component | Purpose | Key UI |
| --- | --- | --- |
| `ProjectsView` | Create/select project and ingest context. | Project rail, create form, paste context, upload file, source cards, start call. |
| Project source cards | Inline in `ProjectsView` | Show source title, type, preview, stored char count, truncation status. |

### Calls

| Component | Purpose | Key UI |
| --- | --- | --- |
| `LibraryView` | Past call browser and call detail. | Call rail, status/date/title, summary, cost/usage, transcript, artifacts, suggestions. |
| `CallLibraryRow` | Call list item. | Status, title, date/duration, artifact/job count. |
| Transcript rows | Inline in `LibraryView` | Speaker, time, transcript text. |
| `ArtifactMiniList` | Compact call artifact list. | Artifact links and retryable jobs. |

### Work

| Component | Purpose | Key UI |
| --- | --- | --- |
| `ArtifactView` | Artifact library and preview/editor surface. | Artifact rail, open tabs, toolbar, rendered document, inspector/queue where enabled. |
| `ArtifactDocument` | Dispatches to Markdown, HTML, or MCP app renderers. | Type-specific rendering. |
| `MarkdownArtifactDocument` | Read/Markdown view for Markdown artifacts. | Rendered read tab, Markdown source tab, copy button, Mermaid rendering. |
| `HtmlPrototypeDocument` | Preview/HTML view for standalone HTML artifacts. | Sandboxed iframe, mobile/desktop toggle, copy HTML. |
| `McpAppDocument` | MCP app artifact renderer. | App iframe, metadata tab, AG-UI event history. |

### Settings

| Component | Purpose | Key UI |
| --- | --- | --- |
| `SettingsView` | External tool and runtime configuration visibility. | Arcade tools, authorize/check actions, recent tool calls, push-to-talk config. |
| Arcade tool rows | Inline in `SettingsView` | Mapping, status, authorization action. |
| Tool call rows | Inline in `SettingsView` | Tool audit trail. |

## 3. Live Call Components

| Component | Purpose | Key UI |
| --- | --- | --- |
| `CallScreen` | Full-screen active call layout. | Left voice rail, waveform, call controls, typed prompt, live transcript, right canvas. |
| `SoundWave` | Visual listening/speaking indicator. | Animated waveform bars. |
| `CallCanvas` | Live visual collaboration surface. | Preview, Build, Context, Templates, Activity tabs. |
| Canvas Preview | Inline in `CallCanvas` | Selected artifact preview or empty state with quick actions. |
| Canvas Build | Inline in `CallCanvas` | Artifact type selection and prompt textarea. |
| Canvas Context | Inline in `CallCanvas` | Paste/upload context during call. |
| Canvas Templates | Inline in `CallCanvas` | AIRES template list, preview iframe, present/generate buttons. |
| Canvas Activity | Inline in `CallCanvas` | Call-linked jobs and activity. |

## 4. Operator Workspace Components

| Component | Purpose | Key UI |
| --- | --- | --- |
| `OperatorWorkspace` | Main Operator and Computer Use workspace shell. | Voice rail, approval popover, work surface tabs. |
| `OperatorOrchestratorPanel` | Voice orchestrator control panel. | Start/stop call, stop all, current task selector, prompt, message list. |
| `OperatorTaskDetail` | Selected task details and approvals. | Goal, progress, step list, approval actions, cancel. |
| `OperatorRunPreview` | Replayable worker/browser viewport. | Viewport iframe, task preview, result cards, generated artifact links. |
| `OperatorActivityPanel` | Task execution log. | Log rows and session events. |
| `OperatorArtifactPanel` | Task artifacts and generated linked work. | Artifact cards, job cards, source summaries. |
| `operatorViewportDocument` | Builds the replayable iframe document for Watch. | Browser/Codex/computer/artifact style mini viewport. |

## 5. Computer Use Specific Components

Computer Use reuses `OperatorWorkspace` with `variant="computer"` and a filtered set of task presets.

| Component/Area | Purpose | Key UI |
| --- | --- | --- |
| Computer Use voice rail | Voice control for local apps/browser. | Start Computer Use call, task selector, typed Ask field. |
| Computer quick starts | Fast manual commands. | Open Spotify, Open Claude Code, Open browser, Download file. |
| Computer Use Watch tab | Observe selected task or local control output. | Replayable worker viewport. |
| Computer Use Command tab | Start supervised desktop/browser control. | Control lane, target URL, allowed domains, objective. |

## 6. Backend Modules and Responsibilities

| Module | Purpose |
| --- | --- |
| `server.js` | Express server, auth, Realtime session relay, state API, calls, projects, jobs, tools, SSE, artifact generation. |
| `cooperTools.js` | Realtime function tool schemas for Cooper, Operator, and Computer Use. |
| `cooperPrompt.js` | Cooper voice instructions and behavior. |
| `server/operatorRuntime.js` | Operator task creation, hydration, runtime state, presets, approval/cancel/stop behavior. |
| `server/localComputerTools.js` | Deterministic local app/browser/search/vision-click tools. |
| `server/pushToTalk.js` | Push-to-talk command classification and routing. |
| `src/wakeWords.js` | Cooper wake phrase logic. |
| `src/canvasPrompt.js` | Canvas prompt construction and context priority. |
| `src/callCost.js` | Realtime/artifact usage and cost summary helpers. |
| `src/computerUseTasks.js` | Computer Use task input mapping and detection. |
| `src/jobDisplay.js` | Job status/progress display helpers. |

## 7. Realtime Tool Categories

| Category | Tools |
| --- | --- |
| Core Cooper | `check_calendar`, `create_canvas_artifact`, `render_mcp_app`, `run_aires_requirements_framework` |
| Context and retrieval | `search_workspace_context`, `get_customer_context`, `inspect_engineering_context`, `search_notion_workspace`, `fetch_notion_page` |
| Actions | `create_followup_action` |
| Advisory | GStack-style review/spec/QA/advisory tools |
| Operator | `start_operator_task`, `get_operator_task_status`, `approve_operator_task`, `cancel_operator_task`, `stop_operator_tasks` |
| Computer Use | `open_chrome_tab`, `search_web`, `click_link_with_vision`, `open_local_app`, `open_web_app`, `open_finder_location`, `open_terminal_workspace`, `start_computer_use_task`, `get_computer_use_status`, `cancel_computer_use_task`, `stop_computer_use_tasks` |

## 8. Design System Notes

| Principle | Implementation Direction |
| --- | --- |
| Minimal floating surfaces | Avoid boxed dashboards inside boxed dashboards. Use sparse cards and open space. |
| Work-first layout | Prioritize transcript, generated document, preview canvas, and active task output. |
| Light mode default | Main app, call UI, Operator, and Computer Use should feel visually related. |
| Volt accent | Use for primary active states and one highlighted action per surface. |
| Reduced chrome | Hide secondary implementation metrics unless the user needs them. |
| Mobile usefulness | Call and canvas views must collapse without horizontal overflow. |

