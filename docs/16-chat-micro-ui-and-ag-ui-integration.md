# Cooper Chat Micro UI and AG-UI Integration

## Decision

Add chat as a first-class Cooper interaction mode, backed by the same durable session state, tools, jobs, context packet, and artifacts already used by the Realtime voice experience.

Use this layering:

1. **Cooper session core** remains authoritative for threads, transcript, context, work, approvals, artifacts, and memory.
2. **OpenAI Realtime API** remains the low-latency voice transport.
3. **ChatKit advanced integration** is the recommended OpenAI-native chat shell and rich-widget runtime.
4. **AG-UI compatibility** is added at the orchestration boundary when Cooper needs to connect CopilotKit, MCP Apps, or other AG-UI agents.
5. **Cooper's component registry** owns the visual language and renders the same micro UI for native events, ChatKit widgets, and AG-UI custom events.

AG-UI is a protocol, not the component system itself. It standardizes bidirectional agent events. ChatKit and CopilotKit are client/UI choices that can consume agent events and render interactive components.

## Product Shape

On desktop and mobile, chat is the universal collaboration surface:

- A typed user turn behaves like a directly addressed Cooper voice turn.
- Cooper streams concise text while background jobs continue.
- Context summaries, source pickers, approvals, activity, artifacts, forms, and presentations appear inline as message-scoped micro UI.
- Opening an artifact may expand it, but the canonical entry remains in the conversation.
- Voice and chat share one session and can be switched without losing context.
- Mobile defaults to chat when microphone permission is unavailable or the user prefers silent work.

## Existing App Integration

Do not scaffold a second application with `create-ag-ui-app`. This repository already has the required shell, state, API server, and rendering logic.

### 1. Extract a shared session event model

Create a server-to-client event envelope that can represent both Realtime and text-agent work:

```ts
type CooperSessionEvent =
  | { type: "message.started"; messageId: string; role: "user" | "assistant" }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "message.completed"; messageId: string }
  | { type: "activity.started"; jobId: string; title: string }
  | { type: "activity.progress"; jobId: string; label: string; progress?: number }
  | { type: "activity.completed"; jobId: string; artifactId?: string }
  | { type: "ui.render"; messageId: string; component: CooperComponentName; props: unknown }
  | { type: "ui.patch"; messageId: string; patch: unknown }
  | { type: "approval.requested"; approvalId: string; props: ApprovalProps }
  | { type: "approval.resolved"; approvalId: string; result: unknown }
  | { type: "session.state"; patch: unknown }
  | { type: "error"; scope: string; message: string };
```

Store these events server-side and materialize the current session view from them. Reconnect and resume should replay a snapshot followed by new events.

### 2. Build a constrained micro-UI registry

The model selects a component name and structured props. It never emits arbitrary React code.

Initial registry:

```ts
type CooperComponentName =
  | "context_summary"
  | "source_picker"
  | "decision_request"
  | "approval_request"
  | "activity_timeline"
  | "artifact_preview"
  | "presentation_deck"
  | "requirements_form"
  | "qa_checklist"
  | "meeting_brief";
```

Each component must have:

- a versioned JSON schema;
- a React renderer;
- a compact mobile rendering;
- an action contract;
- an accessible loading, empty, error, and completed state;
- persistence rules for replayed sessions.

### 3. Add a text-agent endpoint

Add a server endpoint such as `POST /api/chatkit` for the OpenAI-native path or `POST /api/ag-ui/cooper` for an AG-UI path. Both call the same Cooper orchestrator and append to the same session.

For ChatKit advanced integration:

- implement `ChatKitServer.respond(...)`;
- stream text, progress, and widgets;
- use a custom store backed by Cooper's existing call/session persistence;
- map widget actions back to Cooper action handlers;
- register client tools only for safe browser-local behavior.

For AG-UI compatibility:

- install `@ag-ui/core` and `@ag-ui/client`;
- expose an HTTP SSE endpoint that accepts `RunAgentInput`;
- map Cooper events to `RUN_*`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, state, and custom events;
- use `CUSTOM` events for the component registry until a suitable generative-UI standard is adopted;
- map AG-UI frontend tool results and interrupts back to Cooper approvals/actions.

### 4. Keep voice and chat on one thread

Realtime audio events and ChatKit/AG-UI text events should append to one session event log:

```text
Realtime WebRTC ─┐
                 ├─> Cooper session orchestrator ─> session event log ─> UI projection
ChatKit / AG-UI ─┘
```

A typed message should:

1. append a user message;
2. explicitly request an assistant response;
3. allow function/tool calls;
4. stream Cooper's response and tool status;
5. persist transcript, jobs, approvals, and resulting artifacts;
6. optionally synthesize speech only when voice playback is enabled.

### 5. Render safe progress, not private chain of thought

Show:

- tool selected;
- source being retrieved;
- deterministic execution step;
- artifact section being produced;
- retry, limit, approval, and completion status.

Do not show private reasoning or raw chain of thought. Use concise, human-readable activity summaries derived from tool and lifecycle events.

## Recommended Rollout

### Phase 1: Native Cooper chat

- Refactor the existing call rail transcript and prompt into a full-screen responsive `SessionChat`.
- Render existing jobs and artifacts as inline micro UI.
- Make voice optional and keep the existing WebRTC session available from the composer.
- Persist text and voice turns in the same call record.

### Phase 2: ChatKit advanced integration

- Add the ChatKit server endpoint and custom store adapter.
- Recreate the initial Cooper component registry as ChatKit widgets and actions.
- Use ChatKit progress events for long-running generation.
- Keep the Cooper design system rather than accepting default visual styling.

### Phase 3: AG-UI adapter

- Add an AG-UI endpoint around the Cooper orchestrator.
- Connect CopilotKit or another AG-UI client only where its headless primitives or MCP Apps renderer materially reduce work.
- Add contract tests proving that Cooper event replay and AG-UI event replay produce the same UI projection.

## Why Not Replace Everything With AG-UI

- AG-UI defines the event contract; it does not replace Realtime WebRTC audio.
- OpenAI Agents SDK support is currently listed by AG-UI as in progress, so a thin Cooper-owned adapter is safer than coupling core session behavior to an incomplete integration.
- Cooper already has durable calls, context packets, artifacts, jobs, approvals, and Realtime tools. Rewriting these around a new runtime would add risk without improving the user experience.
- A protocol adapter preserves optionality while the component registry delivers the immediate product value.

## Acceptance Criteria

- Desktop and mobile users can complete a session without microphone permission.
- A typed turn can invoke every tool available to a voice turn.
- Context, work progress, approvals, artifacts, and presentations render inline.
- Voice and text turns preserve ordering in a single transcript.
- Reconnect restores message-scoped components and their latest state.
- Background work continues when the user sends another message.
- No private reasoning trace is exposed.
- The UI supports loading, error, retry, approval, and completion states.
- The AG-UI adapter passes lifecycle, message, tool, state, custom UI, cancellation, and reconnect contract tests.

## Primary References

- [OpenAI ChatKit overview](https://developers.openai.com/api/docs/guides/chatkit)
- [OpenAI ChatKit widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets)
- [OpenAI ChatKit actions](https://developers.openai.com/api/docs/guides/chatkit-actions)
- [OpenAI advanced ChatKit integration](https://developers.openai.com/api/docs/guides/custom-chatkit)
- [AG-UI overview](https://docs.ag-ui.com/introduction)
- [AG-UI core architecture](https://docs.ag-ui.com/concepts/architecture)
- [AG-UI TypeScript core SDK](https://docs.ag-ui.com/sdk/js/core/overview)
- [CopilotKit agentic frontend options](https://docs.copilotkit.ai/)

## Prototype

Open `docs/cooper-chat-micro-ui-prototype.html`. Use its Desktop and Mobile controls to inspect both responsive states. The source picker, suggested prompts, composer, approval, and background progress are interactive.
