# chat-with-plan

A global [Claude Code](https://claude.com/claude-code) skill that sends the
plan you're working on to the local **Codex-voice** app (Cooper) and opens a
voice call pre-seeded with that plan as context — so you can talk it through out
loud with the realtime voice agent.

From any repo or session, invoke `/chat-with-plan` (or say "chat with plan",
"talk through this plan", etc.). The skill grabs the active plan, POSTs it to a
loopback-only ingest endpoint on the local Codex-voice server, and opens the
resulting call URL in your browser. If the dev server isn't running, it starts
it for you.

## Requirements

- Node.js 18+ (the skill uses built-in `fetch`; no npm dependencies).
- A local checkout of the **Codex-voice** app — the repository that ships this
  skill. The ingest endpoint requires `COOPER_INGEST_TOKEN` to be set in that
  app's `.env`; the `setup` command below generates and writes one for you.

## Install

From this directory:

```sh
./install.sh
```

This copies `SKILL.md` and `bin/` into `~/.claude/skills/chat-with-plan/` and
makes the binary executable.

## One-time setup

Point the skill at your Codex-voice checkout:

```sh
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs setup --voice-dir <path-to-Codex-voice>
```

Optional: override the dev server URL with `--base-url <url>` (defaults to
`http://localhost:3000`).

`setup` writes config to `~/.config/chat-with-plan/config.json` and ensures a
`COOPER_INGEST_TOKEN` exists in `<voice-dir>/.env`, generating a random one if
it is missing.

## Usage

After producing a plan (e.g. in plan mode, or a design doc), invoke the skill:

```
/chat-with-plan
```

The agent assembles the plan text, sends it via:

```sh
node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs send --plan-file <path> [--title <t>] [--repo <r>]
```

and opens the call. In the Codex-voice UI, click **"Start voice chat"** /
**"Call Cooper"** and grant microphone access to begin talking through the plan.

## How it works

1. `send` loads config and reads `COOPER_INGEST_TOKEN` from the Codex-voice
   `.env` (or `process.env`).
2. It health-checks `GET <baseUrl>/api/health`. If the server is down, it spawns
   `npm run dev` (detached, logging to a file under the system temp dir) and
   polls health for up to ~60s.
3. It POSTs the plan to `<baseUrl>/api/ingest/plan` with
   `Authorization: Bearer <token>` and a JSON body
   `{ plan, title, repo, source: "claude-code/chat-with-plan" }`.
4. On success it prints the full call URL (`<baseUrl><url>`) and opens it in the
   browser.
