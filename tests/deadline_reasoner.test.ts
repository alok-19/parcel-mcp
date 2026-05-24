import { describe, expect, it } from "vitest";
import { reasonAboutShipment } from "../src/intelligence/deadline_reasoner.js";
import type { RawTrackingResult } from "../src/types.js";

function makeRaw(events: RawTrackingResult["events"]): RawTrackingResult {
  const latest = events.at(-1);
  return {
    awb: "1234567890",
    carrier: "bluedart",
    ...(latest?.description ? { raw_status: latest.description } : {}),
    ...(latest?.location ? { current_location: latest.location } : {}),
    events,
    fetched_at: "2026-05-24T09:00:00.000+05:30",
    liveSupported: true,
    source: "fixture"
  };
}

describe("reasonAboutShipment", () => {
  it("marks delivered shipments as delivered", () => {
    const status = reasonAboutShipment({
      raw: makeRaw([
        {
          timestamp: "2026-05-23T10:00:00.000+05:30",
          location: "Delhi",
          status_code: "delivered",
          description: "Shipment Delivered"
        }
      ])
    });

    expect(status.status).toBe("delivered");
    expect(status.normalized_phase).toBe("delivered");
    expect(status.predicted_delivery).toBeUndefined();
    expect(status.reasoning).toContain("already delivered");
  });

  it("marks shipments as delayed when p90 breaches needed_by", () => {
    const status = reasonAboutShipment({
      raw: makeRaw([
        {
          timestamp: "2026-05-24T08:00:00.000+05:30",
          location: "Delhi Hub",
          status_code: "in_transit",
          description: "Forwarded to destination"
        }
      ]),
      neededBy: "2026-05-24T12:00:00+05:30",
      originPin: "842001",
      destinationPin: "560001"
    });

    expect(status.status).toBe("delayed");
    expect(status.predicted_delivery?.basis).toBe("historical_data");
    expect(status.reasoning).toContain("deadline");
  });

  it("falls back to carrier raw status when event text is too generic for phase inference", () => {
    const status = reasonAboutShipment({
      raw: {
        ...makeRaw([
          {
            timestamp: "2026-05-24T01:02:00.000+05:30",
            location: "Muzaffarpur Hub",
            status_code: "in_transit",
            description: "Shipment Further Connected"
          }
        ]),
        raw_status: "In Transit Await Delivery Information"
      }
    });

    expect(status.normalized_phase).toBe("in_transit");
  });

  it("keeps predicted delivery timestamps in India time when scans are in India time", () => {
    const status = reasonAboutShipment({
      raw: makeRaw([
        {
          timestamp: "2026-05-24T01:02:00.000+05:30",
          location: "Muzaffarpur Hub",
          status_code: "in_transit",
          description: "Shipment Further Connected"
        }
      ])
    });

    expect(status.predicted_delivery?.p50).toContain("+05:30");
    expect(status.predicted_delivery?.p90).toContain("+05:30");
  });

  it("prefers carrier-provided expected delivery dates when available", () => {
    const status = reasonAboutShipment({
      raw: {
        ...makeRaw([
          {
            timestamp: "2026-05-24T01:02:00.000+05:30",
            location: "Muzaffarpur Hub",
            status_code: "in_transit",
            description: "Shipment Further Connected"
          }
        ]),
        expected_delivery_date: "2026-05-27T23:59:00.000+05:30"
      }
    });

    expect(status.predicted_delivery?.carrier_expected_delivery).toContain("2026-05-27");
    expect(status.predicted_delivery?.p50).toContain("2026-05-27T18:00:00");
    expect(status.predicted_delivery?.confidence).toBeGreaterThan(0.7);
  });

  it("uses city-pair SLA fallback when pins are missing but Blue Dart route cities are present", () => {
    const status = reasonAboutShipment({
      raw: {
        ...makeRaw([
          {
            timestamp: "2026-05-24T01:02:00.000+05:30",
            location: "Muzaffarpur Hub",
            status_code: "in_transit",
            description: "Shipment Further Connected"
          }
        ]),
        origin_city: "Kanti",
        destination_city: "Bengaluru"
      }
    });

    expect(status.predicted_delivery?.basis).toBe("heuristic");
    expect(status.reasoning).toContain("route heuristics");
  });
});
