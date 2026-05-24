import slaSeed from "../../data/sla_seed.json" with { type: "json" };
import type { CarrierSlug, EtaEstimate } from "../types.js";

interface ServiceEstimate {
  p50_hours: number;
  p90_hours: number;
}

interface RouteRecord {
  origin_pin: string;
  destination_pin: string;
  origin_city: string;
  destination_city: string;
  carriers: Partial<Record<CarrierSlug, Record<string, ServiceEstimate>>>;
  sample_size: number;
  source: string;
}

const defaultCarrierHours: Record<CarrierSlug, ServiceEstimate> = {
  bluedart: { p50_hours: 48, p90_hours: 72 },
  dtdc: { p50_hours: 72, p90_hours: 108 },
  delhivery: { p50_hours: 60, p90_hours: 96 },
  india_post: { p50_hours: 84, p90_hours: 132 }
};

const routes = (slaSeed as { routes: RouteRecord[] }).routes;
const cityAliases = new Map<string, string>([
  ["kanti", "muzaffarpur"],
  ["bangalore", "bengaluru"],
  ["new delhi", "delhi"]
]);

/**
 * Looks up route ETA heuristics using exact and state-pair fallbacks.
 */
export function lookupEta(args: {
  carrier: CarrierSlug;
  originPin?: string;
  destinationPin?: string;
  originCity?: string;
  destinationCity?: string;
  serviceType?: string;
}): EtaEstimate {
  const serviceType = normalizeServiceType(args.serviceType, args.carrier);
  const originPin = args.originPin;
  const destinationPin = args.destinationPin;

  if (originPin && destinationPin) {
    const exact = routes.find(
      (route) =>
        route.origin_pin === originPin &&
        route.destination_pin === destinationPin &&
        route.carriers[args.carrier]?.[serviceType]
    );
    if (exact) {
      const estimate = exact.carriers[args.carrier]![serviceType]!;
      return {
        ...estimate,
        service_type: serviceType,
        basis: "historical_data",
        confidence: 0.82,
        sourceNote: `Seeded route estimate for ${exact.origin_city} -> ${exact.destination_city}.`
      };
    }

    const statePair = routes.find(
      (route) =>
        route.origin_pin.slice(0, 2) === originPin.slice(0, 2) &&
        route.destination_pin.slice(0, 2) === destinationPin.slice(0, 2) &&
        route.carriers[args.carrier]?.[serviceType]
    );
    if (statePair) {
      const estimate = statePair.carriers[args.carrier]![serviceType]!;
      return {
        p50_hours: Math.round(estimate.p50_hours * 1.1),
        p90_hours: Math.round(estimate.p90_hours * 1.15),
        service_type: serviceType,
        basis: "heuristic",
        confidence: 0.64,
        sourceNote: `State-pair fallback derived from ${statePair.origin_city} -> ${statePair.destination_city}.`
      };
    }
  }

  const originCity = normalizeCity(args.originCity);
  const destinationCity = normalizeCity(args.destinationCity);
  if (originCity && destinationCity) {
    const exactCity = routes.find(
      (route) =>
        normalizeCity(route.origin_city) === originCity &&
        normalizeCity(route.destination_city) === destinationCity &&
        route.carriers[args.carrier]?.[serviceType]
    );
    if (exactCity) {
      const estimate = exactCity.carriers[args.carrier]![serviceType]!;
      return {
        ...estimate,
        service_type: serviceType,
        basis: "heuristic",
        confidence: 0.7,
        sourceNote: `City-pair fallback derived from ${exactCity.origin_city} -> ${exactCity.destination_city}.`
      };
    }
  }

  const fallback = defaultCarrierHours[args.carrier];
  return {
    ...fallback,
    service_type: serviceType,
    basis: "default",
    confidence: 0.48,
    sourceNote: `Default ${args.carrier} average because no route-specific estimate was available.`
  };
}

/**
 * Normalizes service names to seeded keys.
 */
function normalizeServiceType(serviceType: string | undefined, carrier: CarrierSlug): string {
  if (!serviceType) {
    if (carrier === "india_post") {
      return "speedpost";
    }
    if (carrier === "delhivery") {
      return "express";
    }
    if (carrier === "dtdc") {
      return "premium";
    }
    return "critical_express";
  }

  return serviceType.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Exposes default carrier ETA for tests and reasoning.
 */
export function getDefaultCarrierEta(carrier: CarrierSlug): ServiceEstimate {
  return defaultCarrierHours[carrier];
}

/**
 * Normalizes city names for route matching and folds a few carrier-local aliases.
 */
function normalizeCity(city: string | undefined): string | undefined {
  if (!city) {
    return undefined;
  }

  const normalized = city.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
  return cityAliases.get(normalized) ?? normalized;
}
