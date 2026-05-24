import type { CarrierAdapter } from "./base.js";
import { BlueDartAdapter } from "./bluedart.js";
import { DelhiveryAdapter } from "./delhivery.js";
import { DtdcAdapter } from "./dtdc.js";
import { IndiaPostAdapter } from "./india_post.js";
import type { CarrierSlug } from "../types.js";

const adapters: CarrierAdapter[] = [
  new BlueDartAdapter(),
  new DtdcAdapter(),
  new DelhiveryAdapter(),
  new IndiaPostAdapter()
];

/**
 * Returns all registered Phase 1 carrier adapters.
 */
export function getAllAdapters(): CarrierAdapter[] {
  return adapters;
}

/**
 * Returns a carrier adapter by slug if available.
 */
export function getAdapterByName(carrier: CarrierSlug): CarrierAdapter | undefined {
  return adapters.find((adapter) => adapter.name === carrier);
}

/**
 * Resolves the best adapter for an AWB when no explicit carrier is given.
 */
export function findMatchingAdapters(awb: string): CarrierAdapter[] {
  return adapters.filter((adapter) => adapter.matches(awb)).sort((a, b) => b.matchConfidence(awb) - a.matchConfidence(awb));
}
