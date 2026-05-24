import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { NormalizedPhase, ShipmentStatus, Watch } from "../types.js";

const DEFAULT_DB_PATH = resolve(process.cwd(), "parcel.sqlite");

/**
 * SQLite-backed persistence for Phase 1 watchlist state.
 */
export class WatchDatabase {
  private readonly db: Database.Database;

  constructor(dbPath = process.env.PARCEL_MCP_DB_PATH ?? process.env.BHARAT_LOGISTICS_DB_PATH ?? DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  /**
   * Returns the underlying database path for transparency.
   */
  get path(): string {
    return this.db.name;
  }

  /**
   * Inserts a watch row and returns its public representation.
   */
  addWatch(input: {
    awb: string;
    carrier: string;
    label?: string;
    needed_by?: string;
  }): Watch {
    const addedAt = new Date().toISOString();
    const watchId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO watches (
          watch_id, awb, carrier, label, needed_by, added_at, last_status, last_phase,
          last_location, last_scan_at, last_reasoning, last_error, last_change_at, last_checked_at, consecutive_failures
        ) VALUES (
          @watch_id, @awb, @carrier, @label, @needed_by, @added_at, NULL, NULL,
          NULL, NULL, NULL, NULL, NULL, NULL, 0
        )`
      )
      .run({
        watch_id: watchId,
        awb: input.awb,
        carrier: input.carrier,
        label: input.label ?? null,
        needed_by: input.needed_by ?? null,
        added_at: addedAt
      });

    return {
      watch_id: watchId,
      awb: input.awb,
      carrier: input.carrier,
      label: input.label,
      needed_by: input.needed_by,
      added_at: addedAt
    };
  }

  /**
   * Lists all watches ordered by creation time.
   */
  listWatches(): Watch[] {
    const rows = this.db
      .prepare(
        `SELECT watch_id, awb, carrier, label, needed_by, added_at, last_status, last_checked_at
                , last_phase, last_location, last_scan_at, last_reasoning, last_error, last_change_at, consecutive_failures
         FROM watches
         ORDER BY added_at ASC`
      )
      .all() as Array<Record<string, string | null>>;

    return rows.map((row) => ({
      watch_id: row.watch_id ?? "",
      awb: row.awb ?? "",
      carrier: row.carrier ?? "",
      label: row.label ?? undefined,
      needed_by: row.needed_by ?? undefined,
      added_at: row.added_at ?? "",
      last_status: (row.last_status as ShipmentStatus["status"] | null) ?? undefined,
      last_phase: (row.last_phase as NormalizedPhase | null) ?? undefined,
      last_location: row.last_location ?? undefined,
      last_scan_at: row.last_scan_at ?? undefined,
      last_reasoning: row.last_reasoning ?? undefined,
      last_error: row.last_error ?? undefined,
      last_change_at: row.last_change_at ?? undefined,
      last_checked_at: row.last_checked_at ?? undefined,
      consecutive_failures: row.consecutive_failures ? Number(row.consecutive_failures) : 0
    }));
  }

  /**
   * Returns a single watch by ID if present.
   */
  getWatch(watchId: string): Watch | undefined {
    const row = this.db
      .prepare(
        `SELECT watch_id, awb, carrier, label, needed_by, added_at, last_status, last_checked_at
                , last_phase, last_location, last_scan_at, last_reasoning, last_error, last_change_at, consecutive_failures
         FROM watches
         WHERE watch_id = ?`
      )
      .get(watchId) as Record<string, string | number | null> | undefined;

    if (!row) {
      return undefined;
    }

    return {
      watch_id: String(row.watch_id ?? ""),
      awb: String(row.awb ?? ""),
      carrier: String(row.carrier ?? ""),
      label: row.label ? String(row.label) : undefined,
      needed_by: row.needed_by ? String(row.needed_by) : undefined,
      added_at: String(row.added_at ?? ""),
      last_status: row.last_status ? String(row.last_status) as Watch["last_status"] : undefined,
      last_phase: row.last_phase ? String(row.last_phase) as Watch["last_phase"] : undefined,
      last_location: row.last_location ? String(row.last_location) : undefined,
      last_scan_at: row.last_scan_at ? String(row.last_scan_at) : undefined,
      last_reasoning: row.last_reasoning ? String(row.last_reasoning) : undefined,
      last_error: row.last_error ? String(row.last_error) : undefined,
      last_change_at: row.last_change_at ? String(row.last_change_at) : undefined,
      last_checked_at: row.last_checked_at ? String(row.last_checked_at) : undefined,
      consecutive_failures: Number(row.consecutive_failures ?? 0)
    };
  }

  /**
   * Removes a watch by ID.
   */
  removeWatch(watchId: string): boolean {
    const result = this.db.prepare("DELETE FROM watches WHERE watch_id = ?").run(watchId);
    return result.changes > 0;
  }

  /**
   * Updates denormalized watch summary fields.
   */
  updateWatchStatus(input: {
    watchId: string;
    status: string;
    phase?: string;
    location?: string;
    lastScanAt?: string;
    reasoning?: string;
    checkedAt: string;
    changedAt?: string;
    error?: string;
    consecutiveFailures: number;
  }): void {
    this.db
      .prepare(
        `UPDATE watches
         SET last_status = @status,
             last_phase = @last_phase,
             last_location = @last_location,
             last_scan_at = @last_scan_at,
             last_reasoning = @last_reasoning,
             last_error = @last_error,
             last_change_at = @last_change_at,
             last_checked_at = @last_checked_at,
             consecutive_failures = @consecutive_failures
         WHERE watch_id = @watch_id`
      )
      .run({
        watch_id: input.watchId,
        status: input.status,
        last_phase: input.phase ?? null,
        last_location: input.location ?? null,
        last_scan_at: input.lastScanAt ?? null,
        last_reasoning: input.reasoning ?? null,
        last_error: input.error ?? null,
        last_change_at: input.changedAt ?? null,
        last_checked_at: input.checkedAt,
        consecutive_failures: input.consecutiveFailures
      });
  }

  /**
   * Stores a failed refresh attempt for a watch.
   */
  updateWatchFailure(input: {
    watchId: string;
    checkedAt: string;
    error: string;
    consecutiveFailures: number;
  }): void {
    this.db
      .prepare(
        `UPDATE watches
         SET last_error = @last_error,
             last_checked_at = @last_checked_at,
             consecutive_failures = @consecutive_failures
         WHERE watch_id = @watch_id`
      )
      .run({
        watch_id: input.watchId,
        last_error: input.error,
        last_checked_at: input.checkedAt,
        consecutive_failures: input.consecutiveFailures
      });
  }

  /**
   * Ensures required tables exist.
   */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watches (
        watch_id TEXT PRIMARY KEY,
        awb TEXT NOT NULL,
        carrier TEXT NOT NULL,
        label TEXT,
        needed_by TEXT,
        added_at TEXT NOT NULL,
        last_status TEXT,
        last_phase TEXT,
        last_location TEXT,
        last_scan_at TEXT,
        last_reasoning TEXT,
        last_error TEXT,
        last_change_at TEXT,
        last_checked_at TEXT
        ,
        consecutive_failures INTEGER NOT NULL DEFAULT 0
      );
    `);

    const columns = this.db.prepare("PRAGMA table_info(watches)").all() as Array<{ name: string }>;
    const existing = new Set(columns.map((column) => column.name));
    const migrations: Array<[string, string]> = [
      ["last_phase", "ALTER TABLE watches ADD COLUMN last_phase TEXT"],
      ["last_location", "ALTER TABLE watches ADD COLUMN last_location TEXT"],
      ["last_scan_at", "ALTER TABLE watches ADD COLUMN last_scan_at TEXT"],
      ["last_reasoning", "ALTER TABLE watches ADD COLUMN last_reasoning TEXT"],
      ["last_error", "ALTER TABLE watches ADD COLUMN last_error TEXT"],
      ["last_change_at", "ALTER TABLE watches ADD COLUMN last_change_at TEXT"],
      ["consecutive_failures", "ALTER TABLE watches ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0"]
    ];

    for (const [name, statement] of migrations) {
      if (!existing.has(name)) {
        this.db.exec(statement);
      }
    }
  }
}

/**
 * Shared database singleton.
 */
export const watchDatabase = new WatchDatabase();
