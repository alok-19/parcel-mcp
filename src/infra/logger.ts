import pino from "pino";

/**
 * Shared structured logger that writes to stderr to avoid corrupting stdio MCP transport.
 */
export const logger = pino(
  {
    name: "indian-parcel-mcp",
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: ["awb", "*.awb", "args.awb"],
      censor: "[redacted]"
    }
  },
  pino.destination(2)
);
