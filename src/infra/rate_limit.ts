/**
 * Limits fresh carrier fetches per AWB to avoid hammering public portals.
 */
export class AwbRateLimiter {
  private readonly lastFetch = new Map<string, number>();

  constructor(private readonly minIntervalMs: number) {}

  /**
   * Returns whether a fresh network fetch is allowed for the AWB.
   */
  canFetch(awb: string, now = Date.now()): boolean {
    const previous = this.lastFetch.get(awb);
    return previous === undefined || now - previous >= this.minIntervalMs;
  }

  /**
   * Marks an AWB fetch as completed now.
   */
  markFetched(awb: string, now = Date.now()): void {
    this.lastFetch.set(awb, now);
  }

  /**
   * Returns seconds remaining until a new fetch is allowed.
   */
  retryAfterSeconds(awb: string, now = Date.now()): number {
    const previous = this.lastFetch.get(awb);
    if (previous === undefined) {
      return 0;
    }

    const remaining = this.minIntervalMs - (now - previous);
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
}

/**
 * Shared Phase 1 AWB fetch limiter.
 */
export const awbRateLimiter = new AwbRateLimiter(60_000);
