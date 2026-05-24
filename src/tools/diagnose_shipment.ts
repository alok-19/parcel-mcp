import { detectAnomalies } from "../intelligence/anomaly_detector.js";
import { buildEscalationPlaybook } from "../intelligence/escalation.js";
import { trackShipmentTool } from "./track_shipment.js";
import type { CarrierSlug } from "../types.js";

/**
 * Deep diagnosis tool that builds on the main shipment tracking flow.
 */
export async function diagnoseShipmentTool(input: {
  awb: string;
  carrier?: CarrierSlug;
  needed_by?: string;
  purpose?: string;
}) {
  const status = await trackShipmentTool({
    awb: input.awb,
    ...(input.carrier ? { carrier: input.carrier } : {}),
    ...(input.needed_by ? { needed_by: input.needed_by } : {}),
    ...(input.purpose ? { purpose: input.purpose } : {})
  });
  const anomalies = detectAnomalies(status);
  const escalation_playbook = buildEscalationPlaybook({
    status,
    ...(input.purpose ? { purpose: input.purpose } : {})
  });
  const reasoning =
    anomalies.length === 0
      ? `No major anomaly rules fired. ${status.reasoning}`
      : `Detected ${anomalies.length} anomaly signal(s): ${anomalies.map((anomaly) => anomaly.type).join(", ")}. ${status.reasoning}`;

  return {
    status,
    anomalies,
    escalation_playbook,
    reasoning
  };
}
