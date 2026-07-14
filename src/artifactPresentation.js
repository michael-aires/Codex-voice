export const HTML_ARTIFACT_KINDS = [
  "html_prototype",
  "ui_wireframe",
  "aires_requirements",
  "landing_page",
  "mini_app",
  "executive_report"
];

export function artifactOutputTypeFromMetadata(artifact = {}) {
  artifact = artifact || {};
  if (artifact.outputType) return artifact.outputType;
  if (artifact.extension === "json" || artifact.file?.endsWith(".json") || artifact.kind === "mcp_app") return "mcp_app";
  if (
    artifact.extension === "html" ||
    artifact.file?.endsWith(".html") ||
    HTML_ARTIFACT_KINDS.includes(String(artifact.kind || "").toLowerCase())
  ) {
    return "html";
  }
  return "markdown";
}

export function artifactInitialMode(artifact = {}) {
  const outputType = artifactOutputTypeFromMetadata(artifact);
  if (outputType === "html") return "preview";
  if (outputType === "mcp_app") return "app";
  return "rendered";
}

export function artifactPreviewSurface(artifact = {}) {
  const outputType = artifactOutputTypeFromMetadata(artifact);
  if (outputType === "html") return "iframe";
  if (outputType === "mcp_app") return "mcp_app_iframe";
  return "rendered_markdown";
}
