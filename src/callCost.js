const MILLION = 1_000_000;

export const OPENAI_CALL_PRICING = {
  currency: "USD",
  source: "OpenAI API pricing, checked 2026-07-03",
  realtime: {
    model: "gpt-realtime-2",
    textInputPerMillion: 4,
    textCachedInputPerMillion: 0.4,
    textOutputPerMillion: 24,
    audioInputPerMillion: 32,
    audioCachedInputPerMillion: 0.4,
    audioOutputPerMillion: 64,
    imageInputPerMillion: 5,
    imageCachedInputPerMillion: 0.5
  },
  transcription: {
    model: "gpt-4o-mini-transcribe",
    inputPerMillion: 1.25,
    outputPerMillion: 5,
    estimatedPerMinute: 0.003
  },
  responses: {
    "gpt-5.4": {
      textInputPerMillion: 2.5,
      textCachedInputPerMillion: 0.25,
      textOutputPerMillion: 15,
      longPromptInputMultiplier: 2,
      longPromptOutputMultiplier: 1.5,
      longPromptInputThreshold: 272_000
    }
  }
};

export function createEmptyRealtimeUsage({
  model = OPENAI_CALL_PRICING.realtime.model,
  transcriptionModel = OPENAI_CALL_PRICING.transcription.model,
  startedAt = new Date().toISOString()
} = {}) {
  return {
    model,
    transcriptionModel,
    startedAt,
    updatedAt: startedAt,
    responses: 0,
    transcriptionEvents: 0,
    response: emptyUsageTotals(),
    transcription: emptyUsageTotals(),
    costUsd: 0,
    costSource: "actual_usage",
    pricing: OPENAI_CALL_PRICING
  };
}

export function addRealtimeResponseUsage(current, usage, at = new Date().toISOString()) {
  if (!usage || typeof usage !== "object") return summarizeRealtimeUsage(current || createEmptyRealtimeUsage(), at);
  const next = normalizeRealtimeUsage(current);
  next.responses += 1;
  addResponseUsageTotals(next.response, usage);
  return summarizeRealtimeUsage(next, at);
}

export function addRealtimeTranscriptionUsage(current, usage, at = new Date().toISOString()) {
  if (!usage || typeof usage !== "object") return summarizeRealtimeUsage(current || createEmptyRealtimeUsage(), at);
  const next = normalizeRealtimeUsage(current);
  next.transcriptionEvents += 1;
  addTranscriptionUsageTotals(next.transcription, usage);
  return summarizeRealtimeUsage(next, at);
}

export function normalizeRealtimeUsage(value = {}) {
  const base = createEmptyRealtimeUsage({
    model: value?.model || OPENAI_CALL_PRICING.realtime.model,
    transcriptionModel: value?.transcriptionModel || OPENAI_CALL_PRICING.transcription.model,
    startedAt: value?.startedAt || new Date().toISOString()
  });
  return {
    ...base,
    updatedAt: value?.updatedAt || base.updatedAt,
    responses: toNumber(value?.responses),
    transcriptionEvents: toNumber(value?.transcriptionEvents),
    response: normalizeUsageTotals(value?.response),
    transcription: normalizeUsageTotals(value?.transcription),
    costUsd: toMoney(value?.costUsd),
    costSource: value?.costSource || "actual_usage",
    pricing: value?.pricing || OPENAI_CALL_PRICING
  };
}

export function summarizeRealtimeUsage(value = {}, at = new Date().toISOString()) {
  const usage = normalizeRealtimeUsage(value);
  const responseCost = calculateRealtimeResponseCost(usage.response);
  const transcriptionCost = calculateTranscriptionCost(usage.transcription);
  const costUsd = toMoney(responseCost + transcriptionCost);
  return {
    ...usage,
    updatedAt: at,
    costUsd,
    costSource: hasRecordedUsage(usage) ? "actual_usage" : "no_usage",
    costBreakdown: {
      realtimeUsd: toMoney(responseCost),
      transcriptionUsd: toMoney(transcriptionCost)
    }
  };
}

export function callUsageTokens(usage = {}) {
  const normalized = normalizeRealtimeUsage(usage);
  return normalized.response.totalTokens + normalized.transcription.totalTokens;
}

export function hasRecordedUsage(usage = {}) {
  const normalized = normalizeRealtimeUsage(usage);
  return normalized.responses > 0 || normalized.transcriptionEvents > 0 || normalized.response.totalTokens > 0 || normalized.transcription.totalTokens > 0;
}

export function callCostSummary(call = {}, jobs = []) {
  const usage = call.realtimeUsage ? summarizeRealtimeUsage(call.realtimeUsage, call.realtimeUsage.updatedAt) : null;
  const jobUsage = summarizeJobResponseUsage(jobs);
  const hasRealtimeUsage = usage && hasRecordedUsage(usage);
  if (hasRealtimeUsage || jobUsage.calls > 0) {
    const tokens = (hasRealtimeUsage ? callUsageTokens(usage) : 0) + jobUsage.totalTokens;
    const costUsd = toMoney((hasRealtimeUsage ? usage.costUsd : 0) + jobUsage.costUsd);
    return {
      source: "actual",
      model: modelLabel(usage, jobUsage),
      tokens,
      tokenLabel: compactTokens(tokens, false),
      costUsd,
      costValue: formatUsd(costUsd),
      costLabel: "Cost",
      detail: "Recorded from Realtime usage events and OpenAI Responses usage for generated artifacts."
    };
  }

  const estimate = estimateLegacyCallCost(call, jobs);
  return {
    source: "estimate",
    model: jobs.find((job) => job.model)?.model || call.model || OPENAI_CALL_PRICING.realtime.model,
    tokens: estimate.tokens,
    tokenLabel: estimate.tokens ? compactTokens(estimate.tokens, true) : "0",
    costUsd: estimate.costUsd,
    costValue: estimate.costUsd > 0 ? `~${formatUsd(estimate.costUsd)}` : "$0.00",
    costLabel: estimate.costUsd > 0 ? "Est. cost" : "Cost",
    detail: "Estimated because this older call has no saved Realtime usage payload."
  };
}

export function calculateRealtimeResponseCost(totals = {}) {
  const usage = normalizeUsageTotals(totals);
  const regularTextInput = Math.max(0, usage.inputTextTokens - usage.cachedTextTokens);
  const regularAudioInput = Math.max(0, usage.inputAudioTokens - usage.cachedAudioTokens);
  const regularImageInput = Math.max(0, usage.inputImageTokens - usage.cachedImageTokens);

  return (
    regularTextInput * OPENAI_CALL_PRICING.realtime.textInputPerMillion / MILLION +
    usage.cachedTextTokens * OPENAI_CALL_PRICING.realtime.textCachedInputPerMillion / MILLION +
    regularAudioInput * OPENAI_CALL_PRICING.realtime.audioInputPerMillion / MILLION +
    usage.cachedAudioTokens * OPENAI_CALL_PRICING.realtime.audioCachedInputPerMillion / MILLION +
    regularImageInput * OPENAI_CALL_PRICING.realtime.imageInputPerMillion / MILLION +
    usage.cachedImageTokens * OPENAI_CALL_PRICING.realtime.imageCachedInputPerMillion / MILLION +
    usage.outputTextTokens * OPENAI_CALL_PRICING.realtime.textOutputPerMillion / MILLION +
    usage.outputAudioTokens * OPENAI_CALL_PRICING.realtime.audioOutputPerMillion / MILLION
  );
}

export function calculateTranscriptionCost(totals = {}) {
  const usage = normalizeUsageTotals(totals);
  return (
    usage.inputTokens * OPENAI_CALL_PRICING.transcription.inputPerMillion / MILLION +
    usage.outputTokens * OPENAI_CALL_PRICING.transcription.outputPerMillion / MILLION
  );
}

export function addResponsesApiUsage(current, usage, { model = "gpt-5.4", at = new Date().toISOString() } = {}) {
  if (!usage || typeof usage !== "object") return normalizeResponsesApiUsage(current);
  const next = normalizeResponsesApiUsage(current) || emptyResponsesApiUsage();
  next.calls.push(normalizeResponsesApiCall({ ...usage, model, at }));
  return summarizeResponsesApiUsage(next, at);
}

export function normalizeResponsesApiUsage(value = {}) {
  if (!value || typeof value !== "object") return null;
  const calls = Array.isArray(value.calls)
    ? value.calls.map(normalizeResponsesApiCall).filter((call) => call.totalTokens > 0 || call.inputTokens > 0 || call.outputTokens > 0)
    : [];
  if (!calls.length && !value.totalTokens && !value.inputTokens && !value.outputTokens) return null;
  return summarizeResponsesApiUsage({
    ...emptyResponsesApiUsage(),
    calls,
    updatedAt: value.updatedAt || new Date().toISOString()
  }, value.updatedAt || new Date().toISOString());
}

export function summarizeResponsesApiUsage(value = {}, at = new Date().toISOString()) {
  const usage = value && typeof value === "object" ? value : emptyResponsesApiUsage();
  const calls = Array.isArray(usage.calls) ? usage.calls.map(normalizeResponsesApiCall) : [];
  const totals = calls.reduce((acc, call) => {
    acc.totalTokens += call.totalTokens;
    acc.inputTokens += call.inputTokens;
    acc.cachedInputTokens += call.cachedInputTokens;
    acc.outputTokens += call.outputTokens;
    acc.costUsd += call.costUsd;
    return acc;
  }, { totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 });

  return {
    calls,
    updatedAt: at,
    totalTokens: totals.totalTokens,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    outputTokens: totals.outputTokens,
    costUsd: toMoney(totals.costUsd),
    costSource: calls.length ? "actual_usage" : "no_usage",
    pricing: OPENAI_CALL_PRICING.responses
  };
}

export function calculateResponsesApiCost({ model = "gpt-5.4", inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 } = {}) {
  const pricing = responsePricingForModel(model);
  const input = toNumber(inputTokens);
  const cached = Math.min(input, toNumber(cachedInputTokens));
  const output = toNumber(outputTokens);
  const regularInput = Math.max(0, input - cached);
  const longPrompt = input > pricing.longPromptInputThreshold;
  const inputMultiplier = longPrompt ? pricing.longPromptInputMultiplier : 1;
  const outputMultiplier = longPrompt ? pricing.longPromptOutputMultiplier : 1;

  return (
    regularInput * pricing.textInputPerMillion * inputMultiplier / MILLION +
    cached * pricing.textCachedInputPerMillion * inputMultiplier / MILLION +
    output * pricing.textOutputPerMillion * outputMultiplier / MILLION
  );
}

function addResponseUsageTotals(target, usage) {
  addBaseTotals(target, usage);
  const inputDetails = usage.input_token_details || {};
  const cachedDetails = inputDetails.cached_tokens_details || {};
  const outputDetails = usage.output_token_details || {};

  target.inputTextTokens += toNumber(inputDetails.text_tokens);
  target.inputAudioTokens += toNumber(inputDetails.audio_tokens);
  target.inputImageTokens += toNumber(inputDetails.image_tokens);
  target.cachedTextTokens += toNumber(cachedDetails.text_tokens);
  target.cachedAudioTokens += toNumber(cachedDetails.audio_tokens);
  target.cachedImageTokens += toNumber(cachedDetails.image_tokens);
  target.cachedTokens += toNumber(inputDetails.cached_tokens);
  target.outputTextTokens += toNumber(outputDetails.text_tokens);
  target.outputAudioTokens += toNumber(outputDetails.audio_tokens);

  if (!hasInputDetails(inputDetails) && usage.input_tokens) {
    target.inputTextTokens += toNumber(usage.input_tokens);
  }
  if (!hasOutputDetails(outputDetails) && usage.output_tokens) {
    target.outputTextTokens += toNumber(usage.output_tokens);
  }
}

function addTranscriptionUsageTotals(target, usage) {
  addBaseTotals(target, usage);
  const inputDetails = usage.input_token_details || {};
  target.inputTextTokens += toNumber(inputDetails.text_tokens);
  target.inputAudioTokens += toNumber(inputDetails.audio_tokens);
  target.outputTextTokens += toNumber(usage.output_tokens);

  if (!hasInputDetails(inputDetails) && usage.input_tokens) {
    target.inputAudioTokens += toNumber(usage.input_tokens);
  }
}

function addBaseTotals(target, usage) {
  target.totalTokens += toNumber(usage.total_tokens);
  target.inputTokens += toNumber(usage.input_tokens);
  target.outputTokens += toNumber(usage.output_tokens);
}

function emptyUsageTotals() {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    inputTextTokens: 0,
    inputAudioTokens: 0,
    inputImageTokens: 0,
    cachedTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0
  };
}

function normalizeUsageTotals(value = {}) {
  const empty = emptyUsageTotals();
  return Object.fromEntries(
    Object.keys(empty).map((key) => [key, toNumber(value?.[key])])
  );
}

function estimateLegacyCallCost(call = {}, jobs = []) {
  const transcript = Array.isArray(call.transcript) ? call.transcript : [];
  const michaelWords = transcript
    .filter((entry) => normalizeSpeakerName(entry.speaker) !== "cooper")
    .reduce((sum, entry) => sum + wordCount(entry.text), 0);
  const cooperWords = transcript
    .filter((entry) => normalizeSpeakerName(entry.speaker) === "cooper")
    .reduce((sum, entry) => sum + wordCount(entry.text), 0);

  const michaelSpeechSeconds = michaelWords ? michaelWords / 2.5 : Math.max(0, Number(call.durationSeconds || 0)) * 0.22;
  const cooperSpeechSeconds = cooperWords ? cooperWords / 2.5 : Math.max(0, Number(call.durationSeconds || 0)) * 0.08;
  const inputAudioTokens = Math.round(michaelSpeechSeconds * 10);
  const outputAudioTokens = Math.round(cooperSpeechSeconds * 20);
  const textTokens = Math.round(transcript.reduce((sum, entry) => sum + String(entry.text || "").length, 0) / 4);
  const jobTokens = jobs.reduce((sum, job) => sum + toNumber(job.outputTokens || job.maxOutputTokens), 0);
  const tokens = inputAudioTokens + outputAudioTokens + textTokens + jobTokens;
  const costUsd = toMoney(
    inputAudioTokens * OPENAI_CALL_PRICING.realtime.audioInputPerMillion / MILLION +
    outputAudioTokens * OPENAI_CALL_PRICING.realtime.audioOutputPerMillion / MILLION +
    textTokens * OPENAI_CALL_PRICING.realtime.textInputPerMillion / MILLION
  );

  return { tokens, costUsd };
}

function summarizeJobResponseUsage(jobs = []) {
  const summaries = jobs
    .map((job) => normalizeResponsesApiUsage(job?.responseUsage))
    .filter(Boolean);
  const models = new Set();
  const totals = summaries.reduce((acc, usage) => {
    usage.calls.forEach((call) => models.add(call.model));
    acc.calls += usage.calls.length;
    acc.totalTokens += usage.totalTokens;
    acc.costUsd += usage.costUsd;
    return acc;
  }, { calls: 0, totalTokens: 0, costUsd: 0 });
  return { ...totals, models: [...models] };
}

function modelLabel(realtimeUsage, jobUsage) {
  const labels = [];
  if (realtimeUsage && hasRecordedUsage(realtimeUsage)) labels.push(realtimeUsage.model || OPENAI_CALL_PRICING.realtime.model);
  if (jobUsage?.models?.length) labels.push(...jobUsage.models);
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) return OPENAI_CALL_PRICING.realtime.model;
  if (unique.length === 1) return unique[0];
  return "mixed";
}

function emptyResponsesApiUsage() {
  return {
    calls: [],
    updatedAt: new Date().toISOString(),
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    costSource: "no_usage",
    pricing: OPENAI_CALL_PRICING.responses
  };
}

function normalizeResponsesApiCall(value = {}) {
  const inputDetails = value.input_tokens_details || value.inputTokenDetails || {};
  const inputTokens = toNumber(value.input_tokens ?? value.inputTokens);
  const outputTokens = toNumber(value.output_tokens ?? value.outputTokens);
  const cachedInputTokens = Math.min(inputTokens, toNumber(inputDetails.cached_tokens ?? value.cachedInputTokens));
  const model = cleanModelName(value.model) || "gpt-5.4";
  const totalTokens = toNumber(value.total_tokens ?? value.totalTokens) || inputTokens + outputTokens;
  const costUsd = calculateResponsesApiCost({ model, inputTokens, cachedInputTokens, outputTokens });
  return {
    model,
    at: String(value.at || value.completedAt || new Date().toISOString()),
    totalTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd: toMoney(costUsd)
  };
}

function responsePricingForModel(model = "gpt-5.4") {
  const name = cleanModelName(model);
  if (OPENAI_CALL_PRICING.responses[name]) return OPENAI_CALL_PRICING.responses[name];
  if (name.startsWith("gpt-5.4")) return OPENAI_CALL_PRICING.responses["gpt-5.4"];
  return OPENAI_CALL_PRICING.responses["gpt-5.4"];
}

function compactTokens(tokens, estimated) {
  const value = Math.max(0, Number(tokens || 0));
  const prefix = estimated ? "~" : "";
  if (value >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${prefix}${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return `${prefix}${Math.round(value)}`;
}

function formatUsd(value) {
  const amount = Math.max(0, Number(value || 0));
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function normalizeSpeakerName(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanModelName(value) {
  return String(value || "").trim();
}

function hasInputDetails(details = {}) {
  return Boolean(toNumber(details.text_tokens) || toNumber(details.audio_tokens) || toNumber(details.image_tokens));
}

function hasOutputDetails(details = {}) {
  return Boolean(toNumber(details.text_tokens) || toNumber(details.audio_tokens));
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function toMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1_000_000) / 1_000_000 : 0;
}
