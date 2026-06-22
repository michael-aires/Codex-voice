---
name: chat-with-plan
description: Send the current plan to the local Codex-voice app and open a voice call to talk it through. Use when the user says "chat with plan", "talk through this plan", "voice chat about the plan", "discuss this plan out loud", or after producing a plan they want to discuss by voice.
---

# chat-with-plan

Send the active plan to the local **Codex-voice** app (Cooper) and open a voice
call pre-seeded with that plan as context, so the user can talk through it out
loud with the realtime voice agent.

The heavy lifting (health-check, auto-starting the dev server, posting the plan,
opening the browser) is done by a bundled Node script. Your job is to assemble
the plan text and invoke that script.

## Steps

### 1. Assemble the plan text

Find the plan to send, in priority order:

1. The active plan-mode plan, if the host exposes one — e.g. the file at
   `$CLAUDE_PLAN_FILE` if that env var is set.
2. Otherwise, the most recent plan or design produced in the current
   conversation (the plan you just wrote, an `ExitPlanMode` plan, a design doc,
   etc.).
3. If neither can be found, ask the user to point you at a plan file or to paste
   the plan, and use that.

Write the assembled plan text to a temp file using the **Write** tool, e.g.
`/tmp/chat-with-plan-<something>.md`. Derive a short human title from the plan
(its first heading or first line, trimmed to a handful of words).

### 2. Send it

Run:

```
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs send --plan-file <tmpfile> --title "<title>" [--repo "<current repo name>"]
```

Pass `--repo` with the current repository's name when you can determine it
(e.g. the basename of the git repo root). Omit it otherwise.

On success the script prints a single URL line (the opened call URL) and opens
it in the default browser.

### 3. Handle "not configured"

If the script reports that chat-with-plan is **not configured**, it prints the
exact setup command. Run it, substituting the path to the Codex-voice checkout
on this machine:

```
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs setup --voice-dir <path-to-Codex-voice>
```

`setup` writes the config and ensures a `COOPER_INGEST_TOKEN` exists in the
Codex-voice `.env` (generating one if needed). Then retry step 2.

### 4. Report back

Tell the user:

- The plan was loaded into Codex-voice and a call was opened (give them the
  printed URL).
- In the app, click **"Start voice chat"** / **"Call Cooper"** and grant
  microphone access to begin talking through the plan.

## Notes

- This skill requires the local **Codex-voice** app (the repo that ships this
  skill). The dev server is auto-started if it is not already running, so the
  first call after a cold start may take a few seconds.
- The ingest endpoint is loopback-only and token-authenticated; `setup` manages
  the token for you.
