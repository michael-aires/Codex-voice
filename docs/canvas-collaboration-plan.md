# Cooper — Real-Time Visual Collaboration Canvas: Engineering Plan

> **Goal:** Turn Cooper from a post-call artifact generator into a **live visual collaboration partner**. During a call, Cooper can draw mermaid diagrams, build HTML prototypes, and sketch wireframes via Realtime tool calls that run in the background and **pop into a multi-tab canvas** when ready — while the conversation keeps flowing. Plus a **knowledge base** to feed Cooper context (paste/upload) that is either injected into the live session or indexed in an OpenAI vector store for retrieval.
>
> **Status:** Plan for eng-review. Grounded in the current code (`server.js` 1110 LOC, `src/main.jsx` 1707 LOC).

## Locked product decisions
- **KB ingestion = Hybrid**: small context → live session prompt; large docs → chunked into an OpenAI vector store, retrieved on demand via a `search_knowledge` tool.
- **Generation latency = both fast and quality**: in-call tool calls default to a **fast single-shot** pass (seconds); a **quality multi-step** pass is available when Cooper or Michael asks to "take time." The generation tool carries a `speed` hint.
- **Delivery = phased with checkpoints**: ship Phase 1, review, then Phase 2, review, then Phase 3.

---

## 1. Current-state baseline (what exists today)

- **Realtime call** over WebRTC, data channel `oai-events`; client registers one tool `check_calendar` via `session.update` ([src/main.jsx:53-120](../src/main.jsx)). Function calls handled in `handleFunctionCall` ([src/main.jsx:371-392](../src/main.jsx)).
- **Post-call artifacts only**: `POST /api/calls/:id/artifacts` enqueues a job; a single in-process worker runs the multi-step Responses loop (`createResponse`, ~15s pacing between steps) and writes `.md`/`.html` to `data/artifacts/` ([server.js:424-703](../server.js)).
- **Artifact preview**: markdown → markdown-it + DOMPurify; HTML → sandboxed `<iframe srcDoc>` with Mobile/Desktop toggle ([src/main.jsx:1391-1450](../src/main.jsx)).
- **State/eventing**: JSON file DB `{calls, artifacts, jobs}`; SSE `/api/events` broadcasts `state.updated`; client refetches `/api/state`.
- **Gaps**: no in-call generation, no canvas, no multi-tab surface, no knowledge base, HTML sometimes renders blank/escaped.

### Known rendering bugs to fix in Phase 1
1. **View-mode mismatch** — markdown uses modes `rendered`/`markdown`; HTML uses `preview`/`html`. Shared `mode` state can land an HTML artifact in a non-matching branch → raw HTML dumped into `<pre>` (escaped text). Fix: per-type mode, or reset `mode` to the type's default when the selected artifact changes ([src/main.jsx:1322-1447](../src/main.jsx)).
2. **HTML extraction fragility** — `extractHtmlDocument` falls back to the "could not isolate" page when the model's output isn't a clean fenced/`<!doctype>` block ([server.js:899-916](../server.js)). Fix: strengthen extraction (strip the `<!-- Cooper step N -->` markers first, prefer the largest valid `<html>…</html>` span) and make the fallback render the content rather than an apology.
3. **Mermaid is only fenced-in-markdown** — promote mermaid to a first-class canvas item type with its own render path ([src/main.jsx:1594-1615](../src/main.jsx)).

---

## 2. Target architecture

### 2.1 Canvas model
A **canvas item** is the unit shown in a tab:
```
CanvasItem {
  id, callId,
  type: "mermaid" | "html" | "wireframe" | "markdown",
  title,
  status: "generating" | "ready" | "failed",
  content,                // inline for mermaid/markdown; html string for html/wireframe
  file,                   // disk path for html/wireframe (reuse artifacts dir)
  source: "in_call_tool" | "post_call" | "manual",
  speed: "fast" | "quality",
  jobId, error,
  createdAt, updatedAt
}
```
Stored per call (`call.canvasItems[]`) and surfaced through `/api/state`. Each item maps to one tab in the Canvas panel.

### 2.2 In-call generation tools (Realtime function tools)
Register additional client-side tools in `sessionUpdate.tools` (alongside `check_calendar`):
- `create_diagram({ title, description, diagram_type, speed? })` → mermaid
- `create_prototype({ title, brief, fidelity?, speed? })` → standalone HTML
- `create_wireframe({ title, brief, speed? })` → low-fidelity HTML wireframe
- `update_canvas_item({ item_id, instruction })` → iterate an existing item
- `search_knowledge({ query })` → retrieve from the KB (Phase 2)

**Flow:** Cooper emits a `function_call` → client `handleFunctionCall` routes the new tool → `POST /api/calls/:id/canvas {type, brief, speed}` → server creates a `generating` canvas item + job, returns the item id → client replies `function_call_output` ("Started '<title>' — it'll appear on the canvas shortly") + `response.create` so Cooper acknowledges verbally and keeps talking. When the job finishes, **SSE pushes `canvas.item.updated`** → the tab flips from skeleton to rendered content → client sends a data-channel `conversation.item.create` system note so Cooper can say "the diagram's ready." Optional browser notification.

### 2.3 Generation backend (fast + quality)
Extend the job system with a **canvas job** kind:
- **fast** (`speed: "fast"`, default in-call): a single `createResponse` call with `reasoning.effort: "low"` and a type-specific instruction (mermaid syntax / standalone HTML / wireframe). Target: item ready in a few seconds.
- **quality** (`speed: "quality"`): the existing multi-step recipe loop (plan → expand → build) for polished output.
- Mermaid output is validated before marking `ready`; on parse failure, retry once with a "fix the mermaid syntax" pass, else mark `failed` with the raw text available.

**Fast lane (eng-review D1 — accepted).** In-call fast jobs must NOT be subject to the global 15s pacing (`lastGenerationAt + jobDelayMs`, [server.js:502-507](../server.js)) and must not queue behind long post-call jobs. Implement a **separate fast worker lane**: fast canvas jobs run immediately on their own small concurrency pool (e.g. ≤2 in flight); the existing single worker keeps handling `quality`/post-call jobs under the 15s pace. This is the change that makes the feature feel live rather than "it'll show up eventually."

**Fast-path model (eng-review D3 — accepted).** Add `COOPER_FAST_MODEL` (default a quicker model than `gpt-5.4`); the fast lane uses it, the quality path keeps `COOPER_WORK_MODEL`.

**Mermaid safety (folded in).** Render mermaid with `securityLevel: 'strict'` and sanitize the produced SVG (the source is LLM-authored). Diagrams render in the main DOM as sanitized SVG; HTML/wireframe prototypes stay in the `<iframe sandbox>` without `allow-same-origin`.

### 2.4 Knowledge base (Hybrid)
- **Capture UI**: a "Context" panel (pre-call and during-call) to paste text or upload files; each entry gets a name and an ingestion mode.
- **Routing by size** (auto, overridable): small (≤ ~6k chars) → **session injection**; large → **indexed**.
  - *Session injection*: appended to Cooper's instructions; if mid-call, pushed via `session.update` so it's live immediately.
  - *Indexed*: chunk → OpenAI **Files API** upload → **vector store** add; store `vectorStoreId`/`fileId` on the entry.
- **Retrieval**: `search_knowledge` tool → `POST /api/knowledge/search` → query the vector store → return top snippets to Cooper as `function_call_output`.
- **Data model**: `KbEntry { id, callId?, name, mode: "prompt"|"indexed", text|fileRef, vectorStoreId?, fileId?, chars, createdAt }`.

### 2.5 New endpoints
- `POST /api/calls/:id/canvas` — enqueue canvas generation (`{type, brief, speed}`) → 202 `{item}`
- `GET /api/canvas/:id/content` — raw content (or reuse `/api/artifacts/:id/content`)
- `POST /api/calls/:id/canvas/:itemId/update` — iterate
- `POST /api/calls/:id/knowledge` — add KB entry (paste/upload)
- `GET /api/calls/:id/knowledge` — list
- `POST /api/knowledge/search` — retrieval
- **SSE additions**: `canvas.item.created`, `canvas.item.updated`, `knowledge.updated` — these carry the **item payload** (id, status, type, title, and content/file when ready) so the client patches one tab instead of refetching all of `/api/state` on every step (folded in from review).

---

## 3. Phased delivery

### Phase 1 — Foundation: fix rendering + multi-tab canvas + in-call diagrams (CHECKPOINT)
- Fix the two render bugs (view-mode mismatch, extraction/fallback) and promote **mermaid** to a first-class render path.
- Build the **Canvas panel**: multi-tab UI, available **during the call** (split/overlay with the call screen) and post-call; per-tab render for mermaid/html/markdown; `generating` skeleton → `ready` pop-in driven by SSE; add/switch/close tabs.
- Add Realtime tools `create_diagram` + `create_prototype`; client routing; server `POST /api/calls/:id/canvas` + **fast** generation path on a **dedicated fast worker lane** (bypasses the 15s pacing, separate concurrency — D1) using `COOPER_FAST_MODEL` (D3); canvas item data model + targeted SSE events; Cooper announces completion over the data channel.
- **Tests (eng-review D2 — in Phase 1):** stand up **vitest**; cover the regression fixes (`extractHtmlDocument` hardening, artifact view-mode selection) and the canvas job lifecycle (enqueue → fast-lane run → `ready`/`failed`, mermaid validate + one retry). This establishes the harness the later phases extend.
- **Acceptance:** On a live call, "Cooper, draw a mermaid diagram of this flow" produces a new canvas tab that renders a correct diagram within seconds (fast lane, not blocked by post-call jobs) while the conversation continues; existing post-call HTML artifacts render correctly (no blank/escaped output); `npm test` passes the new suite.

### Phase 2 — HTML/wireframe generation + Knowledge base (CHECKPOINT)
- `create_wireframe` tool + dedicated low-fi wireframe styling; harden `create_prototype` quality.
- KB capture UI (paste/upload), storage, **hybrid routing** (prompt injection vs OpenAI vector store), `search_knowledge` retrieval tool, live `session.update` injection for mid-call additions.
- **Acceptance:** Paste a doc before/at any point in a call; Cooper can answer from it (retrieval or injected) and reference it when generating a prototype/wireframe that appears on the canvas.

### Phase 3 — Quality, iteration & polish (CHECKPOINT)
- **quality** multi-step path wired to the `speed` hint; `update_canvas_item` iteration; export/download; design-system polish for diagrams/prototypes/wireframes; accessibility; persistence robustness; a focused test suite (currently none) covering extraction, canvas job lifecycle, and KB routing.
- **Acceptance:** "Take your time and make it production-grade" yields a refined artifact; "make the header sticky" iterates the existing tab; outputs look designed, not default.

---

## 4. Risks & mitigations
- **Realtime tool-call reliability** — the model may not call tools consistently; mitigate with explicit tool instructions in the session prompt and a manual "Ask Cooper to diagram this" button as a fallback trigger.
- **Latency vs. quality** — fast path must feel instant; cap fast output tokens and use low effort; show an honest skeleton with progress.
- **iframe safety** — keep the sandbox without `allow-same-origin`; never inject KB secrets into prototypes.
- **Mermaid render failures** — validate + one auto-fix retry before surfacing failure.
- **Single-process job worker** — fast canvas jobs share the worker; ensure in-call jobs are prioritized over post-call ones so live requests aren't stuck behind the 15s pacing.
- **Vch store cost/PII** — meeting context is sensitive; make indexing explicit, scope vector stores per call, and allow deletion.

## 5. Out of scope (this effort)
Multi-user/real-time co-editing between humans, real calendar integration, auth/multi-tenant changes, moving off the JSON file store (tracked separately in the hardening roadmap).

## 6. What already exists (reused, not rebuilt)
- Responses-API generation (`createResponse`, retry/backoff, `RetryableJobError`) — extended with a fast lane, not replaced.
- Single-worker job loop + crash recovery — kept for quality/post-call; fast lane added alongside.
- Sandboxed `<iframe srcDoc>` preview + Mobile/Desktop toggle — reused for html/wireframe canvas items.
- Lazy mermaid import + render path — promoted to a first-class canvas item type.
- SSE `/api/events` + `updateDb` broadcast — extended with targeted `canvas.item.*` payloads.
- `data/artifacts/` file store + `/api/artifacts/:id/content` — reused for html/wireframe item bytes.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open → resolved | 3 decisions (all accepted), 0 critical gaps remaining |

**Decisions folded in:**
- **D1 (architecture):** Dedicated fast worker lane for in-call generation — bypasses the 15s global pacing and runs separate from post-call jobs. Resolves the top real-time risk.
- **D2 (tests):** Minimal vitest suite pulled into Phase 1 — covers the HTML-extraction + view-mode regression fixes and the canvas job lifecycle. Regression rule satisfied.
- **D3 (perf/config):** `COOPER_FAST_MODEL` for the fast lane; quality path keeps `gpt-5.4`.

**Folded in without a decision:** mermaid `securityLevel: 'strict'` + SVG sanitize; targeted `canvas.item.*` SSE payloads instead of full-state refetch; iframe sandbox stays without `allow-same-origin`.

**Critical failure modes covered by Phase 1:** blank/escaped HTML render (fixed + regression test); in-call latency (fast lane); mermaid syntax errors (validate + one retry, else `failed` with raw text visible).

**UNRESOLVED:** none.

**VERDICT:** ENG CLEARED — plan is solid and scope unchanged. Ready to implement Phase 1.
