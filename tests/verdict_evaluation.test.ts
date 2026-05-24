import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reasonAboutShipment } from "../src/intelligence/deadline_reasoner.js";
import type { RawTrackingResult, ShipmentStatus } from "../src/types.js";

interface VerdictEvalCase {
  name: string;
  raw: RawTrackingResult;
  needed_by?: string;
  origin_pin?: string;
  destination_pin?: string;
  expected_status: ShipmentStatus["status"];
  expected_phase: NonNullable<ShipmentStatus["normalized_phase"]>;
}

const cases = JSON.parse(
  readFileSync(resolve(process.cwd(), "data/verdict_eval_cases.json"), "utf8")
) as VerdictEvalCase[];

describe("verdict evaluation set", () => {
  for (const testCase of cases) {
    it(`matches expected verdict for ${testCase.name}`, () => {
      const result = reasonAboutShipment({
        raw: testCase.raw,
        ...(testCase.needed_by ? { neededBy: testCase.needed_by } : {}),
        ...(testCase.origin_pin ? { originPin: testCase.origin_pin } : {}),
        ...(testCase.destination_pin ? { destinationPin: testCase.destination_pin } : {})
      });

      expect(result.status).toBe(testCase.expected_status);
      expect(result.normalized_phase).toBe(testCase.expected_phase);
    });
  }
});
