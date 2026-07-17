import React from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Github,
  Link2,
  NotebookText,
  Plus,
  Search,
  Sparkles,
  Upload,
  Users,
  X
} from "lucide-react";
import {
  createManualPreparationPlan,
  recommendSessionPreparation,
  SESSION_PREPARATION_OPTIONS
} from "./sessionPreparation.js";
import { contextSourcesFromSessionSeed } from "./sessionContextSeed.js";

const NOTION_ALL_PAGES = "__all_pages__";

const freshSession = {
  id: "",
  type: "session",
  title: "Fresh Cooper session",
  time: "Now",
  duration: "Open agenda",
  subtitle: "Start without a scheduled meeting",
  source: "Cooper"
};

const providerCopy = {
  notion: {
    title: "Add from Notion",
    eyebrow: "Notion workspace",
    placeholder: "Search pages, tickets, and databases",
    empty: "Search your connected Notion workspace, then select one or more results.",
    icon: NotebookText
  },
  github: {
    title: "Add from GitHub",
    eyebrow: "GitHub context",
    placeholder: "Search pull requests, branches, and issues",
    empty: "Search the GitHub account connected through Arcade, then select the code context Cooper should load.",
    icon: Github
  },
  meeting: {
    title: "Add meeting notes",
    eyebrow: "Cooper call library",
    placeholder: "Search past calls and meeting notes",
    empty: "Search past Cooper calls and attach the transcript to this session.",
    icon: CalendarDays
  }
};

export function SessionContextCheckpoint({
  open,
  meetings = [],
  seedMeeting = null,
  busy = false,
  onClose,
  onStart,
  onOpenSettings
}) {
  const [meetingId, setMeetingId] = React.useState("");
  const [intent, setIntent] = React.useState("");
  const [sources, setSources] = React.useState([]);
  const [pendingFiles, setPendingFiles] = React.useState([]);
  const [sourceMenuOpen, setSourceMenuOpen] = React.useState(false);
  const [provider, setProvider] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [repository, setRepository] = React.useState("all");
  const [results, setResults] = React.useState([]);
  const [repositories, setRepositories] = React.useState([]);
  const [notionDatabases, setNotionDatabases] = React.useState([]);
  const [notionDatabaseId, setNotionDatabaseId] = React.useState("");
  const [selectedResultIds, setSelectedResultIds] = React.useState([]);
  const [selectedResults, setSelectedResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [authorizationUrl, setAuthorizationUrl] = React.useState("");
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteTitle, setPasteTitle] = React.useState("");
  const [pasteContent, setPasteContent] = React.useState("");
  const [launchError, setLaunchError] = React.useState("");
  const [launching, setLaunching] = React.useState(false);
  const [preparationMode, setPreparationMode] = React.useState("cooper");
  const [preparationKinds, setPreparationKinds] = React.useState(() => SESSION_PREPARATION_OPTIONS.map((option) => option.kind));
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setMeetingId(seedMeeting?.id || "");
    setIntent(checkpointIntent(seedMeeting?.description || seedMeeting?.prompt || ""));
    setSources(contextSourcesFromSessionSeed(seedMeeting));
    setPendingFiles([]);
    setSourceMenuOpen(false);
    setProvider("");
    setLaunchError("");
    setLaunching(false);
    setPreparationMode("cooper");
    setPreparationKinds(SESSION_PREPARATION_OPTIONS.map((option) => option.kind));
  }, [open, seedMeeting]);

  const sessionMeetings = React.useMemo(() => {
    const seededItem = seedMeeting?.id && !meetings.some((meeting) => meeting.id === seedMeeting.id)
      ? [seedMeeting]
      : [];
    return [freshSession, ...seededItem, ...meetings];
  }, [meetings, seedMeeting]);
  const selectedMeeting = sessionMeetings.find((meeting) => meeting.id === meetingId) || freshSession;
  const totalSources = sources.length + pendingFiles.length;
  const cooperPreparationPlan = React.useMemo(() => recommendSessionPreparation({
    focus: selectedMeeting,
    sessionContext: [intent, ...sources.map((source) => `${source.title || ""} ${source.meta || ""}`)].join("\n")
  }), [intent, selectedMeeting, sources]);
  const activePreparationPlan = preparationMode === "manual"
    ? createManualPreparationPlan(preparationKinds)
    : cooperPreparationPlan;

  if (!open) return null;

  function openProvider(nextProvider) {
    setProvider(nextProvider);
    setSourceMenuOpen(false);
    setQuery("");
    setTypeFilter("all");
    setRepository("all");
    setResults([]);
    setRepositories([]);
    setNotionDatabases([]);
    setNotionDatabaseId("");
    setSelectedResultIds([]);
    setSelectedResults([]);
    setSearchError("");
    setAuthorizationUrl("");
    if (nextProvider === "meeting" || nextProvider === "notion") {
      window.setTimeout(() => runSearch(nextProvider, "", {
        type: nextProvider === "notion" ? "database" : "all",
        databaseId: ""
      }), 0);
    }
  }

  async function runSearch(providerOverride = provider, queryOverride = query, overrides = {}) {
    if (!providerOverride) return;
    if (!["meeting", "notion"].includes(providerOverride) && !queryOverride.trim()) {
      setSearchError("Enter a search term first.");
      return;
    }

    const databaseId = overrides.databaseId ?? notionDatabaseId;
    const hasDatabaseFilter = Boolean(databaseId && databaseId !== NOTION_ALL_PAGES);
    const resultType = overrides.type || (providerOverride === "notion" ? (databaseId ? "page" : "database") : typeFilter);

    setSearching(true);
    setSearchError("");
    setAuthorizationUrl("");
    try {
      const params = new URLSearchParams({
        provider: providerOverride,
        query: queryOverride.trim(),
        type: resultType,
        repository,
        limit: providerOverride === "notion" ? "-1" : "50"
      });
      if (hasDatabaseFilter) params.set("databaseId", databaseId);
      const response = await fetch(`/api/context-sources/search?${params}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthorizationUrl(payload.authorizationUrl || "");
        throw new Error(payload.message || payload.error || "Context search failed.");
      }
      const nextResults = Array.isArray(payload.results) ? payload.results : [];
      setResults(nextResults);
      if (providerOverride === "notion" && !databaseId && resultType === "database" && !queryOverride.trim()) {
        setNotionDatabases(nextResults);
      }
      setRepositories(Array.isArray(payload.repositories) ? payload.repositories : []);
    } catch (error) {
      setResults([]);
      setSearchError(error.message || "Context search failed.");
    } finally {
      setSearching(false);
    }
  }

  function toggleResult(result) {
    setSelectedResultIds((current) => current.includes(result.id)
      ? current.filter((value) => value !== result.id)
      : [...current, result.id]);
    setSelectedResults((current) => current.some((item) => item.id === result.id)
      ? current.filter((item) => item.id !== result.id)
      : [...current, result]);
  }

  function addSelectedResults() {
    setSources((current) => dedupeSources([...current, ...selectedResults]));
    setProvider("");
  }

  function openNotionDatabase(databaseId) {
    setNotionDatabaseId(databaseId);
    setQuery("");
    setResults([]);
    if (!databaseId) {
      setResults(notionDatabases);
      return;
    }
    window.setTimeout(() => runSearch("notion", "", { type: "page", databaseId }), 0);
  }

  function addPastedText() {
    if (!pasteContent.trim()) return;
    setSources((current) => dedupeSources([...current, {
      id: `paste-${Date.now()}`,
      provider: "paste",
      type: "note",
      title: pasteTitle.trim() || "Pasted context",
      meta: `${pasteContent.trim().length.toLocaleString()} characters`,
      content: pasteContent.trim()
    }]));
    setPasteTitle("");
    setPasteContent("");
    setPasteOpen(false);
  }

  function handleFiles(event) {
    const files = [...(event.target.files || [])];
    setPendingFiles((current) => {
      const next = [...current];
      for (const file of files) {
        if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
      }
      return next;
    });
    event.target.value = "";
    setSourceMenuOpen(false);
  }

  function removeSource(providerName, id) {
    if (providerName === "file") {
      setPendingFiles((current) => current.filter((file) => fileKey(file) !== id));
      return;
    }
    setSources((current) => current.filter((source) => `${source.provider}:${source.id}` !== id));
  }

  function togglePreparationKind(kind) {
    setPreparationKinds((current) => current.includes(kind)
      ? current.filter((value) => value !== kind)
      : [...current, kind]);
  }

  async function startSession(plan = activePreparationPlan) {
    setLaunchError("");
    setLaunching(true);
    try {
      const response = await fetch("/api/context-packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          meeting: selectedMeeting,
          intent: intent.trim(),
          sources
        })
      });
      let payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create the session context packet.");

      const unresolvedSources = (payload.packet?.sources || []).filter((source) => source.resolutionStatus !== "completed");
      if (unresolvedSources.length) {
        const names = unresolvedSources.map((source) => source.title).join(", ");
        throw new Error(`Cooper could not load ${names}. Remove it or reconnect Notion in Settings before starting.`);
      }

      for (const file of pendingFiles) {
        const form = new FormData();
        form.set("file", file);
        form.set("title", file.name);
        const uploadResponse = await fetch(`/api/context-packets/${payload.packet.id}/uploads`, {
          method: "POST",
          credentials: "same-origin",
          body: form
        });
        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) throw new Error(uploadPayload.error || `Could not add ${file.name}.`);
        payload = uploadPayload;
      }

      await onStart?.({
        meeting: selectedMeeting.id ? selectedMeeting : null,
        packet: payload.packet,
        sessionContext: payload.sessionContext,
        preparationKinds: plan.kinds,
        preparationPlan: plan
      });
    } catch (error) {
      setLaunchError(error.message || "Could not start the session.");
    } finally {
      setLaunching(false);
    }
  }

  const sourceRows = [
    ...sources.map((source) => ({ ...source, key: `${source.provider}:${source.id}` })),
    ...pendingFiles.map((file) => ({
      id: fileKey(file),
      key: fileKey(file),
      provider: "file",
      type: "file",
      title: file.name,
      meta: formatBytes(file.size)
    }))
  ];

  return (
    <div className="context-checkpoint-backdrop" role="presentation">
      <section className="context-checkpoint" role="dialog" aria-modal="true" aria-labelledby="context-checkpoint-title">
        <header className="context-checkpoint-head">
          <div className="context-dialog-title">
            <div>
              <h2 id="context-checkpoint-title">Prepare session</h2>
              <p>{selectedMeeting.title}{selectedMeeting.time ? ` · ${selectedMeeting.time}${selectedMeeting.duration ? ` (${selectedMeeting.duration})` : ""}` : ""}</p>
            </div>
          </div>
          <div className="context-dialog-steps" aria-label="Preparation progress">
            <CheckpointStep number="1" title="Meeting" detail={selectedMeeting.id ? "Selected" : "Fresh session"} complete />
            <CheckpointStep number="2" title="Sources" detail={`${totalSources} selected`} active />
            <CheckpointStep number="3" title="Review" detail="Ready to launch" />
          </div>
          <button className="context-icon-button context-close" onClick={onClose} type="button" aria-label="Close context checkpoint">
            <X size={18} />
          </button>
        </header>

        <div className="context-checkpoint-body">
          <aside className="context-meeting-picker">
            <p className="context-eyebrow">Session intent</p>
            <h2>What should this session accomplish?</h2>
            <label className="context-meeting-select">
              <span>Meeting</span>
              <select value={meetingId} onChange={(event) => setMeetingId(event.target.value)}>
                {sessionMeetings.map((meeting) => (
                  <option key={meeting.id || "fresh"} value={meeting.id}>{meeting.time ? `${meeting.time} · ` : ""}{meeting.title}</option>
                ))}
              </select>
            </label>
            <label className="context-intent-field">
              <span>Session intent</span>
              <textarea
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                placeholder="Capture the decision, question, or output you want from this session."
              />
            </label>
            <section className="context-session-people">
              <p className="context-eyebrow">People</p>
              <div><Users size={17} /><span>{selectedMeeting.subtitle || "Michael Moll"}</span></div>
            </section>
          </aside>

          <main className="context-workspace">
            <p className="context-eyebrow">Sources</p>
            <h1>Bring the room into context</h1>
            <p className="context-intro">Select the sources Cooper will reference.</p>

            <section className="context-sources-section">
              <div className="context-section-heading">
                <div>
                  <p className="context-eyebrow">Selected sources</p>
                  <h3>{totalSources ? `${totalSources} ready for review` : "Add context from your workspace"}</h3>
                </div>
                <div className="context-add-source-wrap">
                  <button className="context-secondary-button" onClick={() => setSourceMenuOpen((current) => !current)} type="button">
                    <Plus size={16} />
                    Add source
                  </button>
                  {sourceMenuOpen && (
                    <div className="context-source-menu">
                      <button onClick={() => openProvider("notion")} type="button"><NotebookText size={17} /><span><strong>Notion</strong><small>Pages, tickets, databases</small></span></button>
                      <button onClick={() => openProvider("github")} type="button"><Github size={17} /><span><strong>GitHub</strong><small>PRs, branches, issues</small></span></button>
                      <button onClick={() => openProvider("meeting")} type="button"><CalendarDays size={17} /><span><strong>Meeting notes</strong><small>Past Cooper calls</small></span></button>
                      <button onClick={() => fileInputRef.current?.click()} type="button"><Upload size={17} /><span><strong>Upload files</strong><small>Markdown, text, PDF</small></span></button>
                      <button onClick={() => { setPasteOpen(true); setSourceMenuOpen(false); }} type="button"><FileText size={17} /><span><strong>Paste text</strong><small>Plans, notes, agent output</small></span></button>
                    </div>
                  )}
                </div>
              </div>
              <input ref={fileInputRef} className="context-file-input" type="file" accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf" multiple onChange={handleFiles} />

              {sourceRows.length ? (
                <div className="context-source-list">
                  {sourceRows.map((source) => (
                    <article className="context-source-row" key={source.key}>
                      <ProviderGlyph provider={source.provider} />
                      <div>
                        <strong>{source.title}</strong>
                        <small>{providerLabel(source.provider)} · {source.repository || source.meta || source.type}</small>
                      </div>
                      {source.locked ? (
                        <span className="context-source-primary"><Check size={13} />Primary ticket</span>
                      ) : (
                        <button onClick={() => removeSource(source.provider, source.key)} type="button" aria-label={`Remove ${source.title}`}><X size={15} /></button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="context-empty-sources">
                  <Link2 size={22} />
                  <strong>No external context selected</strong>
                  <p>Cooper can still start fresh. Add sources when the decision depends on existing work.</p>
                </div>
              )}
            </section>

            <div className="context-compact-launch">
              {launchError && <p className="context-error" role="alert">{launchError}</p>}
              <button aria-label="Start session with prepared context" className="context-primary-button" disabled={busy || launching} onClick={() => startSession(activePreparationPlan)} title="Create and prepare session" type="button">
                <Sparkles size={16} />
                <span>{busy || launching ? "Preparing context" : "Start session"}</span>
              </button>
              <button className="context-secondary-button context-enter-direct" disabled={busy || launching} onClick={() => startSession(createManualPreparationPlan([]))} type="button">Enter without prep</button>
            </div>
          </main>

          <aside className="context-summary">
            <p className="context-eyebrow">Review</p>
            <h2>What Cooper will know</h2>
            <dl>
              <div><dt>Sources</dt><dd>{totalSources} selected</dd></div>
              <div><dt>Freshness</dt><dd>{totalSources ? "Current" : "Fresh session"}</dd></div>
              <div><dt>People</dt><dd>{selectedMeeting.subtitle || "Michael Moll"}</dd></div>
            </dl>
            <div className="context-packet-note">
              <Check size={16} />
              <p>Cooper receives one bounded packet. Remote content is fetched through the server and never trusted as system instructions.</p>
            </div>
            <section className="context-preparation-options">
              <div>
                <p className="context-eyebrow">Prepare before entering</p>
                <span>Queue durable, quality-checked drafts before the room opens.</span>
              </div>
              <div className="context-preparation-mode" role="tablist" aria-label="Document planning mode">
                <button aria-selected={preparationMode === "cooper"} className={preparationMode === "cooper" ? "selected" : ""} onClick={() => setPreparationMode("cooper")} role="tab" type="button">Let Cooper decide</button>
                <button aria-selected={preparationMode === "manual"} className={preparationMode === "manual" ? "selected" : ""} onClick={() => setPreparationMode("manual")} role="tab" type="button">Choose documents</button>
              </div>
              {preparationMode === "cooper" && (
                <div className="context-cooper-plan">
                  <strong>{cooperPreparationPlan.kinds.length} recommended documents</strong>
                  <p>{cooperPreparationPlan.rationale}</p>
                  <ul>{cooperPreparationPlan.kinds.map((kind) => <li key={kind}>{SESSION_PREPARATION_OPTIONS.find((option) => option.kind === kind)?.title}</li>)}</ul>
                </div>
              )}
              {preparationMode === "manual" && SESSION_PREPARATION_OPTIONS.map((option) => (
                  <label key={option.kind}>
                    <input type="checkbox" checked={preparationKinds.includes(option.kind)} onChange={() => togglePreparationKind(option.kind)} />
                    <span><strong>{option.title}</strong><small>{option.description} · {option.effort}</small></span>
                  </label>
                ))}
            </section>
            {launchError && <p className="context-error" role="alert">{launchError}</p>}
            <button aria-label="Start session with prepared context" className="context-primary-button" disabled={busy || launching} onClick={() => startSession(activePreparationPlan)} title="Create and prepare session" type="button">
              <Sparkles size={16} />
              <span>{busy || launching ? "Preparing context" : "Start session"}</span>
            </button>
            <button className="context-secondary-button context-enter-direct" disabled={busy || launching} onClick={() => startSession(createManualPreparationPlan([]))} type="button">Enter without prep</button>
            <button className="context-quiet-button" onClick={onClose} type="button">Cancel</button>
          </aside>
        </div>
      </section>

      {provider && (
        <ProviderDialog
          provider={provider}
          query={query}
          setQuery={setQuery}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          repository={repository}
          setRepository={setRepository}
          repositories={repositories}
          notionDatabases={notionDatabases}
          notionDatabaseId={notionDatabaseId}
          results={results}
          selectedIds={selectedResultIds}
          searching={searching}
          error={searchError}
          authorizationUrl={authorizationUrl}
          onSearch={() => runSearch()}
          onToggle={toggleResult}
          onOpenNotionDatabase={openNotionDatabase}
          onAdd={addSelectedResults}
          onClose={() => setProvider("")}
          onOpenSettings={onOpenSettings}
        />
      )}

      {pasteOpen && (
        <div className="context-provider-scrim">
          <section className="context-paste-dialog" role="dialog" aria-modal="true" aria-label="Paste context">
            <header><div><p className="context-eyebrow">Direct context</p><h2>Paste text</h2></div><button onClick={() => setPasteOpen(false)} type="button" aria-label="Close"><X size={18} /></button></header>
            <label><span>Source title</span><input value={pasteTitle} onChange={(event) => setPasteTitle(event.target.value)} placeholder="Sprint plan or agent output" /></label>
            <label><span>Context</span><textarea value={pasteContent} onChange={(event) => setPasteContent(event.target.value)} placeholder="Paste notes, Markdown, requirements, or generated output here." /></label>
            <footer><button className="context-quiet-button" onClick={() => setPasteOpen(false)} type="button">Cancel</button><button className="context-primary-button" disabled={!pasteContent.trim()} onClick={addPastedText} type="button">Add context</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function CheckpointStep({ number, title, detail, active = false, complete = false }) {
  return (
    <div className={`context-step${active ? " active" : ""}${complete ? " complete" : ""}`}>
      <span>{complete ? <Check size={15} /> : number}</span>
      <div><strong>{title}</strong><small>{detail}</small></div>
    </div>
  );
}

function ProviderDialog({
  provider,
  query,
  setQuery,
  typeFilter,
  setTypeFilter,
  repository,
  setRepository,
  repositories,
  notionDatabases,
  notionDatabaseId,
  results,
  selectedIds,
  searching,
  error,
  authorizationUrl,
  onSearch,
  onToggle,
  onOpenNotionDatabase,
  onAdd,
  onClose,
  onOpenSettings
}) {
  const copy = providerCopy[provider];
  const Icon = copy.icon;
  const selectedNotionDatabase = notionDatabases.find((database) => database.id === notionDatabaseId);
  const notionAllPages = notionDatabaseId === NOTION_ALL_PAGES;
  const notionDatabaseMode = provider === "notion" && !notionDatabaseId;
  const notionPageMode = provider === "notion" && Boolean(notionDatabaseId);
  const types = provider === "notion"
    ? [["all", "All types"], ["page", "Pages"], ["ticket", "Tickets"], ["database", "Databases"]]
    : provider === "github"
      ? [["all", "All types"], ["pull_request", "Pull requests"], ["branch", "Branches"], ["issue", "Issues"]]
      : [["all", "All calls"], ["meeting_summary", "Meeting notes"]];

  return (
    <div className="context-provider-scrim">
      <section className="context-provider-dialog" role="dialog" aria-modal="true" aria-labelledby="context-provider-title">
        <header>
          <div className="context-provider-title"><span><Icon size={19} /></span><div><p className="context-eyebrow">{copy.eyebrow}</p><h2 id="context-provider-title">{copy.title}</h2></div></div>
          <button onClick={onClose} type="button" aria-label="Close source picker"><X size={18} /></button>
        </header>

        <form className="context-provider-search" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
          <label>
            <Search size={17} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onSearch();
              }}
              placeholder={provider === "notion" && notionAllPages ? "Search all pages" : provider === "notion" && notionDatabaseId ? `Search in ${selectedNotionDatabase?.title || "database"}` : provider === "notion" ? "Filter databases" : copy.placeholder}
            />
          </label>
          <button className="context-primary-button" disabled={searching} type="submit">{searching ? "Searching" : "Search"}</button>
        </form>

        <div className="context-provider-filters">
          {provider === "notion" ? (
            <select value={notionDatabaseId} onChange={(event) => onOpenNotionDatabase(event.target.value)} aria-label="Notion database">
              <option value="">All databases</option>
              <option value={NOTION_ALL_PAGES}>All pages</option>
              <optgroup label="Browse a database">
                {notionDatabases.map((database) => <option key={database.id} value={database.id}>{database.title}</option>)}
              </optgroup>
            </select>
          ) : (
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Result type">
              {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}
          {provider === "github" && (
            <select value={repository} onChange={(event) => setRepository(event.target.value)} aria-label="Repository">
              <option value="all">All repositories</option>
              {repositories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          <span>{notionAllPages ? `${results.length} pages` : notionPageMode ? `${results.length} pages in ${selectedNotionDatabase?.title || "database"}` : provider === "notion" ? `${results.length} databases` : `${results.length} result${results.length === 1 ? "" : "s"}`}</span>
        </div>

        <div className="context-provider-results">
          {searching && !results.length ? (
            <div className="context-provider-empty"><Search className="context-search-spinner" size={23} /><strong>Loading Notion</strong><p>{notionDatabaseMode ? "Loading connected databases." : "Loading accessible pages."}</p></div>
          ) : error ? (
            <div className="context-provider-empty error">
              <strong>Connection needs attention</strong>
              <p>{error}</p>
              <div>
                {authorizationUrl && <a href={authorizationUrl} target="_blank" rel="noreferrer">Authorize in Arcade</a>}
                <button onClick={onOpenSettings} type="button">Open settings</button>
              </div>
            </div>
          ) : results.length ? results.map((result) => notionDatabaseMode && result.type === "database" ? (
            <article className={selectedIds.includes(result.id) ? "context-result-row context-database-row selected" : "context-result-row context-database-row"} key={`${result.provider}:${result.id}`}>
              <button className="context-checkbox-button" aria-label={`${selectedIds.includes(result.id) ? "Remove" : "Add"} ${result.title}`} onClick={() => onToggle(result)} type="button">
                <span className="context-checkbox"><Check size={13} /></span>
              </button>
              <ProviderGlyph provider={provider} />
              <button className="context-result-open" onClick={() => onOpenNotionDatabase(result.id)} type="button">
                <span className="context-result-copy"><strong>{result.title || "Untitled database"}</strong><small>Notion database{result.updatedAt ? ` · Updated ${shortDate(result.updatedAt)}` : ""}</small></span>
                <span className="context-drill-label">Browse <ChevronRight size={16} /></span>
              </button>
            </article>
          ) : (
            <label className={selectedIds.includes(result.id) ? "context-result-row selected" : "context-result-row"} key={`${result.provider}:${result.id}`}>
              <input type="checkbox" checked={selectedIds.includes(result.id)} onChange={() => onToggle(result)} />
              <span className="context-checkbox"><Check size={13} /></span>
              <ProviderGlyph provider={provider} />
              <span className="context-result-copy"><strong>{result.title || "Untitled source"}</strong><small>{result.repository || result.meta || result.type}{result.updatedAt ? ` · Updated ${shortDate(result.updatedAt)}` : ""}</small></span>
              <em>{result.freshness === "review" ? "Review" : "Current"}</em>
            </label>
          )) : (
            <div className="context-provider-empty"><Search size={23} /><strong>{notionPageMode ? "No pages found" : "Find the exact source"}</strong><p>{notionPageMode ? "Try another search or switch to All pages to search the full workspace." : copy.empty}</p></div>
          )}
        </div>

        <footer>
          <span>{selectedIds.length} selected</span>
          <div><button className="context-quiet-button" onClick={onClose} type="button">Cancel</button><button className="context-primary-button" disabled={!selectedIds.length} onClick={onAdd} type="button">Add selected</button></div>
        </footer>
      </section>
    </div>
  );
}

function ProviderGlyph({ provider }) {
  const Icon = provider === "github" ? Github : provider === "meeting" ? CalendarDays : provider === "file" ? Upload : provider === "paste" ? FileText : NotebookText;
  return <span className={`context-provider-glyph ${provider}`}><Icon size={16} /></span>;
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.provider}:${source.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function providerLabel(provider) {
  return provider === "notion" ? "Notion" : provider === "github" ? "GitHub" : provider === "meeting" ? "Meeting notes" : provider === "file" ? "Upload" : "Pasted text";
}

function fileKey(file) {
  return `file:${file.name}:${file.size}:${file.lastModified}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function checkpointIntent(value = "") {
  const cleaned = String(value)
    .split(/(?:─{3,}|-{3,}|\b(?:join zoom meeting|view meeting insights|meeting id:|one tap mobile|dial by your location)\b)/i)[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > 420 ? `${cleaned.slice(0, 417).trimEnd()}…` : cleaned;
}
