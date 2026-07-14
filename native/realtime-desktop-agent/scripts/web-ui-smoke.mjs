import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const webRoot = join(appRoot, "Resources", "Web");

const [html, app, css, tokenText] = await Promise.all([
  readFile(join(webRoot, "index.html"), "utf8"),
  readFile(join(webRoot, "app.js"), "utf8"),
  readFile(join(webRoot, "styles.css"), "utf8"),
  readFile(join(webRoot, "design-tokens.json"), "utf8")
]);

const tokens = JSON.parse(tokenText);
assert(tokens.schema === "aires.native-design-tokens.v1", "design token schema ok");
assert(Array.isArray(tokens.components) && tokens.components.includes("CanvasCard") && tokens.components.includes("NotificationPanel"), "component inventory exists");
for (const variable of collectCssVariables(tokens)) {
  assert(css.includes(`${variable}:`), `CSS token exists: ${variable}`);
}

assert(html.includes('id="lockView"'), "lock view exists");
assert(html.includes('data-nav-view="home"'), "Today nav exists");
assert(html.includes('data-nav-view="sessions"'), "Sessions nav exists");
assert(html.includes('data-nav-view="projects"'), "Projects nav exists");
assert(html.includes('data-nav-view="library"'), "Library nav exists");
assert(html.includes('data-nav-view="operator"'), "Operator nav exists");
assert(html.includes('data-nav-view="settings"'), "Settings nav exists");
assert(html.includes('class="session-sidebar"') && html.includes('class="session-rail-nav"'), "Session OS sidebar exists");
assert(html.includes('data-call-mode="free"') && html.includes('data-call-mode="manual"') && html.includes('data-call-mode="wake"'), "call modes exist");
assert(html.includes('id="canvasLayout"') && html.includes('id="canvasGroup"') && html.includes('id="canvasFilter"'), "canvas controls exist");

assert(app.includes("renderHome") && app.includes("renderShellView"), "home and shell renderers exist");
assert(app.includes("openMeetingUrl") && app.includes("Meeting join opened") && app.includes("joinUrl"), "meeting join path exists");
assert(app.includes("renderSessionsBody") && app.includes("sessionSearchText"), "sessions UI exists");
assert(app.includes("renderProjectsBody") && app.includes("extractPdfFile"), "projects and PDF UI exist");
assert(app.includes("renderLibraryBody") && app.includes("requestResponsesArtifact"), "library and artifact generation UI exists");
assert(app.includes("retryResponsesJob") && app.includes("Retry Responses"), "library artifact retry UI exists");
assert(app.includes("startAiresFacilitation") && app.includes("buildAiresFacilitationPacket"), "AIRES live facilitation UI exists");
assert(app.includes("startArtifactPresentation") && app.includes("presentationOverlay") && app.includes("artifactPresentationSlides"), "presentation runtime exists");
assert(app.includes("artifactReaderModes") && app.includes("renderArtifactSource") && app.includes("renderArtifactMetadata"), "library artifact reader tabs exist");
assert(app.includes("renderOperatorBody") && app.includes("queueOperatorTask"), "operator UI exists");
assert(app.includes("executeComputerUseOperatorTask") && app.includes("renderComputerUseResult") && app.includes("localComputerToolNames"), "Computer Use execution UI exists");
assert(app.includes("merge: true") && app.includes("hydrateNativeStore();"), "store merge/refresh path exists");
assert(app.includes("renderSettingsBody") && app.includes("hydrateManifestStatus"), "settings and manifest UI exists");
assert(app.includes("renderArcadeSettingsPanel") && app.includes("hydrateArcadeStatus") && app.includes("authorizeAllArcadeTools"), "Arcade settings UI exists");
assert(app.includes("requestNativeNotificationStatus"), "notification settings bridge exists");
assert(app.includes("sanitizeHTML") && app.includes("allowedEmbedURL") && app.includes("loadMermaid"), "renderer security hooks exist");
assert(app.includes("renderMcpAppPreview") && app.includes("buildMcpAppArtifact"), "MCP App preview UI exists");
assert(app.includes("run_gstack_skill") && app.includes("renderGstackSkillResult") && app.includes("advisoryOnly"), "GStack advisory UI exists");
assert(app.includes("arcadeToolNames") && app.includes("renderArcadeToolResult") && app.includes("arcade_oauth"), "Arcade tool approval UI exists");
assert(app.includes("connectorMeta") && app.includes("renderRecoverableToolError"), "connector error UI exists");
assert(app.includes("approveBrokerTool") && app.includes("connectorApprovalPrompt") && app.includes("connectorApprovalDetail"), "connector approval UI exists");
assert(app.includes("Approval-gated tools") && app.includes("This will be saved to the tool audit."), "connector approval copy exists");

assert(css.includes(".topbar") && css.includes(".workspace-topbar"), "topbar styles exist");
assert(css.includes(".session-os-layout") && css.includes(".session-sidebar") && css.includes(".session-rail-nav"), "Session OS shell styles exist");
assert(css.includes(".canvas-grid.layout-one") && css.includes(".canvas-grid.layout-three"), "canvas layout styles exist");
assert(css.includes(".settings-panel") && app.includes("capabilityPanel"), "settings panel styles exist");
assert(css.includes(".settings-panel") && app.includes("notificationPanel"), "notification panel styles exist");
assert(css.includes(".arcade-panel") && css.includes(".arcade-tool-row") && css.includes(".arcade-service-row"), "Arcade settings styles exist");
assert(css.includes(".artifact-reader-tabs") && css.includes(".artifact-meta-grid"), "artifact reader styles exist");
assert(css.includes(".presentation-overlay") && css.includes(".presentation-stage") && css.includes(".presentation-slide"), "presentation runtime styles exist");
assert(css.includes(".mcp-preview") && css.includes(".aires-mode-grid") && css.includes(".aires-live-actions"), "artifact preview styles exist");
assert(css.includes("@media (max-width: 820px)"), "mobile breakpoint exists");

console.log("native web UI smoke passed");

function collectCssVariables(value, variables = new Set()) {
  if (!value || typeof value !== "object") {
    return variables;
  }
  if (typeof value.cssVariable === "string") {
    variables.add(value.cssVariable);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCssVariables(item, variables);
    }
  } else {
    for (const item of Object.values(value)) {
      collectCssVariables(item, variables);
    }
  }
  return variables;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Web UI smoke assertion failed: ${message}`);
  }
}
