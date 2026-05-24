import { z } from "zod/v4";

/**
 * Canonical shipment status verdict returned to MCP clients.
 */
export const shipmentStatusEnum = z.enum([
  "on_track",
  "at_risk",
  "delayed",
  "stuck",
  "delivered",
  "exception",
  "unknown"
]);

/**
 * Canonical shipment lifecycle phase.
 */
export const normalizedPhaseEnum = z.enum([
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "rto",
  "exception",
  "unknown"
]);

/**
 * Supported carrier slugs for Phase 1.
 */
export const carrierSlugEnum = z.enum([
  "bluedart",
  "dtdc",
  "delhivery",
  "india_post"
]);

/**
 * Basis for ETA estimates.
 */
export const etaBasisEnum = z.enum(["historical_data", "heuristic", "default"]);

/**
 * Single normalized scan event.
 */
export const scanEventSchema = z.object({
  timestamp: z.string(),
  location: z.string(),
  status_code: z.string(),
  description: z.string()
});

/**
 * Structured delivery prediction window.
 */
export const predictedDeliverySchema = z.object({
  p50: z.string(),
  p90: z.string(),
  confidence: z.number().min(0).max(1),
  basis: etaBasisEnum,
  carrier_expected_delivery: z.string().optional()
});

/**
 * Tool response for shipment tracking.
 */
export const shipmentStatusSchema = z.object({
  awb: z.string(),
  carrier: z.string(),
  status: shipmentStatusEnum,
  normalized_phase: normalizedPhaseEnum.optional(),
  carrier_raw_status: z.string().optional(),
  current_location: z.string().optional(),
  last_scan_at: z.string().optional(),
  predicted_delivery: predictedDeliverySchema.optional(),
  needed_by: z.string().optional(),
  buffer_hours: z.number().optional(),
  events: z.array(scanEventSchema),
  reasoning: z.string(),
  fetched_at: z.string()
});

/**
 * Structured anomaly record.
 */
export const anomalySchema = z.object({
  type: z.enum([
    "stale_scan",
    "low_scan_density",
    "stuck_out_for_delivery",
    "returned_to_origin",
    "exception_flag"
  ]),
  severity: z.enum(["info", "warning", "critical"]),
  description: z.string(),
  detected_at: z.string()
});

/**
 * Structured escalation playbook step.
 */
export const escalationStepSchema = z.object({
  step: z.number().int().positive(),
  action: z.string(),
  channel: z.enum(["phone", "email", "web_form", "social"]),
  contact: z.string().optional(),
  script: z.string().optional(),
  expected_outcome: z.string(),
  wait_before_next_step_hours: z.number().optional()
});

/**
 * Persisted watch entry.
 */
export const watchSchema = z.object({
  watch_id: z.string(),
  awb: z.string(),
  carrier: z.string(),
  label: z.string().optional(),
  needed_by: z.string().optional(),
  added_at: z.string(),
  last_status: shipmentStatusEnum.optional(),
  last_phase: normalizedPhaseEnum.optional(),
  last_location: z.string().optional(),
  last_scan_at: z.string().optional(),
  last_reasoning: z.string().optional(),
  last_error: z.string().optional(),
  last_change_at: z.string().optional(),
  last_checked_at: z.string().optional(),
  consecutive_failures: z.number().int().nonnegative().optional()
});

/**
 * Result row returned when refreshing monitored watches.
 */
export const watchRefreshItemSchema = z.object({
  watch_id: z.string(),
  awb: z.string(),
  carrier: z.string(),
  label: z.string().optional(),
  checked_at: z.string(),
  changed: z.boolean(),
  status: shipmentStatusSchema.optional(),
  anomalies: z.array(anomalySchema),
  error: z.string().optional()
});

/**
 * In-memory observability stats for a single carrier.
 */
export const carrierObservabilitySchema = z.object({
  carrier: z.string(),
  success_count: z.number().int().nonnegative(),
  live_success_count: z.number().int().nonnegative(),
  cache_hit_count: z.number().int().nonnegative(),
  failure_count: z.number().int().nonnegative(),
  rate_limited_count: z.number().int().nonnegative(),
  parse_error_count: z.number().int().nonnegative(),
  unavailable_count: z.number().int().nonnegative(),
  not_found_count: z.number().int().nonnegative(),
  unexpected_error_count: z.number().int().nonnegative(),
  last_success_at: z.string().optional(),
  last_failure_at: z.string().optional()
});

/**
 * Recent parser-drift incidents captured from live carrier responses.
 */
export const parserDriftIncidentSchema = z.object({
  carrier: z.string(),
  parser: z.string(),
  detail: z.string(),
  observed_at: z.string()
});

/**
 * Monitoring refresh summary counters.
 */
export const watchRefreshSummarySchema = z.object({
  total_runs: z.number().int().nonnegative(),
  shipments_checked: z.number().int().nonnegative(),
  changed_shipments: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  last_run_at: z.string().optional()
});

/**
 * Structured observability snapshot for quick health inspection.
 */
export const observabilitySnapshotSchema = z.object({
  carriers: z.array(carrierObservabilitySchema),
  recent_parser_drift: z.array(parserDriftIncidentSchema),
  watch_refresh: watchRefreshSummarySchema
});

/**
 * Carrier parser event with internal raw timestamp detail.
 */
export interface ParsedCarrierEvent extends ScanEvent {
  rawTimestampText?: string;
}

/**
 * Raw carrier adapter result before reasoning.
 */
export interface RawTrackingResult {
  awb: string;
  carrier: CarrierSlug;
  raw_status?: string;
  current_location?: string;
  origin_city?: string;
  destination_city?: string;
  expected_delivery_date?: string;
  events: ParsedCarrierEvent[];
  fetched_at: string;
  liveSupported: boolean;
  source: "live" | "fixture";
  notes?: string[];
}

/**
 * Output from ETA lookup logic.
 */
export interface EtaEstimate {
  p50_hours: number;
  p90_hours: number;
  basis: EtaBasis;
  confidence: number;
  service_type?: string;
  sourceNote: string;
}

/**
 * Supported anomaly record.
 */
export type Anomaly = z.infer<typeof anomalySchema>;

/**
 * Canonical carrier slug.
 */
export type CarrierSlug = z.infer<typeof carrierSlugEnum>;

/**
 * Basis for ETA estimates.
 */
export type EtaBasis = z.infer<typeof etaBasisEnum>;

/**
 * Normalized shipment phase.
 */
export type NormalizedPhase = z.infer<typeof normalizedPhaseEnum>;

/**
 * Scan event type.
 */
export type ScanEvent = z.infer<typeof scanEventSchema>;

/**
 * Escalation step type.
 */
export type EscalationStep = z.infer<typeof escalationStepSchema>;

/**
 * Shipment status tool return type.
 */
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

/**
 * Watch row type.
 */
export type Watch = z.infer<typeof watchSchema>;

/**
 * Watch refresh row type.
 */
export type WatchRefreshItem = z.infer<typeof watchRefreshItemSchema>;

/**
 * Tool input for shipment tracking.
 */
export const trackShipmentInputSchema = {
  awb: z.string().trim().min(1).describe("Shipment AWB or tracking number"),
  carrier: carrierSlugEnum.optional().describe("Optional explicit carrier slug"),
  needed_by: z.string().datetime({ offset: true }).optional().describe("Deadline in ISO 8601 format"),
  purpose: z.string().trim().max(280).optional().describe("Why the shipment matters"),
  origin_pincode: z.string().regex(/^\d{6}$/).optional().describe("Origin PIN code"),
  destination_pincode: z.string().regex(/^\d{6}$/).optional().describe("Destination PIN code")
};

/**
 * Tool input for carrier detection.
 */
export const detectCarrierInputSchema = {
  awb: z.string().trim().min(1).describe("Shipment AWB or tracking number")
};

/**
 * Tool input for ETA estimation.
 */
export const estimateEtaInputSchema = {
  carrier: carrierSlugEnum.describe("Carrier slug"),
  origin_pincode: z.string().regex(/^\d{6}$/).describe("Origin PIN code"),
  destination_pincode: z.string().regex(/^\d{6}$/).describe("Destination PIN code"),
  service_type: z.string().trim().max(64).optional().describe("Optional service class")
};

/**
 * Tool input for shipment diagnosis.
 */
export const diagnoseShipmentInputSchema = {
  awb: z.string().trim().min(1).describe("Shipment AWB or tracking number"),
  carrier: carrierSlugEnum.optional().describe("Optional explicit carrier slug"),
  needed_by: z.string().datetime({ offset: true }).optional().describe("Deadline in ISO 8601 format"),
  purpose: z.string().trim().max(280).optional().describe("Why the shipment matters")
};

/**
 * Tool input for adding a watch.
 */
export const watchShipmentInputSchema = {
  awb: z.string().trim().min(1).describe("Shipment AWB or tracking number"),
  needed_by: z.string().datetime({ offset: true }).optional().describe("Deadline in ISO 8601 format"),
  label: z.string().trim().max(120).optional().describe("Short local label for the watch")
};

/**
 * Tool input for removing a watch.
 */
export const removeWatchInputSchema = {
  watch_id: z.string().uuid().describe("Watch identifier")
};

/**
 * Tool input for refreshing one watch or all watches.
 */
export const refreshWatchesInputSchema = {
  watch_id: z.string().uuid().optional().describe("Optional watch identifier to refresh just one watch")
};
