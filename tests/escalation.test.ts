import { describe, expect, it } from "vitest";
import { buildEscalationPlaybook } from "../src/intelligence/escalation.js";
import type { ShipmentStatus } from "../src/types.js";

describe("buildEscalationPlaybook", () => {
  it("fills Blue Dart escalation placeholders", () => {
    const status: ShipmentStatus = {
      awb: "1234567890",
      carrier: "bluedart",
      status: "delayed",
      normalized_phase: "in_transit",
      current_location: "Delhi Hub",
      last_scan_at: "2026-05-24T05:00:00+05:30",
      needed_by: "2026-05-24T18:00:00+05:30",
      events: [
        {
          timestamp: "2026-05-24T05:00:00+05:30",
          location: "Delhi Hub",
          status_code: "in_transit",
          description: "Forwarded to destination"
        }
      ],
      reasoning: "",
      fetched_at: "2026-05-24T09:00:00+05:30"
    };

    const steps = buildEscalationPlaybook({ status, purpose: "visa documents" });
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]?.script).toContain("1234567890");
    expect(steps[0]?.script).toContain("Delhi Hub");
    expect(steps[0]?.script).toContain("2026-05-24T18:00:00+05:30");
  });
});
