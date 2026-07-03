# Cooper UI System

This system is extracted from the July 3 Cooper reference screens for the Calls and Work views. The goal is a calm operating surface for a human who runs meetings, makes decisions, and asks Cooper to produce artifacts while the conversation continues.

## Design Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--aires-black` | `#242224` | Active navigation, brand mark, primary buttons, strong text |
| `--aires-ink` | `#171717` | Page titles and transcript body |
| `--aires-white` | `#ffffff` | App shell, panels, cards, toolbar surfaces |
| `--aires-grey` | `#f3f6ef` | Page background and canvas gutters |
| `--aires-surface-soft` | `#fafbf8` | Hover rows, secondary panels, inactive inputs |
| `--aires-rail` | `#f7f9f4` | Left rail selected context and count rows |
| `--aires-volt` | `#f1da31` | New call, active underline, selected accents |
| `--aires-volt-bg` | `#fff8ce` | Active call/work row tint |
| `--aires-border` | `#dde3dc` | Panel, row, toolbar, and tab borders |
| `--aires-muted` | `#69716d` | Captions, meta text, timestamps |
| `--aires-success` | `#217a45` | Completed state |
| `--aires-error` | `#dc2626` | Failed/destructive state |

The palette is mostly white, black, warm grey, and one precise yellow accent. Yellow is a signal, not a background theme.

### Typography

| Role | Family | Weight | Size |
| --- | --- | --- | --- |
| Display title | Urbanist | 800 | 24-30px app pages, 48px splash |
| Body | Inter | 400-600 | 14-16px |
| UI label | Inter | 700-850 | 12-15px |
| Metadata | IBM Plex Mono | 600 | 10-12px uppercase |

Rules:

- Letter spacing is `0` for readable UI text.
- Metadata labels use uppercase with `0.12em` letter spacing.
- Controls must define their own font sizes and weights; do not inherit browser defaults.

### Shape, Borders, and Elevation

| Token | Value | Use |
| --- | --- | --- |
| `--radius-control` | `8px` | Buttons, tabs, row cards, inputs |
| `--radius-card` | `10px` | Primary page panels |
| `--radius-dialog` | `14px` | Modals, large preview frames |
| `--shadow-xs` | Subtle 1px/2px shadow | Header, panels, rows |
| `--shadow-lg` | Soft large shadow | Floating approvals and call shell |

The reference UI is mostly flat. Borders do the work; shadows are quiet.

### Spacing

- Base grid: `8px`.
- App gutter: `14-22px` desktop, `10-14px` mobile.
- Header height: `58-64px`.
- Left rail: `280-380px` depending on page.
- Work inspector: `250-300px`.
- Controls: `36-42px` high for toolbar/nav, `46-52px` for primary actions.

## Core Sections

### App Shell

The shell is a white framed workspace over warm grey. It has:

- Brand left: black rounded square with yellow `C`, then `Cooper`.
- Center navigation: Home, Projects, Calls, Work, Settings.
- Right actions: primary yellow action, workspace switch, lock/session control, avatar.
- Active nav is black with yellow icon accent where available.

### Home

Home is the human operating dashboard. It should answer:

- What meeting or decision needs attention?
- What work is running?
- What did Cooper generate recently?
- Where do I start the next call?

Home should not feel like a landing page. It is a command center for meetings, decisions, and artifacts.

### Calls

Calls use a three-region reading model:

- Left rail: searchable meeting list grouped by recency, selected row tinted yellow.
- Main detail: call title, state, compact metrics, transcript/artifacts/summary tabs.
- Right panel: artifacts created in the call, with preview affordances.

The transcript is the source of truth. Cooper turns must be as visible as Michael/user turns.

### Work

Work uses an editor/canvas model:

- Left rail: artifact categories and recent items.
- Top tab strip: open artifacts, each closable.
- Toolbar: artifact type selector, zoom, refresh, canvas controls.
- Center canvas: rendered HTML, Mermaid, markdown article, or iframe preview.
- Right inspector: artifact metadata, description, tags, source call, updated time.

Generated documents should read like finished deliverables, but copy actions always copy source markdown or HTML.

### Call Canvas

During a call, the canvas should keep the same language as Work:

- Preview, Build, Context, Templates, Activity tabs.
- Generated work appears without ending the call.
- Activity must show model/API progress so the user never feels nothing is happening.

### Operator

Operator should reuse the same shell logic but with a supervised-work emphasis:

- Voice orchestrator rail.
- Watch/delegate/task/activity/artifacts tabs.
- Browser-like preview pane for visible runs.
- Approvals as interruptive but compact popovers.

## Interaction Rules

- A selected row uses a warm yellow tint plus a yellow border.
- A selected tab uses black fill and white text, or yellow underline in document readers.
- Primary creation actions use yellow fill with black text.
- Destructive actions use red fill.
- Empty states should be short, direct, and actionable.
- Mobile collapses to stacked sections without horizontal overflow.

