import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import {
  detectCarrierInputSchema,
  estimateEtaInputSchema,
  shipmentStatusSchema,
  trackShipmentInputSchema
} from "../src/types.js";

describe("tool schemas", () => {
  it("accepts a valid track_shipment payload", () => {
    const schema = z.object(trackShipmentInputSchema);
    const parsed = schema.parse({
      awb: "1234567890",
      needed_by: "2026-05-26T12:00:00+05:30"
    });
    expect(parsed.awb).toBe("1234567890");
  });

  it("rejects invalid PIN codes for estimate_eta", () => {
    const schema = z.object(estimateEtaInputSchema);
    expect(() =>
      schema.parse({
        carrier: "bluedart",
        origin_pincode: "123",
        destination_pincode: "560001"
      })
    ).toThrow();
  });

  it("accepts valid detect_carrier payload", () => {
    const schema = z.object(detectCarrierInputSchema);
    expect(schema.parse({ awb: "EA123456789IN" }).awb).toBe("EA123456789IN");
  });

  it("validates shipment status output", () => {
    const parsed = shipmentStatusSchema.parse({
      awb: "1234567890",
      carrier: "bluedart",
      status: "on_track",
      events: [],
      reasoning: "Looks healthy.",
      fetched_at: new Date().toISOString()
    });
    expect(parsed.status).toBe("on_track");
  });
});
