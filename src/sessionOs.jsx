import React from "react";
import {
  AudioLines,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Plus
} from "lucide-react";
import { SESSION_NAV_ITEMS } from "./sessionModel.js";

export function SessionOsTopbar({
  active = "today",
  onNavigate,
  onNewSession,
  onOpenOperator,
  onOpenComputer,
  onLogout,
  compact = false
}) {
  return (
    <header className={`session-os-topbar${compact ? " compact" : ""}`}>
      <button className="session-os-brand" onClick={() => onNavigate?.("today")} type="button" aria-label="Go to Today">
        <img src="/assets/aires/logo-symbol.svg" alt="" />
        <strong>Cooper</strong>
        <span>AIRES workspace</span>
      </button>

      <nav className="session-os-nav" aria-label="Primary navigation">
        {SESSION_NAV_ITEMS.map((item) => (
          <button
            className={active === item.id ? "active" : ""}
            key={item.id}
            onClick={() => onNavigate?.(item.id)}
            type="button"
            aria-current={active === item.id ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="session-os-actions">
        <button className="session-os-new" onClick={onNewSession} type="button" aria-label="New session">
          <Plus size={17} />
          <span>New session</span>
        </button>
        <details className="session-os-capabilities">
          <summary aria-label="Open session and profile menu">MM</summary>
          <div className="session-os-menu">
            <p>Session capabilities</p>
            <button onClick={onNewSession} type="button"><AudioLines size={16} /><span>Talk with Cooper</span></button>
            <button onClick={onOpenOperator} type="button"><Monitor size={16} /><span>Delegate work</span></button>
            <button onClick={onOpenComputer} type="button"><MonitorSmartphone size={16} /><span>Computer Use</span></button>
            <button className="danger" onClick={onLogout} type="button"><LogOut size={16} /><span>Lock workspace</span></button>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SessionMemory({ chapters = [], activeId = "", onSelect }) {
  if (!chapters.length) return null;

  return (
    <section className="session-memory" aria-labelledby="session-memory-title">
      <div className="session-memory-head">
        <strong id="session-memory-title">Session memory</strong>
        <p>Restore the transcript, context, decision, and canvas state from any moment.</p>
      </div>
      <div className="session-memory-track">
        {chapters.map((chapter, index) => (
          <button
            className={`session-memory-step ${chapter.status}${activeId === chapter.id ? " selected" : ""}`}
            key={chapter.id}
            onClick={() => onSelect?.(chapter)}
            type="button"
            aria-pressed={activeId === chapter.id}
          >
            <span className="session-memory-index">{index + 1}</span>
            <span>
              <strong>{chapter.label}</strong>
              <small>{chapter.time}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
