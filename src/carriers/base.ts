import { DateTime } from "luxon";
import type { RawTrackingResult, ParsedCarrierEvent } from "../types.js";

/**
 * Base error for carrier adapter failures.
 */
export class CarrierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarrierError";
  }
}

/**
 * Raised when an AWB shape is not valid for the target carrier.
 */
export class InvalidAWBError extends CarrierError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAWBError";
  }
}

/**
 * Raised when a carrier portal reports no shipment for the AWB.
 */
export class NotFoundError extends CarrierError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Raised when a carrier portal is unavailable or blocked.
 */
export class CarrierUnavailableError extends CarrierError {
  constructor(message: string) {
    super(message);
    this.name = "CarrierUnavailableError";
  }
}

/**
 * Raised when carrier markup changes and parsing no longer works.
 */
export class ParseError extends CarrierError {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Common contract for all carrier-specific tracking adapters.
 */
export interface CarrierAdapter {
  readonly name: string;
  readonly displayName: string;
  readonly liveSupported: boolean;

  /**
   * Returns true when the AWB format matches this carrier.
   */
  matches(awb: string): boolean;

  /**
   * Returns a confidence score for the AWB shape.
   */
  matchConfidence(awb: string): number;

  /**
   * Fetches and parses tracking data for the AWB.
   */
  track(awb: string): Promise<RawTrackingResult>;
}

/**
 * Converts carrier-local timestamps to ISO 8601 in Asia/Kolkata.
 */
export function toIsoInIndia(raw: string): string | undefined {
  const normalized = raw.replace(/\s+/g, " ").trim();
  const candidates = [
    "dd/MM/yyyy HH:mm",
    "dd/MM/yyyy hh:mm a",
    "dd LLL yyyy HH:mm",
    "dd LLL yyyy hh:mm a",
    "dd-MM-yyyy HH:mm",
    "dd-MM-yyyy hh:mm a",
    "yyyy-MM-dd HH:mm:ss"
  ];

  for (const format of candidates) {
    const dt = DateTime.fromFormat(normalized, format, { zone: "Asia/Kolkata", locale: "en-IN" });
    if (dt.isValid) {
      return dt.toISO();
    }
  }

  const fallback = DateTime.fromISO(normalized, { zone: "Asia/Kolkata" });
  return fallback.isValid ? fallback.toISO() ?? undefined : undefined;
}

/**
 * Sorts events newest-last for consistent downstream reasoning.
 */
export function sortEvents(events: ParsedCarrierEvent[]): ParsedCarrierEvent[] {
  return [...events].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}
