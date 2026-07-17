import React from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileCheck2,
  LoaderCircle,
  Mic,
  RotateCcw,
  Sparkles
} from "lucide-react";
import {
  deriveSessionPreparationState,
  SESSION_PREPARATION_STAGES
} from "./sessionPreparation.js";

export function SessionPreparationFlow({
  preparation,
  jobs = [],
  artifacts = [],
  onEnter,
  onEnterWithVoice,
  onRetry,
  onCancel
}) {
  const readiness = deriveSessionPreparationState({
    callId: preparation?.callId,
    kinds: preparation?.kinds,
    jobs,
    artifacts,
    queueError: preparation?.queueError
  });
  const sourceCount = preparation?.packet?.sources?.length || 0;
  const activeOutput = readiness.outputs.find((output) => ["queued", "running", "pausing", "repairing", "validating"].includes(output.status));
  const headline = readiness.ready
    ? readiness.degraded ? "The session is ready with a visible exception." : "Cooper is ready for the room."
    : activeOutput ? `Cooper is preparing ${activeOutput.title}.` : "Preparing a shared starting point.";

  return (
    <main className="session-preparation-page">
      <header className="session-preparation-topbar">
        <div><span className="cooper-mark">◆</span><strong>Cooper</strong><small>AIRES workspace</small></div>
        <button onClick={onCancel} type="button">Cancel</button>
      </header>

      <section className="session-preparation-layout">
        <div className="session-preparation-main">
          <p className="context-eyebrow">Session preparation</p>
          <h1>{headline}</h1>
          <p className="session-preparation-intro">
            {readiness.ready
              ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} and ${readiness.completedCount} prepared document${readiness.completedCount === 1 ? "" : "s"} are attached to the same durable session.`
              : "The call can open at any time. Document work will continue safely in the background and appear on the canvas as it completes."}
          </p>

          <div className="session-preparation-progress" aria-live="polite">
            <div><span style={{ width: `${Math.max(4, readiness.progress)}%` }} /></div>
            <small>{readiness.progress}% document pipeline complete</small>
          </div>

          <ol className="session-preparation-stages">
            {SESSION_PREPARATION_STAGES.map((stage, index) => {
              const complete = index < readiness.stageIndex || (readiness.ready && index === readiness.stageIndex);
              const active = index === readiness.stageIndex && !readiness.ready;
              return (
                <li className={complete ? "complete" : active ? "active" : ""} key={stage.id}>
                  <span>{complete ? <Check size={14} /> : active ? <LoaderCircle className="spin" size={14} /> : index + 1}</span>
                  <strong>{stage.label}</strong>
                </li>
              );
            })}
          </ol>

          {preparation?.queueError && (
            <div className="session-preparation-warning" role="alert"><CircleAlert size={18} /><span>{preparation.queueError}</span></div>
          )}

          <div className="session-preparation-actions">
            <button className="today-primary-action" onClick={onEnter} type="button">
              <span>{readiness.ready ? "Enter prepared session" : "Enter session now"}</span><ArrowRight size={17} />
            </button>
            <button className="today-secondary-action" onClick={onEnterWithVoice} type="button">
              <Mic size={17} /><span>Enter with voice</span>
            </button>
          </div>
          {!readiness.ready && <p className="session-preparation-footnote">Entering now does not cancel or restart any background document.</p>}
        </div>

        <aside className="session-preparation-manifest">
          <div className="session-preparation-summary">
            <Sparkles size={18} />
            <div><p className="context-eyebrow">Document plan</p><strong>{preparation?.plan?.mode === "manual" ? "Chosen by you" : "Recommended by Cooper"}</strong></div>
          </div>
          <p>{preparation?.plan?.rationale}</p>
          <div className="session-preparation-documents">
            {readiness.outputs.map((output) => (
              <article key={output.kind}>
                <span className={`document-state ${output.status}`}>
                  {output.status === "completed" ? <FileCheck2 size={16} /> : ["failed", "canceled"].includes(output.status) ? <CircleAlert size={16} /> : <LoaderCircle className={output.status === "running" ? "spin" : ""} size={16} />}
                </span>
                <div>
                  <strong>{output.title}</strong>
                  <small>{preparation?.plan?.reasons?.[output.kind] || output.description}</small>
                  <em>{documentStatusLabel(output)}{output.required ? " · readiness document" : " · continues in background"}</em>
                </div>
                {output.status === "failed" && <button aria-label={`Retry ${output.title}`} onClick={() => onRetry?.(output.job?.id)} type="button"><RotateCcw size={15} /></button>}
              </article>
            ))}
            {!readiness.outputs.length && <p className="session-preparation-empty">No documents requested. Cooper will enter with the context packet and opening presentation.</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function documentStatusLabel(output) {
  if (output.status === "completed") return output.quality?.status === "needs_review" ? "Ready with quality warnings" : "Ready and quality checked";
  if (output.status === "failed") return output.job?.error || "Generation needs attention";
  if (output.status === "running") return output.job?.activeStepSummary || output.job?.progress || "Generating";
  if (output.status === "queued") return "Queued in the durable pipeline";
  return "Waiting to be queued";
}
