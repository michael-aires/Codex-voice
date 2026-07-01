const COOPER_MENTION = /\bcooper\b/;
const NEGATED_COOPER_INVOCATION = /\b(let'?s|let\s+s)\s+not\s+ask\s+cooper\b|\b(do\s+not|don't|dont|not)\s+(ask|call|wake|invite)\s+cooper\b|\bnot\s+cooper\b|\bcooper\s+should\s+(not|never)\b|\bcooper\s+(do\s+not|don't|dont|never)\b/;

export function normalizeWakeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCooperWakePhrase(value = "") {
  const text = normalizeWakeText(value);
  if (!COOPER_MENTION.test(text)) return false;
  if (NEGATED_COOPER_INVOCATION.test(text)) return false;
  return true;
}
