export type AiEnhancementStatus =
  | "enhanced"
  | "cache_hit"
  | "fallback"
  | "timeout"
  | "error";

export type AiErrorCategory =
  | "none"
  | "timeout"
  | "rate_limit"
  | "provider_unavailable"
  | "invalid_output"
  | "network"
  | "unknown";

export type AiStageTimings = {
  requestBuildMs: number;
  networkMs: number;
  parseMs: number;
  totalMs: number;
};

export type AiMetricEvent = {
  status: AiEnhancementStatus;
  provider: string;
  model: string;
  attempts: number;
  errorCategory: AiErrorCategory;
  timings: AiStageTimings;
  promptChars: number;
  outputChars: number;
  createdAt: number;
};

const MAX_EVENTS = 500;
const events: AiMetricEvent[] = [];

export function recordAiMetric(event: Omit<AiMetricEvent, "createdAt">) {
  events.push({
    ...event,
    createdAt: Date.now(),
  });

  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function getAiMetricsSnapshot() {
  const total = events.length;
  const enhanced = events.filter((event) => event.status === "enhanced").length;
  const cacheHits = events.filter((event) => event.status === "cache_hit").length;
  const fallback = events.filter((event) =>
    ["fallback", "timeout", "error"].includes(event.status),
  ).length;
  const timeouts = events.filter((event) => event.errorCategory === "timeout").length;
  const totalLatencies = events.map((event) => event.timings.totalMs);
  const networkLatencies = events.map((event) => event.timings.networkMs);
  const categories = events.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.errorCategory] = (accumulator[event.errorCategory] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    windowSize: total,
    enhancementSuccessRate: total ? Number(((enhanced + cacheHits) / total).toFixed(3)) : null,
    fallbackRate: total ? Number((fallback / total).toFixed(3)) : null,
    timeoutRate: total ? Number((timeouts / total).toFixed(3)) : null,
    averageLatencyMs: average(totalLatencies),
    averageGeminiNetworkMs: average(networkLatencies),
    timeoutCount: timeouts,
    errorCategories: categories,
    targets: {
      enhancementSuccessRate: 0.95,
      fallbackRate: 0.05,
      medianResponseTimeMs: 5000,
    },
  };
}
