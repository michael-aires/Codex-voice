export function buildCanvasCustomPrompt({
  request = "",
  projectContext = "",
  transcriptEntries = [],
  fallbackPrompt = ""
} = {}) {
  const requestText = String(request || "").trim();
  const projectText = String(projectContext || "").trim();
  const transcriptText = Array.isArray(transcriptEntries) && transcriptEntries.length
    ? transcriptEntries
        .slice(-8)
        .map((entry) => `- ${entry.speaker || "speaker"}: ${entry.text || ""}`)
        .join("\n")
    : "";

  const promptBlock = requestText
    ? `Michael provided the source context and instruction for this artifact. Treat this as the primary source of truth. Do not let any attached project context override or dilute it.\n\n${requestText}`
    : String(fallbackPrompt || "").trim();

  const projectBlock = !requestText && projectText
    ? `Active project context to use because Michael did not provide a build prompt:\n${projectText}`
    : "";

  const transcriptBlock = transcriptText
    ? `${requestText ? "Secondary live transcript context. Use only if it supports Michael's typed context:" : "Recent live transcript:"}\n${transcriptText}`
    : "";

  return [promptBlock, projectBlock, transcriptBlock].filter(Boolean).join("\n\n");
}
