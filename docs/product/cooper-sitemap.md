# Cooper Site Map

## 1. Route Model

Cooper currently behaves as a single-page React app. There are not separate browser routes for each page. Navigation is driven by local state:

- `workspace`: `cooper`, `operator`, or `computer`
- `view`: `home`, `projects`, `calls`, `work`, or `settings`
- `callActive`: switches into full-screen live call mode

## 2. Application Tree

```text
/
├── Lock screen
│   └── Password form
├── Workspace chooser
│   ├── Cooper
│   ├── Operator
│   └── Computer Use
├── Cooper workspace
│   ├── Home
│   │   ├── New call action
│   │   ├── Recent calls
│   │   ├── Operating context
│   │   └── Generated artifacts
│   ├── Projects
│   │   ├── Project list
│   │   ├── Create project
│   │   ├── Paste context
│   │   ├── Upload Markdown/Text/PDF
│   │   └── Start call with project
│   ├── Calls
│   │   ├── Call list
│   │   ├── Call detail
│   │   ├── Transcript
│   │   ├── Call artifacts
│   │   ├── Summary/notes placeholders
│   │   └── Generate follow-up work
│   ├── Work
│   │   ├── Artifact list
│   │   ├── Artifact tabs
│   │   ├── Rendered read view
│   │   ├── Markdown/HTML/source view
│   │   ├── HTML prototype preview
│   │   ├── MCP app preview
│   │   └── Copy/open actions
│   ├── Settings
│   │   ├── Arcade status
│   │   ├── Tool authorization
│   │   ├── Push-to-talk config
│   │   ├── MCP/Notion status
│   │   └── Recent tool calls
│   └── Live call mode
│       ├── Left call rail
│       │   ├── Back
│       │   ├── Status
│       │   ├── Waveform
│       │   ├── Join/Wake/End
│       │   ├── Typed Ask Cooper prompt
│       │   └── Live transcript
│       └── Right canvas
│           ├── Preview
│           ├── Build
│           ├── Context
│           ├── Templates
│           └── Activity
├── Operator workspace
│   ├── Voice orchestrator rail
│   │   ├── Start/stop call
│   │   ├── Stop all active work
│   │   ├── Current task selector
│   │   ├── Text prompt
│   │   └── Message list
│   ├── Approval popover
│   └── Work surface
│       ├── Watch
│       ├── Command
│       ├── Task
│       ├── Activity
│       └── Artifacts
└── Computer Use workspace
    ├── Computer Use voice rail
    │   ├── Start/stop call
    │   ├── Current task selector
    │   ├── Text prompt
    │   └── Message list
    └── Work surface
        ├── Watch
        ├── Command
        │   ├── Open Spotify
        │   ├── Open Claude Code
        │   ├── Open browser
        │   └── Download file
        ├── Task
        ├── Activity
        └── Artifacts
```

## 3. API Map

```text
/api/auth/session
/api/auth/login
/api/auth/logout
/session
/api/state
/api/events
/api/calls
/api/calls/:id
/api/calls/:id/transcript
/api/calls/:id/end
/api/calls/:id/artifacts
/api/artifacts/:id/content
/api/jobs/:id/retry
/api/projects
/api/projects/:id/context
/api/projects/:id/sources
/api/projects/:id/uploads
/api/aires/examples
/api/aires/examples/:id
/api/tools/arcade/status
/api/tools/arcade/authorize
/api/tools/arcade/authorize-all
/api/tools/arcade/check
/api/tools/execute
/api/operator/state
/api/operator/tasks
/api/operator/tasks/:id/approve
/api/operator/tasks/:id/cancel
/api/operator/stop-all
/api/computer-use/tool-log
/api/computer-use/tool
/api/push-to-talk/config
/api/push-to-talk/utterance
```

## 4. Primary Data Areas

```text
data/cooper.json
├── calls
├── projects
├── artifacts
├── jobs
├── toolCalls
├── gstackRuns
├── arcadeAuthorizations
└── operatorTasks

data/artifacts/
└── generated Markdown, HTML, JSON/MCP app artifacts
```

## 5. External Integration Map

```text
OpenAI
├── Realtime API /v1/realtime/calls
├── Responses API
├── Transcription model
└── Vision model for click targeting

Arcade
├── Tool authorization
├── MCP gateway
└── External tool execution

Notion
├── Arcade Notion tools when mapped
└── Direct read-only fallback when NOTION_API_KEY is configured

macOS
├── Push-to-talk native helper
├── Chrome/Safari automation
├── Finder
├── Terminal
└── Allowed local apps
```

