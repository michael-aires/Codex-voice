const DEFAULT_PROMPT_CHARS = 12_000;
const DEFAULT_TRANSCRIPT_CHARS = 32_000;
const DEFAULT_TRANSCRIPT_TURNS = 32;

export function normalizeSessionChatPrompt(value, maxChars = DEFAULT_PROMPT_CHARS) {
  const prompt = String(value || "").trim();
  if (!prompt) return { error: "A chat message is required.", prompt: "" };
  if (prompt.length > maxChars) {
    return {
      error: `Chat messages are limited to ${maxChars.toLocaleString()} characters.`,
      prompt: ""
    };
  }
  return { error: "", prompt };
}

export function boundedSessionChatInput(
  transcript = [],
  { maxChars = DEFAULT_TRANSCRIPT_CHARS, maxTurns = DEFAULT_TRANSCRIPT_TURNS } = {}
) {
  const candidates = Array.isArray(transcript)
    ? transcript
      .filter((entry) => String(entry?.text || "").trim())
      .slice(-Math.max(1, maxTurns))
    : [];
  const selected = [];
  let usedChars = 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const entry = candidates[index];
    const text = String(entry.text || "").trim();
    const remaining = Math.max(0, maxChars - usedChars);
    if (!remaining) break;
    const boundedText = text.length > remaining ? text.slice(text.length - remaining) : text;
    selected.push({
      role: isCooperSpeaker(entry.speaker) ? "assistant" : "user",
      content: boundedText
    });
    usedChars += boundedText.length;
  }

  return selected.reverse();
}

export function responsesChatTools(toolDefinitions = []) {
  return toolDefinitions.map((tool) => ({ ...tool, strict: false }));
}

export function responseOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text.trim();
  const chunks = [];
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n\n").trim();
}

export function responseFunctionCalls(response) {
  return (response?.output || []).filter((item) => (
    item?.type === "function_call"
    && item.call_id
    && item.name
  ));
}

export function parseFunctionArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function consumeJsonSseFrames(buffer, { flush = false } = {}) {
  const normalized = String(buffer || "").replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = flush ? "" : frames.pop() || "";
  if (flush && frames.at(-1) !== "") frames.push("");
  const events = [];

  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    events.push(JSON.parse(data));
  }

  return { events, remainder };
}

export async function* jsonSseEvents(stream) {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of readableChunks(stream)) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const parsed = consumeJsonSseFrames(buffer);
    buffer = parsed.remainder;
    yield* parsed.events;
  }

  buffer += decoder.decode();
  const parsed = consumeJsonSseFrames(buffer, { flush: true });
  yield* parsed.events;
}

async function* readableChunks(stream) {
  if (stream?.getReader) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  if (stream?.[Symbol.asyncIterator]) {
    yield* stream;
    return;
  }

  throw new Error("The chat response did not include a readable event stream.");
}

function isCooperSpeaker(value) {
  return String(value || "").trim().toLowerCase().includes("cooper");
}
