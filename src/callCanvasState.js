export function canvasJobsForCall(jobs = [], artifacts = [], callId = "") {
  const artifactJobIds = new Set(
    artifacts
      .filter((artifact) => artifact.callId === callId && artifact.jobId)
      .map((artifact) => artifact.jobId)
  );

  return jobs.filter((job) => (
    job.callId === callId &&
    !artifactJobIds.has(job.id) &&
    ["queued", "running", "pausing", "paused", "canceling", "failed"].includes(job.status)
  ));
}

export function detectCanvasWorkTransition(previous, jobs = [], artifacts = [], callId = "") {
  const callJobs = jobs.filter((job) => job.callId === callId);
  const callArtifacts = artifacts.filter((artifact) => artifact.callId === callId);
  const next = {
    callId,
    jobIds: new Set(callJobs.map((job) => job.id)),
    artifactIds: new Set(callArtifacts.map((artifact) => artifact.id))
  };

  if (!previous || previous.callId !== callId) {
    return { next, event: null };
  }

  const artifact = callArtifacts.find((item) => !previous.artifactIds.has(item.id));
  if (artifact) return { next, event: { type: "artifact_ready", artifact } };

  const job = callJobs.find((item) => (
    !previous.jobIds.has(item.id) && ["queued", "running", "pausing"].includes(item.status)
  ));
  if (job) return { next, event: { type: "job_started", job } };

  return { next, event: null };
}
