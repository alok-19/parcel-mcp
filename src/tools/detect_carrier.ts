import { detectCarrierByAwb } from "../intelligence/awb_detector.js";

/**
 * Tool implementation for carrier detection.
 */
export async function detectCarrierTool(input: { awb: string }) {
  return detectCarrierByAwb(input.awb);
}
