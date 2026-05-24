import { DateTime } from "luxon";
import { lookupEta } from "./sla_lookup.js";
import type {
  CarrierSlug,
  EtaEstimate,
  NormalizedPhase,
  RawTrackingResult,
  ShipmentStatus
} from "../types.js";

const deliveredPattern = /(delivered|shipment delivered|item delivered)/i;
const exceptionPattern = /(exception|undelivered|return to origin|rto|refused|failed delivery)/i;
const pickupPattern = /(picked up|shipment picked|booked|manifested)/i;
const outForDeliveryPattern = /(out for delivery|ofd)/i;

/**
 * Computes deadline-aware shipment reasoning and ETA windows.
 */
export function reasonAboutShipment(args: {
  raw: RawTrackingResult;
  neededBy?: string;
  originPin?: string;
  destinationPin?: string;
  serviceType?: string;
}): ShipmentStatus {
  if (args.raw.events.length === 0) {
    return {
      awb: args.raw.awb,
      carrier: args.raw.carrier,
      status: "unknown",
      normalized_phase: "unknown",
      ...(args.raw.raw_status ? { carrier_raw_status: args.raw.raw_status } : {}),
      events: [],
      reasoning:
        args.raw.notes?.[0] ??
        `No carrier scans were visible for ${args.raw.carrier}. The result is conservative and marked unknown because the portal returned no usable events.`,
      fetched_at: args.raw.fetched_at
    };
  }

  const latestEvent = args.raw.events.at(-1);
  const latestTimestamp = latestEvent ? DateTime.fromISO(latestEvent.timestamp, { setZone: true }).setZone("Asia/Kolkata") : undefined;
  const now = DateTime.now().setZone("Asia/Kolkata");
  const eta = buildEta(
    args.raw.carrier,
    latestTimestamp,
    args.originPin,
    args.destinationPin,
    args.raw.origin_city,
    args.raw.destination_city,
    args.serviceType
  );
  const carrierExpectedDelivery = args.raw.expected_delivery_date
    ? DateTime.fromISO(args.raw.expected_delivery_date, { setZone: true }).setZone("Asia/Kolkata")
    : undefined;
  const normalizedPhase = inferShipmentPhase(args.raw, latestEvent);
  const delivered = normalizedPhase === "delivered";
  const predictedDelivery = delivered
    ? undefined
    : buildPredictedDelivery({
        latestTimestamp,
        now,
        eta,
        fetchedAt: args.raw.fetched_at,
        ...(carrierExpectedDelivery ? { carrierExpectedDelivery } : {})
      });
  const neededBy = args.neededBy ? DateTime.fromISO(args.neededBy, { setZone: true }) : undefined;
  const p90 = predictedDelivery ? DateTime.fromISO(predictedDelivery.p90, { setZone: true }) : undefined;
  const bufferHours = neededBy && p90?.isValid ? neededBy.diff(p90, "hours").hours : undefined;

  const status = deriveVerdict({
    events: args.raw.events,
    now,
    ...(latestEvent?.description ? { latestDescription: latestEvent.description } : {}),
    ...(neededBy?.isValid ? { neededBy } : {}),
    ...(p90?.isValid ? { predictedP90: p90 } : {})
  });

  return {
    awb: args.raw.awb,
    carrier: args.raw.carrier,
    status,
    ...(normalizedPhase ? { normalized_phase: normalizedPhase } : {}),
    ...(args.raw.raw_status ? { carrier_raw_status: args.raw.raw_status } : {}),
    ...(args.raw.current_location ?? latestEvent?.location
      ? { current_location: args.raw.current_location ?? latestEvent?.location ?? "Unknown" }
      : {}),
    ...(latestEvent?.timestamp ? { last_scan_at: latestEvent.timestamp } : {}),
    ...(predictedDelivery ? { predicted_delivery: predictedDelivery } : {}),
    ...(args.neededBy ? { needed_by: args.neededBy } : {}),
    ...(bufferHours !== undefined ? { buffer_hours: Math.round(bufferHours * 10) / 10 } : {}),
    events: args.raw.events,
    reasoning: buildReasoning({
      raw: args.raw,
      eta,
      status,
      latestEvent,
      delivered,
      ...(neededBy?.isValid ? { neededBy } : {}),
      ...(bufferHours !== undefined ? { bufferHours } : {})
    }),
    fetched_at: args.raw.fetched_at
  };
}

/**
 * Derives the normalized shipment phase from raw event text.
 */
export function inferNormalizedPhase(description: string): NormalizedPhase {
  const normalized = description.trim().toLowerCase();
  if (deliveredPattern.test(normalized)) {
    return "delivered";
  }
  if (exceptionPattern.test(normalized)) {
    return /return/i.test(normalized) ? "rto" : "exception";
  }
  if (outForDeliveryPattern.test(normalized)) {
    return "out_for_delivery";
  }
  if (pickupPattern.test(normalized)) {
    return "picked_up";
  }
  if (/transit|hub|bagged|arrived|departed/i.test(normalized)) {
    return "in_transit";
  }
  if (/forwarded|connected|dispatched|shipment arrived|await delivery information/i.test(normalized)) {
    return "in_transit";
  }
  return "unknown";
}

/**
 * Infers a normalized phase from the richest available shipment signals.
 */
function inferShipmentPhase(
  raw: RawTrackingResult,
  latestEvent: RawTrackingResult["events"][number] | undefined
): NormalizedPhase {
  const candidates = [
    latestEvent?.description,
    latestEvent?.status_code,
    raw.raw_status
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  for (const candidate of candidates) {
    const inferred = inferNormalizedPhase(candidate);
    if (inferred !== "unknown") {
      return inferred;
    }
  }

  return "unknown";
}

/**
 * Computes a route estimate for the shipment.
 */
function buildEta(
  carrier: CarrierSlug,
  latestTimestamp: DateTime | undefined,
  originPin?: string,
  destinationPin?: string,
  originCity?: string,
  destinationCity?: string,
  serviceType?: string
): EtaEstimate {
  const eta = lookupEta({
    carrier,
    ...(originPin ? { originPin } : {}),
    ...(destinationPin ? { destinationPin } : {}),
    ...(originCity ? { originCity } : {}),
    ...(destinationCity ? { destinationCity } : {}),
    ...(serviceType ? { serviceType } : {})
  });

  if (!latestTimestamp?.isValid) {
    return eta;
  }

  return eta;
}

/**
 * Applies the Phase 1 verdict rules in priority order.
 */
function deriveVerdict(args: {
  latestDescription?: string;
  events: RawTrackingResult["events"];
  neededBy?: DateTime;
  predictedP90?: DateTime;
  now: DateTime;
}): ShipmentStatus["status"] {
  if (args.latestDescription && deliveredPattern.test(args.latestDescription)) {
    return "delivered";
  }

  if (args.events.some((event) => exceptionPattern.test(event.description))) {
    return "exception";
  }

  if (args.neededBy?.isValid && args.predictedP90?.isValid) {
    if (args.predictedP90 > args.neededBy) {
      return "delayed";
    }

    if (args.neededBy.diff(args.predictedP90, "hours").hours <= 12) {
      return "at_risk";
    }
  }

  const latestEvent = args.events.at(-1);
  if (latestEvent) {
    const ageHours = args.now.diff(DateTime.fromISO(latestEvent.timestamp, { setZone: true }).setZone("Asia/Kolkata"), "hours").hours;
    if (ageHours >= 36) {
      return "stuck";
    }
  }

  return "on_track";
}

/**
 * Produces an LLM-friendly explanation string.
 */
function buildReasoning(args: {
  raw: RawTrackingResult;
  latestEvent: RawTrackingResult["events"][number] | undefined;
  eta: EtaEstimate;
  neededBy?: DateTime;
  bufferHours?: number;
  delivered: boolean;
  status: ShipmentStatus["status"];
}): string {
  if (!args.latestEvent) {
    return `No carrier scans were visible for ${args.raw.carrier}. The result is conservative and marked unknown because the portal returned no usable events.`;
  }

  const latestAt = DateTime.fromISO(args.latestEvent.timestamp, { setZone: true }).setZone("Asia/Kolkata");
  const ageHours = latestAt.isValid
    ? Math.round(DateTime.now().setZone("Asia/Kolkata").diff(latestAt, "hours").hours)
    : undefined;
  const base = `Currently at ${args.latestEvent.location} with latest scan "${args.latestEvent.description}"${ageHours !== undefined ? ` from about ${ageHours} hours ago` : ""}.`;
  if (args.delivered) {
    return `${base} The shipment is already delivered, so no forward delivery estimate is returned.`;
  }

  const carrierExpectedDelivery = args.raw.expected_delivery_date
    ? DateTime.fromISO(args.raw.expected_delivery_date, { setZone: true }).setZone("Asia/Kolkata")
    : undefined;
  const etaSentence =
    carrierExpectedDelivery?.isValid
      ? `Carrier-provided expected delivery is ${carrierExpectedDelivery.toFormat("dd LLL yyyy")} with supporting route timing from ${args.eta.basis === "historical_data" ? "seeded route data" : args.eta.basis === "heuristic" ? "route heuristics" : "carrier defaults"}.`
      : `Estimated delivery window is ${args.eta.p50_hours}-${args.eta.p90_hours} hours based on ${args.eta.basis === "historical_data" ? "seeded route data" : args.eta.basis === "heuristic" ? "route heuristics" : "carrier defaults"}.`;

  if (args.neededBy?.isValid && args.bufferHours !== undefined) {
    const deadlineSentence =
      args.status === "delayed"
        ? `The p90 estimate misses the ${args.neededBy.toFormat("dd LLL yyyy HH:mm")} deadline by about ${Math.abs(Math.round(args.bufferHours))} hours.`
        : `The delivery buffer versus the ${args.neededBy.toFormat("dd LLL yyyy HH:mm")} deadline is about ${Math.round(args.bufferHours)} hours.`;
    return `${base} ${etaSentence} ${deadlineSentence}`;
  }

  return `${base} ${etaSentence}`;
}

/**
 * Builds a delivery window, preferring carrier-provided EDD when available.
 */
function buildPredictedDelivery(args: {
  latestTimestamp: DateTime | undefined;
  now: DateTime;
  eta: EtaEstimate;
  carrierExpectedDelivery?: DateTime;
  fetchedAt: string;
}) {
  if (args.carrierExpectedDelivery?.isValid) {
    const carrierDate = args.carrierExpectedDelivery;
    const p50 = carrierDate.set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
    const p90 = carrierDate.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
    return {
      p50: p50.toISO() ?? args.fetchedAt,
      p90: p90.toISO() ?? args.fetchedAt,
      confidence: Math.max(args.eta.confidence, 0.74),
      basis: args.eta.basis,
      carrier_expected_delivery: carrierDate.toISO() ?? args.fetchedAt
    };
  }

  const anchor = args.latestTimestamp ?? args.now;
  return {
    p50: anchor.plus({ hours: args.eta.p50_hours }).toISO() ?? args.fetchedAt,
    p90: anchor.plus({ hours: args.eta.p90_hours }).toISO() ?? args.fetchedAt,
    confidence: args.eta.confidence,
    basis: args.eta.basis
  };
}
