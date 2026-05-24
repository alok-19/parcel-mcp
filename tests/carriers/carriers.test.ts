import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBlueDartHtml } from "../../src/carriers/bluedart.js";
import { parseDelhiveryHtml } from "../../src/carriers/delhivery.js";
import { parseDtdcHtml } from "../../src/carriers/dtdc.js";
import { parseIndiaPostHtml } from "../../src/carriers/india_post.js";
import { ParseError } from "../../src/carriers/base.js";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests/carriers", name), "utf8");

describe("carrier parsers", () => {
  it("parses Blue Dart fixture", () => {
    const result = parseBlueDartHtml(fixture("bluedart.fixtures.html"), "1234567890");
    expect(result.events).toHaveLength(3);
    expect(result.current_location).toBe("Delhi Hub");
  });

  it("parses Blue Dart live accordion fixture", () => {
    const result = parseBlueDartHtml(fixture("bluedart.live-shape.fixtures.html"), "21038951172");
    expect(result.events).toHaveLength(4);
    expect(result.current_location).toBe("Muzaffarpur Hub");
    expect(result.raw_status).toContain("In Transit");
    expect(result.origin_city).toBe("Kanti");
    expect(result.destination_city).toBe("Bengaluru");
    expect(result.expected_delivery_date).toContain("2026-05-27");
  });

  it("fails loudly for drifted Blue Dart markup with no recognizable rows", () => {
    expect(() => parseBlueDartHtml("<html><body><div>tracking unavailable</div></body></html>", "1234567890")).toThrow(
      ParseError
    );
  });

  it("parses DTDC fixture", () => {
    const result = parseDtdcHtml(fixture("dtdc.fixtures.html"), "B12345678");
    expect(result.events).toHaveLength(3);
    expect(result.current_location).toBe("Kolkata Hub");
  });

  it("parses Delhivery fixture", () => {
    const result = parseDelhiveryHtml(fixture("delhivery.fixtures.html"), "12345678901234");
    expect(result.events).toHaveLength(3);
  });

  it("parses India Post fixture", () => {
    const result = parseIndiaPostHtml(fixture("india_post.fixtures.html"), "EA123456789IN");
    expect(result.events).toHaveLength(3);
    expect(result.raw_status).toContain("Delivered");
  });
});
