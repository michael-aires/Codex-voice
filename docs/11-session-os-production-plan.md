# Cooper Session OS Production Plan

> Status: accepted design specification and implementation plan.
>
> Accepted concept: `docs/cooper-session-os-concept.png`
>
> Interactive reference: `docs/cooper-session-os-prototype.html`

## Product Decision

Cooper is one workspace organized around a persistent **Session**. A session can begin from a meeting, task, project, finished artifact, or a blank conversation. Voice, transcript, context, generated artifacts, delegated work, approvals, and Computer Use activity all belong to that session.

Operator and Computer Use remain distinct execution capabilities, but they are entered from Cooper as session modes instead of behaving like unrelated products.

## Information Architecture

| Session OS | Existing implementation | Migration behavior |
| --- | --- | --- |
| Today | `home`, `today-detail` | Keep the existing calendar/task entry flow. |
| Sessions | `library` | Rename past calls to Sessions and preserve transcript, summary, cost, and artifact behavior. |
| Projects | `projects` | Preserve project creation, uploads, pasted context, and contextual call start. |
| Library | `artifacts` | Rename Work to Library and preserve HTML, Markdown, Mermaid, MCP App, and prototype previews. |
| Settings | `settings` | Preserve Arcade, Notion, push-to-talk, and connection state. |
| Session | `call` | Combine Cooper voice, canvas, approvals, active jobs, transcript, and Session Memory. |
| Capabilities | `operator`, `computer` workspaces | Open Operator and Computer Use from the unified Session OS shell and return to the originating session. |

## Design Contract

### Tokens

| Token | Value | Contract |
| --- | --- | --- |
| `--so-ink` | `#2d2c2d` | Primary text and selected navigation. |
| `--so-muted` | `#74747b` | Secondary text and metadata. |
| `--so-canvas` | `#fbfbf8` | Product background. No gradients. |
| `--so-surface` | `#ffffff` | Rails, documents, dialogs, and rows. |
| `--so-soft` | `#f3f3ef` | Quiet selected and hover surfaces. |
| `--so-line` | `#e4e4df` | One-pixel structural borders. |
| `--so-volt` | `#f0de4a` | Creation, approval, listening, and selected decisions only. |
| `--so-success` | `#25764a` | Completed/connected state. |
| `--so-danger` | `#d94747` | Failed or destructive state. |

### Typography

- UI and document headings: Inter/system sans, `700-800`.
- Body: Inter/system sans, `400-600`.
- Metadata: IBM Plex Mono/system mono, `10-12px`, uppercase only for structural labels.
- UI controls always define font size, weight, and line height explicitly.

### Geometry

- Control radius: `6-7px`.
- Surface radius: `8px`.
- Borders provide hierarchy; shadows are reserved for dialogs and document paper.
- Desktop Session layout: `27%` collaborator rail / `73%` work canvas.
- Mobile Session layout: collaborator rail followed by the canvas, both full width.

### Container Rules

- No dashboard wrapper around the whole app.
- No nested cards unless the inner object is a real approval, artifact, or document.
- Lists remain lists; documents remain open reading surfaces.
- Yellow is a signal, never a page theme.
- No gradients, decorative blobs, fake metrics, or marketing copy.

## Shared Components

- `SessionOsTopbar`: Cooper identity, Today/Sessions/Projects/Library/Settings, New session, capability/profile menu.
- `SessionMemory`: Brief/Debate/Decision/Build chapter timeline.
- `SessionCapabilityMenu`: Talk with Cooper, delegate Operator work, or start Computer Use.
- Existing call rail, canvas, project, session library, artifact reader, and connection views remain feature owners.

## Session Memory

Session Memory is the new product feature introduced by the accepted concept.

The client derives four stable chapters from persisted session data:

1. **Brief** - selected meeting/task/project context and early transcript.
2. **Debate** - midpoint discussion and unresolved tradeoffs.
3. **Decision** - the latest decision-like human/model turn.
4. **Build** - latest background job or generated artifact.

Selecting a chapter restores its summary in the collaborator rail and opens its associated artifact when one exists. Chapters are derived from persisted calls, transcript entries, jobs, and artifacts so the view survives refreshes without storing hidden model reasoning.

## Delivery Sequence

1. Introduce the Session OS token layer and shared shell components.
2. Rename navigation and reuse the existing page owners.
3. Apply the shared shell to Today, Sessions, Projects, Library, Settings, and live Session.
4. Add Session Memory to the live Session canvas.
5. Route Operator and Computer Use through the Session capability menu while preserving their runtimes.
6. Add pure model tests, CSS contract tests, and React/browser regression coverage.
7. Run the complete Node test suite, production build, desktop QA, mobile QA, and concept-to-render fidelity review.

## Verification Contract

- All existing tests pass.
- Session model tests cover legacy route mapping and every memory chapter.
- CSS contract tests enforce the accepted palette, radii, no-gradient rule, and `27/73` Session layout.
- The production bundle builds successfully.
- Browser QA proves Today → Session, chapter restoration, artifact selection, Sessions, Projects, Library, Settings, Operator, and Computer Use entry points.
- Desktop QA uses the concept-native `1536x1024` viewport; mobile QA uses `390x844`.
- No relevant console errors, framework overlays, horizontal overflow, clipped primary controls, or inaccessible focus states remain.
