import React from "react";
import {
  Activity,
  Check,
  Copy,
  Database,
  FileText,
  GitBranch,
  Github,
  ListChecks,
  NotebookText,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { createPreparedSessionOverview } from "./sessionPreparation.js";

export function PreparedSessionOverview({
  contextPacket,
  sessionFocus,
  jobs = [],
  artifacts = [],
  onOpenArtifact,
  onPrepareAgain
}) {
  const [tab, setTab] = React.useState("overview");
  const [copied, setCopied] = React.useState(false);
  const overview = React.useMemo(() => createPreparedSessionOverview({
    packet: contextPacket?.packet,
    sessionContext: contextPacket?.sessionContext,
    focus: sessionFocus,
    jobs,
    artifacts
  }), [contextPacket, sessionFocus, jobs, artifacts]);

  async function copyBrief() {
    const text = [
      overview.title,
      overview.goal,
      "",
      ...overview.evidence.map((item) => `${item.title}\n${item.summary}\n${item.citation}`),
      "",
      "Questions for the room",
      ...overview.questions.map((question) => `- ${question}`)
    ].join("\n");
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function openPreparedArtifact(item) {
    if (item.artifactId) {
      onOpenArtifact?.(item.artifactId);
      return;
    }
    setTab("activity");
  }

  const tabs = [
    ["overview", "Overview"],
    ["documents", "Documents"],
    ["sources", "Sources"],
    ["activity", "Activity"]
  ];

  return (
    <section className="prepared-session-shell" aria-label="Prepared session overview">
      <header className="prepared-session-head">
        <h2>Session overview</h2>
        <nav aria-label="Prepared session sections">
          {tabs.map(([id, label]) => (
            <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
          ))}
        </nav>
      </header>

      {tab === "overview" && (
        <article className="prepared-session-overview">
          <div className="prepared-overview-main">
            <p className="prepared-status"><span />Prepared from {overview.sourceCount} connected source{overview.sourceCount === 1 ? "" : "s"}</p>
            <div className="prepared-title-row">
              <div>
                <h3>{overview.title}</h3>
                <p>{overview.goal}</p>
              </div>
              <div className="prepared-title-actions">
                <button onClick={copyBrief} type="button"><Copy size={15} />{copied ? "Copied" : "Copy brief"}</button>
                <button onClick={onPrepareAgain} type="button"><RefreshCw size={15} />Re-prepare</button>
              </div>
            </div>

            <div className="prepared-coverage">
              <div><strong>What Cooper knows</strong><span>Evidence is bounded to the selected context packet and cited below.</span></div>
              <div><div><i style={{ width: `${overview.coverage}%` }} /></div><small>{overview.coverage}% context coverage - {overview.questions.length} open questions</small></div>
            </div>

            <PreparedSection title="Shared understanding" detail="The concise version attendees can align on before discussion starts.">
              <div className="prepared-evidence-list">
                {overview.evidence.map((item, index) => (
                  <article key={item.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{item.title}</strong><p>{item.summary}</p><cite>{item.citation}</cite></div>
                  </article>
                ))}
              </div>
            </PreparedSection>

            <PreparedSection title="Questions for the room" detail="Resolve these gaps before implementation moves forward.">
              <ul className="prepared-question-list">{overview.questions.map((question) => <li key={question}>{question}</li>)}</ul>
            </PreparedSection>

            <PreparedSection title="Ready to review" detail="Working artifacts stay reviewable while Cooper listens and the call continues.">
              <PreparedArtifactList items={overview.preparedArtifacts} onOpen={openPreparedArtifact} />
            </PreparedSection>
          </div>

          <aside className="prepared-overview-side">
            <PreparedSources sources={overview.sources} />
            <section><p className="prepared-label">Evidence boundary</p><div className="prepared-boundary">Cooper can reason across these selected sources. It cannot assume behavior that is not stated or visible in the connected evidence.</div></section>
            <section><p className="prepared-label">Session outcome</p><h4>Definition of done</h4><p>Resolve the key decision, accept or revise the prepared work, and name the next owner and verification step.</p></section>
          </aside>
        </article>
      )}

      {tab === "documents" && (
        <section className="prepared-simple-panel"><h3>Prepared documents</h3><p>Open completed work on the canvas. Jobs that are still running link to their live activity.</p><PreparedArtifactList items={overview.preparedArtifacts} onOpen={openPreparedArtifact} /></section>
      )}
      {tab === "sources" && (
        <section className="prepared-simple-panel"><h3>Session sources</h3><p>This is the evidence boundary Cooper receives when the realtime call starts.</p><PreparedSources sources={overview.sources} expanded /></section>
      )}
      {tab === "activity" && (
        <section className="prepared-simple-panel"><h3>Preparation activity</h3><p>A human-readable execution trace shows retrieval and artifact progress without exposing private model reasoning.</p><div className="prepared-activity-list">{overview.activity.map((item) => <div key={item.id}><time>{formatTime(item.at)}</time><span className={item.status} /><p>{item.message}</p></div>)}</div></section>
      )}
    </section>
  );
}

function PreparedSection({ title, detail, children }) {
  return <section className="prepared-section"><header><h4>{title}</h4><p>{detail}</p></header><div>{children}</div></section>;
}

function PreparedArtifactList({ items, onOpen }) {
  return (
    <div className="prepared-artifact-list">
      {items.map((item) => {
        const Icon = artifactIcon(item.kind);
        return (
          <button key={item.kind} onClick={() => onOpen(item)} type="button">
            <span><Icon size={17} /></span>
            <span><strong>{item.title}</strong><small>{item.outputType.toUpperCase()} - {item.progress}</small></span>
            <em className={item.status}>{statusLabel(item.status)}</em>
          </button>
        );
      })}
    </div>
  );
}

function PreparedSources({ sources, expanded = false }) {
  return (
    <section className={expanded ? "prepared-sources expanded" : "prepared-sources"}>
      <p className="prepared-label">Context packet</p>
      <h4>Sources Cooper can use</h4>
      <div>{sources.map((source) => {
        const Icon = sourceIcon(source.provider, source.type);
        return <article key={`${source.provider}:${source.id}`}><span><Icon size={15} /></span><div><strong>{source.title}</strong><small>{source.provider} - {source.type}</small></div><Check size={14} /></article>;
      })}</div>
      {!sources.length && <p>No external sources were selected.</p>}
    </section>
  );
}

function artifactIcon(kind) {
  if (kind === "mermaid_diagram") return GitBranch;
  if (kind === "aires_requirements") return ListChecks;
  if (kind === "qa_checklist") return ShieldCheck;
  return FileText;
}

function sourceIcon(provider, type) {
  if (provider === "github") return Github;
  if (type === "database") return Database;
  return NotebookText;
}

function statusLabel(status) {
  if (status === "ready" || status === "completed") return "Ready";
  if (status === "running") return "Building";
  if (status === "queued") return "Queued";
  if (status === "failed") return "Retry";
  return "Available";
}

function formatTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "now";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date);
}
