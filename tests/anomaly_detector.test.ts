import { describe, expect, it, vi } from "vitest";
import { detectAnomalies } from "../src/intelligence/anomaly_detector.js";
import type { ShipmentStatus } from "../src/types.js";

describe("detectAnomalies", () => {
  it("flags stale in-transit scans", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00+05:30"));

    const anomalies = detectAnomalies({
      awb: "1234567890",
      carrier: "bluedart",
      status: "stuck",
      normalized_phase: "in_transit",
      current_location: "Delhi",
      last_scan_at: "2026-05-22T08:00:00+05:30",
      events: [
        {
          timestamp: "2026-05-22T08:00:00+05:30",
          location: "Delhi",
          status_code: "in_transit",
          description: "Forwarded to destination"
        }
      ],
      reasoning: "",
      fetched_at: "2026-05-24T12:00:00+05:30"
    } satisfies ShipmentStatus);

    expect(anomalies.some((anomaly) => anomaly.type === "stale_scan")).toBe(true);
    vi.useRealTimers();
  });

  it("flags stuck out for delivery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T22:00:00+05:30"));

    const anomalies = detectAnomalies({
      awb: "1234567890",
      carrier: "dtdc",
      status: "at_risk",
      normalized_phase: "out_for_delivery",
      current_location: "Kolkata",
      last_scan_at: "2026-05-24T07:00:00+05:30",
      events: [
        {
          timestamp: "2026-05-24T07:00:00+05:30",
          location: "Kolkata",
          status_code: "out_for_delivery",
          description: "Out for delivery"
        }
      ],
      reasoning: "",
      fetched_at: "2026-05-24T22:00:00+05:30"
    } satisfies ShipmentStatus);

    expect(anomalies.some((anomaly) => anomaly.type === "stuck_out_for_delivery")).toBe(true);
    vi.useRealTimers();
  });
});
