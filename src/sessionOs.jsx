import React from "react";
import {
  AudioLines,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  FolderKanban,
  ListChecks,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Plus,
  Settings,
  TrendingUp,
  X
} from "lucide-react";
import { SESSION_NAV_ITEMS } from "./sessionModel.js";

const SESSION_NAV_ICONS = {
  today: CalendarDays,
  sessions: Clock3,
  projects: FolderKanban,
  docs: FileText,
  settings: Settings
};

export function SessionOsTopbar({
  active = "today",
  onNavigate,
  onNewSession,
  onOpenOperator,
  onOpenComputer,
  onLogout,
  compact = false
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [active]);

  React.useEffect(() => {
    if (menuOpen) closeRef.current?.focus();
  }, [menuOpen]);

  function navigate(destination) {
    setMenuOpen(false);
    onNavigate?.(destination);
  }

  function closeThen(callback) {
    setMenuOpen(false);
    callback?.();
  }

  const primaryItems = SESSION_NAV_ITEMS.filter((item) => item.id !== "settings");
  const settingsItem = SESSION_NAV_ITEMS.find((item) => item.id === "settings");

  return (
    <header className={`session-os-topbar app-navigation${compact ? " compact" : ""}${menuOpen ? " is-open" : ""}`}>
      <button
        className="session-os-launcher"
        onClick={() => setMenuOpen(true)}
        type="button"
        aria-label="Open Cooper AIRES workspace navigation"
        aria-expanded={menuOpen}
      >
        <img src="/assets/aires/logo-symbol.svg" alt="" />
        <span className="session-os-launcher-lockup"><strong>Cooper</strong><small>AIRES WORKSPACE</small></span>
      </button>
      <button className="session-os-drawer-scrim" onClick={() => setMenuOpen(false)} type="button" aria-label="Close navigation" aria-hidden={!menuOpen} tabIndex={menuOpen ? 0 : -1} />

      <aside className="session-os-sidebar-panel" aria-label="Cooper workspace navigation" aria-hidden={!menuOpen}>
        <div className="session-os-sidebar-head">
          <button className="session-os-brand" onClick={() => navigate("today")} type="button" aria-label="Go to Today">
            <img src="/assets/aires/logo-symbol.svg" alt="" />
            <span>
              <strong>Cooper</strong>
              <small>AIRES WORKSPACE</small>
            </span>
          </button>
          <button ref={closeRef} className="session-os-drawer-close" onClick={() => setMenuOpen(false)} type="button" aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>

        <nav className="session-os-nav" aria-label="Primary navigation">
          {primaryItems.map((item) => {
            const Icon = SESSION_NAV_ICONS[item.id];
            return (
              <button
                className={active === item.id ? "active" : ""}
                key={item.id}
                onClick={() => navigate(item.id)}
                type="button"
                aria-current={active === item.id ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === "today" && <em>7</em>}
              </button>
            );
          })}
        </nav>

        <section className="session-os-workspace-links" aria-label="Workspace shortcuts">
          <span>Workspace</span>
          <button onClick={() => navigate("projects")} type="button"><TrendingUp size={19} /><span>Rep velocity</span></button>
          <button onClick={() => navigate("library")} type="button"><ListChecks size={19} /><span>Listings</span></button>
        </section>

        <div className="session-os-sidebar-foot">
          {settingsItem && (() => {
            const Icon = SESSION_NAV_ICONS.settings;
            return (
              <button
                className={`session-os-settings-link${active === settingsItem.id ? " active" : ""}`}
                onClick={() => navigate(settingsItem.id)}
                type="button"
                aria-current={active === settingsItem.id ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{settingsItem.label}</span>
              </button>
            );
          })()}

          <button className="session-os-new" onClick={() => closeThen(onNewSession)} type="button" aria-label="New session">
            <Plus size={17} />
            <span>New session</span>
          </button>

          <details className="session-os-capabilities">
            <summary aria-label="Open session and profile menu">
              <span className="session-os-avatar">MM</span>
              <span className="session-os-profile-copy"><strong>Michael Moll</strong><small>Executive</small></span>
              <ChevronDown size={16} />
            </summary>
            <SessionCapabilityMenu
              onNewSession={() => closeThen(onNewSession)}
              onOpenOperator={() => closeThen(onOpenOperator)}
              onOpenComputer={() => closeThen(onOpenComputer)}
              onLogout={() => closeThen(onLogout)}
            />
          </details>
        </div>
      </aside>
    </header>
  );
}

function SessionCapabilityMenu({ onNewSession, onOpenOperator, onOpenComputer, onLogout }) {
  return (
    <div className="session-os-menu">
      <p>Session capabilities</p>
      <button onClick={onNewSession} type="button"><AudioLines size={16} /><span>Talk with Cooper</span></button>
      <button onClick={onOpenOperator} type="button"><Monitor size={16} /><span>Codex orchestration</span></button>
      <button onClick={onOpenComputer} type="button"><MonitorSmartphone size={16} /><span>Computer Use</span></button>
      <button className="danger" onClick={onLogout} type="button"><LogOut size={16} /><span>Lock workspace</span></button>
    </div>
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
