# chat-with-plan

Send a Markdown plan from Claude Code or another local agent into Cooper as a durable context packet and saved session.

The command uses Cooper's loopback-only, bearer-token-protected plan ingest endpoint. The returned record has three equivalent destinations:

- Web: `/?call=<session-id>`
- Universal link: `/open/sessions/<session-id>`
- iOS: `cooper://sessions/<session-id>`

## Install

```bash
./install.sh
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs setup --voice-dir /path/to/Codex-voice
```

Setup stores local configuration under `~/.config/chat-with-plan/` and creates `COOPER_INGEST_TOKEN` in the Cooper checkout's `.env` when missing.

## Send a plan

```bash
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs send \
  --plan-file /tmp/implementation-plan.md \
  --repo Codex-voice \
  --target both
```

`--target web` is the default. On macOS, `ios` and `both` open the exact saved session in a booted iOS Simulator through `simctl`; the web destination is opened in the default browser.

If Cooper is not running, the command starts `npm run dev` in the configured checkout and waits for `/api/health` before ingesting the plan.
