const { mkdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { chromium } = require("playwright");
require("dotenv").config({ path: resolve(__dirname, "../../.env") });

const baseUrl = process.env.COOPER_QA_BASE_URL || "http://127.0.0.1:5002";
const outputDir = process.env.COOPER_QA_OUTPUT_DIR || resolve(__dirname, "../../test-output/codex-orchestration");
const workspace = resolve(__dirname, "../..");
const reuseCompleted = process.env.COOPER_QA_REUSE_COMPLETED === "true";
let activeBrowser = null;

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  activeBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible().catch(() => false)) {
    if (!process.env.COOPER_APP_PASSWORD) throw new Error("COOPER_APP_PASSWORD is missing.");
    await passwordInput.fill(process.env.COOPER_APP_PASSWORD);
    await page.getByRole("button", { name: "Unlock" }).click();
  }

  await page.getByRole("button", { name: /Codex Voice-orchestrated/i }).click();
  await page.getByText("Codex orchestration", { exact: true }).last().waitFor();
  if (!reuseCompleted) {
    await page.getByRole("button", { name: /Delegate/ }).click();
    await page.locator('input[placeholder="/Users/you/code/project"]').fill(workspace);
    await page.locator("textarea").fill("Inspect package.json and the Codex orchestration files. Make no changes. Reply with a concise confirmation that the durable Codex bridge is connected and the project can build.");
    await page.getByRole("button", { name: /Start task/ }).click();

    await page.getByText("Start durable Codex session", { exact: true }).first().waitFor({ timeout: 20_000 });
    await page.screenshot({ path: join(outputDir, "codex-desktop-approval.png"), fullPage: true });
    await page.getByRole("button", { name: "Approve" }).first().click();

    await page.waitForFunction(async () => {
      const response = await fetch("/api/codex/runtime", { credentials: "same-origin" });
      const payload = await response.json();
      return payload.tasks?.some((task) => task.status === "completed" && task.runtime?.threadId);
    }, null, { timeout: 120_000 });
  }
  await page.locator(".operator-work-tabs button").filter({ hasText: "Task" }).click();
  await page.locator(".operator-task-detail .status-badge").filter({ hasText: "Completed" }).waitFor({ timeout: 20_000 });
  await page.getByText("Persistent local server", { exact: true }).waitFor({ timeout: 20_000 });
  await page.screenshot({ path: join(outputDir, "codex-desktop-completed.png"), fullPage: true });

  const runtime = await page.evaluate(async () => {
    const response = await fetch("/api/codex/runtime", { credentials: "same-origin" });
    return response.json();
  });
  if (!runtime.connected || !runtime.durableDaemon) {
    throw new Error(`Expected durable Codex runtime, received ${JSON.stringify(runtime)}`);
  }
  const completedTask = runtime.tasks.find((task) => task.status === "completed" && task.runtime?.threadId);
  if (!completedTask) throw new Error("No completed Codex task with a persisted thread ID was returned.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(outputDir, "codex-mobile-completed.png"), fullPage: true });

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    taskId: completedTask.id,
    threadId: completedTask.runtime.threadId,
    turnId: completedTask.runtime.turnId,
    transportMode: runtime.transportMode,
    consoleErrors,
    screenshots: [
      join(outputDir, "codex-desktop-approval.png"),
      join(outputDir, "codex-desktop-completed.png"),
      join(outputDir, "codex-mobile-completed.png")
    ]
  }, null, 2));
  await browser.close();
  activeBrowser = null;
  if (consoleErrors.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  activeBrowser?.close().catch(() => {});
  process.exitCode = 1;
});
