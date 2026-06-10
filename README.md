# Cooper

Cooper is a local React + Express progressive web app for an AIRES executive voice assistant. It uses OpenAI Realtime 2 over WebRTC for live meeting audio and the OpenAI Responses API for post-call Markdown artifacts.

## Setup

```bash
npm install
cp .env.example .env
```

Add your OpenAI API key and a long private app password to `.env`:

```bash
OPENAI_API_KEY=sk-your-key-here
COOPER_APP_PASSWORD=use-a-long-random-password
COOPER_SESSION_SECRET=use-a-different-long-random-secret
```

Optional settings:

```bash
COOPER_SESSION_TTL_HOURS=168
COOPER_WORK_MODEL=gpt-5.4
COOPER_FALLBACK_WORK_MODEL=
# Fast model for the real-time canvas lane (diagrams, prototypes, wireframes). Defaults to COOPER_WORK_MODEL when unset.
COOPER_FAST_MODEL=
COOPER_JOB_DELAY_MS=15000
COOPER_JOB_MAX_ATTEMPTS=3
COOPER_JOB_MAX_OUTPUT_TOKENS=6500
# Knowledge base inline threshold (characters). Entries at or below this size are injected directly into
# the live Realtime session; larger entries are indexed into an OpenAI vector store and retrieved on demand.
COOPER_KB_INLINE_MAX_CHARS=6000
```

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## What Is Included

- Splash entry and mobile-first Cooper workspace.
- Password gate backed by `COOPER_APP_PASSWORD` and an HTTP-only signed session cookie.
- Full-screen WebRTC call mode with microphone input, model audio output, and animated waveform.
- Server-side Realtime session endpoint using `/v1/realtime/calls` with multipart `FormData` fields named `sdp` and `session`.
- `oai-events` data channel plus a sample `check_calendar(date, time)` function tool registered through `session.update`.
- Saved local call library with transcripts in `data/cooper.json`.
- Transcript capture for microphone/user turns and Cooper's spoken output transcript events.
- Post-call suggestions for work: post-call kit, execution plan, PRD, HTML prototype, follow-up summary, and code sketch.
- Rate-limited server-side job loop that calls `/v1/responses` one step at a time, retries transient/rate-limit failures, and writes artifacts to `data/artifacts`.
- HTML prototype artifacts are standalone inline HTML/CSS/JS and render in a sandboxed Work preview with Mobile and Desktop viewport toggles.
- Live shared canvas: Cooper can draw mermaid diagrams (`create_diagram`), high-fidelity HTML prototypes (`create_prototype`), and low-fidelity grayscale wireframes (`create_wireframe`) on a fast background lane while talking.
  - Each canvas tool accepts `speed` (`"fast"` | `"quality"`, default `fast`). `quality` runs a slower multi-step refine on the paced post-call lane with `COOPER_WORK_MODEL`; `fast` uses the real-time lane with `COOPER_FAST_MODEL`.
  - Iterate in place with `update_canvas_item(item_id, instruction, speed?)` or the per-tab Edit affordance, which `POST`s `/api/calls/:id/canvas/:itemId/update { instruction, speed? }` to regenerate an item from its current content plus the change while keeping the same tab and id.
  - Each canvas tab can be downloaded (mermaid `.mmd`, html/wireframe `.html`, plus rendered SVG export for diagrams).
  - Crash recovery: in-flight canvas jobs are requeued onto their original lane after a restart, and any item stuck `generating` with no active job is marked `failed`.
- Hybrid knowledge base per call: paste or upload context before or during a call. Small entries are injected straight into the live Realtime session; large entries are indexed into an OpenAI vector store and retrieved on demand via the `search_knowledge` tool. Any vector-store error gracefully degrades to injected prompt-mode context, so the feature never hard-fails.
- Live execution feedback through `/api/events` plus persisted per-job activity logs.
- Browser/PWA notifications when Cooper finishes queued work, plus manual retry for failed jobs.
- PWA manifest and service worker for installable mobile/browser use.

## Notes

- `COOPER_APP_PASSWORD` is required before Cooper API routes or Realtime sessions will run.
- `data/` is ignored by git because it contains local transcripts and generated artifacts.
- Cooper remains silent by default during meetings. He speaks when addressed by name, when you press **Call Cooper**, or when you submit a prompt.

## Docs Used

- [Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)
- [Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Responses API reference](https://platform.openai.com/docs/api-reference/responses)
- [gpt-realtime-2 model](https://developers.openai.com/api/docs/models/gpt-realtime-2)
