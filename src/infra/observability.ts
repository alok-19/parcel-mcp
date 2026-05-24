import type { z } from "zod/v4";
import {
  carrierObservabilitySchema,
  observabilitySnapshotSchema,
  parserDriftIncidentSchema,
  watchRefreshSummarySchema
} from "../types.js";

type CarrierObservability = z.infer<typeof carrierObservabilitySchema>;
type ParserDriftIncident = z.infer<typeof parserDriftIncidentSchema>;
type WatchRefreshSummary = z.infer<typeof watchRefreshSummarySchema>;

const allCarriers = ["bluedart", "dtdc", "delhivery", "india_post"] as const;

/**
 * Lightweight in-memory metrics for carrier health and watch refresh activity.
 */
export class ObservabilityStore {
  private readonly carriers = new Map<string, CarrierObservability>(
    allCarriers.map((carrier) => [
      carrier,
      {
        carrier,
        success_count: 0,
        live_success_count: 0,
        cache_hit_count: 0,
        failure_count: 0,
        rate_limited_count: 0,
        parse_error_count: 0,
        unavailable_count: 0,
        not_found_count: 0,
        unexpected_error_count: 0
      }
    ])
  );

  private readonly parserDrift: ParserDriftIncident[] = [];
  private watchRefresh: WatchRefreshSummary = {
    total_runs: 0,
    shipments_checked: 0,
    changed_shipments: 0,
    failures: 0
  };

  /**
   * Records a successful live tracking outcome for a carrier.
   */
  recordLiveSuccess(carrier: string, at = new Date().toISOString()): void {
    const bucket = this.ensureCarrier(carrier);
    bucket.success_count += 1;
    bucket.live_success_count += 1;
    bucket.last_success_at = at;
  }

  /**
   * Records a cached tracking result served without a fresh carrier fetch.
   */
  recordCacheHit(carrier: string, at = new Date().toISOString()): void {
    const bucket = this.ensureCarrier(carrier);
    bucket.success_count += 1;
    bucket.cache_hit_count += 1;
    bucket.last_success_at = at;
  }

  /**
   * Records a carrier failure category.
   */
  recordFailure(
    carrier: string,
    kind: "rate_limited" | "parse_error" | "unavailable" | "not_found" | "unexpected",
    at = new Date().toISOString()
  ): void {
    const bucket = this.ensureCarrier(carrier);
    bucket.failure_count += 1;
    bucket.last_failure_at = at;
    if (kind === "rate_limited") {
      bucket.rate_limited_count += 1;
    } else if (kind === "parse_error") {
      bucket.parse_error_count += 1;
    } else if (kind === "unavailable") {
      bucket.unavailable_count += 1;
    } else if (kind === "not_found") {
      bucket.not_found_count += 1;
    } else {
      bucket.unexpected_error_count += 1;
    }
  }

  /**
   * Captures a parser-drift incident from live carrier HTML.
   */
  recordParserDrift(carrier: string, parser: string, detail: string, at = new Date().toISOString()): void {
    this.parserDrift.unshift({
      carrier,
      parser,
      detail,
      observed_at: at
    });
    this.parserDrift.splice(10);
  }

  /**
   * Records a monitoring refresh run.
   */
  recordWatchRefresh(summary: { checked: number; changed: number; failures: number }, at = new Date().toISOString()): void {
    this.watchRefresh = {
      total_runs: this.watchRefresh.total_runs + 1,
      shipments_checked: this.watchRefresh.shipments_checked + summary.checked,
      changed_shipments: this.watchRefresh.changed_shipments + summary.changed,
      failures: this.watchRefresh.failures + summary.failures,
      last_run_at: at
    };
  }

  /**
   * Returns a validated observability snapshot.
   */
  snapshot() {
    return observabilitySnapshotSchema.parse({
      carriers: [...this.carriers.values()].sort((left, right) => left.carrier.localeCompare(right.carrier)),
      recent_parser_drift: this.parserDrift,
      watch_refresh: this.watchRefresh
    });
  }

  private ensureCarrier(carrier: string): CarrierObservability {
    const existing = this.carriers.get(carrier);
    if (existing) {
      return existing;
    }

    const created: CarrierObservability = {
      carrier,
      success_count: 0,
      live_success_count: 0,
      cache_hit_count: 0,
      failure_count: 0,
      rate_limited_count: 0,
      parse_error_count: 0,
      unavailable_count: 0,
      not_found_count: 0,
      unexpected_error_count: 0
    };
    this.carriers.set(carrier, created);
    return created;
  }
}

/**
 * Shared observability singleton.
 */
export const observabilityStore = new ObservabilityStore();
