export function progressPercent(job = {}) {
  if (job.status === "completed") return 100;
  const stepCount = Math.max(1, Number(job.stepCount || 1));
  const stepIndex = Math.min(stepCount, Math.max(0, Number(job.stepIndex || 0)));
  if (job.status === "failed") return Math.max(8, Math.round((stepIndex / stepCount) * 100));
  const base = (stepIndex / stepCount) * 100;
  return Math.min(96, Math.max(8, Math.round(base + (job.status === "running" ? 18 / stepCount : 0))));
}

export function elapsedMsSince(value, now = Date.now()) {
  const timestamp = new Date(value || 0).getTime();
  if (!timestamp || Number.isNaN(timestamp)) return 0;
  return Math.max(0, now - timestamp);
}

export function formatDurationMs(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function jobStatusLine(job = {}, now = Date.now()) {
  const stepCount = Math.max(1, Number(job.stepCount || 1));
  const step = Math.min(stepCount, Math.max(1, Number(job.stepIndex || 0) + 1));
  const parts = [
    `${job.status || "queued"} - step ${step}/${stepCount}`,
    job.attempts ? `calls ${job.attempts}` : "",
    job.maxAttempts ? `retries ${Number(job.failures || 0)}/${job.maxAttempts}` : "",
    job.model ? `model ${job.model}` : "",
    job.maxOutputTokens ? `${job.maxOutputTokens} output tokens` : ""
  ].filter(Boolean);

  const elapsedSource = job.apiStatus === "waiting_for_openai"
    ? job.lastApiStartedAt
    : job.lastActivityAt || job.updatedAt || job.createdAt;
  const elapsed = elapsedMsSince(elapsedSource, now);
  if (elapsed > 0 && ["running", "queued"].includes(job.status)) {
    parts.push(`${formatDurationMs(elapsed)} ${job.apiStatus === "waiting_for_openai" ? "waiting" : "since update"}`);
  }

  return parts.join(" - ");
}

export function jobApiLine(job = {}, now = Date.now()) {
  if (!job.apiStatus || job.apiStatus === "queued") return "";
  if (job.apiStatus === "waiting_for_openai") {
    return `API: waiting on OpenAI response for ${formatDurationMs(elapsedMsSince(job.lastApiStartedAt, now))}.`;
  }
  if (job.apiStatus === "response_received") {
    const duration = job.lastApiDurationMs ? ` in ${formatDurationMs(job.lastApiDurationMs)}` : "";
    const chars = job.lastOutputChars ? `, ${job.lastOutputChars.toLocaleString()} chars` : "";
    return `API: response received${duration}${chars}.`;
  }
  if (job.apiStatus === "waiting_between_steps") return "API: pacing before the next model call.";
  if (job.apiStatus === "finalizing") return "API: model steps complete; writing artifact file.";
  if (job.apiStatus === "retry_scheduled") return "API: retry scheduled after a recoverable failure.";
  if (job.apiStatus === "failed") return "API: failed; manual retry is available.";
  if (job.apiStatus === "completed") return "API: artifact completed.";
  return `API: ${String(job.apiStatus).replace(/_/g, " ")}.`;
}

export function jobOpenArtifactId(job = {}) {
  if (job.status !== "completed") return "";
  if (typeof job.artifactId !== "string") return "";
  return job.artifactId.trim();
}

export function collectJobLogs(jobs = []) {
  return jobs
    .flatMap((job) =>
      (job.logs || []).map((log) => ({
        ...log,
        jobId: job.id,
        jobTitle: job.title
      }))
    )
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}
