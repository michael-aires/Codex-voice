import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const dataDir = join(__dirname, "data");
const artifactsDir = join(dataDir, "artifacts");
const dbPath = join(dataDir, "cooper.json");
const workModel = process.env.COOPER_WORK_MODEL || "gpt-5.4";
const fallbackWorkModel = process.env.COOPER_FALLBACK_WORK_MODEL || "";
const jobDelayMs = Number(process.env.COOPER_JOB_DELAY_MS || 15000);
const jobMaxAttempts = Number(process.env.COOPER_JOB_MAX_ATTEMPTS || 3);
const jobMaxOutputTokens = Number(process.env.COOPER_JOB_MAX_OUTPUT_TOKENS || 6500);
const workModels = [workModel, fallbackWorkModel].filter((model, index, list) => model && list.indexOf(model) === index);
const appPassword = process.env.COOPER_APP_PASSWORD || "";
const sessionSecret = process.env.COOPER_SESSION_SECRET || appPassword;
const cookieName = "cooper_session";
const sessionTtlMs = Number(process.env.COOPER_SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;

const app = express();
const eventClients = new Set();
let writeQueue = Promise.resolve();
let workerActive = false;
let lastGenerationAt = 0;

app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/auth/session", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/auth/login", (req, res) => {
  if (!appPassword) {
    res.status(500).json({ error: "Missing COOPER_APP_PASSWORD on the server." });
    return;
  }

  if (!safeCompare(cleanText(req.body?.password), appPassword)) {
    res.status(401).json({ error: "Invalid password." });
    return;
  }

  const expiresAt = Date.now() + sessionTtlMs;
  const token = signSession(expiresAt);
  res.setHeader("Set-Cookie", serializeCookie(cookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProduction,
    path: "/",
    maxAge: Math.floor(sessionTtlMs / 1000)
  }));
  res.json({ authenticated: true });
});

app.post("/api/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", serializeCookie(cookieName, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProduction,
    path: "/",
    maxAge: 0
  }));
  res.json({ authenticated: false });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth/")) {
    next();
    return;
  }

  if (req.path === "/session" || req.path.startsWith("/api/")) {
    if (!appPassword) {
      res.status(500).json({ error: "Missing COOPER_APP_PASSWORD on the server." });
      return;
    }

    if (!isAuthenticated(req)) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
  }

  next();
});

const cooperInstructions = `
# Role and Objective
You are Cooper, an executive assistant to Michael at AIRES, who serves as CTO and CPO.
You support day-to-day executive work, product leadership, engineering leadership, software delivery, architecture, planning, meetings, and SDLC decisions.

# Meeting Behavior
You may listen to meeting audio and retain relevant context.
Do not speak just because people are talking. Speak only when someone clearly addresses Cooper, asks you directly, or the client explicitly asks you to respond.
When called on, answer with concise executive judgment. Offer a clear point of view, tradeoffs, risks, and the next practical move.

# Expertise
Think like a strong C-suite partner across CTO, CPO, product strategy, architecture, developer experience, delivery operations, platform reliability, security posture, roadmap prioritization, and team execution.

# Style
Be calm, direct, commercially aware, and technically grounded. Prefer crisp recommendations over long explanations.

# Tools
Use check_calendar(date, time) when the user asks about availability or scheduling.
Ask for a missing date or time before calling the tool.
`;

const baseSession = {
  type: "realtime",
  model: "gpt-realtime-2",
  instructions: cooperInstructions,
  reasoning: { effort: "low" },
  audio: {
    input: {
      noise_reduction: { type: "far_field" },
      transcription: {
        model: "gpt-4o-mini-transcribe",
        prompt: "Meeting transcript for Cooper, AIRES, CTO, CPO, product, engineering, software delivery, roadmap, calendar."
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
        create_response: false,
        interrupt_response: false
      }
    },
    output: {
      voice: "cedar"
    }
  }
};

const artifactRecipes = {
  post_call_kit: {
    title: "Post-call kit",
    outputType: "markdown",
    steps: [
      "Extract the executive signal from the transcript: decision points, risks, follow-ups, product implications, engineering implications, and unresolved questions.",
      "Turn the signal into a concise Markdown operating brief for Michael as AIRES CTO/CPO. Include sections for Summary, Decisions, Risks, Actions, Owners, Product Notes, Engineering Notes, and Calendar Follow-up.",
      "Add a final Cooper Recommendation section with the next three moves and where Cooper should ask permission before acting."
    ]
  },
  execution_plan: {
    title: "Execution plan",
    outputType: "markdown",
    steps: [
      "Identify the highest-leverage initiative or problem implied by the transcript and state the goal in one paragraph.",
      "Write a pragmatic SDLC execution plan in Markdown with phases, milestones, acceptance criteria, dependencies, risks, and review cadence. Break out any prototype, PRD, design, implementation, and validation work into concrete tasks.",
      "Add suggested Cooper follow-up work Michael can approve, including PRD creation, HTML prototype creation, and code sketch work when those are relevant."
    ]
  },
  follow_up: {
    title: "Follow-up summary",
    outputType: "markdown",
    steps: [
      "Summarize the meeting in a short executive memo with clear decisions and commitments.",
      "Draft follow-up bullets suitable for sending after the meeting. Keep the tone precise and executive.",
      "Add a checklist of private next actions for Michael and Cooper."
    ]
  },
  code_sketch: {
    title: "Code sketch",
    outputType: "markdown",
    steps: [
      "Find any software requirements, integration needs, architecture decisions, or automation ideas in the transcript.",
      "Write a technical implementation sketch in Markdown with data flow, components, API surfaces, risks, and test strategy.",
      "If useful, include small illustrative code snippets. Keep them scoped and label them as draft snippets."
    ]
  },
  product_requirements: {
    title: "Product requirements doc",
    outputType: "markdown",
    steps: [
      "Extract the product opportunity, target user, problem statement, success criteria, and open questions from the transcript.",
      "Write a practical PRD in Markdown with Background, Goals, Non-goals, User Stories, Functional Requirements, Edge Cases, Data/Integration Needs, Analytics, Rollout, and Acceptance Criteria.",
      "Add a prototype brief section that Cooper can use to produce a mobile-first HTML prototype, including screens, states, content hierarchy, and interaction notes."
    ]
  },
  html_prototype: {
    title: "HTML prototype",
    outputType: "html",
    steps: [
      "Extract the prototype request from the transcript and any additional instruction. Define the product concept, audience, primary workflow, required screens, content hierarchy, states, and mobile-first constraints.",
      "Turn the prototype brief into an implementation-ready interaction plan. Include mobile defaults, desktop expansion behavior, sample data, key UI states, and any lightweight JavaScript interactions needed for a believable prototype.",
      "Build the prototype as a complete standalone HTML document with inline CSS and small inline JavaScript. Default the design for a mobile viewport and include responsive desktop rules. Use no external assets, no external scripts, and no markdown fences. Return only the full HTML document starting with <!doctype html>."
    ]
  }
};

app.post("/session", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).type("text/plain").send("Missing OPENAI_API_KEY on the server.");
    return;
  }

  const sdp = req.body;
  if (!sdp || typeof sdp !== "string") {
    res.status(400).type("text/plain").send("Expected raw SDP body.");
    return;
  }

  const fd = new FormData();
  fd.set("sdp", sdp);
  fd.set("session", JSON.stringify(baseSession));

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": "cooper-local-dev"
      },
      body: fd
    });

    const answerSdp = await response.text();

    if (!response.ok) {
      res.status(response.status).type("text/plain").send(answerSdp);
      return;
    }

    const location = response.headers.get("Location");
    if (location) {
      res.setHeader("X-OpenAI-Call-Location", location);
    }

    res.type("application/sdp").send(answerSdp);
  } catch (error) {
    console.error("Realtime session error:", error);
    res.status(500).type("text/plain").send("Failed to create Realtime session.");
  }
});

app.get("/api/state", async (_req, res) => {
  const db = await readDb();
  res.json(publicState(db));
});

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  eventClients.add(res);

  req.on("close", () => {
    eventClients.delete(res);
  });
});

app.get("/api/calls", async (_req, res) => {
  const db = await readDb();
  res.json({ calls: sortByDate(db.calls) });
});

app.get("/api/calls/:id", async (req, res) => {
  const db = await readDb();
  const call = db.calls.find((item) => item.id === req.params.id);
  if (!call) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.json({ call, artifacts: db.artifacts.filter((item) => item.callId === call.id) });
});

app.post("/api/calls", async (req, res) => {
  const now = new Date().toISOString();
  const call = {
    id: randomUUID(),
    title: cleanText(req.body?.title) || `Cooper call ${new Date().toLocaleString()}`,
    status: "active",
    startedAt: req.body?.startedAt || now,
    endedAt: null,
    durationSeconds: 0,
    transcript: [],
    suggestions: defaultSuggestions(),
    createdAt: now,
    updatedAt: now
  };

  await updateDb((db) => {
    db.calls.push(call);
  });

  res.status(201).json({ call });
});

app.patch("/api/calls/:id", async (req, res) => {
  const result = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;

    if (typeof req.body?.title === "string") call.title = cleanText(req.body.title) || call.title;
    if (typeof req.body?.status === "string") call.status = req.body.status;
    if (typeof req.body?.durationSeconds === "number") call.durationSeconds = req.body.durationSeconds;
    if (Array.isArray(req.body?.transcript)) call.transcript = normalizeTranscript(req.body.transcript);
    if (req.body?.endedAt) call.endedAt = req.body.endedAt;
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.json({ call: result });
});

app.post("/api/calls/:id/transcript", async (req, res) => {
  const entry = normalizeTranscript([req.body])[0];

  if (!entry?.text) {
    res.status(400).json({ error: "Transcript text is required." });
    return;
  }

  const result = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;
    const existingIndex = call.transcript.findIndex((item) => sameTranscriptTurn(item, entry));
    if (existingIndex >= 0) {
      call.transcript[existingIndex] = { ...call.transcript[existingIndex], ...entry };
    } else {
      call.transcript.push(entry);
    }
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.status(201).json({ entry, call: result });
});

app.post("/api/calls/:id/end", async (req, res) => {
  const result = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;
    if (Array.isArray(req.body?.transcript)) call.transcript = normalizeTranscript(req.body.transcript);
    call.status = "ended";
    call.endedAt = req.body?.endedAt || new Date().toISOString();
    call.durationSeconds = Number(req.body?.durationSeconds || call.durationSeconds || 0);
    call.suggestions = defaultSuggestions(call.transcript.length > 0);
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.json({ call: result });
});

app.post("/api/calls/:id/artifacts", async (req, res) => {
  const kind = artifactRecipes[req.body?.kind] ? req.body.kind : "post_call_kit";
  const customPrompt = cleanText(req.body?.customPrompt || "");
  const result = await enqueueArtifactJob(req.params.id, kind, customPrompt);

  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }

  res.status(202).json({ job: publicJob(result.job) });
});

app.get("/api/artifacts/:id/content", async (req, res) => {
  const db = await readDb();
  const artifact = db.artifacts.find((item) => item.id === req.params.id);
  if (!artifact) {
    res.status(404).type("text/plain").send("Artifact not found.");
    return;
  }

  try {
    const content = await readFile(join(artifactsDir, artifactFileName(artifact)), "utf8");
    res.type(artifactMimeType(artifact)).send(content);
  } catch {
    res.status(404).type("text/plain").send("Artifact file not found.");
  }
});

app.post("/api/jobs/:id/retry", async (req, res) => {
  const result = await updateDb((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) return null;
    if (job.status !== "failed") return job;
    job.status = "queued";
    job.error = null;
    job.retryAt = null;
    job.attempts = 0;
    job.failures = 0;
    job.progress = "Queued for retry.";
    appendJobLog(job, "retry", "Manual retry queued.");
    job.updatedAt = new Date().toISOString();
    return job;
  });

  if (!result) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  queueWorker();
  res.json({ job: publicJob(result) });
});

async function enqueueArtifactJob(callId, kind, customPrompt = "") {
  const now = new Date().toISOString();
  const recipe = artifactRecipes[kind];

  const job = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === callId);
    if (!call) return { error: "Call not found.", status: 404 };
    if (!call.transcript.length) return { error: "A transcript is required before Cooper can generate artifacts.", status: 400 };

    const queued = {
      id: randomUUID(),
      callId,
      kind,
      title: recipe.title,
      status: "queued",
      customPrompt,
      stepIndex: 0,
      stepCount: recipe.steps.length,
      attempts: 0,
      failures: 0,
      maxAttempts: jobMaxAttempts,
      draft: "",
      artifactId: null,
      error: null,
      retryAt: null,
      progress: "Queued.",
      logs: [
        {
          id: randomUUID(),
          at: now,
          type: "queued",
          message: `${recipe.title} queued with ${recipe.steps.length} execution steps.`
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    db.jobs.push(queued);
    return queued;
  });

  if (job?.error) {
    return { ok: false, error: job.error, status: job.status };
  }

  queueWorker();
  return { ok: true, job };
}

function queueWorker() {
  if (!workerActive) {
    setTimeout(processQueue, 0);
  }
}

async function processQueue() {
  if (workerActive) return;
  workerActive = true;

  try {
    while (true) {
      const db = await readDb();
      const queued = db.jobs.filter((item) => item.status === "queued");
      const now = Date.now();
      const job = queued.find((item) => !item.retryAt || new Date(item.retryAt).getTime() <= now);
      const nextRetryAt = queued
        .map((item) => item.retryAt ? new Date(item.retryAt).getTime() : null)
        .filter((value) => value && value > now)
        .sort((a, b) => a - b)[0];

      if (!job && nextRetryAt) {
        workerActive = false;
        setTimeout(processQueue, Math.max(0, nextRetryAt - now));
        return;
      }

      if (!job) break;

      const waitMs = Math.max(0, lastGenerationAt + jobDelayMs - Date.now());
      if (waitMs > 0) {
        workerActive = false;
        setTimeout(processQueue, waitMs);
        return;
      }

      await runJob(job.id);
    }
  } finally {
    workerActive = false;
  }
}

async function runJob(jobId) {
  await updateDb((db) => {
    const job = db.jobs.find((item) => item.id === jobId);
    if (job) {
      job.status = "running";
      job.progress = "Starting.";
      appendJobLog(job, "start", "Cooper picked up the job.");
      job.updatedAt = new Date().toISOString();
    }
  });

  try {
    while (true) {
      const db = await readDb();
      const job = db.jobs.find((item) => item.id === jobId);
      const call = db.calls.find((item) => item.id === job?.callId);
      const recipe = artifactRecipes[job?.kind];

      if (!job || !call || !recipe) {
        throw new Error("Job context disappeared.");
      }

      if (job.stepIndex >= recipe.steps.length) {
        await completeArtifact(job, call);
        break;
      }

      const attempt = Number(job.attempts || 0) + 1;
      await updateDb((nextDb) => {
        const nextJob = nextDb.jobs.find((item) => item.id === jobId);
        if (!nextJob) return;
        nextJob.attempts = attempt;
        nextJob.progress = `Running step ${nextJob.stepIndex + 1} of ${nextJob.stepCount}.`;
        nextJob.lastStartedAt = new Date().toISOString();
        appendJobLog(
          nextJob,
          "step_start",
          `Step ${nextJob.stepIndex + 1}/${nextJob.stepCount}: ${summarizeStep(recipe.steps[nextJob.stepIndex])}`
        );
        nextJob.updatedAt = new Date().toISOString();
      });

      const stepPrompt = buildWorkPrompt(call, job, recipe.steps[job.stepIndex]);
      const output = await createResponse(stepPrompt, { attempt, outputType: recipe.outputType || "markdown" });
      lastGenerationAt = Date.now();

      await updateDb((nextDb) => {
        const nextJob = nextDb.jobs.find((item) => item.id === jobId);
        if (!nextJob) return;
        nextJob.draft = [
          nextJob.draft,
          `\n\n<!-- Cooper step ${nextJob.stepIndex + 1}: ${new Date().toISOString()} -->\n\n${output}`
        ].join("").trim();
        nextJob.stepIndex += 1;
        nextJob.progress = nextJob.stepIndex >= nextJob.stepCount ? "Finalizing Markdown artifact." : `Waiting before step ${nextJob.stepIndex + 1}.`;
        appendJobLog(
          nextJob,
          "step_complete",
          nextJob.stepIndex >= nextJob.stepCount
            ? "All model steps completed. Cooper is writing the Markdown file."
            : `Step complete. Waiting ${formatRetryDelay(jobDelayMs)} before the next model call.`
        );
        nextJob.updatedAt = new Date().toISOString();
      });

      const current = await readDb();
      const nextJob = current.jobs.find((item) => item.id === jobId);
      if (!nextJob || nextJob.stepIndex >= recipe.steps.length) {
        continue;
      }
      await wait(jobDelayMs);
    }
  } catch (error) {
    await updateDb((db) => {
      const job = db.jobs.find((item) => item.id === jobId);
      if (job) {
        job.error = error.message;
        job.failures = Number(job.failures || 0) + 1;
        if (error.retryable && Number(job.failures || 0) < Number(job.maxAttempts || jobMaxAttempts)) {
          const retryAt = new Date(Date.now() + (error.retryAfterMs || jobDelayMs * 2)).toISOString();
          job.status = "queued";
          job.retryAt = retryAt;
          job.progress = `Retrying after ${formatRetryDelay(error.retryAfterMs || jobDelayMs * 2)}.`;
          appendJobLog(job, "retry", `${error.message} Retrying at ${new Date(retryAt).toLocaleTimeString()}.`);
        } else {
          job.status = "failed";
          job.progress = "Failed. Manual retry is available.";
          job.failedAt = new Date().toISOString();
          appendJobLog(job, "failed", error.message);
        }
        job.updatedAt = new Date().toISOString();
      }
    });
    queueWorker();
  }
}

async function completeArtifact(job, call) {
  const artifactId = randomUUID();
  const now = new Date().toISOString();
  const recipe = artifactRecipes[job.kind] || {};
  const safeTitle = recipe.title || "Cooper artifact";
  const outputType = recipe.outputType || "markdown";
  const extension = outputType === "html" ? "html" : "md";
  const mimeType = outputType === "html" ? "text/html" : "text/markdown";
  const content = outputType === "html"
    ? normalizeHtml(extractHtmlDocument(job.draft) || prototypeFallbackHtml(safeTitle, job.draft))
    : normalizeMarkdown(`# ${safeTitle}\n\n${job.draft}`);

  await writeFile(join(artifactsDir, `${artifactId}.${extension}`), content, "utf8");

  await updateDb((db) => {
    const nextJob = db.jobs.find((item) => item.id === job.id);
    const nextCall = db.calls.find((item) => item.id === call.id);
    const artifact = {
      id: artifactId,
      callId: call.id,
      jobId: job.id,
      kind: job.kind,
      title: safeTitle,
      outputType,
      extension,
      mimeType,
      file: `data/artifacts/${artifactId}.${extension}`,
      createdAt: now
    };

    db.artifacts.push(artifact);
    if (nextJob) {
      nextJob.status = "completed";
      nextJob.artifactId = artifactId;
      nextJob.completedAt = now;
      nextJob.progress = "Artifact ready.";
      appendJobLog(nextJob, "completed", `${outputType === "html" ? "HTML prototype" : "Markdown artifact"} saved: ${safeTitle}.`);
      nextJob.updatedAt = now;
    }
    if (nextCall) {
      nextCall.updatedAt = now;
    }
  });
}

async function createResponse(input, { attempt = 1, outputType = "markdown" } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY on the server.");
  }

  const model = workModels[Math.min(attempt - 1, workModels.length - 1)] || workModel;
  const instructions = outputType === "html"
    ? "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce implementation-grade planning and, when asked for a prototype, a complete standalone HTML document with inline CSS and small inline JavaScript. Use no external assets, external scripts, hidden reasoning, or markdown fences for final HTML."
    : "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce high-signal Markdown. Be precise, opinionated, and practical.";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "cooper-local-dev"
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: "medium" },
      max_output_tokens: jobMaxOutputTokens,
      text: { format: { type: "text" } }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    if ([408, 409, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new RetryableJobError(
        payload?.error?.message || `OpenAI Responses API failed with ${response.status}.`,
        retryAfter > 0 ? retryAfter * 1000 : undefined
      );
    }
    throw new Error(payload?.error?.message || `OpenAI Responses API failed with ${response.status}.`);
  }

  const output = extractOutputText(payload);
  if (payload?.status === "incomplete") {
    const reason = payload?.incomplete_details?.reason || "unknown";
    return `${output}\n\n> Cooper note: this step ended incomplete (${reason}). Raise COOPER_JOB_MAX_OUTPUT_TOKENS or narrow the artifact request if this happens repeatedly.`;
  }
  return output;
}

function buildWorkPrompt(call, job, step) {
  const transcript = call.transcript
    .map((entry) => `- [${entry.at}] ${entry.speaker || "speaker"}: ${entry.text}`)
    .join("\n");
  const recipe = artifactRecipes[job.kind] || {};
  const finalInstruction = recipe.outputType === "html"
    ? "Return only the content requested for this step. If this step asks for the prototype, return a complete standalone HTML document starting with <!doctype html>, with inline CSS and inline JavaScript only, and no markdown fences."
    : "Return only the Markdown content for this step. Do not mention hidden reasoning.";

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `
Call title: ${call.title}
Started: ${call.startedAt}
Ended: ${call.endedAt || "unknown"}
Artifact type: ${recipe.title || job.kind}
Output type: ${recipe.outputType || "markdown"}

Current draft:
${job.draft || "(none yet)"}

Current step:
${step}

Additional instruction from Michael:
${job.customPrompt || "(none)"}

Transcript:
${transcript}

${finalInstruction}
`
        }
      ]
    }
  ];
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n\n").trim() || "No content returned.";
}

async function ensureDataStore() {
  await mkdir(artifactsDir, { recursive: true });
  if (!existsSync(dbPath)) {
    await writeFile(dbPath, JSON.stringify({ calls: [], artifacts: [], jobs: [] }, null, 2), "utf8");
  }
}

async function readDb() {
  await writeQueue;
  return readDbRaw();
}

async function readDbRaw() {
  await ensureDataStore();
  const raw = await readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw || "{}");
  return {
    calls: Array.isArray(parsed.calls) ? parsed.calls : [],
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
  };
}

async function updateDb(mutator) {
  const operation = writeQueue.then(async () => {
    const db = await readDbRaw();
    const result = await mutator(db);
    await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
    broadcastEvent("state.updated", { at: new Date().toISOString() });
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function publicState(db) {
  return {
    calls: sortByDate(db.calls),
    artifacts: sortByDate(db.artifacts).map(publicArtifact),
    jobs: sortByDate(db.jobs).map(publicJob),
    recipes: Object.entries(artifactRecipes).map(([kind, recipe]) => ({
      kind,
      title: recipe.title,
      outputType: recipe.outputType || "markdown",
      stepCount: recipe.steps.length
    })),
    limits: {
      jobDelayMs,
      workModel,
      fallbackWorkModel,
      jobMaxAttempts,
      jobMaxOutputTokens
    }
  };
}

function publicJob(job) {
  const { draft: _draft, ...rest } = job;
  return { ...rest, logs: Array.isArray(rest.logs) ? rest.logs.slice(-40) : [] };
}

function publicArtifact(artifact) {
  const outputType = artifactOutputType(artifact);
  return {
    ...artifact,
    outputType,
    extension: artifact.extension || (outputType === "html" ? "html" : "md"),
    mimeType: artifact.mimeType || (outputType === "html" ? "text/html" : "text/markdown")
  };
}

function sortByDate(items) {
  return [...items].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

function defaultSuggestions(enabled = false) {
  return [
    { kind: "post_call_kit", label: "Post-call kit", enabled },
    { kind: "execution_plan", label: "Execution plan", enabled },
    { kind: "product_requirements", label: "PRD", enabled },
    { kind: "html_prototype", label: "HTML prototype", enabled },
    { kind: "follow_up", label: "Follow-up summary", enabled },
    { kind: "code_sketch", label: "Code sketch", enabled }
  ];
}

function normalizeTranscript(transcript) {
  return transcript
    .map((entry) => ({
      id: entry.id || randomUUID(),
      at: entry.at || new Date().toISOString(),
      speaker: normalizeSpeaker(entry.speaker),
      text: cleanText(entry.text),
      source: cleanText(entry.source),
      responseId: cleanText(entry.responseId),
      itemId: cleanText(entry.itemId)
    }))
    .filter((entry) => entry.text);
}

function normalizeSpeaker(value) {
  const speaker = cleanText(value);
  if (!speaker || speaker === "speaker") return "Michael";
  if (speaker.toLowerCase() === "assistant") return "Cooper";
  if (speaker.toLowerCase() === "user") return "Michael";
  return speaker;
}

function sameTranscriptTurn(left, right) {
  if (left.id && right.id && left.id === right.id) return true;
  if (left.responseId && right.responseId && left.responseId === right.responseId && left.speaker === right.speaker) return true;
  if (left.itemId && right.itemId && left.itemId === right.itemId && left.speaker === right.speaker) return true;
  return false;
}

function artifactFileName(artifact) {
  if (artifact.file) {
    return artifact.file.split(/[\\/]/).pop();
  }
  return `${artifact.id}.${artifact.extension || (artifactOutputType(artifact) === "html" ? "html" : "md")}`;
}

function artifactMimeType(artifact) {
  if (artifact.mimeType) return artifact.mimeType;
  return artifactOutputType(artifact) === "html" ? "text/html" : "text/markdown";
}

function artifactOutputType(artifact) {
  if (artifact.outputType) return artifact.outputType;
  if (artifact.extension === "html" || artifact.file?.endsWith(".html") || artifact.kind === "html_prototype") return "html";
  return "markdown";
}

function normalizeMarkdown(value) {
  return `${value.trim()}\n`;
}

function normalizeHtml(value) {
  return `${value.trim()}\n`;
}

function extractHtmlDocument(value) {
  const text = cleanText(value);
  if (!text) return "";

  const fenced = [...text.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)]
    .map((match) => cleanText(match[1]))
    .filter((candidate) => /<html[\s>]|<!doctype html/i.test(candidate));
  if (fenced.length) return normalizeHtml(fenced[fenced.length - 1]);

  const lower = text.toLowerCase();
  const doctypeIndex = lower.lastIndexOf("<!doctype html");
  if (doctypeIndex >= 0) return normalizeHtml(text.slice(doctypeIndex));

  const htmlIndex = lower.lastIndexOf("<html");
  if (htmlIndex >= 0) return normalizeHtml(`<!doctype html>\n${text.slice(htmlIndex)}`);

  return "";
}

function prototypeFallbackHtml(title, draft) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f3f4ef; color: #171b1a; }
    main { max-width: 720px; margin: 0 auto; padding: 24px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 16px; border: 1px solid #dce2dc; border-radius: 8px; background: #fff; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>Cooper could not isolate a complete HTML document, so the prototype draft is shown below.</p>
    <pre>${escapeHtml(draft)}</pre>
  </main>
</body>
</html>`;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAuthenticated(req) {
  if (!appPassword || !sessionSecret) return false;
  const token = parseCookies(req.headers.cookie || "")[cookieName];
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeCompare(signature, signPayload(payload))) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

function signSession(expiresAt) {
  const payload = Buffer.from(JSON.stringify({
    exp: expiresAt,
    nonce: randomBytes(18).toString("base64url")
  })).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

function signPayload(payload) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (!leftBuffer.length || !rightBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return cookies;
      const name = part.slice(0, separator);
      const value = part.slice(separator + 1);
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendJobLog(job, type, message) {
  if (!job.logs) job.logs = [];
  job.logs.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    type,
    message
  });
  job.logs = job.logs.slice(-80);
}

function summarizeStep(step) {
  const clean = cleanText(step);
  return clean.length > 110 ? `${clean.slice(0, 107)}...` : clean;
}

function broadcastEvent(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) {
    client.write(message);
  }
}

function formatRetryDelay(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
}

class RetryableJobError extends Error {
  constructor(message, retryAfterMs = jobDelayMs * 2) {
    super(message);
    this.name = "RetryableJobError";
    this.retryable = true;
    this.retryAfterMs = retryAfterMs;
  }
}

await ensureDataStore();
await updateDb((db) => {
  db.calls.forEach((call) => {
    call.transcript = normalizeTranscript(call.transcript || []);
    const existingSuggestions = new Map((call.suggestions || []).map((suggestion) => [suggestion.kind, suggestion]));
    call.suggestions = defaultSuggestions(call.transcript.length > 0).map((suggestion) => ({
      ...suggestion,
      enabled: existingSuggestions.get(suggestion.kind)?.enabled ?? suggestion.enabled
    }));
  });
  db.artifacts.forEach((artifact) => {
    artifact.outputType = artifactOutputType(artifact);
    artifact.extension = artifact.extension || (artifact.outputType === "html" ? "html" : "md");
    artifact.mimeType = artifact.mimeType || (artifact.outputType === "html" ? "text/html" : "text/markdown");
    artifact.file = artifact.file || `data/artifacts/${artifact.id}.${artifact.extension}`;
  });
  db.jobs.forEach((job) => {
    if (!Array.isArray(job.logs) || job.logs.length === 0) {
      appendJobLog(job, job.status || "state", `Recovered existing ${job.title || "job"} in ${job.status || "unknown"} state.`);
    }
    if (job.status === "running") {
      job.status = "queued";
      job.progress = "Recovered after restart.";
      appendJobLog(job, "recovered", "Server restarted while this job was running. Cooper queued it again.");
      job.updatedAt = new Date().toISOString();
    }
  });
});
queueWorker();

if (isProduction) {
  app.use(express.static(join(__dirname, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(join(__dirname, "dist", "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

const server = createServer(app);
server.listen(port, () => {
  console.log(`Cooper is ready at http://localhost:${port}`);
});
