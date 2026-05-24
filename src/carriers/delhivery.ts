/**
 * Scrape strategy:
 * Delhivery often renders tracking summaries in server-side HTML or embedded JSON fragments.
 * Phase 1 parsing accepts either a summary table or text-rich status blocks from saved fixtures.
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
 * Delhivery carrier adapter.
 */
export class DelhiveryAdapter implements CarrierAdapter {
  readonly name: CarrierSlug = "delhivery";
  readonly displayName = "Delhivery";
  readonly liveSupported = false;

  /**
   * Returns true when the AWB matches Delhivery's 14-digit shape.
   */
  matches(awb: string): boolean {
    return /^\d{14}$/.test(awb.trim());
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
      throw new InvalidAWBError("Delhivery AWBs must be 14 digits.");
    }

    const url = `https://www.delhivery.com/track/package/${encodeURIComponent(awb.trim())}`;
    try {
      const response = await httpClient.fetchText(url);
      return parseDelhiveryHtml(response.body, awb, "live");
    } catch (error) {
      throw new CarrierUnavailableError(
        `Delhivery live tracking is best-effort only in Phase 1. ${(error as Error).message}`
      );
    }
  }
}

/**
 * Parses Delhivery tracking HTML into a normalized result.
 */
export function parseDelhiveryHtml(
  html: string,
  awb: string,
  source: "live" | "fixture" = "fixture"
): RawTrackingResult {
  const $ = cheerio.load(html);
  const events = sortEvents([...extractTableEvents($), ...extractTimelineEvents($)]);
  if (events.length === 0) {
    throw new ParseError("Delhivery fixture did not contain recognizable event rows.");
  }

  const latest = events.at(-1);
  return {
    awb,
    carrier: "delhivery",
    ...(latest?.description ? { raw_status: latest.description } : {}),
    ...(latest?.location ? { current_location: latest.location } : {}),
    events,
    fetched_at: new Date().toISOString(),
    liveSupported: false,
    source,
    ...(source === "live" ? { notes: ["Delhivery live support is best-effort in Phase 1."] } : {})
  };
}

/**
 * Extracts tabular Delhivery events.
 */
function extractTableEvents($: cheerio.CheerioAPI) {
  return $("table tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
    .filter((cells) => cells.length >= 3 && toIsoInIndia(cells[0] ?? ""))
    .map((cells) => ({
      timestamp: toIsoInIndia(cells[0] ?? "") ?? new Date().toISOString(),
      rawTimestampText: cells[0] ?? "",
      location: cells[1] ?? "Unknown",
      status_code: /delivered/i.test(cells.slice(2).join(" ")) ? "delivered" : "in_transit",
      description: cells.slice(2).join(" | ")
    }));
}

/**
 * Extracts timeline-card style Delhivery events.
 */
function extractTimelineEvents($: cheerio.CheerioAPI) {
  return $(".shipment-status-card, .timeline-item, .track-history li")
    .toArray()
    .map((node) => {
      const text = $(node).text().replace(/\s+/g, " ").trim();
      const timestampMatch = text.match(/\d{2}[/-]\d{2}[/-]\d{4}\s+\d{2}:\d{2}(?:\s*[APMapm]{2})?/);
      const timestamp = timestampMatch?.[0] ? toIsoInIndia(timestampMatch[0]) : undefined;
      if (!timestamp) {
        return undefined;
      }

      const location =
        $(node).find(".location, .city, .hub").first().text().replace(/\s+/g, " ").trim() || "Unknown";

      return {
        timestamp,
        rawTimestampText: timestampMatch?.[0] ?? "",
        location,
        status_code: /delivered/i.test(text) ? "delivered" : "in_transit",
        description: text
      };
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
}
