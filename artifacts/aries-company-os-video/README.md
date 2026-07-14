# AIRES Company OS videos

Two 1920×1080 AIRES-design-system videos based on the internal white paper *Aries Company OS — Turning organizational conversation into governed, verifiable work* (version 1.0, July 13, 2026). Both use the official transparent AIRES lockups supplied by the user.

The new 156.5-second product demo walks through a concrete governed session: starting from Today, selecting Notion and GitHub context, creating and reviewing a requirements brief during the session, ending the session, and confirming or rejecting post-session synthesis and decisions. The existing 163.4-second concept film remains available and includes bug triage, feature request, and customer onboarding chapters.

## Product demo deliverables

- Final video: `out/aries-company-os-demo.mp4`
- Static storyboard: `demo-storyboard.html`
- Scene model and anchors: `src/demo-storyboard.json`
- Remotion composition: `src/DemoComposition.tsx`
- Voiceover script: `demo-voiceover-script.md`
- Source ledger: `demo-source-ledger.md`
- Scope lock: `demo-scope-lock.md`
- Validation manifest: `demo-artifact-manifest.json`
- Representative Remotion frames: `qa-demo-stills/`
- Frames extracted from the final MP4: `qa-demo-encoded/`

## Concept film deliverables

- Final video: `out/aries-company-os.mp4`
- Static storyboard: `storyboard.html`
- Scene model and anchors: `src/storyboard.json`
- Voiceover script: `voiceover-script.md`
- Source ledger: `source-ledger.md`
- Validation manifest: `artifact-manifest.json`
- Representative Remotion frames: `qa-stills-v2/`
- Frames extracted from the final MP4: `qa-encoded/`

## Commands

```sh
npm install
npm run lint
npm run dev
npm run voiceover
npm run render
npm run voiceover:demo
npm run render:demo
```

OpenAI voiceover commands read `OPENAI_API_KEY` from the current process, the repository-level `.env`, or this artifact's `.env` and `.env.local`. Copy `.env.example` when local configuration is needed. The checked-in demo narration was generated with `gpt-4o-mini-tts` and the Nova voice; run `npm run voiceover:demo` to regenerate the ten scene files. Environment files are ignored and secret values must not be committed.

The artifact is classified internal. Publishing was intentionally not run; use an authenticated private target before sharing outside the local workspace.
