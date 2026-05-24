import { DateTime } from "luxon";
import type { Anomaly, ShipmentStatus } from "../types.js";

/**
 * Runs the Phase 1 anomaly rules over a normalized shipment.
 */
export function detectAnomalies(status: ShipmentStatus): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = DateTime.now().setZone("Asia/Kolkata");
  const latest = status.events.at(-1);

  if (!latest) {
    return anomalies;
  }

  const latestAt = DateTime.fromISO(latest.timestamp);
  const ageHours = latestAt.isValid ? now.diff(latestAt, "hours").hours : 0;
  const inTransit = status.normalized_phase === "in_transit" || status.normalized_phase === "picked_up";

  if (inTransit && ageHours >= 48) {
    anomalies.push(makeAnomaly("stale_scan", "critical", `No fresh in-transit scan for ${Math.round(ageHours)} hours.`));
  } else if (inTransit && ageHours >= 24) {
    anomalies.push(makeAnomaly("stale_scan", "warning", `No fresh in-transit scan for ${Math.round(ageHours)} hours.`));
  }

  const first = status.events[0];
  if (first) {
    const firstAt = DateTime.fromISO(first.timestamp);
    const shipmentAge = firstAt.isValid ? now.diff(firstAt, "hours").hours : 0;
    if (shipmentAge >= 36 && status.events.length < 2) {
      anomalies.push(
        makeAnomaly("low_scan_density", "warning", "Fewer than two visible scans despite the shipment being active for over 36 hours.")
      );
    }
  }

  if (status.normalized_phase === "out_for_delivery" && ageHours > 12) {
    anomalies.push(
      makeAnomaly("stuck_out_for_delivery", "warning", `Shipment has been out for delivery for about ${Math.round(ageHours)} hours.`)
    );
  }

  if (status.events.some((event) => /return/i.test(event.description) && /origin|sender|booked/i.test(event.description))) {
    anomalies.push(
      makeAnomaly("returned_to_origin", "critical", "Carrier events suggest the shipment is being returned to origin.")
    );
  }

  if (status.events.some((event) => /exception|rto|undelivered|refused|failed/i.test(event.description))) {
    anomalies.push(
      makeAnomaly("exception_flag", "critical", "Carrier events include an exception, RTO, or delivery failure signal.")
    );
  }

  return anomalies;
}

/**
 * Builds a normalized anomaly record with current timestamp.
 */
function makeAnomaly(type: Anomaly["type"], severity: Anomaly["severity"], description: string): Anomaly {
  return {
    type,
    severity,
    description,
    detected_at: new Date().toISOString()
  };
}
