import React from "react";
import AlignCenter from "lucide-react/dist/esm/icons/align-center";
import AlignLeft from "lucide-react/dist/esm/icons/align-left";
import AlignRight from "lucide-react/dist/esm/icons/align-right";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Bold from "lucide-react/dist/esm/icons/bold";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Copy from "lucide-react/dist/esm/icons/copy";
import Download from "lucide-react/dist/esm/icons/download";
import FileDown from "lucide-react/dist/esm/icons/file-down";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban";
import Globe2 from "lucide-react/dist/esm/icons/globe-2";
import Hand from "lucide-react/dist/esm/icons/hand";
import Heading from "lucide-react/dist/esm/icons/heading";
import History from "lucide-react/dist/esm/icons/history";
import Italic from "lucide-react/dist/esm/icons/italic";
import Link from "lucide-react/dist/esm/icons/link";
import List from "lucide-react/dist/esm/icons/list";
import ListOrdered from "lucide-react/dist/esm/icons/list-ordered";
import Lock from "lucide-react/dist/esm/icons/lock";
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import MousePointer2 from "lucide-react/dist/esm/icons/mouse-pointer-2";
import Network from "lucide-react/dist/esm/icons/network";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import Plus from "lucide-react/dist/esm/icons/plus";
import Redo2 from "lucide-react/dist/esm/icons/redo-2";
import Search from "lucide-react/dist/esm/icons/search";
import Send from "lucide-react/dist/esm/icons/send";
import Settings from "lucide-react/dist/esm/icons/settings";
import Share2 from "lucide-react/dist/esm/icons/share-2";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Table2 from "lucide-react/dist/esm/icons/table-2";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Type from "lucide-react/dist/esm/icons/type";
import Underline from "lucide-react/dist/esm/icons/underline";
import Undo2 from "lucide-react/dist/esm/icons/undo-2";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import X from "lucide-react/dist/esm/icons/x";
import ZoomIn from "lucide-react/dist/esm/icons/zoom-in";
import ZoomOut from "lucide-react/dist/esm/icons/zoom-out";
import {
  KNOWLEDGE_FILTERS,
  KNOWLEDGE_TEMPLATES,
  extractKnowledgeTitle,
  filterKnowledgeDocuments,
  graphToMarkdown,
  makeKnowledgeId,
  sortKnowledgeDocuments
} from "./knowledgeStudioModel.js";

const WORKSPACE_DESTINATIONS = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "sessions", label: "Sessions", icon: Clock3 },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings }
];

const SORT_OPTIONS = [
  { id: "updated", label: "Last edited" },
  { id: "created", label: "Created" },
  { id: "title", label: "Title" }
];

const EDITOR_BLOCKS = [
  { id: "section", title: "Section", description: "Heading and paragraph", icon: Heading },
  { id: "callout", title: "Callout", description: "Highlight an important thought", icon: MessageCircle },
  { id: "comparison", title: "Comparison", description: "Two-column decision structure", icon: Table2 },
  { id: "checklist", title: "Checklist", description: "Track concrete next steps", icon: List }
];

async function knowledgeRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Knowledge Studio request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function KnowledgeStudio({ onNavigate, onNewSession }) {
  const [deepLinkedDocumentId] = React.useState(() => new URLSearchParams(window.location.search).get("document")?.trim() || "");
  const [documents, setDocuments] = React.useState([]);
  const [retrieval, setRetrieval] = React.useState({ configured: false, vectorStoreConfigured: false, model: "" });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [mode, setMode] = React.useState("library");
  const [selectedId, setSelectedId] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [sort, setSort] = React.useState("updated");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const toastTimerRef = React.useRef(null);

  const selectedDocument = React.useMemo(
    () => documents.find((document) => document.id === selectedId) || documents[0] || null,
    [documents, selectedId]
  );
  const visibleDocuments = React.useMemo(
    () => sortKnowledgeDocuments(filterKnowledgeDocuments(documents, { query, filter }), sort),
    [documents, query, filter, sort]
  );

  const notify = React.useCallback((message) => {
    window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await knowledgeRequest("/api/knowledge/documents");
      setDocuments(payload.documents || []);
      setRetrieval(payload.retrieval || {});
      const linkedDocument = deepLinkedDocumentId && payload.documents?.find((item) => item.id === deepLinkedDocumentId);
      setSelectedId((current) => current || linkedDocument?.id || payload.documents?.[0]?.id || "");
      if (linkedDocument) setMode(linkedDocument.type === "diagram" ? "diagram" : "editor");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [deepLinkedDocumentId]);

  React.useEffect(() => {
    void loadDocuments();
    return () => window.clearTimeout(toastTimerRef.current);
  }, [loadDocuments]);

  const replaceDocument = React.useCallback((nextDocument) => {
    setDocuments((current) => {
      const exists = current.some((document) => document.id === nextDocument.id);
      return exists
        ? current.map((document) => (document.id === nextDocument.id ? nextDocument : document))
        : [nextDocument, ...current];
    });
    setSelectedId(nextDocument.id);
    return nextDocument;
  }, []);

  const indexingDocumentIds = React.useMemo(
    () => documents.filter((document) => document.lifecycle === "published" && document.indexStatus === "indexing").map((document) => document.id).sort(),
    [documents]
  );
  const indexingDocumentKey = indexingDocumentIds.join("|");

  React.useEffect(() => {
    if (!indexingDocumentIds.length) return undefined;
    let cancelled = false;
    const refreshIndexStatuses = async () => {
      const refreshed = await Promise.all(indexingDocumentIds.map(async (id) => {
        try {
          const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(id)}/index-status`);
          return payload.document || null;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const byId = new Map(refreshed.filter(Boolean).map((document) => [document.id, document]));
      if (byId.size) setDocuments((current) => current.map((document) => byId.get(document.id) || document));
    };
    void refreshIndexStatuses();
    const timer = window.setInterval(refreshIndexStatuses, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [indexingDocumentKey]);

  const createDocument = React.useCallback(async (templateId) => {
    setCreateOpen(false);
    try {
      const payload = await knowledgeRequest("/api/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({ templateId })
      });
      replaceDocument(payload.document);
      const url = new URL(window.location.href);
      url.searchParams.set("view", "docs");
      url.searchParams.set("document", payload.document.id);
      window.history.replaceState({}, "", url);
      setMode(payload.document.type === "diagram" ? "diagram" : "editor");
      notify(`${payload.document.title} created privately`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [notify, replaceDocument]);

  const saveDocument = React.useCallback(async (id, patch, { quiet = false } = {}) => {
    try {
      const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, saveVersion: true })
      });
      replaceDocument(payload.document);
      if (!quiet) notify("Saved as a new version");
      return payload.document;
    } catch (requestError) {
      if (requestError.status === 409 && requestError.payload?.document) replaceDocument(requestError.payload.document);
      throw requestError;
    }
  }, [notify, replaceDocument]);

  const toggleSession = React.useCallback(async (document, active) => {
    const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(document.id)}/session`, {
      method: "POST",
      body: JSON.stringify({ active })
    });
    replaceDocument(payload.document);
    notify(active ? "Cooper started with this document" : "Cooper session ended — the draft is private again");
    return payload.document;
  }, [notify, replaceDocument]);

  const sendChat = React.useCallback(async (document, message) => {
    const optimisticUser = { id: makeKnowledgeId("optimistic"), role: "user", text: message, citations: [], createdAt: new Date().toISOString() };
    replaceDocument({ ...document, messages: [...(document.messages || []), optimisticUser] });
    try {
      const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(document.id)}/chat`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      replaceDocument(payload.document);
      return payload.response;
    } catch (requestError) {
      replaceDocument(document);
      throw requestError;
    }
  }, [replaceDocument]);

  const publishDocument = React.useCallback(async (document, published, visibility = published ? "workspace" : "private") => {
    try {
      const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(document.id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ published, visibility })
      });
      replaceDocument(payload.document);
      notify(published
        ? payload.document.indexStatus === "ready" ? "Published and ready for Cooper retrieval" : "Published — retrieval indexing is in progress"
        : visibility === "team" ? "Shared with the team, but excluded from workspace retrieval" : "Private and removed from workspace retrieval");
      return payload.document;
    } catch (requestError) {
      if (requestError.payload?.document) replaceDocument(requestError.payload.document);
      notify(requestError.message);
      throw requestError;
    }
  }, [notify, replaceDocument]);

  const restoreVersion = React.useCallback(async (document, versionId) => {
    const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(document.id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST" });
    replaceDocument(payload.document);
    notify("Version restored as the newest version");
    return payload.document;
  }, [notify, replaceDocument]);

  const archiveDocument = React.useCallback(async (document) => {
    await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "docs");
    url.searchParams.delete("document");
    window.history.replaceState({}, "", url);
    setMode("library");
    notify("Document archived");
  }, [notify]);

  const openDocument = React.useCallback((document) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "docs");
    url.searchParams.set("document", document.id);
    window.history.replaceState({}, "", url);
    setSelectedId(document.id);
    setMode(document.type === "diagram" ? "diagram" : "editor");
  }, []);

  const returnToLibrary = React.useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "docs");
    url.searchParams.delete("document");
    window.history.replaceState({}, "", url);
    setMode("library");
  }, []);

  const navigateWorkspace = React.useCallback((destination) => {
    if (destination === "docs") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "docs");
      url.searchParams.delete("document");
      window.history.replaceState({}, "", url);
      setMode("library");
      return;
    }
    onNavigate?.(destination);
  }, [onNavigate]);

  return (
    <main className="knowledge-studio" data-knowledge-mode={mode}>
      {mode === "library" && (
        <KnowledgeLibrary
          documents={visibleDocuments}
          selectedDocument={selectedDocument}
          selectedId={selectedId}
          loading={loading}
          error={error}
          query={query}
          filter={filter}
          sort={sort}
          retrieval={retrieval}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onSortChange={setSort}
          onSelect={setSelectedId}
          onOpen={openDocument}
          onCreate={() => setCreateOpen(true)}
          onCreateTemplate={createDocument}
          onNavigate={navigateWorkspace}
          onNewSession={onNewSession}
          onRestore={restoreVersion}
          onPublish={publishDocument}
          onNotify={notify}
        />
      )}
      {mode === "editor" && selectedDocument && (
        <KnowledgeEditor
          key={selectedDocument.id}
          document={selectedDocument}
          onBack={returnToLibrary}
          onSave={saveDocument}
          onSession={toggleSession}
          onSendChat={sendChat}
          onPublish={publishDocument}
          onRestore={restoreVersion}
          onArchive={archiveDocument}
          onNotify={notify}
        />
      )}
      {mode === "diagram" && selectedDocument && (
        <KnowledgeDiagram
          key={selectedDocument.id}
          document={selectedDocument}
          onBack={returnToLibrary}
          onSave={saveDocument}
          onSession={toggleSession}
          onSendChat={sendChat}
          onPublish={publishDocument}
          onRestore={restoreVersion}
          onArchive={archiveDocument}
          onNotify={notify}
        />
      )}
      {createOpen && <CreateKnowledgeDialog onClose={() => setCreateOpen(false)} onCreate={createDocument} />}
      {toast && <div className="knowledge-toast" role="status"><Sparkles size={15} /><span>{toast}</span></div>}
    </main>
  );
}

export function SessionKnowledgeCanvas({ callId, sessionTitle = "Session notes", onAttachContext }) {
  const projectKey = `Session · ${callId || "current"}`;
  const [document, setDocument] = React.useState(null);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState("");
  const toastTimerRef = React.useRef(null);
  const onAttachContextRef = React.useRef(onAttachContext);

  React.useEffect(() => {
    onAttachContextRef.current = onAttachContext;
  }, [onAttachContext]);

  const notify = React.useCallback((message) => {
    window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  React.useEffect(() => {
    let active = true;
    async function loadOrCreate() {
      setError("");
      try {
        const library = await knowledgeRequest("/api/knowledge/documents");
        let next = (library.documents || []).find((item) => item.project === projectKey && item.lifecycle !== "archived");
        if (!next) {
          const created = await knowledgeRequest("/api/knowledge/documents", {
            method: "POST",
            body: JSON.stringify({ templateId: "blank", title: `${sessionTitle} notes`, project: projectKey })
          });
          next = created.document;
        }
        if (!next.session) {
          const bound = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(next.id)}/session`, {
            method: "POST",
            body: JSON.stringify({ active: true })
          });
          next = bound.document;
        }
        await onAttachContextRef.current?.({ title: next.title, content: next.plainText, externalId: `knowledge-document:${next.id}` });
        if (active) setDocument(next);
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    }
    void loadOrCreate();
    return () => {
      active = false;
      window.clearTimeout(toastTimerRef.current);
    };
  }, [projectKey, sessionTitle]);

  const saveDocument = React.useCallback(async (id, patch, { quiet = false } = {}) => {
    let payload;
    try {
      payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, saveVersion: true })
      });
    } catch (requestError) {
      if (requestError.status === 409 && requestError.payload?.document) setDocument(requestError.payload.document);
      throw requestError;
    }
    setDocument(payload.document);
    await onAttachContextRef.current?.({
      title: payload.document.title,
      content: payload.document.plainText,
      externalId: `knowledge-document:${payload.document.id}`
    });
    if (!quiet) notify("Saved and synced to this session");
    return payload.document;
  }, [notify]);

  const restoreVersion = React.useCallback(async (current, versionId) => {
    const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(current.id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST" });
    setDocument(payload.document);
    await onAttachContextRef.current?.({ title: payload.document.title, content: payload.document.plainText, externalId: `knowledge-document:${payload.document.id}` });
    notify("Version restored and synced");
    return payload.document;
  }, [notify]);

  const publishDocument = React.useCallback(async (current, published, visibility = published ? "workspace" : "private") => {
    const payload = await knowledgeRequest(`/api/knowledge/documents/${encodeURIComponent(current.id)}/publish`, {
      method: "POST",
      body: JSON.stringify({ published, visibility })
    });
    setDocument(payload.document);
    notify(published ? "Published to workspace knowledge" : visibility === "team" ? "Shared with the team" : "Private again");
    return payload.document;
  }, [notify]);

  if (error) return <div className="knowledge-session-canvas knowledge-session-error"><KnowledgeError message={error} /></div>;
  if (!document) return <div className="knowledge-session-canvas"><KnowledgeLoading /></div>;

  return (
    <section className="knowledge-session-canvas" aria-label="Editable session document">
      <div className="knowledge-session-document-status"><span><i />Session document</span><strong>{document.title}</strong><small>Autosaves to Docs and updates Cooper's live context.</small></div>
      <KnowledgeEditor
        embedded
        document={document}
        onBack={() => {}}
        onSave={saveDocument}
        onSession={async () => document}
        onSendChat={async () => null}
        onPublish={publishDocument}
        onRestore={restoreVersion}
        onArchive={async () => null}
        onNotify={notify}
      />
      {toast && <div className="knowledge-toast" role="status"><Sparkles size={15} /><span>{toast}</span></div>}
    </section>
  );
}

function CooperMark({ className = "" }) {
  return (
    <svg className={`knowledge-cooper-mark ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 1.5 22.5 12 12 22.5 1.5 12Z" />
      <path fill="#fff" d="M12 6.6c.56 2.82 2.58 4.84 5.4 5.4-2.82.56-4.84 2.58-5.4 5.4-.56-2.82-2.58-4.84-5.4-5.4 2.82-.56 4.84-2.58 5.4-5.4Z" />
    </svg>
  );
}

function WorkspaceLauncher({ onNavigate, onCreate, onNewSession }) {
  const [open, setOpen] = React.useState(false);
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  function navigate(destination) {
    setOpen(false);
    onNavigate(destination);
  }

  return (
    <>
      <button
        className="knowledge-workspace-launcher"
        type="button"
        aria-label="Open Cooper AIRES workspace navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <CooperMark />
        <span className="knowledge-workspace-lockup"><strong>Cooper</strong><small>AIRES WORKSPACE</small></span>
      </button>
      <button className={`knowledge-nav-scrim${open ? " open" : ""}`} type="button" aria-label="Close workspace navigation" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <aside className={`knowledge-workspace-drawer${open ? " open" : ""}`} aria-label="Cooper AIRES workspace navigation" aria-hidden={!open}>
        <div className="knowledge-drawer-head">
          <div className="knowledge-drawer-brand"><CooperMark /><span><strong>Cooper</strong><small>AIRES WORKSPACE</small></span></div>
          <button ref={closeRef} type="button" aria-label="Close workspace navigation" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav aria-label="Primary navigation">
          {WORKSPACE_DESTINATIONS.map((destination) => {
            const Icon = destination.icon;
            return (
              <button className={destination.id === "docs" ? "active" : ""} key={destination.id} type="button" aria-current={destination.id === "docs" ? "page" : undefined} onClick={() => navigate(destination.id)}>
                <Icon size={17} /><span>{destination.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="knowledge-drawer-spacer" />
        <button className="knowledge-button accent full" type="button" onClick={() => { setOpen(false); onCreate(); }}><Plus size={16} /><span>New document</span></button>
        <button className="knowledge-drawer-session" type="button" onClick={() => { setOpen(false); onNewSession?.(); }}><Sparkles size={16} /><span>New Cooper session</span></button>
        <div className="knowledge-drawer-context">Daily Catch Up<br />Cooper · AIRES workspace</div>
      </aside>
    </>
  );
}

function KnowledgeLibrary({
  documents,
  selectedDocument,
  selectedId,
  loading,
  error,
  query,
  filter,
  sort,
  retrieval,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpen,
  onCreate,
  onCreateTemplate,
  onNavigate,
  onNewSession,
  onRestore,
  onPublish,
  onNotify
}) {
  const [sortOpen, setSortOpen] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const selectedSort = SORT_OPTIONS.find((option) => option.id === sort) || SORT_OPTIONS[0];

  return (
    <section className="knowledge-library-screen">
      <WorkspaceLauncher onNavigate={onNavigate} onCreate={onCreate} onNewSession={onNewSession} />
      <div className="knowledge-library-layout">
        <section className="knowledge-library-main">
          <h1>Docs</h1>
          <label className="knowledge-search"><Search size={18} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} type="search" placeholder="Search your knowledge" aria-label="Search your knowledge" /></label>
          <div className="knowledge-library-controls">
            <div className="knowledge-filter-tabs" role="tablist" aria-label="Document filters">
              {KNOWLEDGE_FILTERS.map((item) => <button className={filter === item.id ? "active" : ""} key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => onFilterChange(item.id)}>{item.label}</button>)}
            </div>
            <span className="knowledge-control-spacer" />
            <div className="knowledge-menu-wrap">
              <button className="knowledge-button accent" type="button" aria-expanded={newOpen} onClick={() => setNewOpen((current) => !current)}>New <ChevronDown size={15} /></button>
              {newOpen && <QuickCreateMenu onChoose={(templateId) => { setNewOpen(false); if (templateId === "chooser") onCreate(); else void onCreateTemplate(templateId); }} />}
            </div>
            <div className="knowledge-menu-wrap">
              <button className="knowledge-button" type="button" aria-expanded={sortOpen} onClick={() => setSortOpen((current) => !current)}>Sort: {selectedSort.label} <SlidersHorizontal size={15} /></button>
              {sortOpen && (
                <div className="knowledge-popover sort" role="menu">
                  {SORT_OPTIONS.map((option) => <button key={option.id} type="button" onClick={() => { onSortChange(option.id); setSortOpen(false); }}>{sort === option.id ? <Check size={15} /> : <span />} {option.label}</button>)}
                </div>
              )}
            </div>
          </div>

          {loading && <KnowledgeLoading />}
          {!loading && error && <KnowledgeError message={error} />}
          {!loading && !error && (
            <div className="knowledge-document-list" aria-label="Knowledge documents">
              {documents.length ? documents.map((document) => (
                <KnowledgeDocumentRow
                  document={document}
                  key={document.id}
                  selected={document.id === selectedId}
                  onClick={() => {
                    onSelect(document.id);
                    if (window.matchMedia("(max-width: 980px)").matches) onOpen(document);
                  }}
                  onDoubleClick={() => onOpen(document)}
                />
              )) : <div className="knowledge-empty"><Search size={22} /><strong>No documents match this view.</strong><span>Try another search or create a private page.</span><button className="knowledge-button accent" onClick={onCreate} type="button">Create document</button></div>}
            </div>
          )}

          <section className="knowledge-template-section">
            <h2>Start from a template</h2>
            <div className="knowledge-template-strip">
              {KNOWLEDGE_TEMPLATES.filter((template) => ["meeting", "brief", "decision"].includes(template.id)).map((template) => (
                <button key={template.id} type="button" onClick={() => onCreateTemplate(template.id)}>
                  <FileText size={19} /><span><strong>{template.title}</strong><small>{template.description}</small></span>
                </button>
              ))}
              <button type="button" onClick={onCreate}><span><strong>Browse all templates</strong><small>See every document and diagram starter</small></span><ChevronRight size={15} /></button>
            </div>
          </section>
        </section>
        <KnowledgeDetailRail document={selectedDocument} retrieval={retrieval} onOpen={onOpen} onRestore={onRestore} onPublish={onPublish} onNotify={onNotify} />
      </div>
    </section>
  );
}

function QuickCreateMenu({ onChoose }) {
  return (
    <div className="knowledge-popover quick-create" role="menu">
      <button type="button" onClick={() => onChoose("blank")}><FileText size={17} /><span>Blank document</span></button>
      <button type="button" onClick={() => onChoose("chooser")}><Heading size={17} /><span>From a template</span></button>
      <button type="button" onClick={() => onChoose("diagram")}><Network size={17} /><span>Blank diagram</span></button>
    </div>
  );
}

function KnowledgeDocumentRow({ document, selected, onClick, onDoubleClick }) {
  const Icon = document.type === "diagram" ? Network : FileText;
  return (
    <button className={`knowledge-document-row${selected ? " selected" : ""}`} type="button" onClick={onClick} onDoubleClick={onDoubleClick} aria-pressed={selected}>
      <span className="knowledge-document-main"><span className="knowledge-document-icon"><Icon size={21} /></span><span><strong>{document.title}</strong><small>{document.excerpt}</small></span></span>
      <span className="knowledge-document-meta type"><Icon size={14} />{document.type === "diagram" ? "Diagram" : "Document"}</span>
      <span className="knowledge-document-meta owner">{document.owner}</span>
      <span className="knowledge-document-meta date">{formatKnowledgeDate(document.updatedAt)}{document.lifecycle === "published" && <small className="knowledge-published"><i />Published</small>}</span>
      <ChevronRight className="knowledge-row-chevron" size={17} />
    </button>
  );
}

function KnowledgeDetailRail({ document, retrieval, onOpen, onRestore, onPublish, onNotify }) {
  if (!document) return <aside className="knowledge-detail-rail" aria-label="Document details" />;
  const Icon = document.type === "diagram" ? Network : FileText;
  return (
    <aside className="knowledge-detail-rail" aria-label="Document details">
      <span className="knowledge-detail-icon"><Icon size={22} /></span>
      <h2>{document.title}</h2>
      <dl>
        <div><dt>Owner</dt><dd>{document.owner}</dd></div>
        <div><dt>Last updated</dt><dd>{formatKnowledgeDate(document.updatedAt)}</dd></div>
        <div><dt>Project</dt><dd>{document.project}</dd></div>
        <div><dt>Visibility</dt><dd>{knowledgeVisibilityLabel(document)}</dd></div>
      </dl>
      <section className="knowledge-version-list">
        <div className="knowledge-section-head"><h3>Recent versions</h3><span>{document.versionCount || document.versions?.length || 0}</span></div>
        {(document.versions || []).slice(0, 4).map((version) => (
          <button key={version.id} type="button" onClick={() => version.id !== document.currentVersionId && onRestore(document, version.id)} disabled={version.id === document.currentVersionId}>
            <span>{formatKnowledgeDate(version.createdAt)}</span><span>{version.actor}</span>{version.id === document.currentVersionId ? <em>Current</em> : <History size={14} />}
          </button>
        ))}
      </section>
      <div className="knowledge-retrieval-state">
        <strong>Cooper retrieval</strong>
        <span className={document.indexStatus === "ready" ? "ready" : ""}><i />{knowledgeIndexLabel(document, retrieval)}</span>
      </div>
      <div className="knowledge-detail-actions">
        <button className="knowledge-button accent full" type="button" onClick={() => onOpen(document)}>Open {document.type}<ChevronRight size={15} /></button>
        <button className="knowledge-button full" type="button" onClick={() => copyKnowledgeLink(document, onNotify)}><Copy size={15} />Copy link</button>
        {document.lifecycle !== "published"
          ? <button className="knowledge-button quiet full" type="button" onClick={() => onPublish(document, true)}><Globe2 size={15} />Publish</button>
          : <button className="knowledge-button quiet full" type="button" onClick={() => onPublish(document, false)}><Lock size={15} />Unpublish</button>}
        {document.indexStatus === "failed" && <button className="knowledge-button full" type="button" onClick={() => onPublish(document, true)}><RefreshCwIcon />Retry indexing</button>}
        {document.indexStatus === "remove-failed" && <button className="knowledge-button full" type="button" onClick={() => onPublish(document, false)}><RefreshCwIcon />Retry provider cleanup</button>}
      </div>
    </aside>
  );
}

function KnowledgeEditor({ document, onBack, onSave, onSession, onSendChat, onPublish, onRestore, onArchive, onNotify, embedded = false }) {
  const editorRef = React.useRef(null);
  const saveTimerRef = React.useRef(null);
  const savePromiseRef = React.useRef(Promise.resolve(document));
  const currentVersionRef = React.useRef(document.currentVersionId);
  const [saveState, setSaveState] = React.useState("Saved just now");
  const [railTab, setRailTab] = React.useState("format");
  const [chatOpen, setChatOpen] = React.useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  React.useEffect(() => () => window.clearTimeout(saveTimerRef.current), []);
  React.useEffect(() => {
    currentVersionRef.current = document.currentVersionId;
    setSaveState("Saved just now");
  }, [document.currentVersionId]);
  React.useLayoutEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = document.html;
  }, [document.id]);

  const saveNow = React.useCallback(async ({ quiet = true } = {}) => {
    window.clearTimeout(saveTimerRef.current);
    const html = editorRef.current?.innerHTML || document.html;
    const title = extractKnowledgeTitle(html) || document.title;
    setSaveState("Saving…");
    const promise = savePromiseRef.current.catch(() => document).then(() => onSave(document.id, {
      html,
      title,
      expectedVersionId: currentVersionRef.current
    }, { quiet }))
      .then((next) => {
        currentVersionRef.current = next.currentVersionId;
        setSaveState("Saved just now");
        return next;
      })
      .catch((error) => {
        setSaveState("Save failed");
        if (error.status === 409 && error.payload?.document?.html && editorRef.current) {
          editorRef.current.innerHTML = error.payload.document.html;
        }
        onNotify(error.message);
        throw error;
      });
    savePromiseRef.current = promise;
    return promise;
  }, [document, onNotify, onSave]);

  function scheduleSave() {
    setSaveState("Unsaved changes");
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void saveNow({ quiet: true }).catch(() => null), 750);
  }

  async function goBack() {
    if (saveState !== "Saved just now") await saveNow({ quiet: true }).catch(() => null);
    onBack();
  }

  function runCommand(command, value = null) {
    editorRef.current?.focus();
    documentExecCommand(command, value);
    scheduleSave();
  }

  function insertBlock(type) {
    const markup = {
      section: "<h2>New section</h2><p>Start writing…</p>",
      callout: '<aside class="knowledge-inline-callout"><strong>Key point</strong><p>Add the idea that should stand out.</p></aside>',
      comparison: '<table><thead><tr><th>Option A</th><th>Option B</th></tr></thead><tbody><tr><td>Evidence and tradeoff</td><td>Evidence and tradeoff</td></tr></tbody></table>',
      checklist: "<ul><li>First next step</li><li>Second next step</li></ul>"
    }[type];
    editorRef.current?.insertAdjacentHTML("beforeend", markup);
    editorRef.current?.focus();
    scheduleSave();
  }

  async function toggleCooper() {
    if (!document.session) await saveNow({ quiet: true });
    await onSession(document, !document.session);
    setChatOpen(!document.session);
  }

  async function restoreEditorVersion(current, versionId) {
    const next = await onRestore(current, versionId);
    if (editorRef.current) editorRef.current.innerHTML = next.html;
    setSaveState("Saved just now");
    return next;
  }

  return (
    <section className={`knowledge-editor-screen${embedded ? " embedded" : ""}`}>
      {!embedded && <KnowledgeDocumentHeader
        document={document}
        saveState={saveState}
        sessionActive={Boolean(document.session)}
        menuOpen={menuOpen}
        onBack={goBack}
        onMenu={() => setMenuOpen((current) => !current)}
        onSession={toggleCooper}
        onPublish={() => setShareOpen(true)}
        onArchive={() => onArchive(document)}
      />}
      <div className={`knowledge-editor-shell${chatOpen ? " chat-open" : ""}${mobileToolsOpen ? " mobile-tools-open" : ""}`}>
        <section className="knowledge-editor-main">
          <EditorToolbar onCommand={runCommand} onOpenRail={(tab) => { setRailTab(tab); setMobileToolsOpen(true); }} />
          <div className="knowledge-document-stage">
            <article
              ref={editorRef}
              className="knowledge-document-page"
              contentEditable
              suppressContentEditableWarning
              spellCheck
              aria-label="Editable document"
              onInput={scheduleSave}
            />
          </div>
        </section>
        {chatOpen
          ? <KnowledgeChatRail document={document} onClose={() => setChatOpen(false)} onSend={onSendChat} />
          : <EditorUtilityRail document={document} activeTab={railTab} onTab={setRailTab} onCommand={runCommand} onInsert={insertBlock} onRestore={restoreEditorVersion} onPublish={onPublish} />}
      </div>
      {!embedded && !chatOpen && <button className="knowledge-ask-cooper" type="button" onClick={() => setChatOpen(true)}><Sparkles size={17} /><span>Ask Cooper</span><ChevronDown size={14} /></button>}
      {mobileToolsOpen && <button className="knowledge-mobile-rail-close" type="button" aria-label="Close editor tools" onClick={() => setMobileToolsOpen(false)}><X size={17} /></button>}
      {shareOpen && <ShareKnowledgeDialog document={document} onClose={() => setShareOpen(false)} onChoose={async (published, visibility) => {
        await savePromiseRef.current.catch(() => null);
        await onPublish(document, published, visibility);
        setShareOpen(false);
      }} />}
    </section>
  );
}

function KnowledgeDocumentHeader({ document, saveState, sessionActive, menuOpen, onBack, onMenu, onSession, onPublish, onArchive }) {
  return (
    <header className="knowledge-document-header">
      <button className="knowledge-back" type="button" aria-label="Back to Docs" onClick={onBack}><ArrowLeft size={18} /><span>Docs</span></button>
      <div className="knowledge-header-title"><span>{document.title}</span><small>{knowledgeVisibilityLabel(document)}</small></div>
      <div className="knowledge-header-actions">
        <span className={`knowledge-save-state${saveState === "Save failed" ? " error" : ""}`}>{saveState}</span>
        <button className="knowledge-button share" type="button" onClick={onPublish}><Share2 size={15} /><span>{document.lifecycle === "published" ? "Unpublish" : "Share"}</span></button>
        <button className={`knowledge-button accent session${sessionActive ? " active" : ""}`} type="button" aria-label={sessionActive ? "End Cooper session" : "Start with Cooper"} onClick={onSession}><Sparkles size={16} /><span>{sessionActive ? "End session" : "Start with Cooper"}</span></button>
        <div className="knowledge-menu-wrap">
          <button className="knowledge-icon-button" type="button" aria-label="More document actions" aria-expanded={menuOpen} onClick={onMenu}><MoreHorizontal size={18} /></button>
          {menuOpen && (
            <div className="knowledge-popover document-actions" role="menu">
              <a download href={`/api/knowledge/documents/${encodeURIComponent(document.id)}/export?format=markdown`}><Download size={16} />Export Markdown</a>
              <a download href={`/api/knowledge/documents/${encodeURIComponent(document.id)}/export?format=html`}><FileText size={16} />Export HTML</a>
              <a download href={`/api/knowledge/documents/${encodeURIComponent(document.id)}/export?format=pdf`}><FileDown size={16} />Export PDF</a>
              <button className="danger" type="button" onClick={onArchive}><Trash2 size={16} />Archive</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function EditorToolbar({ onCommand, onOpenRail }) {
  return (
    <div className="knowledge-editor-toolbar" role="toolbar" aria-label="Document formatting">
      <ToolbarButton label="Undo" icon={Undo2} onClick={() => onCommand("undo")} />
      <ToolbarButton label="Redo" icon={Redo2} onClick={() => onCommand("redo")} />
      <i />
      <select aria-label="Text style" defaultValue="p" onChange={(event) => onCommand("formatBlock", event.target.value)}><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="blockquote">Quote</option></select>
      <i />
      <ToolbarButton label="Bold" icon={Bold} onClick={() => onCommand("bold")} />
      <ToolbarButton label="Italic" icon={Italic} onClick={() => onCommand("italic")} />
      <ToolbarButton label="Underline" icon={Underline} onClick={() => onCommand("underline")} />
      <i />
      <ToolbarButton label="Bulleted list" icon={List} onClick={() => onCommand("insertUnorderedList")} />
      <ToolbarButton label="Numbered list" icon={ListOrdered} onClick={() => onCommand("insertOrderedList")} />
      <ToolbarButton label="Add link" icon={Link} onClick={() => { const url = window.prompt("Paste a link"); if (url) onCommand("createLink", url); }} />
      <span className="knowledge-toolbar-spacer" />
      <button className="knowledge-open-tools" type="button" onClick={() => onOpenRail("format")}><PanelRightOpen size={17} /><span>Tools</span></button>
    </div>
  );
}

function ToolbarButton({ label, icon: Icon, onClick }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick}><Icon size={17} /></button>;
}

function EditorUtilityRail({ document, activeTab, onTab, onCommand, onInsert, onRestore, onPublish }) {
  return (
    <aside className="knowledge-utility-rail" aria-label="Document tools">
      <div className="knowledge-rail-tabs" role="tablist" aria-label="Document tools">
        {[["format", "Format"], ["blocks", "Blocks"], ["details", "Details"]].map(([id, label]) => <button className={activeTab === id ? "active" : ""} key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => onTab(id)}>{label}</button>)}
      </div>
      {activeTab === "format" && (
        <div className="knowledge-rail-panel">
          <RailField label="Text"><select defaultValue="Inter"><option>Inter</option><option>System sans</option></select></RailField>
          <RailField label="Alignment"><div className="knowledge-segmented"><button type="button" aria-label="Align left" onClick={() => onCommand("justifyLeft")}><AlignLeft size={17} /></button><button type="button" aria-label="Align center" onClick={() => onCommand("justifyCenter")}><AlignCenter size={17} /></button><button type="button" aria-label="Align right" onClick={() => onCommand("justifyRight")}><AlignRight size={17} /></button></div></RailField>
          <RailField label="Emphasis"><div className="knowledge-segmented"><button type="button" aria-label="Bold" onClick={() => onCommand("bold")}><Bold size={17} /></button><button type="button" aria-label="Italic" onClick={() => onCommand("italic")}><Italic size={17} /></button><button type="button" aria-label="Underline" onClick={() => onCommand("underline")}><Underline size={17} /></button></div></RailField>
          <PrivacyStatus document={document} />
        </div>
      )}
      {activeTab === "blocks" && (
        <div className="knowledge-rail-panel"><div className="knowledge-block-list">{EDITOR_BLOCKS.map((block) => { const Icon = block.icon; return <button key={block.id} type="button" onClick={() => onInsert(block.id)}><Icon size={18} /><span><strong>{block.title}</strong><small>{block.description}</small></span></button>; })}</div><PrivacyStatus document={document} /></div>
      )}
      {activeTab === "details" && (
        <div className="knowledge-rail-panel">
          <div className="knowledge-detail-stack"><DetailLine label="Owner" value={document.owner} /><DetailLine label="Project" value={document.project} /><DetailLine label="Visibility" value={knowledgeVisibilityLabel(document)} /><DetailLine label="Canonical" value="Sanitized rich HTML" /><DetailLine label="Projection" value="Markdown + plain text" /><DetailLine label="Retrieval" value={knowledgeIndexLabel(document)} /></div>
          <div className="knowledge-version-list editor"><div className="knowledge-section-head"><h3>Versions</h3><span>{document.versionCount}</span></div>{(document.versions || []).slice(0, 8).map((version) => <button key={version.id} type="button" disabled={version.id === document.currentVersionId} onClick={() => onRestore(document, version.id)}><span>{formatKnowledgeDate(version.createdAt)}</span><span>{version.actor}</span>{version.id === document.currentVersionId ? <em>Current</em> : <History size={14} />}</button>)}</div>
          <button className="knowledge-button full" type="button" onClick={() => onPublish(document, document.lifecycle !== "published")}>{document.lifecycle === "published" ? <Lock size={15} /> : <Globe2 size={15} />}{document.lifecycle === "published" ? "Unpublish" : "Publish to workspace"}</button>
          {document.indexStatus === "failed" && <button className="knowledge-button full" type="button" onClick={() => onPublish(document, true)}><RefreshCwIcon />Retry indexing</button>}
          {document.indexStatus === "remove-failed" && <button className="knowledge-button full" type="button" onClick={() => onPublish(document, false)}><RefreshCwIcon />Retry provider cleanup</button>}
          <PrivacyStatus document={document} />
        </div>
      )}
    </aside>
  );
}

function KnowledgeChatRail({ document, onClose, onSend }) {
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const bodyRef = React.useRef(null);
  const active = Boolean(document.session);

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [document.messages?.length]);

  async function submit(event) {
    event.preventDefault();
    const next = message.trim();
    if (!next || !active || sending) return;
    setMessage("");
    setSending(true);
    setError("");
    try {
      await onSend(document, next);
    } catch (requestError) {
      setError(requestError.message);
      setMessage(next);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="knowledge-chat-rail" aria-label="Cooper document conversation">
      <header><div><h2>Cooper</h2><span className={active ? "active" : ""}><i />{active ? "Session active · current draft shared" : "Available when you are ready"}</span></div><button type="button" aria-label="Close Cooper" onClick={onClose}><X size={18} /></button></header>
      <div ref={bodyRef} className="knowledge-chat-body">
        <div className="knowledge-chat-intro"><strong>{active ? "I can work with this draft." : "This draft is still private."}</strong><p>{active ? "Ask me to revise, challenge, summarize, or connect this writing to your permitted published knowledge." : "Starting Cooper is an explicit choice. Until then, this document is not sent to a session or retrieval system."}</p></div>
        {!document.messages?.length && <div className="knowledge-chat-message assistant"><strong>Cooper</strong><p>{active ? "Where would you like a second mind?" : "Take the private moment. I will be here when you want me."}</p></div>}
        {(document.messages || []).map((item) => <div className={`knowledge-chat-message ${item.role}`} key={item.id}><strong>{item.role === "assistant" ? "Cooper" : "You"}</strong><p>{item.text}</p>{item.citations?.length > 0 && <div className="knowledge-citations">{item.citations.map((citation) => <span key={`${citation.fileId}-${citation.filename}`}><FileText size={12} />{citation.filename}</span>)}</div>}</div>)}
        {sending && <div className="knowledge-chat-thinking"><i /><i /><i /></div>}
        {error && <div className="knowledge-chat-error" role="alert">{error}</div>}
      </div>
      <form className="knowledge-chat-compose" onSubmit={submit}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={active ? "Ask about this document" : "Start Cooper to send a message"} disabled={!active} aria-label="Message Cooper" /><button type="submit" aria-label="Send message" disabled={!active || !message.trim() || sending}><Send size={17} /></button></form>
    </aside>
  );
}

function KnowledgeDiagram({ document, onBack, onSave, onSession, onSendChat, onPublish, onRestore, onArchive, onNotify }) {
  const [graph, setGraph] = React.useState(() => document.graph || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  const [selectedNodeId, setSelectedNodeId] = React.useState(() => document.graph?.nodes?.[0]?.id || "");
  const [saveState, setSaveState] = React.useState("Saved just now");
  const [chatOpen, setChatOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [tool, setTool] = React.useState("select");
  const [drag, setDrag] = React.useState(null);
  const saveTimerRef = React.useRef(null);
  const graphRef = React.useRef(graph);

  React.useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || null;

  const saveGraph = React.useCallback(async (nextGraph = graphRef.current, { quiet = true } = {}) => {
    window.clearTimeout(saveTimerRef.current);
    setSaveState("Saving…");
    try {
      const next = await onSave(document.id, { graph: nextGraph, title: document.title, expectedVersionId: document.currentVersionId }, { quiet });
      setSaveState("Saved just now");
      return next;
    } catch (error) {
      setSaveState("Save failed");
      onNotify(error.message);
      return null;
    }
  }, [document.currentVersionId, document.id, document.title, onNotify, onSave]);

  React.useEffect(() => () => window.clearTimeout(saveTimerRef.current), []);

  React.useEffect(() => {
    if (!drag) return undefined;
    function move(event) {
      const x = Math.max(20, drag.nodeX + event.clientX - drag.pointerX);
      const y = Math.max(20, drag.nodeY + event.clientY - drag.pointerY);
      setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === drag.id ? { ...node, x, y } : node) }));
    }
    function up() {
      setDrag(null);
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => void saveGraph(graphRef.current), 350);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, saveGraph]);

  function updateGraph(updater) {
    setGraph((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => void saveGraph(next), 700);
      setSaveState("Unsaved changes");
      return next;
    });
  }

  function addNode() {
    const id = makeKnowledgeId("node");
    const node = { id, label: "New idea", x: 380 + graph.nodes.length * 18, y: 360 + graph.nodes.length * 12, width: 210, tone: "volt", notes: "", groupId: "" };
    updateGraph((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      edges: selectedNodeId ? [...current.edges, { id: makeKnowledgeId("edge"), source: selectedNodeId, target: id, label: "connects to" }] : current.edges
    }));
    setSelectedNodeId(id);
  }

  function removeNode() {
    if (!selectedNodeId) return;
    updateGraph((current) => ({ ...current, nodes: current.nodes.filter((node) => node.id !== selectedNodeId), edges: current.edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId) }));
    setSelectedNodeId("");
  }

  function updateNode(patch) {
    updateGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedNodeId ? { ...node, ...patch } : node) }));
  }

  async function goBack() {
    if (saveState !== "Saved just now") await saveGraph(graph, { quiet: true });
    onBack();
  }

  async function toggleCooper() {
    if (!document.session) await saveGraph(graph, { quiet: true });
    await onSession(document, !document.session);
    setChatOpen(!document.session);
  }

  async function restoreDiagramVersion(current, versionId) {
    const next = await onRestore(current, versionId);
    setGraph(next.graph || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    setSelectedNodeId(next.graph?.nodes?.[0]?.id || "");
    setSaveState("Saved just now");
    return next;
  }

  return (
    <section className="knowledge-diagram-screen">
      <KnowledgeDocumentHeader document={document} saveState={saveState} sessionActive={Boolean(document.session)} menuOpen={menuOpen} onBack={goBack} onMenu={() => setMenuOpen((current) => !current)} onSession={toggleCooper} onPublish={() => setShareOpen(true)} onArchive={() => onArchive(document)} />
      <div className={`knowledge-diagram-shell${chatOpen ? " chat-open" : ""}`}>
        <section className="knowledge-diagram-main">
          <div className="knowledge-diagram-toolbar" role="toolbar" aria-label="Diagram tools">
            <ToolbarButton label="Select" icon={MousePointer2} onClick={() => setTool("select")} />
            <ToolbarButton label="Pan" icon={Hand} onClick={() => setTool("pan")} />
            <i />
            <button className="knowledge-button accent compact" type="button" onClick={addNode}><Plus size={15} />Add node</button>
            <button className="knowledge-button compact" type="button" onClick={removeNode} disabled={!selectedNode}><Trash2 size={15} />Delete</button>
            <span className="knowledge-toolbar-spacer" />
            <button className="knowledge-button compact" type="button" onClick={() => setSummaryOpen(true)}><FileText size={15} />Text summary</button>
          </div>
          <DiagramCanvas graph={graph} selectedNodeId={selectedNodeId} tool={tool} onSelect={setSelectedNodeId} onDragStart={setDrag} />
          <div className="knowledge-canvas-controls"><button type="button" aria-label="Zoom in"><ZoomIn size={17} /></button><button type="button" aria-label="Zoom out"><ZoomOut size={17} /></button><button type="button" aria-label="Fit view"><Maximize2 size={17} /></button></div>
        </section>
        {chatOpen
          ? <KnowledgeChatRail document={document} onClose={() => setChatOpen(false)} onSend={onSendChat} />
          : <DiagramInspector document={document} node={selectedNode} graph={graph} onUpdateNode={updateNode} onSummary={() => setSummaryOpen(true)} onRestore={restoreDiagramVersion} onPublish={onPublish} />}
      </div>
      {!chatOpen && <button className="knowledge-ask-cooper" type="button" onClick={() => setChatOpen(true)}><Sparkles size={17} /><span>Ask Cooper</span><ChevronDown size={14} /></button>}
      {summaryOpen && <DiagramSummaryDialog document={document} graph={graph} onClose={() => setSummaryOpen(false)} />}
      {shareOpen && <ShareKnowledgeDialog document={document} onClose={() => setShareOpen(false)} onChoose={async (published, visibility) => { await onPublish(document, published, visibility); setShareOpen(false); }} />}
    </section>
  );
}

function DiagramCanvas({ graph, selectedNodeId, tool, onSelect, onDragStart }) {
  const nodeById = React.useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  return (
    <div className={`knowledge-diagram-canvas tool-${tool}`} aria-label="Editable diagram canvas">
      <div className="knowledge-diagram-stage">
        <svg className="knowledge-diagram-connections" viewBox="0 0 1200 720" aria-hidden="true">
          <defs><marker id="knowledge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker></defs>
          {graph.edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) return null;
            const x1 = source.x + source.width;
            const y1 = source.y + 34;
            const x2 = target.x;
            const y2 = target.y + 34;
            const bend = Math.max(50, Math.abs(x2 - x1) * 0.45);
            return <path key={edge.id} d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`} markerEnd="url(#knowledge-arrow)" />;
          })}
        </svg>
        {graph.nodes.map((node) => (
          <button
            className={`knowledge-diagram-node tone-${node.tone}${selectedNodeId === node.id ? " selected" : ""}`}
            style={{ left: node.x, top: node.y, width: node.width }}
            key={node.id}
            type="button"
            aria-pressed={selectedNodeId === node.id}
            onClick={() => onSelect(node.id)}
            onPointerDown={(event) => {
              if (tool !== "select") return;
              event.preventDefault();
              onSelect(node.id);
              onDragStart({ id: node.id, pointerX: event.clientX, pointerY: event.clientY, nodeX: node.x, nodeY: node.y });
            }}
          >
            <span><Workflow size={16} /></span>{node.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiagramInspector({ document, node, graph, onUpdateNode, onSummary, onRestore, onPublish }) {
  const [tab, setTab] = React.useState("properties");
  return (
    <aside className="knowledge-utility-rail diagram" aria-label="Diagram tools">
      <div className="knowledge-rail-tabs" role="tablist" aria-label="Diagram tools"><button className={tab === "properties" ? "active" : ""} type="button" role="tab" aria-selected={tab === "properties"} onClick={() => setTab("properties")}>Properties</button><button className={tab === "details" ? "active" : ""} type="button" role="tab" aria-selected={tab === "details"} onClick={() => setTab("details")}>Details</button></div>
      {tab === "properties" && <div className="knowledge-rail-panel">{node ? <><RailField label="Node label"><input value={node.label} onChange={(event) => onUpdateNode({ label: event.target.value })} /></RailField><RailField label="Notes"><textarea value={node.notes || ""} onChange={(event) => onUpdateNode({ notes: event.target.value })} /></RailField><RailField label="Tone"><select value={node.tone} onChange={(event) => onUpdateNode({ tone: event.target.value })}><option value="plain">White</option><option value="volt">Volt</option><option value="green">Green</option></select></RailField><RailField label="Width"><input type="range" min="160" max="340" value={node.width} onChange={(event) => onUpdateNode({ width: Number(event.target.value) })} /></RailField></> : <div className="knowledge-no-selection"><MousePointer2 size={20} /><strong>Select a node</strong><span>Choose a node to edit its label, notes, and visual treatment.</span></div>}<PrivacyStatus document={document} /></div>}
      {tab === "details" && <div className="knowledge-rail-panel"><div className="knowledge-detail-stack"><DetailLine label="Nodes" value={String(graph.nodes.length)} /><DetailLine label="Edges" value={String(graph.edges.length)} /><DetailLine label="Canonical" value="Graph JSON" /><DetailLine label="Projection" value="Deterministic Markdown" /><DetailLine label="Retrieval" value={knowledgeIndexLabel(document)} /></div><button className="knowledge-button full" type="button" onClick={onSummary}><FileText size={15} />View agent-readable summary</button><div className="knowledge-version-list editor"><div className="knowledge-section-head"><h3>Versions</h3><span>{document.versionCount}</span></div>{(document.versions || []).slice(0, 6).map((version) => <button key={version.id} type="button" disabled={version.id === document.currentVersionId} onClick={() => onRestore(document, version.id)}><span>{formatKnowledgeDate(version.createdAt)}</span><span>{version.actor}</span>{version.id === document.currentVersionId ? <em>Current</em> : <History size={14} />}</button>)}</div><button className="knowledge-button full" type="button" onClick={() => onPublish(document, document.lifecycle !== "published")}>{document.lifecycle === "published" ? <Lock size={15} /> : <Globe2 size={15} />}{document.lifecycle === "published" ? "Unpublish" : "Publish to workspace"}</button>{document.indexStatus === "failed" && <button className="knowledge-button full" type="button" onClick={() => onPublish(document, true)}><RefreshCwIcon />Retry indexing</button>}{document.indexStatus === "remove-failed" && <button className="knowledge-button full" type="button" onClick={() => onPublish(document, false)}><RefreshCwIcon />Retry provider cleanup</button>}<PrivacyStatus document={document} /></div>}
    </aside>
  );
}

function DiagramSummaryDialog({ document, graph, onClose }) {
  const summary = graphToMarkdown(graph);
  return (
    <div className="knowledge-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="knowledge-modal knowledge-summary-modal" role="dialog" aria-modal="true" aria-labelledby="diagram-summary-title">
        <header><div><h2 id="diagram-summary-title">Agent-readable diagram summary</h2><p>Derived deterministically from the node graph; stored beside the visual source.</p></div><button type="button" aria-label="Close summary" onClick={onClose}><X size={18} /></button></header>
        <div className="knowledge-modal-body"><div className="knowledge-summary-status"><span><i />Text snapshot ready</span><span>{graph.nodes.length} nodes · {graph.edges.length} edges</span></div><pre>{summary}</pre><p>This projection is retrieval-friendly. The graph JSON remains the editable source of truth for {document.title}.</p></div>
      </section>
    </div>
  );
}

function CreateKnowledgeDialog({ onClose, onCreate }) {
  React.useEffect(() => {
    function keydown(event) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);
  return (
    <div className="knowledge-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="create-knowledge-title">
        <header><div><h2 id="create-knowledge-title">Create something new</h2><p>Start with a blank page or a useful structure. Cooper stays off until invited.</p></div><button type="button" aria-label="Close create dialog" onClick={onClose}><X size={18} /></button></header>
        <div className="knowledge-create-grid">{KNOWLEDGE_TEMPLATES.map((template) => { const Icon = template.type === "diagram" ? Network : FileText; return <button key={template.id} type="button" onClick={() => onCreate(template.id)}><span><Icon size={21} /></span><strong>{template.title}</strong><small>{template.description}</small></button>; })}</div>
      </section>
    </div>
  );
}

function ShareKnowledgeDialog({ document, onClose, onChoose }) {
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");

  async function choose(id, published, visibility) {
    setBusy(id);
    setError("");
    try {
      await onChoose(published, visibility);
    } catch (requestError) {
      setBusy("");
      setError(requestError.message);
    }
  }

  return (
    <div className="knowledge-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="knowledge-modal knowledge-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-knowledge-title">
        <header><div><h2 id="share-knowledge-title">Who can use this work?</h2><p>Saving, sharing, and publishing are separate choices.</p></div><button type="button" aria-label="Close sharing" onClick={onClose}><X size={18} /></button></header>
        <div className="knowledge-share-options">
          <button className={document.visibility === "private" && document.lifecycle !== "published" ? "selected" : ""} type="button" disabled={Boolean(busy)} onClick={() => choose("private", false, "private")}><span><Lock size={19} /></span><strong>Private</strong><small>Only you. Saved and versioned, never available through workspace retrieval.</small>{busy === "private" && <em>Saving…</em>}</button>
          <button className={document.lifecycle === "shared" ? "selected" : ""} type="button" disabled={Boolean(busy)} onClick={() => choose("team", false, "team")}><span><UsersIcon /></span><strong>Share with team</strong><small>Teammates can open it, but Cooper will not retrieve it as published knowledge.</small>{busy === "team" && <em>Saving…</em>}</button>
          <button className={document.lifecycle === "published" ? "selected" : ""} type="button" disabled={Boolean(busy)} onClick={() => choose("workspace", true, "workspace")}><span><Globe2 size={19} /></span><strong>Publish to workspace</strong><small>Authorized Cooper sessions may retrieve the indexed saved version with citations.</small>{busy === "workspace" && <em>Publishing…</em>}</button>
        </div>
        {error && <div className="knowledge-share-error" role="alert">{error}</div>}
      </section>
    </div>
  );
}

function RailField({ label, children }) {
  return <label className="knowledge-rail-field"><span>{label}</span>{children}</label>;
}

function DetailLine({ label, value }) {
  return <div><span>{label}</span><span>{value}</span></div>;
}

function PrivacyStatus({ document }) {
  const sessionActive = Boolean(document.session);
  return (
    <div className={`knowledge-privacy-status${sessionActive ? " session" : document.lifecycle === "published" ? " published" : ""}`}>
      <strong>{sessionActive ? "Session-only context" : document.lifecycle === "published" ? "Published knowledge" : "Private writing"}</strong>
      <p>{sessionActive ? "The exact current draft is shared with this Cooper session, but is not published automatically." : document.lifecycle === "published" ? "This saved version is eligible for permission-aware workspace retrieval." : "This draft is saved and versioned, but unavailable to Cooper and workspace retrieval."}</p>
    </div>
  );
}

function KnowledgeLoading() {
  return <div className="knowledge-loading" aria-label="Loading documents">{[0, 1, 2, 3].map((item) => <i key={item} />)}</div>;
}

function KnowledgeError({ message }) {
  return <div className="knowledge-error" role="alert"><strong>Docs could not load.</strong><span>{message}</span></div>;
}

function formatKnowledgeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function knowledgeVisibilityLabel(document) {
  if (document.session) return "Session-only";
  if (document.lifecycle === "published") return document.visibility === "workspace" ? "Workspace" : "Team";
  if (document.lifecycle === "shared") return "Team";
  return "Private";
}

function knowledgeIndexLabel(document, retrieval = {}) {
  return {
    ready: "Ready for retrieval",
    indexing: "Indexing published version",
    failed: document.indexError || "Indexing needs attention",
    removing: "Removing from provider index",
    "remove-failed": document.indexError || "Provider cleanup needs retrying",
    "not-configured": retrieval.configured === false ? "Published · retrieval provider not configured" : "Published · vector store not configured",
    "not-indexed": "Not indexed"
  }[document.indexStatus] || "Not indexed";
}

async function copyKnowledgeLink(document, notify) {
  const url = new URL(window.location.href);
  url.searchParams.set("document", document.id);
  try {
    await navigator.clipboard.writeText(url.toString());
    notify("Document link copied");
  } catch {
    notify("Copy is unavailable in this browser");
  }
}

function documentExecCommand(command, value) {
  if (typeof document.execCommand === "function") document.execCommand(command, false, value);
}

function RefreshCwIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.9 4M4 12A8 8 0 0 1 18.9 8M5 20v-4h4M19 4v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function UsersIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
