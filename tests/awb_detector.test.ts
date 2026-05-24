import { describe, expect, it } from "vitest";
import { detectCarrierByAwb } from "../src/intelligence/awb_detector.js";

describe("detectCarrierByAwb", () => {
  it("detects Blue Dart AWBs", () => {
    const result = detectCarrierByAwb("1234567890");
    expect(result.carrier).toBe("bluedart");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("detects DTDC AWBs", () => {
    const result = detectCarrierByAwb("B12345678");
    expect(result.carrier).toBe("dtdc");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detects Delhivery AWBs", () => {
    const result = detectCarrierByAwb("12345678901234");
    expect(result.carrier).toBe("delhivery");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detects India Post article numbers", () => {
    const result = detectCarrierByAwb("EA123456789IN");
    expect(result.carrier).toBe("india_post");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("returns unknown when no pattern matches", () => {
    const result = detectCarrierByAwb("weird-value");
    expect(result.carrier).toBe("unknown");
    expect(result.confidence).toBe(0);
  });
});
