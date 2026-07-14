import {execFileSync} from "node:child_process";
import {mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const storyboardPath = resolve(root, "src/demo-storyboard.json");
const outputDir = resolve(root, "public/voiceover-demo");
const timingsPath = resolve(root, "src/demo-audio-timings.json");
const scriptPath = resolve(root, "demo-voiceover-script.md");
const ffmpegPath = resolve(root, "node_modules/@remotion/compositor-darwin-arm64/ffmpeg");
const voice = "Shelley (English (US))";
const rate = "166";

const scenes = JSON.parse(readFileSync(storyboardPath, "utf8"));
mkdirSync(outputDir, {recursive: true});

let markdown = `# Demo voiceover\n\nProvider: macOS on-device speech\nVoice: ${voice}\nRate: ${rate} words per minute\n\n`;
const timings = [];

for (const [index, scene] of scenes.entries()) {
  const base = `${String(index + 1).padStart(2, "0")}-${scene.id}`;
  const textPath = resolve(outputDir, `${base}.txt`);
  const wavPath = resolve(outputDir, `${base}.wav`);
  const mp3Path = resolve(outputDir, `${base}.mp3`);

  writeFileSync(textPath, scene.voiceover);
  markdown += `## ${index + 1}. ${scene.kicker}: ${scene.title}\n\n${scene.voiceover}\n\n`;

  console.log(`Generating ${base}.mp3 with ${voice}`);
  execFileSync("say", ["-v", voice, "-r", rate, "--file-format=WAVE", "--data-format=LEI16@48000", "-o", wavPath, scene.voiceover]);
  execFileSync(ffmpegPath, ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "192k", mp3Path], {
    stdio: "ignore",
    env: {...process.env, DYLD_LIBRARY_PATH: dirname(ffmpegPath)},
  });
  rmSync(wavPath);

  const afinfo = execFileSync("afinfo", [mp3Path], {encoding: "utf8"});
  const match = afinfo.match(/estimated duration:\s*([0-9.]+)/i);
  const duration = match ? Number(match[1]) : Math.max(8, scene.voiceover.split(/\s+/).length / 2.5);
  timings.push({
    id: scene.id,
    audio: `voiceover-demo/${base}.mp3`,
    durationSeconds: Math.ceil((duration + 0.8) * 10) / 10,
  });
}

writeFileSync(scriptPath, markdown);
writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
console.log(`Wrote ${timings.length} on-device voiceover files and ${timingsPath}`);
