type RequestOutcome = "started" | "completed" | "rejected" | "failed";

export class RequestTiming {
  private readonly startedAt = performance.now();

  constructor(private readonly requestId: string) {}

  elapsedMs() {
    return Math.max(0, Math.round(performance.now() - this.startedAt));
  }

  headers() {
    const elapsedMs = this.elapsedMs();
    return {
      "Server-Timing": `total;dur=${elapsedMs}`,
      "X-Trakr-Duration-Ms": String(elapsedMs),
    };
  }

  mark(
    stage: string,
    outcome: RequestOutcome,
    details: Record<string, string | number | boolean | undefined> = {},
  ) {
    console.info(
      JSON.stringify({
        event: "trakr_a2mcp_request",
        requestId: this.requestId,
        stage,
        outcome,
        durationMs: this.elapsedMs(),
        ...details,
      }),
    );
  }
}
