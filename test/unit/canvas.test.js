import { describe, it, expect } from "vitest";
import {
  extractHtmlDocument,
  sanitizeMermaid,
  isValidMermaid,
} from "../../src/lib/canvas.js";

describe("extractHtmlDocument", () => {
  it("returns a clean doctype document unchanged in substance", () => {
    const doc =
      "<!doctype html>\n<html><head><title>T</title></head><body><h1>Hi</h1></body></html>";
    const out = extractHtmlDocument(doc);
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<html");
    expect(out).toContain("<h1>Hi</h1>");
    expect(out).toContain("</html>");
  });

  it("extracts an html document from inside a fenced ```html block", () => {
    const fenced = [
      "Here is your prototype:",
      "```html",
      "<!doctype html>",
      "<html><body><p>Fenced</p></body></html>",
      "```",
      "Hope that helps!",
    ].join("\n");
    const out = extractHtmlDocument(fenced);
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<p>Fenced</p>");
    expect(out).toContain("</html>");
    expect(out).not.toContain("```");
    expect(out).not.toContain("Hope that helps");
  });

  it("strips Cooper step comment markers and prefers the doctype document", () => {
    const draft = [
      "<!-- Cooper step 1: scaffold the page -->",
      "<!doctype html>",
      "<!-- Cooper step 2: add the body -->",
      "<html><body><main>Draft</main></body></html>",
      "<!-- Cooper step 3: done -->",
    ].join("\n");
    const out = extractHtmlDocument(draft);
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<main>Draft</main>");
    expect(out).toContain("</html>");
    expect(out).not.toContain("Cooper step");
  });

  it("prefers the last complete doctype document when several are present", () => {
    const multi = [
      "<!doctype html><html><body><p>first</p></body></html>",
      "<!doctype html><html><body><p>second</p></body></html>",
    ].join("\n");
    const out = extractHtmlDocument(multi);
    expect(out).toContain("second");
    expect(out).not.toContain("first");
  });

  it("returns empty string for prose-only input with no html", () => {
    const out = extractHtmlDocument(
      "I think we should build a dashboard with a sidebar and a chart."
    );
    expect(out).toBe("");
  });
});

describe("isValidMermaid", () => {
  it("accepts a valid graph definition", () => {
    expect(isValidMermaid("graph TD\n  A-->B")).toBe(true);
  });

  it("accepts other known diagram keywords", () => {
    expect(isValidMermaid("flowchart LR\n  A-->B")).toBe(true);
    expect(isValidMermaid("sequenceDiagram\n  A->>B: hi")).toBe(true);
    expect(isValidMermaid("erDiagram\n  CUSTOMER ||--o{ ORDER : places")).toBe(
      true
    );
  });

  it("rejects prose that is not a mermaid diagram", () => {
    expect(isValidMermaid("Here is a diagram of the system architecture.")).toBe(
      false
    );
  });

  it("rejects empty input", () => {
    expect(isValidMermaid("")).toBe(false);
  });
});

describe("sanitizeMermaid", () => {
  it("strips a plain triple-backtick fence and trims", () => {
    const input = "```\ngraph TD\n  A-->B\n```";
    expect(sanitizeMermaid(input)).toBe("graph TD\n  A-->B");
  });

  it("strips a mermaid-tagged fence", () => {
    const input = "```mermaid\nflowchart LR\n  A-->B\n```";
    expect(sanitizeMermaid(input)).toBe("flowchart LR\n  A-->B");
  });

  it("trims surrounding whitespace from unfenced source", () => {
    const input = "\n\n  graph TD\n  A-->B  \n\n";
    expect(sanitizeMermaid(input).trim()).toBe(
      "graph TD\n  A-->B".trim()
    );
    expect(sanitizeMermaid(input).startsWith("graph TD")).toBe(true);
  });

  it("produces output that validates as mermaid after fence removal", () => {
    const input = "```mermaid\ngraph TD\n  A-->B\n```";
    expect(isValidMermaid(sanitizeMermaid(input))).toBe(true);
  });
});
