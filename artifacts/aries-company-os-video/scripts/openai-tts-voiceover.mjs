import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(__dirname, "..");

const readCliArg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
};

const root = resolve(readCliArg("root", process.cwd()));
const storyboardPath = resolve(root, readCliArg("storyboard", "src/storyboard.json"));
const voiceoverDir = resolve(root, readCliArg("out-dir", "public/voiceover"));
const timingsPath = resolve(root, readCliArg("timings", "src/audio-timings.json"));
const scriptPath = resolve(root, readCliArg("script", "voiceover-script.md"));
const audioPrefix = readCliArg("audio-prefix", "voiceover");

const loadEnvFile = (path) => {
  if (!existsSync(path)) return false;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }

  return true;
};

const envPath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");
const loadedEnv = loadEnvFile(envPath);
const loadedEnvLocal = loadEnvFile(envLocalPath);

const model = readCliArg("model", process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts");
const voice = readCliArg("voice", process.env.OPENAI_TTS_VOICE ?? "nova");
const responseFormat = readCliArg("format", process.env.OPENAI_TTS_FORMAT ?? "mp3");
const voiceInstructions = readCliArg(
  "instructions",
  process.env.OPENAI_TTS_INSTRUCTIONS ??
    "Speak like a polished customer-success strategist presenting a technical plan to executives and engineering leads. Sound clear, calm, credible, human, and focused. Use natural pauses and avoid hype."
);

const supportedFormats = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);
if (!supportedFormats.has(responseFormat)) {
  throw new Error(`Unsupported response format: ${responseFormat}`);
}

if (!existsSync(storyboardPath)) {
  throw new Error(`Storyboard not found: ${storyboardPath}`);
}

const scenes = JSON.parse(readFileSync(storyboardPath, "utf8"));
mkdirSync(voiceoverDir, { recursive: true });

let markdown = `# Voiceover\n\nModel: ${model}\nVoice: ${voice}\nFormat: ${responseFormat}\n\n`;
for (const [index, scene] of scenes.entries()) {
  const base = `${String(index + 1).padStart(2, "0")}-${scene.id}`;
  writeFileSync(resolve(voiceoverDir, `${base}.txt`), scene.voiceover);
  markdown += `## ${index + 1}. ${scene.kicker}: ${scene.title}\n\n${scene.voiceover}\n\n`;
}
writeFileSync(scriptPath, markdown);

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    [
      "OPENAI_API_KEY is required for production OpenAI voiceover.",
      `Checked process.env.OPENAI_API_KEY: missing`,
      `Checked ${envPath}: ${loadedEnv ? "present" : "missing"}`,
      `Checked ${envLocalPath}: ${loadedEnvLocal ? "present" : "missing"}`,
    ].join("\n")
  );
}

const requestSpeech = async (input) => {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      instructions: voiceInstructions,
      response_format: responseFormat,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI speech request failed (${response.status}): ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const getDurationSeconds = (audioPath, voiceover) => {
  try {
    const afinfo = execFileSync("afinfo", [audioPath], { encoding: "utf8" });
    const match = afinfo.match(/estimated duration:\s*([0-9.]+)/i);
    if (match) return Number(match[1]);
  } catch {
    // Fall through to a conservative words-per-second estimate.
  }

  return Math.max(12, voiceover.split(/\s+/).length / 2.55);
};

const timings = [];
for (const [index, scene] of scenes.entries()) {
  const base = `${String(index + 1).padStart(2, "0")}-${scene.id}`;
  const audioPath = resolve(voiceoverDir, `${base}.${responseFormat}`);
  if (existsSync(audioPath)) rmSync(audioPath);

  console.log(`Generating ${base}.${responseFormat} with ${model}/${voice}`);
  writeFileSync(audioPath, await requestSpeech(scene.voiceover));

  const duration = getDurationSeconds(audioPath, scene.voiceover);
  timings.push({
    id: scene.id,
    audio: `${audioPrefix}/${base}.${responseFormat}`,
    durationSeconds: Math.ceil((duration + 0.5) * 10) / 10,
  });
}

writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
console.log(`Wrote ${timings.length} OpenAI voiceover files and ${timingsPath}`);
