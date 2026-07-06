import test from "node:test";
import assert from "node:assert/strict";
import { computerUseToolDefinitions, computerUseToolNames } from "../cooperTools.js";
import {
  buildSearchUrl,
  localComputerToolNames,
  normalizeBrowserName,
  parseVisionClickJson
} from "../server/localComputerTools.js";

test("local computer tool catalog includes deterministic web search tools", () => {
  assert.ok(localComputerToolNames.includes("open_chrome_tab"));
  assert.ok(localComputerToolNames.includes("search_web"));
  assert.ok(localComputerToolNames.includes("click_link_with_vision"));
  assert.ok(localComputerToolNames.includes("open_local_app"));
  assert.ok(localComputerToolNames.includes("open_finder_location"));
  assert.ok(localComputerToolNames.includes("open_terminal_workspace"));
});

test("Realtime Computer Use exposes web search and vision click tools", () => {
  assert.ok(computerUseToolNames.has("open_chrome_tab"));
  assert.ok(computerUseToolNames.has("search_web"));
  assert.ok(computerUseToolNames.has("click_link_with_vision"));

  const searchTool = computerUseToolDefinitions.find((tool) => tool.name === "search_web");
  const clickTool = computerUseToolDefinitions.find((tool) => tool.name === "click_link_with_vision");

  assert.deepEqual(searchTool.parameters.required, ["query"]);
  assert.deepEqual(clickTool.parameters.required, ["link_description"]);
});

test("search URL builder encodes Google and DuckDuckGo queries", () => {
  assert.equal(buildSearchUrl("Cooper voice agent", "google"), "https://www.google.com/search?q=Cooper%20voice%20agent");
  assert.equal(buildSearchUrl("AIRES CRM", "duckduckgo"), "https://duckduckgo.com/?q=AIRES%20CRM");
});

test("browser names normalize to supported Mac app names", () => {
  assert.equal(normalizeBrowserName("chrome"), "Google Chrome");
  assert.equal(normalizeBrowserName("Safari"), "Safari");
  assert.equal(normalizeBrowserName("unknown"), "Google Chrome");
});

test("vision click JSON parser accepts raw and fenced JSON", () => {
  assert.deepEqual(parseVisionClickJson('{"x":120,"y":340,"confidence":0.91,"reason":"top result"}'), {
    x: 120,
    y: 340,
    confidence: 0.91,
    reason: "top result"
  });

  assert.equal(parseVisionClickJson("```json\n{\"x\":null,\"y\":null,\"confidence\":0}\n```").confidence, 0);
  assert.equal(parseVisionClickJson("not json").x, null);
});
