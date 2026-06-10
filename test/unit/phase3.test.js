import { describe, it, expect } from "vitest";
import {
  pickCanvasLane,
  buildUpdatePrompt,
  canvasItemDownload
} from "../../src/lib/canvas.js";

describe("pickCanvasLane", () => {
  it('returns "fast" for "fast"', () => {
    expect(pickCanvasLane("fast")).toBe("fast");
  });

  it('returns "fast" for undefined', () => {
    expect(pickCanvasLane(undefined)).toBe("fast");
  });

  it('returns "fast" when called with no argument', () => {
    expect(pickCanvasLane()).toBe("fast");
  });

  it('returns "quality" for "quality"', () => {
    expect(pickCanvasLane("quality")).toBe("quality");
  });
});

describe("buildUpdatePrompt", () => {
  const type = "mermaid";
  const existingContent = "graph TD\n  A --> B";
  const instruction = "Add a node C connected to B";
  const prompt = buildUpdatePrompt(type, existingContent, instruction);

  it("returns a string", () => {
    expect(typeof prompt).toBe("string");
  });

  it("includes the instruction text", () => {
    expect(prompt).toContain(instruction);
  });

  it("includes the current/existing content", () => {
    expect(prompt).toContain(existingContent);
  });

  it("references the type", () => {
    expect(prompt).toContain(type);
  });

  it("works for an html type as well", () => {
    const htmlPrompt = buildUpdatePrompt(
      "html",
      "<!doctype html><html></html>",
      "Make the heading larger"
    );
    expect(htmlPrompt).toContain("html");
    expect(htmlPrompt).toContain("<!doctype html><html></html>");
    expect(htmlPrompt).toContain("Make the heading larger");
  });
});

describe("canvasItemDownload", () => {
  it("maps mermaid to .mmd / text/plain", () => {
    const result = canvasItemDownload({ type: "mermaid", title: "My Diagram" });
    expect(result.filename).toMatch(/\.mmd$/);
    expect(result.mimeType).toBe("text/plain");
  });

  it("maps html to .html / text/html", () => {
    const result = canvasItemDownload({ type: "html", title: "My Prototype" });
    expect(result.filename).toMatch(/\.html$/);
    expect(result.mimeType).toBe("text/html");
  });

  it("maps wireframe to .html / text/html", () => {
    const result = canvasItemDownload({ type: "wireframe", title: "My Wireframe" });
    expect(result.filename).toMatch(/\.html$/);
    expect(result.mimeType).toBe("text/html");
  });

  it("maps markdown to .md / text/markdown", () => {
    const result = canvasItemDownload({ type: "markdown", title: "My Notes" });
    expect(result.filename).toMatch(/\.md$/);
    expect(result.mimeType).toBe("text/markdown");
  });

  it("slugifies the title into the filename", () => {
    const result = canvasItemDownload({ type: "mermaid", title: "My Diagram" });
    expect(result.filename).toBe("my-diagram.mmd");
  });

  it("strips unsafe characters from the title when slugifying", () => {
    const result = canvasItemDownload({
      type: "html",
      title: "Hello, World! @ #2 / Test*"
    });
    // No unsafe filesystem/URL characters should survive.
    expect(result.filename).not.toMatch(/[\\/:*?"<>|@#!,]/);
    // Slug should be lowercase and hyphen-joined.
    expect(result.filename).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/);
  });

  it("always returns the correct extension regardless of title", () => {
    const result = canvasItemDownload({ type: "markdown", title: "Q3 Plan (v2)" });
    expect(result.filename.endsWith(".md")).toBe(true);
    expect(result.mimeType).toBe("text/markdown");
  });
});
