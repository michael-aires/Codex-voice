import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelectedProject } from "../src/projectSelection.js";

const projects = [
  { id: "multi-user", title: "Multi-user cooper" },
  { id: "daily-reporting", title: "Daily reporting" }
];

test("no selected project does not fall back to the first saved project", () => {
  assert.equal(resolveSelectedProject(projects, null), null);
  assert.equal(resolveSelectedProject(projects, ""), null);
});

test("selected project resolves only by explicit id", () => {
  assert.deepEqual(resolveSelectedProject(projects, "daily-reporting"), projects[1]);
  assert.equal(resolveSelectedProject(projects, "missing"), null);
});
