import { describe, it, expect } from "vitest";
import { pickIngestMode, chunkText } from "../../src/lib/knowledge.js";

describe("pickIngestMode", () => {
  it("returns 'prompt' for small text below the inline max", () => {
    expect(pickIngestMode(100)).toBe("prompt");
  });

  it("returns 'indexed' for large text above the inline max", () => {
    expect(pickIngestMode(20000)).toBe("indexed");
  });

  it("treats exactly the default inline max (6000) as 'prompt' (<= boundary)", () => {
    expect(pickIngestMode(6000)).toBe("prompt");
  });

  it("treats one over the default inline max as 'indexed'", () => {
    expect(pickIngestMode(6001)).toBe("indexed");
  });

  it("returns 'prompt' for zero chars", () => {
    expect(pickIngestMode(0)).toBe("prompt");
  });

  describe("override behavior", () => {
    it("override 'prompt' wins even when size would be 'indexed'", () => {
      expect(pickIngestMode(20000, "prompt")).toBe("prompt");
    });

    it("override 'indexed' wins even when size would be 'prompt'", () => {
      expect(pickIngestMode(100, "indexed")).toBe("indexed");
    });

    it("falsy/absent override falls back to size-based routing", () => {
      expect(pickIngestMode(100, undefined)).toBe("prompt");
      expect(pickIngestMode(20000, null)).toBe("indexed");
      expect(pickIngestMode(100, "")).toBe("prompt");
    });

    it("override 'auto' is ignored and size-based routing applies", () => {
      // Only the two valid overrides win; anything else defers to size.
      expect(pickIngestMode(100, "auto")).toBe("prompt");
      expect(pickIngestMode(20000, "auto")).toBe("indexed");
    });
  });
});

describe("chunkText", () => {
  it("returns a single chunk for text shorter than the size", () => {
    const text = "hello world";
    const chunks = chunkText(text, 2000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits long text into multiple chunks each <= size", () => {
    const text = "x".repeat(5000);
    const chunks = chunkText(text, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("concatenation of chunks exactly preserves the original content", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(300);
    const chunks = chunkText(text, 137);
    expect(chunks.join("")).toBe(text);
  });

  it("produces the expected number of chunks for an even split", () => {
    const text = "a".repeat(6000);
    const chunks = chunkText(text, 2000);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.length === 2000)).toBe(true);
  });

  it("handles a non-even split with a smaller final chunk", () => {
    const text = "b".repeat(4500);
    const chunks = chunkText(text, 2000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].length).toBe(2000);
    expect(chunks[1].length).toBe(2000);
    expect(chunks[2].length).toBe(500);
    expect(chunks.join("")).toBe(text);
  });

  it("uses the default size of 2000 when size is omitted", () => {
    const text = "c".repeat(4001);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("returns an empty result (no content lost) for empty text", () => {
    const chunks = chunkText("", 2000);
    expect(chunks.join("")).toBe("");
  });

  it("is deterministic across repeated calls", () => {
    const text = "deterministic-content-".repeat(500);
    const a = chunkText(text, 250);
    const b = chunkText(text, 250);
    expect(a).toEqual(b);
  });
});
