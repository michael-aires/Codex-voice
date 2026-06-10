// Pure knowledge-base helpers. No network, no fs — safe to import in tests
// and on both server and client.

// Default threshold (chars) below which an entry is injected directly into the
// live Realtime session ("prompt" mode) instead of being indexed into a vector
// store ("indexed" mode). The server may override this via
// COOPER_KB_INLINE_MAX_CHARS, but the pure routing helper keeps a stable
// default so tests are deterministic.
export const KB_INLINE_MAX = 6000;

/**
 * Decide how a knowledge entry should be ingested.
 *
 * @param {number} chars   Length of the entry text in characters.
 * @param {string} [override]  Optional explicit mode: "prompt" or "indexed".
 *   When a valid override is supplied it always wins.
 * @param {number} [max]   Optional inline-max threshold (defaults to KB_INLINE_MAX).
 * @returns {"prompt"|"indexed"}
 */
export function pickIngestMode(chars, override, max = KB_INLINE_MAX) {
  if (override === "prompt" || override === "indexed") {
    return override;
  }
  const length = Number.isFinite(chars) ? chars : 0;
  const threshold = Number.isFinite(max) ? max : KB_INLINE_MAX;
  return length <= threshold ? "prompt" : "indexed";
}

/**
 * Split text into chunks of at most `size` characters. Covers all content with
 * no gaps or overlaps. Used for client-side previews and any naive chunking.
 *
 * @param {string} text
 * @param {number} [size=2000]
 * @returns {string[]}
 */
export function chunkText(text, size = 2000) {
  const source = typeof text === "string" ? text : "";
  const step = Number.isFinite(size) && size > 0 ? Math.floor(size) : 2000;
  if (!source.length) return [];
  const chunks = [];
  for (let index = 0; index < source.length; index += step) {
    chunks.push(source.slice(index, index + step));
  }
  return chunks;
}
