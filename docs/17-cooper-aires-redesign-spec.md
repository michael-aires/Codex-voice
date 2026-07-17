# Cooper × AIRES Application Redesign Specification

**Status:** Approved visual direction; implementation specification<br>
**Date:** July 15, 2026<br>
**Application:** Cooper executive-session workspace<br>
**Design-system source:** [AIRES Design System](https://aires-design-system.netlify.app)<br>
**Primary visual references:**

- `docs/cooper-aires-design-concept.png` — Today workspace and selected-session detail
- `docs/cooper-aires-prepare-concept.png` — Prepare session checkpoint
- `docs/cooper-aires-design-system-prototype.html` — approved interaction and responsive prototype

## 1. Redesign Thesis

Cooper should feel like an AIRES operating workspace: precise, calm, direct, and built around real work rather than dashboard decoration. The redesign replaces the existing mixture of floating-canvas, command-center, and legacy dashboard treatments with one coherent system.

The approved direction has five defining characteristics:

1. **A persistent workspace rail on desktop.** Navigation, workspace identity, and account controls occupy a quiet 240 px left rail. The work—not global chrome—owns the remaining space.
2. **Open lists instead of card grids.** Meetings, tasks, sessions, projects, artifacts, and settings connections are represented as bordered rows or structured panels. Cards appear only when an object genuinely needs a boundary.
3. **A selected-object detail rail.** Desktop list workflows use a sticky right rail for context and actions. On smaller screens, the same rail becomes an off-canvas detail view.
4. **Yellow as an action and attention signal.** AIRES yellow is reserved for creation, preparation, selection edges, and current-step indicators. It is never a decorative page wash.
5. **Compact, exact geometry.** Inter typography, 4–8 px radii, one-pixel warm-gray borders, restrained shadows, and Phosphor-light-style icons create the product’s recognizable visual grammar.

The redesign is a visual and interaction migration. Existing APIs, realtime behavior, project/session data, generated artifacts, context selection, authorization, and background-job behavior remain authoritative.

## 2. Product Scope

The redesign applies to the complete React application:

| Surface | Existing implementation | Redesign responsibility |
| --- | --- | --- |
| Authentication | `LockScreen` | AIRES-branded private-workspace gate |
| Workspace entry | `Splash` | Compact capability selector for Cooper, Operator, and Computer Use |
| Today | `HomeView` | Approved three-region desktop composition |
| Today detail | `TodayDetail` | Selected-object detail state using the shared detail rail language |
| Session preparation | `SessionContextCheckpoint` | Approved three-column preparation flow |
| Sessions | `LibraryView` | Session list, transcript/detail, artifacts, and resume action |
| Projects | `ProjectsView` | Project list, selected project context, sources, and start-session action |
| Library | `ArtifactView` and artifact documents | Artifact list, document canvas, and metadata/revision inspector |
| Live session | `CallScreen`, `CallCanvas`, prepared overview | Compact session header, collaborator rail, work canvas, and session memory |
| Operator | `OperatorWorkspace` | AIRES command room with supervised task state and approvals |
| Computer Use | `OperatorWorkspace` computer variant | Same command-room system with device/browser emphasis |
| Settings | `SettingsView` | Connection rows, status, authorization, and device/runtime configuration |

Native iOS and macOS applications are not part of this web implementation pass, but the tokens and component rules in this document are suitable for later parity work.

## 3. Information Architecture

The primary navigation is fixed and ordered:

1. Today
2. Sessions
3. Projects
4. Library
5. Settings

Workspace shortcuts appear below the primary navigation:

- Rep velocity
- Listings

Capability switching is secondary. It belongs in the account/capability menu and may expose:

- Talk with Cooper
- Delegate work
- Computer Use
- Lock workspace

The active destination uses a black fill and white text. A small yellow count may be used when a real actionable count exists. It must not be used as decorative metadata.

## 4. Design Tokens

### 4.1 Color

All core colors come directly from the AIRES token set.

| Token | Value | Application role |
| --- | --- | --- |
| `--aires-white` | `#FFFFFF` | Main canvas, panels, rows, modal surfaces |
| `--aires-neutral-200` | `#F8F7F4` | Desktop navigation rail, muted bands |
| `--aires-neutral-300` | `#F2F1EE` | Hover state, disabled or read-only surface |
| `--aires-neutral-400` | `#EAE9E6` | Subtle separators and progress tracks |
| `--aires-neutral-500` | `#D7D6D2` | Default one-pixel border |
| `--aires-neutral-600` | `#CCCCCC` | Stronger disabled boundary |
| `--aires-neutral-700` | `#949391` | Secondary metadata |
| `--aires-neutral-800` | `#626260` | Body-muted text |
| `--aires-black` | `#2D2C2D` | Primary text, selected controls, strong actions |
| `--aires-yellow` | `#F0DE4A` | Primary action, selected edge, current step |
| `--aires-yellow-soft` | `#FFF9CB` | Selected-row or attention background when needed |
| `--aires-green` | `#2F766D` | Meeting/task ready and completed state |
| `--aires-blue` | `#4E6BC6` | Links, connected document/provider action |
| `--aires-red` | `#E55200` | Error and destructive emphasis |
| `--aires-teal` | `#46BCE0` | Optional provider or informational accent |
| `--aires-purple` | `#9560B8` | Optional generated-artifact/provider accent |

Color rules:

- The default page background is true white.
- The navigation rail is warm neutral 200, not gray-green or cream.
- Yellow is never used as a page-wide gradient, glow, or decorative background.
- Semantic colors are paired with text or icons; color alone does not communicate state.
- Dark mode is out of scope for this pass.

### 4.2 Typography

**Primary family:** Inter<br>
**Fallback:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Urbanist is removed from application chrome. IBM Plex Mono may remain only where code, identifiers, or machine output genuinely benefits from monospacing; it is not used for routine metadata labels.

| Role | Size | Weight | Line height | Use |
| --- | ---: | ---: | ---: | --- |
| Display | 48 px | 500 | 1.06 | Desktop Today greeting only |
| Page title | 32 px | 600 | 1.12 | Primary screen or selected-object title |
| Section title | 20 px | 600 | 1.25 | Major panel heading |
| Object title | 16 px | 500 | 1.35 | Row and card title |
| Body | 14 px | 400 | 1.5 | Primary descriptive copy |
| UI label | 14 px | 500 | 1.2 | Buttons, tabs, navigation |
| Caption | 12 px | 400–500 | 1.4 | Time, source, count, status |

Typography rules:

- No uppercase tracking for routine UI categories.
- Headings use tight, neutral tracking; never negative enough to reduce legibility.
- Controls always define size and weight explicitly.
- Long object titles wrap to two lines on mobile and ellipsize only in dense desktop rails.
- The Today display title reduces to 36 px below 760 px.

### 4.3 Spacing

The spacing scale is `4, 8, 12, 16, 24, 32, 48, 64` px.

Common application values:

- Desktop sidebar width: 240 px
- Desktop content gutter: 48 px
- Compact desktop gutter: 32 px
- Mobile content gutter: 16 px
- Main/list column gap: 32 px
- List/detail gap: 32 px
- Standard panel padding: 24–32 px
- Standard row vertical padding: 16 px
- Compact row vertical padding: 12 px
- Form control height: 40–44 px
- Primary action height: 48 px

### 4.4 Radius, Borders, and Elevation

| Token | Value | Use |
| --- | --- | --- |
| `--radius-xs` | 4 px | Checkboxes, compact tags, icon containers |
| `--radius-sm` | 6 px | Tabs and compact controls |
| `--radius-md` | 8 px | Buttons, inputs, rows, panels, dialogs |
| `--radius-round` | 100 px | Avatars and status dots only |
| `--border-default` | `1px solid #D7D6D2` | Panels, rows, controls |
| `--shadow-xs` | `0 1px 2px rgb(45 44 45 / 6%)` | Selected row or sticky control only |
| `--shadow-dialog` | `0 22px 64px rgb(45 44 45 / 18%)` | Modal and interruptive approval |

Rules:

- Do not use radii larger than 8 px for application panels or dialogs.
- Do not introduce nested rounded containers to create hierarchy.
- Use a border before using a shadow.
- Modals may use the dialog shadow; persistent panels should remain essentially flat.

### 4.5 Motion

- Hover and selected transitions: 120 ms ease-out
- Drawer/modal entry: 180–220 ms ease-out
- Toast entry: 180 ms translate/fade
- Loading icon rotation: linear, 800–900 ms
- `prefers-reduced-motion: reduce` removes transforms and non-essential animation

## 5. Iconography and Brand

The target icon character is Phosphor Light: simple line icons, approximately 1.5 px stroke, square or round optical balance, no filled icon tiles by default.

The current React implementation may use Lucide where an exact metaphor exists. Icon usage must be normalized to the following presentation:

- Navigation: 20 px
- Row leading icon: 18–20 px inside a 40 px bordered container
- Buttons: 16–18 px
- Inline metadata: 14–16 px
- Empty-state illustration: no larger than 32 px unless it is a branded asset

Brand treatment:

- Use `/assets/aires/logo-symbol.svg` as the AIRES/Cooper mark.
- Desktop rail lockup: `Cooper` with `AIRES WORKSPACE` as a quiet caption.
- Mobile header: symbol plus `Cooper`; omit the caption.
- Do not recreate the symbol with CSS.

## 6. Shared Application Shell

### 6.1 Desktop

At widths above 1030 px:

- Sidebar is fixed at 240 px and spans the viewport height.
- Main application content begins at x = 240 px.
- Sidebar uses neutral 200, with a right border in neutral 400.
- Brand occupies the top 72–80 px.
- Primary nav rows are 44 px high with 8 px radius.
- Workspace shortcuts follow a plain 12 px section label.
- Settings and the user account anchor to the bottom.
- The account block is separated by a one-pixel divider.

### 6.2 Tablet

At 761–1030 px:

- Sidebar becomes an off-canvas drawer.
- A 64 px mobile/tablet header appears.
- Selected-object detail becomes an off-canvas rail.
- Main content uses 24 px gutters.

### 6.3 Mobile

At 760 px and below:

- Header contains menu, centered Cooper lockup, and a yellow new-session icon button.
- Main content uses 16 px gutters.
- Page title wraps naturally; secondary descriptions use a readable 22–24 character line length when possible.
- Lists remain full-width rows; metadata collapses before object titles.
- Detail panels become full-screen drawers.
- Preparation and long forms become full-height sheets with sticky actions.
- No surface may cause horizontal document overflow.

## 7. Shared Components

### 7.1 Buttons

**Accent button**

- Yellow background, black text
- Border uses yellow-strong or neutral 500 depending on context
- 8 px radius, 48 px default height
- Used for Prepare session, Start session, New session, and primary creation

**Primary dark button**

- Black background, white text
- Used for forward actions when yellow is already signaling a selected state

**Secondary button**

- White background, neutral 500 border, black text
- Used for Open in Calendar, Refresh, Back, Download, and secondary actions

**Text/icon button**

- Transparent background with 6–8 px hover surface
- Used for utility actions in toolbars

**Destructive button**

- White or red-tinted surface with red text for secondary destructive actions
- Solid red only for final destructive confirmations

All buttons include hover, focus-visible, active, disabled, and busy states.

### 7.2 Tabs and Filters

- Default tabs are bordered compact capsules only where shown in the approved Today reference.
- Selected filter uses black fill with white text.
- Workbench/document tabs may use a straight tab strip with a black selected state or yellow top edge.
- Tabs must be horizontally scrollable on mobile.

### 7.3 Object Rows

Rows are the primary repeated component.

An object row may contain:

- Leading icon container
- Title and one line of metadata
- Optional participant avatars
- Status type and workspace/source
- Trailing chevron

States:

- Default: white/open surface with bottom divider
- Hover/focus: neutral 200 background
- Selected/up next: neutral 200 background, 4 px yellow left edge, subtle border/shadow
- Running: semantic status dot with live label
- Disabled: muted copy and neutral 300 surface

### 7.4 Detail Rail

- Desktop width: 400–430 px
- Sticky or fixed within the viewport
- White surface with neutral border
- 8 px radius only when floating; no radius when edge-docked
- Title, metadata, people, purpose, sources, and actions have clear vertical rhythm
- Primary and secondary actions anchor at the bottom when practical
- Below 1030 px, the rail becomes an off-canvas panel with an explicit close button

### 7.5 Forms

- Input and select height: 40–44 px
- Textarea minimum height: 96 px
- Border: neutral 500
- Focus: black border plus a subtle yellow/black focus ring
- Labels appear above controls at 12–14 px, 500 weight
- Validation appears inline and is announced to assistive technology

### 7.6 Dialogs and Sheets

- Desktop maximum radius: 8 px
- Backdrop: `rgb(45 44 45 / 48%)`
- Head and action bars use one-pixel dividers
- Close control is 40–44 px and keyboard reachable
- Focus is trapped while open and returns to the invoking control
- Escape closes non-destructive dialogs

### 7.7 Status

Status presentation favors a small semantic dot plus plain text. Pills are reserved for short machine states where the boundary helps scanning.

## 8. Screen Specifications

### 8.1 Authentication

The authentication screen is a centered, unframed AIRES workspace entry on a true-white canvas.

- AIRES symbol and `Cooper` lockup
- `Private workspace` as a small body label, not a promotional eyebrow
- One password field
- One full-width dark or yellow submit action
- Error text directly below the field
- No marketing copy, illustrations, gradients, or oversized card shadow

### 8.2 Workspace Entry

The workspace selector uses three quiet bordered rows or panels:

- Cooper — realtime executive session
- Operator — supervised delegated work
- Computer Use — local app and browser execution

Selected/hover uses a yellow left edge or soft yellow background. The experience must feel like choosing a mode in a product, not choosing a pricing plan.

### 8.3 Today

Desktop follows the approved reference:

- Sidebar: 240 px
- Main list area: flexible, with approximately 48 px outer gutter
- Detail rail: approximately 400–430 px
- Date at top left of content
- Refresh utility aligned to content top right
- Greeting: `Good morning, Michael.`
- Supporting line communicates ready sessions and tasks
- Filters: All, Meetings, Tasks; extended live-source filters may remain but should not crowd the first row
- `Up next` section contains the next meeting in the selected-row treatment
- `Priority work` is an open row list
- Selected object remains visible in the right detail rail

The real feed can contain projects and past sessions. Those collections follow the same row family and appear after priority work or through the extended filter set.

Above-the-fold allowed copy is limited to the live date, greeting, ready-count sentence, filter labels, `Up next`, `Priority work`, and visible object data. Daily Catch Up may appear as a compact secondary action; it must not displace the main hierarchy.

### 8.4 Today Detail

Desktop should reuse the selected-object rail where sufficient. A full detail page is used only when the object contains richer context, generated brief content, or session-launch preparation.

The detail state includes:

- Type/status
- Title
- Time and duration or due date
- People or owner
- Purpose/description
- Context sources
- Prepare/start/resume action
- Secondary source/calendar action

### 8.5 Prepare Session

The approved preparation dialog is the source of truth.

Desktop structure:

1. Header with title, selected meeting, and close
2. Three-step indicator: Meeting, Sources, Review
3. Three columns:
   - Session intent and people
   - Source selection grouped by provider
   - Cooper knowledge summary, freshness, and people
4. Sticky or bottom-aligned yellow `Start session` action

Behavior:

- Source checkboxes update selected count and freshness summary immediately.
- Provider groups may collapse, but selected sources remain discoverable.
- The intent can be edited.
- Start session preserves the current real preparation and background-artifact behavior.
- Enter-without-prep remains available as a secondary path where the existing workflow requires it.

### 8.6 Sessions

Sessions use a two- or three-region reading layout:

- Left: search and session list
- Main: selected session title, continuation metadata, transcript/summary tabs
- Right or embedded side section: artifacts and session actions

The `Resume with Cooper` action is yellow. Selected rows use the shared yellow edge. Transcript turns are open text blocks separated by whitespace or thin dividers, not chat bubbles unless speech ownership would otherwise be unclear.

### 8.7 Projects

Desktop uses:

- Left project list and compact creation control
- Main selected project overview and sources
- Optional right action/context summary at large widths

The main action is `Start session`. Source ingestion supports pasted text and file upload without changing existing behavior. Empty projects display one direct action, not a decorative empty-state card.

### 8.8 Library and Artifact Studio

The Library is an editor/workbench variant of the system:

- Left rail: artifact list and search/filter controls
- Center: document or prototype canvas
- Right inspector: metadata, quality, sources, queue, and revision
- Top toolbar remains compact and aligned to the document canvas

The document itself may be white on a neutral 200 stage. Toolbars, inspector fields, and background jobs use the same button, row, border, and status system as the rest of Cooper.

Office, PDF, HTML, MCP app, Markdown, and Mermaid renderers retain their specialized document behavior. Oversized Office preview radii are reduced to 8 px.

### 8.9 Live Session

The live experience is a specialized two-region shell:

- Compact horizontal header, not the full desktop sidebar
- Left collaborator rail: Cooper status, voice state, transcript/chat, and session controls
- Right work canvas: presentation, prepared overview, artifacts, context, templates, or activity
- Session memory sits beneath or within the work canvas without reducing the primary document below a useful height

The live canvas uses true-white work surfaces over neutral 200. Black remains the primary chrome; yellow communicates active listening/preparation/build state. The prior dark command-room treatment is removed except for embedded third-party content such as the Zoom stage.

### 8.10 Operator and Computer Use

These modes share the AIRES sidebar on desktop and a two-region command-room body:

- Left: voice collaborator, task selection, prompt, messages, and stop controls
- Right: watch/preview, task, activity, and artifact tabs
- Approval requests float above the right preview and are repeated in the left rail when appropriate

Operator and Computer Use are distinguished by copy, icon, and task data—not by a separate visual theme. Dark full-height rails are removed. Browser/viewport previews may retain a dark content stage when it represents the remote application.

### 8.11 Settings

Settings is an open page with grouped connection lists:

- Page title and one primary authorization action
- Summary values as a compact inline definition list, not metric cards
- Connection rows for providers/tools with status, description, and action
- Push-to-talk/device readiness section
- Notices use bordered semantic bands

The page must remain usable with large tool catalogs. Long lists may use `content-visibility: auto` and must preserve keyboard navigation.

## 9. Responsive Contract

| Breakpoint | Behavior |
| --- | --- |
| `> 1260 px` | Full sidebar, main content, and right detail/inspector where applicable |
| `1031–1260 px` | Full sidebar; narrower detail rail or inspector |
| `761–1030 px` | Mobile header; sidebar and detail become drawers; two-column screens collapse |
| `≤ 760 px` | 16 px gutters; full-width rows; full-screen detail/preparation; sticky primary actions |

Required checks at every responsive breakpoint:

- No horizontal document overflow
- Primary actions remain visible and reachable
- Object titles are not clipped
- Selected state is visible without hover
- Navigation is operable by keyboard and touch
- Live session canvas remains usable before deep metadata
- Dialog content scrolls independently from sticky actions

## 10. Accessibility Contract

- WCAG 2.2 AA color contrast for text and interactive states
- Semantic landmarks: header, nav, main, aside, dialog
- Visible focus treatment on every interactive element
- Minimum touch target: 40 × 40 px; 44 × 44 px preferred on mobile
- Icon-only actions include an accessible name
- Dialogs expose `role="dialog"`, `aria-modal="true"`, and a labelled title
- Drawers update expanded/hidden state for assistive technology
- Tabs use tab semantics and selected state
- Live status and background work updates use restrained `aria-live` regions
- Reduced-motion preference is honored
- Content remains usable at 200% browser zoom

## 11. React Architecture

The migration should preserve existing business logic while consolidating presentation.

Shared primitives:

- `SessionOsTopbar` — desktop sidebar/mobile header in application views; compact topbar in live sessions
- `AiresButton` or existing class variants — accent, dark, secondary, text, destructive
- `ObjectRow` presentation pattern — meeting, task, project, session, artifact, connection
- `DetailRail` pattern — selected object and inspector variants
- `StatusIndicator` pattern — dot, label, optional compact pill
- `AiresDialog` structure — preparation, daily brief, provider selection, approval
- `AiresEmptyState` pattern — concise description and one action

Performance rules:

- Derive filtered collections during render or with `useMemo` only where the computation is non-trivial.
- Keep event-driven state changes in handlers rather than effects.
- Use functional state updates when the next value depends on the previous value.
- Keep global event listeners and polling intervals deduplicated and cleaned up.
- Do not add a new icon or UI library; use existing direct Lucide imports and the real AIRES SVG asset.
- Long settings/session/artifact lists may use `content-visibility: auto`.

## 12. Implementation Sequence

1. Lock exact tokens and global typography.
2. Convert the shared application shell to desktop sidebar/mobile header behavior.
3. Bring Today and Today detail to the approved reference.
4. Align preparation and provider dialogs with the approved modal.
5. Apply row, panel, form, and button primitives to Sessions and Projects.
6. Apply the editor variant to Library and artifact renderers.
7. Apply the compact live-session variant to Call and Canvas.
8. Convert Operator and Computer Use to the light AIRES command room.
9. Convert Settings to grouped open lists.
10. Verify all screens at desktop and mobile sizes.

## 13. Verification Contract

Implementation is complete only when all of the following are true:

### Build and automated checks

- `npm run build` passes.
- `npm test` passes.
- `git diff --check` passes.

### Functional browser checks

- Authentication and workspace entry render correctly.
- Today filters and refresh work.
- Selecting a Today row opens or updates its detail.
- Prepare session opens and source selection updates counts.
- A prepared or immediate session can launch.
- Session selection and resume remain available.
- Project creation/source controls remain operable.
- Artifact selection, preview, download, revision, and queue controls remain operable.
- Live-session navigation, transcript input, canvas tabs, and end-session controls remain reachable.
- Operator/Computer Use task tabs and approval controls remain reachable.
- Settings authorization and refresh controls remain reachable.

### Visual checks

- Desktop Today is captured at the approved concept’s 1536 × 1024 size when practical.
- Mobile Today is checked at 390 × 844.
- The preparation state is captured and compared to the approved reference.
- At least one screenshot is captured for Sessions, Projects, Library, live session, Operator, and Settings.
- The accepted concept and latest implementation screenshots are inspected with `view_image` in the final QA pass.
- The fidelity ledger covers copy, composition, typography, palette, geometry, icons, spacing, responsive behavior, and interaction state.

## 14. Fidelity Ledger

| Area | Concept evidence | Required implementation evidence | Pass condition |
| --- | --- | --- | --- |
| Shell | 240 px rail, warm neutral surface | Desktop screenshot and computed sidebar width | Structure and color match |
| Today first viewport | Date, greeting, filters, Up next, priority list, detail rail | 1536 × 1024 screenshot | No material copy or composition drift |
| Typography | Inter, 48/32/20/16/14/12 scale | Computed styles and screenshot | No Urbanist or browser-default controls |
| Palette | White, warm neutrals, black, yellow | Token inspection and screenshot | Exact core values; no gradients |
| Geometry | 4–8 px radii, thin borders | Computed panel/control styles | No oversized rounded cards |
| Prepare state | Stepper and three columns | Open-dialog screenshot and interaction result | Structure and selected-count behavior match |
| Mobile | Mobile header, full-width rows, drawers | 390 × 844 screenshot and scroll-width check | No horizontal overflow or clipped action |
| Secondary surfaces | Shared rows, panels, controls | Per-surface screenshots | Clearly one product family |

## 15. Intentional Deviations From the Concept Images

The concept images contain representative content. The production application intentionally uses live Cooper data and current product behavior instead of hard-coded concept data.

Allowed deviations:

- Live dates, names, counts, source providers, and object copy
- Additional Today filters for Projects and Past sessions when live collections exist
- Daily Catch Up as a compact secondary control
- Existing immediate-entry path in the preparation flow
- Specialized document controls required by PDF, Office, HTML, MCP app, Mermaid, or Markdown outputs
- Compact horizontal header during a live session, where a persistent desktop sidebar would reduce the work canvas too far
- Embedded Zoom/browser content may use its native dark stage

Not allowed without a new design decision:

- Reintroducing Urbanist as the primary application font
- Replacing white with gray-green, cream, or tinted page backgrounds
- Full-page gradients or decorative glows
- Large rounded cards or bento grids
- Dark Operator/Computer Use rails as a separate theme
- New top-level navigation destinations
- New marketing copy or feature-promotional sections inside the product

## 16. Definition of Done

The redesign is done when every web surface listed in Section 2 uses the AIRES tokens and shared component grammar, existing workflows still function, automated checks pass, desktop and mobile browser QA are complete, and the implementation has no material mismatch against the approved Today and preparation references.
