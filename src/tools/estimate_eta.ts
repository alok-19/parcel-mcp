import { lookupEta } from "../intelligence/sla_lookup.js";
import type { CarrierSlug } from "../types.js";

/**
 * Tool implementation for route-only ETA estimation.
 */
export async function estimateEtaTool(input: {
  carrier: CarrierSlug;
  origin_pincode: string;
  destination_pincode: string;
  service_type?: string;
}) {
  const estimate = lookupEta({
    carrier: input.carrier,
    originPin: input.origin_pincode,
    destinationPin: input.destination_pincode,
    ...(input.service_type ? { serviceType: input.service_type } : {})
  });

  return {
    p50_hours: estimate.p50_hours,
    p90_hours: estimate.p90_hours,
    basis: estimate.basis
  };
}
