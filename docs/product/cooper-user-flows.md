# Cooper Key User Flows

## 1. Unlock and Choose Workspace

```mermaid
flowchart TD
  A["Open Cooper"] --> B{"Session valid?"}
  B -->|No| C["Enter app password"]
  C --> D{"Password valid?"}
  D -->|No| C
  D -->|Yes| E["Set signed session cookie"]
  B -->|Yes| F["Show workspace chooser or last workspace"]
  E --> F
  F --> G["Choose Cooper"]
  F --> H["Choose Operator"]
  F --> I["Choose Computer Use"]
```

### Happy Path

1. User opens `localhost:5000`.
2. User enters the private app password.
3. App stores authenticated session cookie.
4. User chooses Cooper, Operator, or Computer Use.
5. App loads the selected workspace.

### Failure States

- Missing server password config.
- Incorrect password.
- Expired session cookie.
- Network/server unavailable.

## 2. Create Project and Add Context

```mermaid
flowchart TD
  A["Open Projects"] --> B["Create project"]
  B --> C["Select project"]
  C --> D{"Add context type"}
  D -->|Paste| E["Submit text source"]
  D -->|Upload| F["Upload MD/TXT/PDF"]
  F --> G["Extract text if PDF"]
  E --> H["Store source locally"]
  G --> H
  H --> I["Build compact project context"]
  I --> J["Start Cooper call with project context"]
```

### Happy Path

1. User creates a project for a sprint, epic, customer workflow, or product area.
2. User pastes agent output or uploads Markdown/PDF/text files.
3. Server stores sources with previews and character counts.
4. User starts a call from the project.
5. Cooper receives a compact project context packet when the call starts.

### Design Principle

Context must be explicit. The app should not silently select unrelated project context.

## 3. Start Cooper Call and Ask for Strategic Input

```mermaid
flowchart TD
  A["Start Cooper call"] --> B["Browser requests microphone"]
  B --> C["Create WebRTC offer"]
  C --> D["POST SDP to /session"]
  D --> E["OpenAI Realtime call established"]
  E --> F["Cooper listens silently"]
  F --> G{"User says Cooper?"}
  G -->|No| F
  G -->|Yes| H["Send response.create / ask event"]
  H --> I["Cooper speaks"]
  I --> J["Transcript stores user and Cooper turns"]
  J --> F
```

### Wake Examples

- "Cooper, what do you think?"
- "Hey Cooper, summarize this."
- "Cooper, what are we missing?"
- "Cooper, generate the requirements for this."

### Success Criteria

- Cooper does not speak during normal room conversation.
- Cooper wakes reliably when addressed by name.
- Both the user's words and Cooper's answer are stored in transcript.

## 4. Generate a Live Canvas Artifact by Voice

```mermaid
flowchart TD
  A["Call is active"] --> B["User asks Cooper to generate artifact"]
  B --> C["Realtime tool call"]
  C --> D["Server queues artifact job"]
  D --> E["Canvas Activity shows running work"]
  E --> F["Job calls Responses API step by step"]
  F --> G{"Job complete?"}
  G -->|No| E
  G -->|Yes| H["Persist artifact"]
  H --> I["Canvas Preview updates"]
  I --> J["User keeps talking to Cooper"]
```

### Example Prompts

- "Cooper, create the jobs to be done canvas for what we are discussing."
- "Cooper, draw a Mermaid diagram of this workflow."
- "Cooper, build a mobile-first HTML prototype from this plan."
- "Cooper, generate AIRES scoped requirements from this conversation."

### Success Criteria

- User does not need to leave the call.
- Canvas shows that work is running.
- Completed artifact appears in Preview and Work library.

## 5. Add Context During a Call

```mermaid
flowchart TD
  A["Call is active"] --> B["Open Canvas Context tab"]
  B --> C{"Add context"}
  C -->|Paste| D["Paste text"]
  C -->|Upload| E["Upload MD/TXT/PDF"]
  D --> F["Server stores context"]
  E --> F
  F --> G["Refresh live Realtime session"]
  G --> H["Cooper can discuss new context"]
```

### Success Criteria

- Context can be added without ending the call.
- Cooper's active session is refreshed.
- Later generated artifacts can use the new context.

## 6. Review Past Call and Generate Follow-Up Work

```mermaid
flowchart TD
  A["Open Calls"] --> B["Select call"]
  B --> C["Read transcript"]
  C --> D["Review artifacts and suggestions"]
  D --> E{"Generate new work?"}
  E -->|Yes| F["Queue job"]
  F --> G["Work updates in Activity/Work library"]
  E -->|No| H["End review"]
```

### Common Outputs

- Post-call kit.
- Execution plan.
- Product requirements document.
- Follow-up summary.
- Code sketch.
- Mermaid diagram.
- HTML prototype.
- AIRES scoped requirements.

## 7. Use Work Library

```mermaid
flowchart TD
  A["Open Work"] --> B["Select artifact"]
  B --> C{"Artifact type"}
  C -->|Markdown| D["Read rendered view or Markdown"]
  C -->|HTML| E["Preview iframe or HTML source"]
  C -->|MCP app| F["Render app or metadata"]
  D --> G["Copy source"]
  E --> G
  F --> G
```

### Success Criteria

- The artifact is readable by default.
- Source can be copied.
- HTML prototypes can be viewed safely in a sandbox.

## 8. Operator: Delegate and Watch Work

```mermaid
flowchart TD
  A["Open Operator"] --> B["Start Operator call or Command tab"]
  B --> C["Describe task"]
  C --> D["Create supervised task"]
  D --> E["Watch tab shows viewport"]
  E --> F{"Approval needed?"}
  F -->|Yes| G["Show approval prompt"]
  G --> H{"Approve?"}
  H -->|No| I["Cancel task"]
  H -->|Yes| J["Continue task"]
  F -->|No| J
  J --> K["Activity and artifacts update"]
  K --> L["Task completes"]
```

### Success Criteria

- Work is visible while it runs.
- User can stop all active work.
- Risky actions pause for approval.
- Results are queryable by Cooper.

## 9. Computer Use: Voice-Control Local Apps and Browser

```mermaid
flowchart TD
  A["Open Computer Use"] --> B["Start Computer Use call"]
  B --> C["User asks Cooper to open/search/click/control"]
  C --> D{"Tool type"}
  D -->|Open app| E["open_local_app"]
  D -->|Search web| F["search_web"]
  D -->|Click visible link| G["click_link_with_vision"]
  D -->|Long task| H["start_computer_use_task"]
  E --> I["Terminal logs tool call"]
  F --> I
  G --> I
  H --> J["Operator task appears in Watch"]
```

### Success Criteria

- Cooper can open allowed apps/sites.
- Web search and vision-click tools log every call.
- Longer work becomes a supervised task.
- User can stop/cancel/status-check active work by voice.

## 10. Settings: Authorize Tools

```mermaid
flowchart TD
  A["Open Settings"] --> B["View mapped Arcade tools"]
  B --> C{"Authorize one or all"}
  C -->|One| D["Start OAuth/authorization"]
  C -->|All| E["Start all configured authorizations"]
  D --> F["Check status"]
  E --> F
  F --> G{"Connected?"}
  G -->|Yes| H["Tool available to Cooper"]
  G -->|No| I["Tool remains blocked"]
```

### Success Criteria

- Cooper cannot use external tools until connected.
- Write tools remain gated.
- Tool call history remains visible for audit.

