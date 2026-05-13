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
COOPER_JOB_DELAY_MS=15000
COOPER_JOB_MAX_ATTEMPTS=3
COOPER_JOB_MAX_OUTPUT_TOKENS=6500
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
