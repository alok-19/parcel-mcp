/**
 * Scrape strategy:
 * India Post tracking pages typically expose a results table with date, office, and event text.
 * Phase 1 guarantees parser coverage through fixtures and returns structured unknowns when live access fails.
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
 * India Post carrier adapter.
 */
export class IndiaPostAdapter implements CarrierAdapter {
  readonly name: CarrierSlug = "india_post";
  readonly displayName = "India Post";
  readonly liveSupported = false;

  /**
   * Returns true when the article number matches India Post format.
   */
  matches(awb: string): boolean {
    return /^[A-Z]{2}\d{9}IN$/i.test(awb.trim());
  }

  /**
   * Returns the confidence for the AWB shape.
   */
  matchConfidence(awb: string): number {
    return this.matches(awb) ? 0.99 : 0;
  }

  /**
   * Attempts a best-effort live fetch.
   */
  async track(awb: string): Promise<RawTrackingResult> {
    if (!this.matches(awb)) {
      throw new InvalidAWBError("India Post article numbers must follow XX#########IN.");
    }

    const url = `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?consignment=${encodeURIComponent(
      awb.trim()
    )}`;
    try {
      const response = await httpClient.fetchText(url);
      return parseIndiaPostHtml(response.body, awb, "live");
    } catch (error) {
      throw new CarrierUnavailableError(
        `India Post live tracking is best-effort in Phase 1. ${(error as Error).message}`
      );
    }
  }
}

/**
 * Parses India Post HTML into a normalized result.
 */
export function parseIndiaPostHtml(
  html: string,
  awb: string,
  source: "live" | "fixture" = "fixture"
): RawTrackingResult {
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
    throw new ParseError("India Post fixture did not contain recognizable event rows.");
  }

  const latest = events.at(-1);
  return {
    awb,
    carrier: "india_post",
    ...(latest?.description ? { raw_status: latest.description } : {}),
    ...(latest?.location ? { current_location: latest.location } : {}),
    events,
    fetched_at: new Date().toISOString(),
    liveSupported: false,
    source,
    ...(source === "live" ? { notes: ["India Post live support is best-effort in Phase 1."] } : {})
  };
}
