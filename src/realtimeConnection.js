export const REALTIME_RECONNECT_LIMIT = 3;

export function realtimeReconnectDelay(attempt = 1) {
  const normalized = Math.max(1, Number(attempt || 1));
  return Math.min(8000, 750 * (2 ** (normalized - 1)));
}

export function isRetryableRealtimeError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  if (/NotAllowedError|SecurityError/i.test(name)) return false;
  if (/(permission|microphone access|not allowed|missing openai_api_key|unauthorized|invalid api key)/i.test(message)) return false;
  return true;
}

export function shouldReconnectRealtime({ manual = false, attempt = 0, error = null } = {}) {
  return !manual && attempt < REALTIME_RECONNECT_LIMIT && isRetryableRealtimeError(error);
}
