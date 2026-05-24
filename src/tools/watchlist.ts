import { watchDatabase } from "../infra/db.js";
import { observabilityStore } from "../infra/observability.js";
import { detectAnomalies } from "../intelligence/anomaly_detector.js";
import { detectCarrierByAwb } from "../intelligence/awb_detector.js";
import { trackShipmentTool } from "./track_shipment.js";

/**
 * Adds a shipment watch to SQLite-backed storage.
 */
export async function watchShipmentTool(input: {
  awb: string;
  needed_by?: string;
  label?: string;
}) {
  const detection = detectCarrierByAwb(input.awb);
  const carrier = detection.carrier === "unknown" ? "unknown" : detection.carrier;
  const watch = watchDatabase.addWatch({
    awb: input.awb.trim().toUpperCase(),
    carrier,
    ...(input.needed_by ? { needed_by: input.needed_by } : {}),
    ...(input.label ? { label: input.label } : {})
  });

  return { watch_id: watch.watch_id };
}

/**
 * Lists all persisted watches.
 */
export async function listWatchesTool() {
  return watchDatabase.listWatches();
}

/**
 * Removes a persisted watch by ID.
 */
export async function removeWatchTool(input: { watch_id: string }) {
  return { removed: watchDatabase.removeWatch(input.watch_id) };
}

/**
 * Refreshes one watch or all watches and persists the latest monitoring state.
 */
export async function refreshWatchesTool(input: { watch_id?: string }) {
  const targetedWatch = input.watch_id ? watchDatabase.getWatch(input.watch_id) : undefined;
  if (input.watch_id && !targetedWatch) {
    throw new Error(`Watch ${input.watch_id} was not found.`);
  }

  const watches = targetedWatch ? [targetedWatch] : watchDatabase.listWatches();

  const checkedAt = new Date().toISOString();
  let changedCount = 0;
  let failureCount = 0;

  const results = [];
  for (const watch of watches) {
    try {
      const status = await trackShipmentTool({
        awb: watch.awb,
        ...(watch.carrier !== "unknown" ? { carrier: watch.carrier as "bluedart" | "dtdc" | "delhivery" | "india_post" } : {}),
        ...(watch.needed_by ? { needed_by: watch.needed_by } : {})
      });
      const anomalies = detectAnomalies(status);
      const changed =
        watch.last_status !== status.status ||
        watch.last_phase !== status.normalized_phase ||
        watch.last_location !== status.current_location ||
        watch.last_scan_at !== status.last_scan_at;

      if (changed) {
        changedCount += 1;
      }

      const watchUpdate: Parameters<typeof watchDatabase.updateWatchStatus>[0] = {
        watchId: watch.watch_id,
        status: status.status,
        checkedAt,
        consecutiveFailures: 0
      };
      if (status.normalized_phase) {
        watchUpdate.phase = status.normalized_phase;
      }
      if (status.current_location) {
        watchUpdate.location = status.current_location;
      }
      if (status.last_scan_at) {
        watchUpdate.lastScanAt = status.last_scan_at;
      }
      watchUpdate.reasoning = status.reasoning;
      if (status.status === "unknown") {
        watchUpdate.error = status.reasoning;
      }
      if (changed) {
        watchUpdate.changedAt = checkedAt;
      } else if (watch.last_change_at) {
        watchUpdate.changedAt = watch.last_change_at;
      }

      watchDatabase.updateWatchStatus(watchUpdate);

      results.push({
        watch_id: watch.watch_id,
        awb: watch.awb,
        carrier: watch.carrier,
        ...(watch.label ? { label: watch.label } : {}),
        checked_at: checkedAt,
        changed,
        status,
        anomalies
      });
    } catch (error) {
      failureCount += 1;
      const message = error instanceof Error ? error.message : "Unknown refresh failure";
      watchDatabase.updateWatchFailure({
        watchId: watch.watch_id,
        checkedAt,
        error: message,
        consecutiveFailures: (watch.consecutive_failures ?? 0) + 1
      });
      results.push({
        watch_id: watch.watch_id,
        awb: watch.awb,
        carrier: watch.carrier,
        ...(watch.label ? { label: watch.label } : {}),
        checked_at: checkedAt,
        changed: false,
        anomalies: [],
        error: message
      });
    }
  }

  observabilityStore.recordWatchRefresh({
    checked: results.length,
    changed: changedCount,
    failures: failureCount
  }, checkedAt);

  return {
    refreshed_at: checkedAt,
    watches: results
  };
}
