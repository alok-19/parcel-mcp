import awbPatterns from "../../data/awb_patterns.json" with { type: "json" };
import type { CarrierSlug } from "../types.js";

interface PatternConfig {
  regex: string;
  confidence: number;
}

interface CarrierPatternConfig {
  display_name: string;
  patterns: PatternConfig[];
}

const configs = awbPatterns as Record<CarrierSlug, CarrierPatternConfig>;

/**
 * Result of carrier auto-detection.
 */
export interface CarrierDetectionResult {
  carrier: CarrierSlug | "unknown";
  confidence: number;
  alternatives: Array<{ carrier: CarrierSlug; confidence: number }>;
}

/**
 * Detects the most likely carrier from an AWB format.
 */
export function detectCarrierByAwb(awb: string): CarrierDetectionResult {
  const cleaned = awb.trim().toUpperCase();
  const matches = Object.entries(configs)
    .flatMap(([carrier, config]) =>
      config.patterns
        .filter((pattern) => new RegExp(pattern.regex).test(cleaned))
        .map((pattern) => ({
          carrier: carrier as CarrierSlug,
          confidence: pattern.confidence
        }))
    )
    .sort((left, right) => right.confidence - left.confidence);

  if (matches.length === 0) {
    return { carrier: "unknown", confidence: 0, alternatives: [] };
  }

  return {
    carrier: matches[0]!.carrier,
    confidence: matches[0]!.confidence,
    alternatives: matches.slice(1, 4)
  };
}
