import contacts from "../../data/carrier_contacts.json" with { type: "json" };
import type { CarrierSlug, EscalationStep, ShipmentStatus } from "../types.js";

interface CarrierContactConfig {
  playbook_template: EscalationStep[];
}

const contactConfig = contacts as Record<CarrierSlug, CarrierContactConfig & Record<string, unknown>>;

/**
 * Generates a carrier-specific escalation playbook for risky shipments.
 */
export function buildEscalationPlaybook(args: {
  status: ShipmentStatus;
  purpose?: string;
}): EscalationStep[] {
  if (!["stuck", "at_risk", "delayed", "exception"].includes(args.status.status)) {
    return [];
  }

  const config = contactConfig[args.status.carrier as CarrierSlug];
  if (!config) {
    return [];
  }

  const lastEvent = args.status.events.at(-1);
  const replacements: Record<string, string> = {
    awb: args.status.awb,
    social_safe_awb: redactAwb(args.status.awb),
    last_location: lastEvent?.location ?? args.status.current_location ?? "unknown location",
    last_scan_time: lastEvent?.timestamp ?? args.status.last_scan_at ?? "unknown time",
    needed_by: args.status.needed_by ?? "no explicit deadline provided",
    purpose: args.purpose ?? "an urgent shipment"
  };

  return config.playbook_template.map((step) => ({
    ...step,
    contact: step.contact ? interpolate(step.contact, replacements) : step.contact,
    script: step.script ? interpolate(step.script, replacements) : step.script
  }));
}

/**
 * Masks an AWB for public escalation output.
 */
function redactAwb(awb: string): string {
  if (awb.length <= 4) {
    return "***";
  }

  return `${awb.slice(0, 2)}***${awb.slice(-2)}`;
}

/**
 * Replaces playbook placeholders with runtime values.
 */
function interpolate(template: string, replacements: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => replacements[key] ?? "");
}
