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
  if (artifact.extension === "pdf" || artifact.file?.endsWith(".pdf")) return "pdf";
  if (artifact.extension === "docx" || artifact.file?.endsWith(".docx")) return "docx";
  if (artifact.extension === "pptx" || artifact.file?.endsWith(".pptx")) return "pptx";
  if (artifact.extension === "xlsx" || artifact.file?.endsWith(".xlsx")) return "xlsx";
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
  if (outputType === "pdf") return "preview";
  if (["docx", "pptx", "xlsx"].includes(outputType)) return "download";
  return "rendered";
}

export function artifactPreviewSurface(artifact = {}) {
  const outputType = artifactOutputTypeFromMetadata(artifact);
  if (outputType === "html") return "iframe";
  if (outputType === "mcp_app") return "mcp_app_iframe";
  if (outputType === "pdf") return "pdf_iframe";
  if (["docx", "pptx", "xlsx"].includes(outputType)) return "office_download";
  return "rendered_markdown";
}
