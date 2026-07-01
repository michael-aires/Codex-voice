export function callModeLabel({
  speaking = false,
  hearing = false,
  connecting = false,
  connected = false
} = {}) {
  if (speaking) return "Speaking";
  if (hearing) return "Listening";
  if (connecting) return "Joining";
  if (connected) return "Standing by";
  return "Ready";
}

export function wakeHint(connected = false) {
  return connected
    ? { label: "Wake word", value: "Cooper", detail: "Typed asks speak back" }
    : { label: "Voice", value: "Ready", detail: "Join to enable mic" };
}

export function callPromptPlaceholder(connected = false) {
  return connected ? "Cooper, what do you think?" : "Join to ask Cooper";
}

export function canvasStateLabel({ connected = false, activeJobCount = 0 } = {}) {
  if (!connected) return "Idle";
  if (activeJobCount === 1) return "1 active";
  if (activeJobCount > 1) return `${activeJobCount} active`;
  return "Live";
}
