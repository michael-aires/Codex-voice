export function createAudioResponseEvent(reason = "manual") {
  const responsePurpose = String(reason || "manual").replace(/[^\w.-]/g, "_").slice(0, 64) || "manual";

  return {
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      metadata: {
        response_purpose: responsePurpose
      }
    }
  };
}
