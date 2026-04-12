import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_PATH || path.join(dataDir, "rentout.sqlite");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const ddl = [
  `CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL UNIQUE,
      name TEXT,
      asset_class TEXT NOT NULL,
      construction_year INTEGER,
      total_units INTEGER NOT NULL,
      address_line TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      unit_number TEXT NOT NULL,
      key_return_status TEXT,
      unit_health_audit_score REAL,
      archive_readiness INTEGER DEFAULT 0,
      UNIQUE(asset_id, unit_number)
    )`,
  `CREATE TABLE IF NOT EXISTS maintenance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      open_tickets INTEGER NOT NULL DEFAULT 0,
      unresolved_damages INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      prior_tenant_name TEXT,
      prior_tenant_external_id TEXT,
      lease_ended_date TEXT,
      term_of_occupancy_months INTEGER,
      rent_payment_schedule TEXT,
      early_exit_clause TEXT,
      pet_addendum TEXT,
      parking_stalls TEXT,
      storage_units TEXT,
      custom_clauses TEXT,
      status TEXT DEFAULT 'ended'
    )`,
  `CREATE TABLE IF NOT EXISTS workflow_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      step_total INTEGER NOT NULL,
      status TEXT NOT NULL,
      neural_load REAL,
      cpu_load REAL,
      meta TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS cache_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      l1_pct REAL NOT NULL,
      l2_pct REAL NOT NULL,
      l3_pct REAL NOT NULL,
      memory_usage_mb REAL,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS seo_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_name TEXT NOT NULL,
      local_seo_score REAL NOT NULL,
      distribution_pct REAL NOT NULL,
      listing_completeness REAL NOT NULL,
      keyword_clusters TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submarket_id TEXT NOT NULL,
      submarket_label TEXT,
      market_avg_rent REAL,
      occupancy_avg_pct REAL,
      market_heat_score REAL,
      source TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS demographic_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radius_miles REAL,
      average_hhi REAL,
      vacancy_rate_pct REAL,
      source TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    )`,
];

export function migrate() {
  for (const sql of ddl) {
    db.prepare(sql).run();
  }
}
