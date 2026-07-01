import { readFile } from "node:fs/promises";
import { gstackSkillRegistry } from "../gstack-skills/registry.js";

const allowedModes = new Set(["advisory", "structured", "voice_summary"]);

export async function runGstackSkill({ skill, input, context = "", mode = "advisory" } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY on the server.");
  }

  const skillId = cleanString(skill);
  const definition = gstackSkillRegistry[skillId];
  if (!definition) {
    throw new Error(`Unknown GStack skill: ${skillId || "(missing)"}.`);
  }

  const selectedMode = allowedModes.has(cleanString(mode)) ? cleanString(mode) : "advisory";
  const userInput = limitText(input, Number(process.env.COOPER_GSTACK_INPUT_MAX_CHARS || 32000));
  const suppliedContext = limitText(context, Number(process.env.COOPER_GSTACK_CONTEXT_MAX_CHARS || 24000));
  if (!userInput.text) {
    throw new Error("GStack skill input is required.");
  }

  const skillPrompt = await readFile(definition.file, "utf8");
  const requestBody = buildPrompt({
    skillId,
    definition,
    selectedMode,
    skillPrompt,
    input: userInput.text,
    inputTruncated: userInput.truncated,
    context: suppliedContext.text,
    contextTruncated: suppliedContext.truncated
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "cooper-local-dev"
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI Responses API failed with ${response.status}.`);
  }

  const outputText = extractOutputText(payload);
  const parsed = parseJsonObject(outputText);
  return normalizeSkillResult(parsed, {
    skillId,
    fallbackText: outputText,
    inputTruncated: userInput.truncated,
    contextTruncated: suppliedContext.truncated
  });
}

export function gstackSkillNames() {
  return Object.keys(gstackSkillRegistry);
}

function buildPrompt({ skillId, definition, selectedMode, skillPrompt, input, inputTruncated, context, contextTruncated }) {
  return {
    model: defaultModel(),
    instructions: [
      "You are Cooper's server-side GStack skill runner.",
      "Use the supplied adapted skill prompt as the review rubric.",
      "This is advisory only. Do not execute tools, mutate files, deploy, create PRs, or claim private repo access.",
      "Return only a single valid JSON object. No markdown fences. No hidden reasoning.",
      "All array fields must be arrays of strings. Keep voice_summary concise enough to speak out loud."
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Skill id: ${skillId}
Skill label: ${definition.label}
Mode: ${selectedMode}
Input truncated by server: ${inputTruncated ? "yes" : "no"}
Context truncated by server: ${contextTruncated ? "yes" : "no"}

Adapted skill prompt:
${skillPrompt}

Optional context:
${context || "(none)"}

User input to review or transform:
${input}

Return exactly this JSON shape:
{
  "skill": "${skillId}",
  "summary": "one short paragraph",
  "key_findings": ["finding 1"],
  "risks": ["risk 1"],
  "recommendations": ["recommendation 1"],
  "questions": ["at most one high-leverage clarifying question if needed"],
  "next_actions": ["next action 1"],
  "voice_summary": "brief spoken Cooper response"
}
`
          }
        ]
      }
    ],
    reasoning: { effort: selectedMode === "voice_summary" ? "low" : "medium" },
    max_output_tokens: Number(process.env.COOPER_GSTACK_MAX_OUTPUT_TOKENS || 2200),
    text: { format: { type: "text" } }
  };
}

function defaultModel() {
  return process.env.COOPER_GSTACK_MODEL || process.env.COOPER_WORK_MODEL || "gpt-5.4";
}

function normalizeSkillResult(parsed, { skillId, fallbackText, inputTruncated, contextTruncated }) {
  const result = isPlainObject(parsed) ? parsed : {};
  const summary = cleanString(result.summary) || cleanString(fallbackText).slice(0, 1200);
  const warnings = [];
  if (inputTruncated) warnings.push("Input was truncated by server limits.");
  if (contextTruncated) warnings.push("Context was truncated by server limits.");
  if (!isPlainObject(parsed)) warnings.push("Model response was normalized because it was not valid JSON.");

  return {
    skill: cleanString(result.skill) || skillId,
    summary,
    key_findings: normalizeStringArray(result.key_findings),
    risks: [...warnings, ...normalizeStringArray(result.risks)],
    recommendations: normalizeStringArray(result.recommendations),
    questions: normalizeStringArray(result.questions).slice(0, 1),
    next_actions: normalizeStringArray(result.next_actions),
    voice_summary: cleanString(result.voice_summary) || summary.slice(0, 600)
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n\n").trim();
}

function parseJsonObject(value) {
  const text = cleanString(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(stringifyListItem).filter(Boolean).slice(0, 12);
  }
  const text = stringifyListItem(value);
  return text ? [text] : [];
}

function stringifyListItem(value) {
  if (typeof value === "string") return cleanString(value);
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`)
      .join("; ")
      .slice(0, 1000);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function limitText(value, maxChars) {
  const text = cleanString(value);
  const limit = Math.max(0, Number(maxChars || 0));
  if (!limit || text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit).trim(), truncated: true };
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
