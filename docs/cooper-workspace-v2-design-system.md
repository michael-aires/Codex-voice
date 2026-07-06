# Cooper Workspace v2 Design System

Cooper should feel like a quiet AIRES workspace: a warm off-white canvas, floating white surfaces, soft black text, and volt yellow only for active decisions or attention. The interface should stay out of the way so the call, transcript, generated artifacts, and delegated work remain the focus.

## Source

The current direction is based on `/Users/michaelmoll/Downloads/Cooper Workspace v2.dc.html` and the AIRES Agent Foundry design-system bundle.

Core tokens:

- Ink: `#2D2C2D`
- Canvas: `#FBFBF8`
- Card: `#FFFFFF`
- Line: `#E4E4DF`
- Volt: `#F0DE4A`
- Display font: `Urbanist`
- Body font: `Inter`
- Mono font: `IBM Plex Mono`
- Radius: `6px` for controls, `8px` for surfaces

## Layout Rules

- Use one quiet top bar, not heavy navigation chrome.
- Treat the page as a canvas with floating work surfaces.
- For live agent experiences, use a left agent rail and a larger right work surface.
- The right surface should default to output: canvas preview, artifact, task replay, or document.
- Move secondary tools into tabs, menus, or compact rails.
- Avoid nested cards. A card may contain content, but page sections should not become boxes inside boxes.
- Use borders instead of heavy shadows. Shadows should be rare and subtle.

## Core Surfaces

### Top Bar

Contains the AIRES glyph, workspace name, primary navigation, and a small set of actions. The bar is 52px high on desktop and uses transparent/off-white chrome.

### Agent Rail

The agent rail is the left 340-392px column used by Cooper, Operator, and Computer Use. It holds the live voice state, chat/input, task selector, and approvals. It should feel like a collaborator, not a dashboard.

### Work Canvas

The right side is where artifacts, previews, diagrams, Computer Use replays, browser views, and generated documents appear. It should fill available space and preserve readable document scale.

### Channels

Channels are the future Slack-style collaboration layer where humans and agents can coordinate. The initial UI is a lightweight Home preview only; later work should add real rooms, messages, agent updates, and artifact embeds.

## Interaction Rules

- Cooper speaks when invoked; the UI should show whether he is listening, thinking, speaking, or running a tool.
- Background work must always expose status, checkpoints, and results.
- Approval requests should appear in the agent rail and as a floating confirmation when risk is high.
- Generated artifacts should be visible as soon as a preview is ready, with Markdown/source available as a secondary mode.

