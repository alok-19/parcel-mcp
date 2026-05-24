/**
 * Scrape strategy:
 * DTDC Phase 1 support is parser-first. The live site is best-effort and often unstable, so this adapter
 * primarily guarantees normalized parsing against saved HTML fixtures that include the standard trace table.
 */
import * as cheerio from "cheerio";
import type { CarrierSlug, RawTrackingResult } from "../types.js";
import { httpClient } from "../infra/http.js";
import {
  CarrierUnavailableError,
  InvalidAWBError,
  ParseError,
  type CarrierAdapter,
  sortEvents,
  toIsoInIndia
} from "./base.js";

/**
 * DTDC carrier adapter.
 */
export class DtdcAdapter implements CarrierAdapter {
  readonly name: CarrierSlug = "dtdc";
  readonly displayName = "DTDC";
  readonly liveSupported = false;

  /**
   * Returns true when the AWB matches DTDC's alphanumeric pattern.
   */
  matches(awb: string): boolean {
    return /^[A-Z]{1,2}\d{7,9}$/i.test(awb.trim());
  }

  /**
   * Returns the confidence for the AWB shape.
   */
  matchConfidence(awb: string): number {
    return this.matches(awb) ? 0.98 : 0;
  }

  /**
   * Attempts a best-effort live fetch but documents unsupported-live behavior.
   */
  async track(awb: string): Promise<RawTrackingResult> {
    if (!this.matches(awb)) {
      throw new InvalidAWBError("DTDC AWBs must be 1-2 letters followed by 7-9 digits.");
    }

    const url = `https://www.dtdc.in/trace.asp?TrkType=Consignment&strCnno=${encodeURIComponent(awb.trim())}`;
    try {
      const response = await httpClient.fetchText(url);
      return parseDtdcHtml(response.body, awb, "live");
    } catch (error) {
      throw new CarrierUnavailableError(
        `DTDC live tracking is not guaranteed in Phase 1; fixture-backed parser is supported. ${(error as Error).message}`
      );
    }
  }
}

/**
 * Parses DTDC tracking HTML into a normalized result.
 */
export function parseDtdcHtml(html: string, awb: string, source: "live" | "fixture" = "fixture"): RawTrackingResult {
  const $ = cheerio.load(html);
  const rows = $("table tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
    .filter((cells) => cells.length >= 3);

  const events = sortEvents(
    rows
      .filter((cells) => toIsoInIndia(cells[0] ?? ""))
      .map((cells) => ({
        timestamp: toIsoInIndia(cells[0] ?? "") ?? new Date().toISOString(),
        rawTimestampText: cells[0] ?? "",
        location: cells[1] ?? "Unknown",
        status_code: /delivered/i.test(cells.slice(2).join(" ")) ? "delivered" : "in_transit",
        description: cells.slice(2).join(" | ")
      }))
  );

  if (events.length === 0) {
    throw new ParseError("DTDC fixture did not contain recognizable event rows.");
  }

  const latest = events.at(-1);
  return {
    awb,
    carrier: "dtdc",
    ...(latest?.description ? { raw_status: latest.description } : {}),
    ...(latest?.location ? { current_location: latest.location } : {}),
    events,
    fetched_at: new Date().toISOString(),
    liveSupported: false,
    source,
    ...(source === "live" ? { notes: ["DTDC live support is best-effort in Phase 1."] } : {})
  };
}
