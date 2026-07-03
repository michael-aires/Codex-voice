# Cooper Operator OpenAI Tool Stack

This note defines how Cooper should use more OpenAI tools without blurring product boundaries.

## Source Guidance

- OpenAI Computer Use guide: `https://developers.openai.com/api/docs/guides/tools-computer-use`
- OpenAI Agents guide: `https://developers.openai.com/api/docs/guides/agents`
- OpenAI tools guide: `https://developers.openai.com/api/docs/guides/tools`
- OpenAI sandbox agents guide: `https://developers.openai.com/api/docs/guides/agents/sandboxes`
- Codex manual sections used locally: Computer Use, in-app browser, Codex app-server, non-interactive mode, Codex MCP server, and Codex with Agents SDK.

## Product Decision

Cooper should not try to click around inside Codex Desktop. Codex should be controlled through supported programmatic surfaces:

- `codex app-server` for streamed sessions and JSON-RPC style control.
- `codex exec --json` for non-interactive task execution and event capture.
- `codex mcp-server` for MCP or Agents SDK based orchestration.

Computer Use should be reserved for external browser or desktop apps where a model needs to inspect screenshots and return UI actions for the app to execute under supervision.

## Runtime Lanes

| Lane | User phrase | Operator preset | Primary OpenAI surface | Current status |
| --- | --- | --- | --- | --- |
| Voice orchestration | "Cooper Operator, start..." | Realtime session tools | Realtime API | Built |
| Artifact factory | "Generate the docs/prototype/report" | `operator_document_suite`, AIRES templates, page/app/report presets | Responses API via Cooper work queue | Built |
| Visible browser work | "Use Computer Use on this website" | `computer_use_browser` | Responses + Computer Use harness | UI and policy lane added |
| Desktop app work | "Operate this desktop app" | `computer_use_desktop` | Responses + Computer Use harness | UI and approval lane added |
| Codex bridge | "Start a Codex run" | `codex_app_server` | Codex app-server or `codex exec --json` | UI and approval lane added |
| Multi-agent Codex | "Use agents/Codex specialists" | `codex_mcp_agent` | Codex MCP + Agents SDK | UI and approval lane added |
| Architecture planning | "Which OpenAI tools should power this?" | `openai_tool_stack_plan` | Responses + hosted tools + docs context | Built as artifact lane |

## Safety Defaults

- Browser and desktop UI work must use an allow-list and a visible replayable trace.
- Login, purchase, production write, external communication, commit, push, destructive, or customer-facing steps require explicit approval.
- Read-only repo debugging is allowed as a read lane.
- Production deployments should keep local browser launch disabled unless explicitly enabled.
- Secrets stay in env vars or approved connectors; they are not written into prompts or artifacts.

## Environment Switches

These flags let the UI show what is real in a given environment.

```env
COOPER_OPERATOR_COMPUTER_USE=true
COOPER_OPERATOR_COMPUTER_USE_BRIDGE=http://127.0.0.1:...
COOPER_OPERATOR_CODEX_APP_SERVER=true
COOPER_OPERATOR_CODEX_MCP=true
COOPER_OPERATOR_AGENTS_SDK=true
COOPER_OPERATOR_SANDBOX_AGENTS=true
COOPER_OPERATOR_LAUNCH_BROWSER=true
```

## Next Implementation Steps

1. Add a local Codex bridge process manager that can start `codex app-server` or `codex exec --json`, stream events over WebSocket/SSE, and map approvals into the Operator UI.
2. Add a Computer Use browser harness with Playwright screenshots, domain allow-lists, action execution, and replay capture.
3. Add a desktop Computer Use harness for approved local apps only.
4. Add Agents SDK orchestration for specialist handoffs and MCP tool routing.
5. Add persistent sandbox runs for long-lived workspaces, files, ports, artifacts, review, and resume.

## Test Expectations

- Cooper Operator tool schema includes every runtime lane as a `start_operator_task` skill.
- Operator presets expose the new OpenAI lanes.
- Computer Use desktop and Codex bridge tasks request a local bridge approval before starting.
- Runtime state reports whether Computer Use, Codex app-server, Codex MCP, Agents SDK, and sandbox agents are enabled.
- The visual viewport labels artifact, Computer Use, Codex bridge, GitHub, browser, and OpenAI planning tasks distinctly.
