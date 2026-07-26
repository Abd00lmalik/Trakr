export class OperationTimeoutError extends Error {
  constructor(
    readonly code: string,
    readonly timeoutMs: number,
  ) {
    super(`${code} after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

export function timeoutFromEnv(
  name: string,
  fallbackMs: number,
  minimumMs: number,
  maximumMs: number,
) {
  const configured = Number.parseInt(process.env[name] ?? "", 10);
  const value = Number.isFinite(configured) ? configured : fallbackMs;
  return Math.min(Math.max(value, minimumMs), maximumMs);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new OperationTimeoutError(code, timeoutMs)),
          timeoutMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
