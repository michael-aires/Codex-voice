const WAKE_PREFIXES = /^(hey|hi|hello|ok|okay|yo)\s+cooper\b/;
const ASK_COOPER = /\b(let'?s|let\s+s)\s+ask\s+cooper\b|\bask\s+cooper\b/;
const COOPER_DIRECT_QUESTION = /^cooper\s+(what|where|when|why|how|who)\b/;
const COOPER_CAN_YOU = /^cooper\s+(can|could|would|will|do|are)\s+you\b/;
const COOPER_SHOULD_WE = /^cooper\s+should\s+(we|i)\b/;
const COOPER_ACTION = /^cooper\s+(please\s+)?(analy[sz]e|answer|build|challenge|check|create|critique|diagram|draft|draw|explain|find|give|help|inspect|jump|look|make|map|open|pull|render|review|search|share|show|summarize|tell|think|wireframe|write)\b/;
const COOPER_INVITATION = /^cooper\s+(give\s+me\s+your\s+take|help\s+me\s+think|help\s+me\s+think\s+through\s+this|it'?s\s+time\s+for\s+you|jump\s+in|summarize\s+this|what\s+are\s+we\s+missing|what\s+do\s+you\s+think|your\s+(take|thoughts|opinion))\b/;
const COOPER_AT_END_QUESTION = /^(what\s+do\s+you\s+think|what\s+are\s+we\s+missing|any\s+thoughts|your\s+take|give\s+me\s+your\s+take)\s+cooper\b/;
const NEGATED_COOPER_INVOCATION = /\b(let'?s|let\s+s)\s+not\s+ask\s+cooper\b|\b(do\s+not|don't|dont|not)\s+ask\s+cooper\b|\bcooper\s+should\s+not\b/;

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
  if (!/\bcooper\b/.test(text)) return false;
  if (NEGATED_COOPER_INVOCATION.test(text)) return false;
  if (text === "cooper") return true;

  return [
    WAKE_PREFIXES,
    ASK_COOPER,
    COOPER_AT_END_QUESTION,
    COOPER_INVITATION,
    COOPER_DIRECT_QUESTION,
    COOPER_CAN_YOU,
    COOPER_SHOULD_WE,
    COOPER_ACTION
  ].some((pattern) => pattern.test(text));
}
