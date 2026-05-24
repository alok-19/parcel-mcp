import { LRUCache } from "lru-cache";
import type { RawTrackingResult } from "../types.js";

/**
 * Short-lived in-memory cache for normalized tracking fetches.
 */
export class TrackingCache {
  private readonly cache = new LRUCache<string, RawTrackingResult>({
    max: 1000,
    ttl: 90_000
  });

  /**
   * Returns a cached result if present and fresh.
   */
  get(awb: string): RawTrackingResult | undefined {
    return this.cache.get(awb);
  }

  /**
   * Stores a normalized result for the AWB.
   */
  set(awb: string, result: RawTrackingResult): void {
    this.cache.set(awb, result);
  }
}

/**
 * Shared cache singleton.
 */
export const trackingCache = new TrackingCache();
