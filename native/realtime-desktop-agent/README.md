# Realtime Desktop Agent

Native macOS MVP shell for a realtime voice agent. The app is intentionally split into:

- SwiftUI macOS host
- WKWebView realtime client
- Local Node token broker
- Local workspace tool runtime

The broker uses the current OpenAI Realtime GA WebRTC flow: the client posts SDP to the local broker, and the broker forwards multipart `sdp` plus `session` fields to `https://api.openai.com/v1/realtime/calls`.

## Run

1. Export an OpenAI API key in the environment that launches Xcode:

```bash
export OPENAI_API_KEY="sk-..."
open native/realtime-desktop-agent/RealtimeDesktopAgent.xcodeproj
```

2. Select the `RealtimeDesktopAgent` scheme and run on My Mac.

The app starts a local Node broker on an available `127.0.0.1` port and loads the bundled web client into WKWebView.

Optional overrides:

```bash
export APPROVED_WORKSPACE="/Users/michaelmoll/Documents/aires-code-repos/Codex-voice"
export REALTIME_AGENT_MODEL="gpt-realtime-2"
export REALTIME_VOICE="marin"
```

## MVP Surface

- Start/end realtime voice call
- Mute/unmute
- Interrupt response
- Live transcript
- Canvas cards and tables
- Visible tool activity log
- Local file search and file reads inside one approved workspace

## Tool Mapping

Realtime function names are API-safe. The UI and agent prompt map them to the intended namespaced tool IDs:

| MVP tool ID | Function name |
| --- | --- |
| `canvas.show_card` | `canvas_show_card` |
| `canvas.show_table` | `canvas_show_table` |
| `local.search_files` | `local_search_files` |
| `local.read_file` | `local_read_file` |
| `app.open_url` | `app_open_url` |
| `app.copy_to_clipboard` | `app_copy_to_clipboard` |

## Security Notes

- The OpenAI API key is only read by the local broker.
- The WKWebView client never receives the standard API key.
- File tools are restricted to `APPROVED_WORKSPACE`.
- External URL opens require confirmation.
- Tool calls are logged visibly in the app.

## Current Limits

- This is a development build and expects Node.js on the Mac.
- The WKWebView path is the MVP bridge; native WebRTC can replace it later.
- Transcripts are in-memory only in this first slice.
