# Demo scope lock

- Source of truth: `demo-source-ledger.md` and the user-requested flow.
- Renderer: AIRES-styled HTML storyboard plus a 1920×1080, 30 fps Remotion composition named `AriesCompanyOSDemo`.
- Format: a product walkthrough showing the UI state change across one durable session.
- Required beats: Start session; define purpose; select Notion/GitHub/meeting context; in-session Make a document; review before write; End and synthesize; post-session synthesis and decision confirmation; governed closeout.
- Voiceover: OpenAI `gpt-4o-mini-tts` with Nova is the preferred regeneration path. This run uses the on-device macOS Shelley voice because `OPENAI_API_KEY` was absent from the process, `.env`, and `.env.local`.
- Brand: exact user-supplied AIRES lockups, warm-neutral canvas, soft-black ink, Volt focus, sparse orange/sky state colors.
- Claim rule: all UI is visibly labeled as an illustrative proposed workflow.
- Non-goals: public deployment, live connector validation, claims of complete production implementation, real customer data, or customer-facing publication.
