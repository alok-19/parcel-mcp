import { describe, expect, it } from "vitest";
import { observabilityStore } from "../src/infra/observability.js";

describe("observability snapshot", () => {
  it("captures carrier failures, parser drift, and watch refresh activity", () => {
    observabilityStore.recordLiveSuccess("bluedart", "2026-05-24T09:55:00.000+05:30");
    observabilityStore.recordCacheHit("bluedart", "2026-05-24T09:57:00.000+05:30");
    observabilityStore.recordFailure("bluedart", "parse_error", "2026-05-24T10:00:00.000+05:30");
    observabilityStore.recordParserDrift(
      "bluedart",
      "bluedart_parser",
      "Blue Dart live markup changed",
      "2026-05-24T10:00:00.000+05:30"
    );
    observabilityStore.recordWatchRefresh(
      { checked: 2, changed: 1, failures: 1 },
      "2026-05-24T10:05:00.000+05:30"
    );

    const snapshot = observabilityStore.snapshot();
    const blueDart = snapshot.carriers.find((carrier) => carrier.carrier === "bluedart");

    expect(blueDart?.live_success_count).toBeGreaterThanOrEqual(1);
    expect(blueDart?.cache_hit_count).toBeGreaterThanOrEqual(1);
    expect(blueDart?.parse_error_count).toBeGreaterThanOrEqual(1);
    expect(snapshot.recent_parser_drift[0]?.detail).toContain("Blue Dart live markup changed");
    expect(snapshot.watch_refresh.total_runs).toBeGreaterThanOrEqual(1);
  });
});
