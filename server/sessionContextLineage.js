const DEFAULT_PACKET_LIMIT = 6;
const DEFAULT_CONTEXT_CHARS = 36_000;

export function contextPacketIdsForCall(call = {}, limit = DEFAULT_PACKET_LIMIT) {
  const ids = [
    ...(Array.isArray(call.contextPacketIds) ? call.contextPacketIds : []),
    call.contextPacketId
  ].map(clean).filter(Boolean);
  return [...new Set(ids)].slice(-boundedLimit(limit));
}

export function contextPacketsForCall(db = {}, call = {}, limit = DEFAULT_PACKET_LIMIT) {
  const packets = new Map((Array.isArray(db.contextPackets) ? db.contextPackets : []).map((packet) => [packet.id, packet]));
  return contextPacketIdsForCall(call, limit).map((id) => packets.get(id)).filter(Boolean);
}

export function boundedContextPacketContext(packets = [], maxChars = DEFAULT_CONTEXT_CHARS) {
  const availablePackets = (Array.isArray(packets) ? packets : []).filter((packet) => clean(packet?.context));
  if (!availablePackets.length) return "";

  const limit = Math.min(120_000, Math.max(1_200, Math.floor(Number(maxChars) || DEFAULT_CONTEXT_CHARS)));
  const separator = "\n\n---\n\n";
  const available = Math.max(1_200, limit - separator.length * Math.max(0, availablePackets.length - 1));
  const perPacket = Math.max(1, Math.floor(available / availablePackets.length));
  return availablePackets
    .map((packet) => clean(packet.context).slice(0, perPacket).trim())
    .filter(Boolean)
    .join(separator)
    .slice(0, limit);
}

export function contextSourceCountForCall(db = {}, call = {}) {
  return contextPacketsForCall(db, call)
    .reduce((total, packet) => total + Math.max(0, Number(packet.sourceCount || 0)), 0);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedLimit(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(12, Math.max(1, Math.floor(parsed))) : DEFAULT_PACKET_LIMIT;
}
