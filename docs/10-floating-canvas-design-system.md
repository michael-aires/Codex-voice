# Cooper Floating Canvas Design System

> Status: design direction and HTML prototype brief.
> Source reference: the July 4 floating buyer-selection screenshot supplied by Michael.
> Scope: redesign philosophy for the current Cooper app surfaces before rewriting the live React UI.

## Philosophy

Cooper should feel like a quiet executive workspace, not a web app wrapped in permanent chrome.

The page is a blank operating canvas. UI appears only when it has a job to do. Components float in space, with generous distance between them, so the human can focus on the meeting, artifact, or task in front of them.

The system should remove the feeling of:

- boxed-in dashboards
- heavy nav bars
- stacked admin panels
- visible framework scaffolding
- dense borders and grid lines
- feature explanations inside the app

The system should create the feeling of:

- a calm blank surface
- independent floating tools
- clear selected state
- minimal chrome
- real work objects
- executive-room restraint

## Core Rule

Everything floats. Nothing frames the whole product.

The app can have navigation, actions, sidebars, previews, transcripts, task lists, forms, and canvases, but they should appear as separate objects on a neutral page, not as sections inside a rigid application frame.

## Active Surfaces In The App Today

The current React app actively contains these surfaces:

| Surface | Current component | Purpose |
| --- | --- | --- |
| Password gate | `LockScreen` | Protect the private Cooper workspace. |
| Workspace chooser | `Splash` | Choose Cooper, Operator, or Computer Use. |
| Home | `HomeView` | Executive overview of calls, active work, recent artifacts, and starting points. |
| Projects | `ProjectsView` | Create/select projects, paste/upload context, start calls with context. |
| Live Call | `CallScreen` | Realtime Cooper voice call, transcript, events, and live canvas. |
| Call Canvas | `CallCanvas` | Preview/build/context/templates/activity during a live call. |
| Calls | `LibraryView` | Past call library, transcripts, artifacts, summaries, notes. |
| Work | `ArtifactView` plus artifact documents | Artifact library and rendered HTML/Markdown/Mermaid/prototype previews. |
| Operator | `OperatorWorkspace` variant `operator` | Voice-orchestrated supervised work tasks and generated artifacts. |
| Computer Use | `OperatorWorkspace` variant `computer` | Voice-controlled local apps/browser/Codex tasks with approvals. |
| Settings | `SettingsView` | Arcade, Notion, push-to-talk, and runtime/tool authorization status. |

## Page Model

Each page uses four layers:

1. **Canvas**
   The background. Usually light gray: `#f4f4f3`.

2. **Identity**
   Small floating brand and user/project identity. Never a full-width header.

3. **Controls**
   Naked navigation, small action groups, segmented tabs, filters, and buttons. Controls float by themselves or sit lightly inside a surface when they directly control that surface.

4. **Work Surfaces**
   The few meaningful panels that hold content: transcript, call list, artifact preview, project context, task runner, settings connections.

## Layout Principles

- Do not wrap the entire app in a bordered shell.
- Do not make a permanent navbar band.
- Do not use page-wide horizontal rules.
- Do not create sections as stacked cards.
- Do not put cards inside cards unless the inner object is a real document, task, transcript turn, or preview.
- Navigation is a naked row of text/icon buttons floating near the top.
- The page title floats independently from navigation.
- Primary action floats at the bottom-right or top-right depending on workflow.
- Secondary/destructive actions can float bottom-left.
- Empty space is part of the design system.

## Color Tokens

| Token | Value | Role |
| --- | --- | --- |
| `--canvas` | `#f4f4f3` | Full page background. |
| `--surface` | `#ffffff` | Floating panels and tool surfaces. |
| `--surface-soft` | `#f8f8f6` | Tab rails, muted rows, inactive controls. |
| `--ink` | `#121214` | Strong headings, selected controls. |
| `--text` | `#222325` | Body text. |
| `--muted` | `#75777d` | Metadata, timestamps, secondary text. |
| `--line` | `#dededc` | Thin panel border only. |
| `--line-soft` | `#ececea` | Internal dividers only where clarity requires. |
| `--accent` | `#f5e85d` | Selected, ready, and create actions. |
| `--accent-soft` | `#fff6b7` | Selected row tint. |
| `--success` | `#227447` | Completed and authorized. |
| `--danger` | `#e5484d` | Stop, failed, destructive action. |

Yellow is a signal. It should never become the theme.

## Typography

Recommended stack:

- Display and UI: `Inter`, `SF Pro Display`, system sans.
- Mono metadata: `IBM Plex Mono`, `SFMono-Regular`, monospace.

Rules:

- Large page titles: `28-34px`, `800`, tight but not negative tracking.
- Panel titles: `16-20px`, `750-800`.
- Body: `14-16px`, `400-500`.
- Metadata: `10-12px`, uppercase, `0.12em` tracking.
- Buttons: explicit `14-15px`, `750`.
- Do not scale type with viewport width.

## Shape And Elevation

| Element | Radius | Border | Shadow |
| --- | --- | --- | --- |
| Floating panel | `10px` | `1px solid var(--line)` | none or very soft |
| Primary button | `8px` | none | soft dark shadow only if floating bottom-right |
| Tab button | `5-7px` | none | selected black fill |
| Small status chip | `6px` | none | none |
| Document preview | `10-12px` | optional | subtle paper shadow |

Panels should feel placed, not decorated.

## Component Rules

### Naked Navigation

The nav is not a bar. It is a compact floating row:

- no outer frame
- no full-width background
- selected item uses black fill
- inactive items are plain text/icon buttons
- on mobile, it may collapse into a floating segmented row

### Floating Panels

Panels should have:

- white surface
- thin border
- 10px radius
- clear internal padding
- minimal internal dividers
- no decorative header band unless the panel is a document or card with a real object header

### Lists

Rows should be quiet:

- selected row: pale yellow tint plus yellow border
- active/running row: small status dot plus concise progress
- no dense table grids unless the content is truly tabular

### Tabs

Tabs are small and embedded near the content they control:

- inactive: soft gray background or transparent
- active: black fill with white text
- no full-page tab bars unless the page is primarily a canvas/workbench

### Live Call

The call screen should become a floating collaboration layout:

- left: compact call controller and transcript surface
- right: large floating canvas
- no dark fullscreen room unless deliberately toggled
- waveform can be a small floating object, not a full-screen center element
- Cooper status should be visible but quiet

### Work

The Work page should read like a floating document studio:

- left floating library rail
- center floating document/canvas
- right floating inspector
- artifact tabs sit directly above the document, not inside a page header

### Operator / Computer Use

These pages should look like command rooms:

- voice orchestrator as the dominant left floating surface
- task selector as a compact dropdown, not a long list
- preview/watch surface as the largest object
- approvals float above the preview when needed
- activity and artifacts are tabs, not simultaneous stacked panels

## Motion

Motion should be functional:

- panels fade/translate in by 6-10px
- selected tab changes instantly or within 120ms
- running work uses subtle progress pulses
- no decorative orbs, blobs, or bokeh

## Mobile Rules

- Floating surfaces stack vertically.
- Navigation becomes horizontally scrollable or icon-first.
- Call controls remain reachable at the bottom.
- The canvas remains first-class: preview appears before deep metadata.
- No horizontal overflow.

## Migration Plan

1. Use `docs/cooper-floating-ui-redesign.html` as the visual target.
2. Extract shared React primitives:
   - `FloatingPage`
   - `NakedNav`
   - `FloatingPanel`
   - `FloatingTabs`
   - `StatusChip`
   - `ObjectRow`
   - `DocumentFrame`
   - `VoiceConsole`
3. Move global colors/spacing into design tokens.
4. Convert one surface at a time:
   - Lock and Splash
   - Home
   - Calls
   - Work
   - Live Call + Canvas
   - Projects
   - Operator
   - Computer Use
   - Settings
5. Keep existing behavior and data flow unchanged during the visual migration.

## Success Criteria

- The app no longer feels like a framed dashboard.
- Every view has obvious primary work and minimal chrome.
- Navigation is discoverable but not dominant.
- Active tasks/calls/artifacts are easy to scan.
- Live call, Operator, and Computer Use all feel like related members of the same product family.
- The design works on mobile without hiding the core workflow.
