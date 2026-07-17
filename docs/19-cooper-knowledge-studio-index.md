# Cooper Knowledge Studio

Product index for human-authored documents, editable session canvases, diagrams, and agent retrieval.

Date: July 16, 2026

## Package

- Interactive prototype: [cooper-knowledge-studio-prototype.html](./cooper-knowledge-studio-prototype.html)
- Docs library concept: [cooper-knowledge-studio-library-concept.png](./cooper-knowledge-studio-library-concept.png)
- Docs library render: [cooper-knowledge-studio-library-desktop.png](./cooper-knowledge-studio-library-desktop.png)
- Workspace launcher reveal: [cooper-knowledge-studio-library-launcher-hover-desktop.png](./cooper-knowledge-studio-library-launcher-hover-desktop.png)
- Workspace navigation drawer: [cooper-knowledge-studio-library-nav-open-desktop.png](./cooper-knowledge-studio-library-nav-open-desktop.png)
- Private editor concept: [cooper-knowledge-studio-editor-concept.png](./cooper-knowledge-studio-editor-concept.png)
- Diagram concept: [cooper-knowledge-studio-diagram-concept.png](./cooper-knowledge-studio-diagram-concept.png)
- Scoped implementation plan: [20-cooper-knowledge-studio-build-plan.md](./20-cooper-knowledge-studio-build-plan.md)

## Source context

The product direction came from the July 16 design discussion and these references:

- `Screenshot 2026-07-16 at 12.18.02 AM.png`: the preferred document typography and quiet page rhythm.
- `Screenshot 2026-07-16 at 12.21.33 AM.png`: the preferred homepage hierarchy, open main canvas, and useful right detail rail.
- `Screenshot 2026-07-16 at 12.26.15 AM.png`: the Cooper / AIRES Workspace lockup and the requirement for fully collapsible navigation.
- [cooper-aires-live-canvas-minimal-prototype.html](./cooper-aires-live-canvas-minimal-prototype.html): the approved minimal session tabs, compact actions, and content-first canvas.

Notable phrases preserved from the source discussion:

- “Human and AI collaboration.”
- “Original thought.”
- “People want to feel like they are making an impact” and “doing work.”
- “Sometimes people want to start with a blank page.”
- “Sometimes you just want that private moment.”
- Context comes from meetings, but it also comes from humans doing the writing.

## Product thesis

Cooper should not treat documents as static artifacts generated after a session. Documents are a primary way people think, decide, and create context.

The Knowledge Studio gives human writing equal standing with meetings and agent work:

1. A person can start privately from a blank page or a light template.
2. The page is a familiar, full-screen WYSIWYG editor rather than a read-only preview.
3. Cooper remains available but is not active by default.
4. Starting Cooper explicitly binds the current document version to a session.
5. Shared or published work becomes durable organizational context that Cooper can retrieve later.
6. Diagrams use the same lifecycle: editable source, version history, a readable derivative, and retrieval eligibility.

## Core product principles

### Writing is the work

The document, not the assistant, is the focal point. The editor should feel closer to a minimal Microsoft Word than a chat application with a document attachment.

### Private by default

Opening or creating a document does not begin a session. Autosave works normally, but the draft is unavailable to Cooper and excluded from organizational retrieval until the user changes that state.

### Cooper is invited

“Start with Cooper” is an explicit transition. It can expose the current draft to the active session without automatically publishing or globally indexing it.

### One source, many useful representations

The editable source remains authoritative. Markdown, plain text, search chunks, embeddings, previews, and agent summaries are derived representations that can be rebuilt.

### Context must be attributable

When Cooper uses stored knowledge, the UI should show the documents and versions that informed the answer. Retrieval must respect workspace, project, visibility, and user permissions before similarity scoring.

## Information architecture

Primary navigation becomes:

```text
Today | Sessions | Projects | Docs | Settings
```

`Docs` replaces the artifact-centric idea of a generic Library for human-facing work. Generated outputs may still exist as artifacts internally, but anything intended to be read, edited, shared, or reused should graduate into a document or diagram.

The navigation is intentionally absent from the default canvas. A naked Cooper mark sits on the white workspace; hover or keyboard focus reveals the `Cooper / AIRES WORKSPACE` lockup, and clicking it opens the full left navigation drawer. This keeps the product hierarchy available without reserving permanent screen width or adding a competing top bar.

## Screen inventory

### 1. Docs library

Purpose: discover, search, filter, resume, and create knowledge.

Key elements:

- No persistent top or left navigation; the Cooper workspace launcher reveals navigation on demand.
- Large “Search your knowledge” input.
- Filters for All, Documents, Diagrams, Published, and Mine.
- One primary New menu: blank document, template, or blank diagram.
- Open list rows with title, excerpt, type, owner, edited time, and published state.
- Homepage-style right detail rail for owner, project, visibility, versions, and open action.
- A restrained template strip below the active list.

Prototype states:

- Search and filters update the visible list.
- Selecting a row updates the detail rail.
- New opens a starter chooser.
- Opening a document enters the editor; opening a diagram enters the node canvas.

### 2. New work chooser

Purpose: avoid blank-page anxiety without making a template mandatory.

Initial options:

- Blank document.
- Project brief.
- Meeting notes.
- Blank diagram.

The first production slice should keep the template schema simple: a title, description, initial structured document JSON, and optional project/type metadata.

### 3. Private document editor

Purpose: a focused place for human writing.

Key elements:

- Full-screen shell with back-to-Docs, title, autosave state, Share, Start with Cooper, and overflow.
- Sparse toolbar for paragraph styles, emphasis, lists, links, and comments.
- Centered 820px writing page using Inter, generous line height, and the same scale as the approved Daily Catch Up view.
- Right rail with Format, Blocks, and Details.
- Collapsed Ask Cooper launcher.
- Explicit “Private draft — not available to Cooper” state.

Prototype states:

- The page is contenteditable and accepts direct edits.
- Formatting controls operate on the selected text.
- Blocks insert a section, callout, list, or simple comparison structure.
- Details show ownership, visibility, version, canonical format, and retrieval state.
- Autosave state changes from Saving to Saved.

### 4. Document plus Cooper

Purpose: invite AI collaboration without turning writing into an always-on session.

Transition:

```text
Private draft --Start with Cooper--> Session-only document context
```

Behavior:

- The current unsaved/saved snapshot is sent directly to the active session.
- The right rail becomes a focused Cooper conversation.
- The session can revise, challenge, summarize, or connect the draft to other permitted knowledge.
- Ending the session removes the session binding; it does not delete the draft.
- Starting Cooper does not automatically publish the document or make it globally retrievable.

### 5. Editable session canvas

Purpose: remove the read-only boundary between a session artifact and human writing.

Behavior:

- “Create → Blank document” in a session opens the same WYSIWYG editor component inside the Canvas tab.
- Documents generated by Cooper are immediately editable using the same model and toolbar.
- Session Canvas, Docs, and later re-opened versions reference the same document ID.
- The active session receives direct document updates; future sessions retrieve only eligible saved versions.

### 6. Diagram workspace

Purpose: support spatial thinking as first-class knowledge.

Key elements:

- React Flow-style node canvas with a restrained toolbar.
- Human-editable nodes, edges, groups, labels, and properties.
- Private-by-default and optional Start with Cooper behavior identical to documents.
- “Knowledge representation” status and an agent-readable summary preview.

The visual graph is not itself sufficient retrieval text. Save both:

- Editable graph JSON: nodes, edges, groups, positions, styles, and viewport.
- Derived text snapshot: node labels, edge relationships, group hierarchy, notes, and a concise deterministic summary.

## Document lifecycle

```text
Private draft
  -> Session-only (explicit Start with Cooper)
  -> Shared (named people or project)
  -> Published (retrieval-eligible workspace knowledge)
  -> Archived
```

Important distinction:

- **Saved** means durable and versioned.
- **Shared** means another authorized human can open it.
- **Session-only** means the active Cooper session can read the current snapshot.
- **Published** means eligible for knowledge retrieval, subject to permissions and filters.

## Canonical formats

### Rich text documents

The implemented prototype stores sanitized rich HTML as the authoritative browser-editable source and derives Markdown and plain text on every save. That makes the WYSIWYG workflow, export, versioning, and retrieval pipeline testable without prematurely choosing an editor framework.

For production, migrate the authoritative source to a structured editor document such as a ProseMirror/Tiptap, Lexical, or equivalent JSON tree. The editor engine remains a production build decision that should be selected through a focused round-trip and paste-sanitization spike.

Store derived forms beside each version:

- Canonical structured JSON for lossless production editing (sanitized rich HTML in this prototype).
- Markdown for portability and repository/file workflows.
- Normalized plain text for search, diffing, accessibility, and indexing.
- Optional rendered HTML for previews, never as the only source.

### Diagrams

Store:

- React Flow-style graph JSON as the editable source.
- Deterministic Markdown/text describing groups, nodes, edges, and notes.
- Optional Mermaid export where the graph can be represented faithfully.

### Files and attachments

Retain the original uploaded file and a parsed text representation. The parsed derivative should link to the exact file version and parser version so it can be rebuilt.

## Retrieval recommendation

### Short answer

Yes, use retrieval-augmented generation. Use embeddings as one part of retrieval, not as the document store and not as a substitute for permissions, versioning, or exact text.

For the first production slice, use OpenAI vector stores and the Responses API `file_search` tool behind a small application-owned knowledge service. OpenAI’s Retrieval documentation says vector stores power semantic search and that uploaded files are automatically chunked, embedded, and indexed. The File Search tool can then retrieve relevant file content for a model response.

Official references:

- [OpenAI Retrieval guide](https://developers.openai.com/api/docs/guides/retrieval)
- [OpenAI File Search guide](https://developers.openai.com/api/docs/guides/tools-file-search)
- [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
- [Responses API migration and native tools](https://developers.openai.com/api/docs/guides/migrate-to-responses)

### Why embeddings help

Embeddings allow semantic search to find related ideas even when the query and document do not share the same words. That is useful for questions such as “What have we learned about onboarding friction?” when the source document says “invite-flow abandonment.”

Keyword search still matters for names, IDs, project codes, quoted phrases, and exact terminology. The retrieval layer should therefore support hybrid ranking or combine semantic and lexical results rather than relying only on cosine similarity.

### Recommended context order

When Cooper answers inside a document or session, assemble context in this order:

1. Current document snapshot, passed directly and exactly.
2. Explicitly pinned sources selected by the user.
3. Project and session sources already bound to the work.
4. Semantic and keyword retrieval over published/authorized knowledge.
5. General workspace retrieval only when the query needs it.

The current document should not be retrieved through RAG while it is open. Direct context is more exact and avoids stale-index behavior.

### Ingestion policy

Do not upload a new vector-store file on every keystroke.

- Autosave structured document versions frequently.
- Generate a normalized text/Markdown projection after a debounce.
- For private drafts, stop there.
- For a session-only draft, send the latest snapshot directly to that session.
- On publish, eligible share, or an explicit “make available to Cooper” action, enqueue the latest version for indexing.
- Record the indexed document version, vector store, file ID, parser/chunker version, and status.
- Re-index only when the retrieval-eligible version changes.

### Tenant and permission boundary

Start with one vector store per workspace or tenant, not one global store. Attach attributes such as:

```json
{
  "document_id": "doc_123",
  "version_id": "docv_8",
  "project_id": "project_product",
  "visibility": "published",
  "owner_id": "user_42",
  "document_type": "rich_text",
  "updated_at": 1784189520
}
```

The application must authorize the caller and build attribute filters before retrieval. The model should never be trusted to enforce document permissions by prompt.

### Retrieval response contract

The knowledge service should return:

```ts
interface KnowledgeHit {
  documentId: string;
  versionId: string;
  title: string;
  excerpt: string;
  score: number;
  sourceUrl: string;
  projectId?: string;
  updatedAt: string;
}
```

Cooper responses that depend on stored knowledge should preserve these source references so the UI can show “Used in this answer” with document title and version.

### When to move beyond hosted File Search

OpenAI-hosted vector stores are appropriate for an MVP because they remove custom chunking, embedding, and index operations. Reconsider a self-managed hybrid index when the product needs one or more of:

- Complex row-level permissions or cross-tenant policies.
- Custom language analyzers and exact lexical ranking.
- Very frequent partial-document updates.
- Cross-provider model portability.
- Custom chunk visibility, deletion guarantees, or data residency.
- Retrieval evaluation controls that cannot be expressed through vector-store ranking and filters.

If that point arrives, keep the same knowledge-service interface and replace its storage adapter rather than changing editor or agent code.

## Initial domain model

```ts
type DocumentType = "rich_text" | "diagram";
type Visibility = "private" | "session_only" | "shared" | "published" | "archived";

interface KnowledgeDocument {
  id: string;
  workspaceId: string;
  projectId?: string;
  ownerId: string;
  title: string;
  type: DocumentType;
  visibility: Visibility;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentVersion {
  id: string;
  documentId: string;
  sourceJson: unknown;
  markdown: string;
  plainText: string;
  createdBy: string;
  createdAt: string;
  reason: "autosave" | "manual" | "publish" | "agent_revision";
}

interface KnowledgeIndexRecord {
  id: string;
  documentId: string;
  versionId: string;
  provider: "openai_vector_store" | "self_managed";
  vectorStoreId?: string;
  fileId?: string;
  status: "queued" | "indexing" | "ready" | "failed" | "deleted";
  indexedAt?: string;
  error?: string;
}

interface SessionDocumentBinding {
  sessionId: string;
  documentId: string;
  versionId: string;
  mode: "direct_snapshot" | "retrieval";
  attachedAt: string;
  detachedAt?: string;
}
```

## Decisions represented in the prototype

- Use `Docs` as the human-facing navigation label.
- Keep the approved compact 64px Cooper header.
- Use Inter for both editor content and application chrome.
- Make the editor full-screen with no persistent left navigation.
- Keep formatting and reusable blocks in the same right utility rail.
- Keep Cooper collapsed until invited.
- Make privacy/retrieval state visible in the editor, not hidden in settings.
- Treat diagrams as documents with a text derivative.
- Use one editor component in Docs and Session Canvas.

## Implemented prototype status

The localhost application now implements the complete prototype loop:

- On-demand Cooper workspace launcher and overlay navigation.
- Searchable/filterable Docs library, starter chooser, private document creation, and deep links.
- Full-screen contenteditable WYSIWYG writing with formatting, blocks, autosave, optimistic concurrency, durable versions, restore, export, archive, and responsive tools.
- Private, team-shared, session-only, and published lifecycle transitions.
- Explicit Start with Cooper / End session behavior and a document-scoped Responses conversation.
- The same editor mounted in Session Canvas Write, with exact saved text synchronized into live session context.
- Editable diagram JSON with deterministic Markdown/plain-text projection.
- OpenAI Files/vector-store ingestion, permission-filtered `file_search`, citations, unpublish cleanup, retry states, and status polling.
- Automated model, persistence, provider-adapter, design-contract, and regression tests, plus desktop and 390px browser verification.

This is intentionally a prototype architecture: local JSON persistence and sanitized rich HTML keep the product loop concrete. A production rollout still needs the structured editor engine, database migrations, real identity/authorization grants, a durable background job queue, and retrieval evaluation against representative workspace data.

## Assumptions to validate

- `Docs` is clearer than `Knowledge` or `Library` for the primary navigation label.
- Team members understand the difference between saved, shared, session-only, and published.
- A right utility rail is preferable to a floating toolbar for blocks and page-level formatting.
- The first WYSIWYG engine can round-trip the required Markdown subset without destructive loss.
- Workspace-level OpenAI vector stores plus metadata filters are sufficient for the initial permission model.
- Diagram text projection can be deterministic enough for reliable retrieval without model-generated summaries on every save.

## Open questions

- Which editor engine best fits the existing React application and desired Markdown round-tripping?
- Should private documents support optional local-only search before publication?
- Does “shared” automatically become retrieval-eligible, or is “published to Cooper” a separate switch?
- How should concurrent human and Cooper edits be reconciled: suggestion mode, tracked changes, or direct edits with version restore?
- Is collaborative multiplayer editing required in the first year, or can versioned single-writer editing ship first?
- Should comments and suggestions be part of document context by default?
- Which knowledge scopes are selectable when starting a session: current document, current project, selected docs, or workspace?
- What is the retention/deletion contract for indexed versions after a document is unpublished or deleted?

## Success signals

- People create and return to human-authored documents without starting sessions.
- Blank and template starts both lead to saved work.
- Private-draft leakage into retrieval remains zero.
- Users can identify which sources informed a Cooper answer.
- Search success and document-open rate improve relative to the current artifact Library.
- A document created in a session can be reopened, edited, versioned, and retrieved later without conversion.
