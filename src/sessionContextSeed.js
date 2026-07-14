export function contextSourcesFromSessionSeed(seed = null) {
  if (!seed || seed.type !== "task") return [];

  const targetId = clean(seed.targetId) || notionIdFromValue(seed.url) || notionIdFromValue(seed.id);
  if (!targetId && !clean(seed.url)) return [];

  return [{
    id: targetId || clean(seed.url),
    provider: "notion",
    type: "page",
    title: clean(seed.title) || "Notion sprint ticket",
    url: clean(seed.url),
    meta: ["Primary sprint ticket", "Full page + properties", clean(seed.eyebrow || seed.subtitle), clean(seed.status)].filter(Boolean).join(" · "),
    updatedAt: clean(seed.metadata?.updatedAt),
    primary: true,
    locked: true
  }];
}

function notionIdFromValue(value = "") {
  const text = clean(value);
  if (!text) return "";
  const dashed = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (dashed) return dashed.toLowerCase();
  const compact = text.match(/(?:^|[^0-9a-f])([0-9a-f]{32})(?=$|[^0-9a-f])/i)?.[1];
  if (!compact) return "";
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
