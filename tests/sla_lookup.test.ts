import { describe, expect, it } from "vitest";
import { lookupEta } from "../src/intelligence/sla_lookup.js";

describe("lookupEta city fallback", () => {
  it("maps Blue Dart locality aliases like Kanti to seeded city heuristics", () => {
    const estimate = lookupEta({
      carrier: "bluedart",
      originCity: "Kanti",
      destinationCity: "Bengaluru"
    });

    expect(estimate.basis).toBe("heuristic");
    expect(estimate.p50_hours).toBe(60);
    expect(estimate.p90_hours).toBe(84);
    expect(estimate.sourceNote).toContain("Muzaffarpur");
  });
});
