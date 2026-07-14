import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cssPath = new URL("../src/session-os.css", import.meta.url);
const planPath = new URL("../docs/11-session-os-production-plan.md", import.meta.url);
const auditPath = new URL("../docs/12-session-os-completion-audit.md", import.meta.url);
const appPath = new URL("../src/main.jsx", import.meta.url);
const componentsPath = new URL("../src/sessionOs.jsx", import.meta.url);

test("Session OS stylesheet locks the accepted design tokens", async () => {
  const css = await readFile(cssPath, "utf8");
  const expectedTokens = {
    "--so-ink": "#2d2c2d",
    "--so-canvas": "#fbfbf8",
    "--so-surface": "#ffffff",
    "--so-line": "#e4e4df",
    "--so-volt": "#f0de4a",
    "--so-radius-control": "7px",
    "--so-radius-surface": "8px"
  };

  for (const [token, value] of Object.entries(expectedTokens)) {
    assert.match(css, new RegExp(`${token}:\\s*${value.replace("#", "\\#")}`));
  }
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|conic-gradient/i);
});

test("Session OS stylesheet enforces the accepted desktop and mobile canvas model", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /grid-template-columns:\s*minmax\(330px, 27%\)\s+minmax\(0, 73%\)/);
  assert.match(css, /\.session-memory-track\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.session-memory-track\s*\{[\s\S]*grid-template-columns:\s*1fr 1fr/);
});

test("production plan records the accepted IA and verification contract", async () => {
  const plan = await readFile(planPath, "utf8");

  for (const section of ["Today", "Sessions", "Projects", "Library", "Settings", "Session Memory", "Verification Contract"]) {
    assert.match(plan, new RegExp(section));
  }
});

test("production app mounts the shared Session OS shell across every workspace", async () => {
  const app = await readFile(appPath, "utf8");
  const components = await readFile(componentsPath, "utf8");

  assert.ok((app.match(/<SessionOsTopbar/g) || []).length >= 5);
  for (const capability of ["Talk with Cooper", "Delegate work", "Computer Use", "Lock workspace"]) {
    assert.match(components, new RegExp(capability));
  }
  assert.match(app, /<SessionMemory/);
  assert.match(app, /className="project-empty-state"/);
  assert.match(components, /aria-current=\{active === item\.id \? "page" : undefined\}/);
  assert.match(components, /aria-label="New session"/);
});

test("completion audit covers every required workspace and verification gate", async () => {
  const audit = await readFile(auditPath, "utf8");

  for (const requirement of [
    "Today",
    "Sessions",
    "Projects",
    "Library",
    "Settings",
    "New session",
    "Session Memory",
    "Operator",
    "Computer Use",
    "npm test",
    "npm run build"
  ]) {
    assert.match(audit, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("saved sessions can prepare and launch a linked Cooper continuation", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /Resume with Cooper/);
  assert.match(app, /\/api\/calls\/\$\{call\.id\}\/resume/);
  assert.match(app, /resumedFromCallId/);
  assert.match(app, /type:\s*"resumed_session"/);
  assert.match(app, /Continuing session/);
});
