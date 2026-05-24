import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtureHtml = `<html><body><div>Status: In Transit</div><table>
<tr><td>22/05/2026 10:30</td><td>Muzaffarpur</td><td>Shipment Picked Up</td></tr>
<tr><td>23/05/2026 21:10</td><td>Delhi Hub</td><td>Forwarded to Destination</td></tr>
</table></body></html>`;

describe("watch monitoring refresh", () => {
  let tempDir: string;
  let previousDbPath: string | undefined;
  let previousLegacyDbPath: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "parcel-watch-"));
    previousDbPath = process.env.PARCEL_MCP_DB_PATH;
    previousLegacyDbPath = process.env.BHARAT_LOGISTICS_DB_PATH;
    process.env.PARCEL_MCP_DB_PATH = join(tempDir, "watch.sqlite");
    delete process.env.BHARAT_LOGISTICS_DB_PATH;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (previousDbPath === undefined) {
      delete process.env.PARCEL_MCP_DB_PATH;
    } else {
      process.env.PARCEL_MCP_DB_PATH = previousDbPath;
    }
    if (previousLegacyDbPath === undefined) {
      delete process.env.BHARAT_LOGISTICS_DB_PATH;
    } else {
      process.env.BHARAT_LOGISTICS_DB_PATH = previousLegacyDbPath;
    }
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("refreshes watches and persists the latest monitoring state", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const value = String(input);
      if (value.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /");
      }
      return new Response(fixtureHtml, { status: 200 });
    });

    const { watchShipmentTool, listWatchesTool, refreshWatchesTool } = await import("../src/tools/watchlist.js");
    const created = await watchShipmentTool({
      awb: "1234567893",
      needed_by: "2026-05-26T12:00:00+05:30",
      label: "Visa docs"
    });

    const refreshed = await refreshWatchesTool({ watch_id: created.watch_id });
    expect(refreshed.watches).toHaveLength(1);
    expect(refreshed.watches[0]?.status?.status).toBe("delayed");
    expect(refreshed.watches[0]?.changed).toBe(true);

    const watches = await listWatchesTool();
    expect(watches[0]?.last_status).toBe("delayed");
    expect(watches[0]?.last_phase).toBe("in_transit");
    expect(watches[0]?.last_location).toBe("Delhi Hub");
    expect(watches[0]?.consecutive_failures).toBe(0);
  });

  it("records refresh failures without crashing the batch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("network down");
    });

    const { watchShipmentTool, listWatchesTool, refreshWatchesTool } = await import("../src/tools/watchlist.js");
    const created = await watchShipmentTool({
      awb: "1234567891",
      label: "Failure case"
    });

    const refreshed = await refreshWatchesTool({ watch_id: created.watch_id });
    expect(refreshed.watches[0]?.status?.status).toBe("unknown");
    expect(refreshed.watches[0]?.error).toBeUndefined();

    const watches = await listWatchesTool();
    expect(watches[0]?.last_error).toContain("temporarily unavailable");
    expect(watches[0]?.consecutive_failures).toBe(0);
  });

  it("persists unknown tracking results without counting them as refresh failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const value = String(input);
      if (value.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /");
      }
      return new Response("<html><body>No records found</body></html>", { status: 200 });
    });

    const { watchShipmentTool, listWatchesTool, refreshWatchesTool } = await import("../src/tools/watchlist.js");
    const created = await watchShipmentTool({
      awb: "1234567893",
      label: "Unknown case"
    });

    const refreshed = await refreshWatchesTool({ watch_id: created.watch_id });
    expect(refreshed.watches[0]?.status?.status).toBe("unknown");
    expect(refreshed.watches[0]?.error).toBeUndefined();

    const watches = await listWatchesTool();
    expect(watches[0]?.last_status).toBe("unknown");
    expect(watches[0]?.last_error).toContain("no matching events");
    expect(watches[0]?.consecutive_failures).toBe(0);
  });

  it("throws when a requested watch_id does not exist", async () => {
    const { refreshWatchesTool } = await import("../src/tools/watchlist.js");

    await expect(refreshWatchesTool({ watch_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(
      "was not found"
    );
  });
});
