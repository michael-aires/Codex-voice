# Native AIRES Design System

Date: 2026-07-13
Scope: `native/realtime-desktop-agent`
Token contract: `Resources/Web/design-tokens.json`
Runtime tokens: `Resources/Web/styles.css`

This document defines the native macOS Cooper design contract. The native app should feel like a focused AIRES executive workspace: quiet, dense enough for repeated work, fast to scan, and built around active sessions rather than marketing composition.

## Foundations

### Color

Core brand colors:

- Soft Black: `#2d2c2d` via `--aires-black`
- Volt: `#f0de4a` via `--aires-volt`
- Volt border: `#c9b92e` via `--aires-volt-border`
- Orange: `#ee7437` via `--aires-orange`
- Sky: `#b1cdd6` via `--aires-sky`
- Navy: `#172554` via `--aires-navy`
- Medium Grey: `#9c9c9c` via `--aires-grey`

Native surfaces stay warm and light:

- App: `--surface-app`
- Card: `--surface-card`
- Muted: `--surface-muted`
- Soft work surface: `--surface-soft`

Use Volt sparingly for primary action, progress, and attention. Do not let the UI become a single-yellow theme; pair it with black, zinc text, warm grey surfaces, and occasional semantic status colors.

### Typography

- Body: `--font-body`
- Display: `--font-display`
- Data/metadata: `--font-mono`
- Letter spacing is `0` by default. Only mono section labels may use positive tracking for scanned metadata.
- Hero-size display type is reserved for Today and detail headers. Panels, cards, settings rows, and operator/task surfaces use compact headings.

### Shape And Elevation

The native app uses sharp, architectural radii:

- `--radius-sm`: 4px
- `--radius-md`: 6px
- `--radius-lg`: 8px
- `--radius-xl`: 10px
- `--radius-panel`: 12px

Default cards and rows should stay at 8px or less unless they are top-level panels or lock/settings shells. Avoid nested cards.

Elevation is subtle:

- `--shadow-xs` for rows and small hover states
- `--shadow-md` for panels that need separation
- `--shadow-lg` for overlays or major shell surfaces only

## Component Inventory

Implemented native components and their expected roles:

- `AppShell`: top-level Today/detail/call/workspace state
- `Topbar`: brand, route navigation, active runtime state, user avatar
- `SessionSidebar`: native Session OS rail for workspace routes, local broker posture, and approval-gated status
- `SegmentedFilter`: Today filters and call mode controls
- `TodayRow`, `TaskRow`, `MeetingRow`: compact, clickable work items
- `DetailHeader`: task/meeting detail with primary call action and secondary destination
- `CallControls`: start/end/mute/interrupt/Ask Cooper controls
- `TranscriptTurn`: saved and live transcript rows
- `CanvasCard`: single source payload with persisted render-mode selection
- `RenderModeMenu`: Text/HTML/Mermaid/Embed selector plus reset
- `ArtifactPreview`: safe rendered Library artifact surface and source fallback
- `SettingsRow`: compact label/value diagnostics and status rows
- `ApprovalRow`: approval-gated tool/operator rows
- `OperatorTask`: queued/running/blocked/completed local task row
- `ConnectorRow`: connector status, risk, auth mode, and scopes
- `NotificationPanel`: macOS notification permission/status controls

## Interaction Rules

- Use segmented controls for filters and call mode.
- Use menus/selects for render mode and connector status.
- Use inputs for API key, local lock, allowlist, and numeric TTL values.
- Use concise text buttons for visible commands such as `Start call`, `Ask Cooper`, `Export diagnostics`, and `Queue`.
- Use icon-style compact buttons only when the symbol is already familiar or the surrounding label is clear.
- Keep canvas cards in one unified stream; filtering and grouping must not duplicate cards.
- Every unsafe renderer path must fall back to text with a visible error.

## Safety Rules

- HTML and SVG rendering remain deny-by-default.
- Embeds require an explicit host allowlist and iframe sandboxing.
- Connector output is treated as untrusted until rendered through the card/artifact registry.
- API keys and lock hashes never appear in UI text, diagnostics, stores, manifests, notification payloads, or smoke output.

## Verification

Run:

```bash
node native/realtime-desktop-agent/scripts/web-ui-smoke.mjs
```

The static UI smoke checks that `design-tokens.json` is valid, every token points to a CSS custom property in `styles.css`, and the component inventory is represented by native Web UI markers.
