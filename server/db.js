import "dotenv/config";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const dbType = process.env.DATABASE_URL ? "postgres" : "sqlite";
export const isPostgres = dbType === "postgres";

const sqlitePath = process.env.SQLITE_PATH || path.join(dataDir, "rentout.sqlite");
const sqliteDb = isPostgres ? null : new Database(sqlitePath);
const pgPool = isPostgres
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
    })
  : null;

if (sqliteDb) {
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
}

const baseTables = [
  {
    name: "operators",
    sqlite: `CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS operators (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "auth_sessions",
    sqlite: `CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT,
      last_seen_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGSERIAL PRIMARY KEY,
      operator_id BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      ip_address TEXT,
      user_agent TEXT,
      last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "auth_login_challenges",
    sqlite: `CREATE TABLE IF NOT EXISTS auth_login_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
      challenge_token_hash TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL DEFAULT 'totp',
      expires_at TEXT NOT NULL,
      fulfilled_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS auth_login_challenges (
      id BIGSERIAL PRIMARY KEY,
      operator_id BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
      challenge_token_hash TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL DEFAULT 'totp',
      expires_at TIMESTAMPTZ NOT NULL,
      fulfilled_at TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "audit_logs",
    sqlite: `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      request_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      operator_id BIGINT REFERENCES operators(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      request_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      payload TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "integration_accounts",
    sqlite: `CREATE TABLE IF NOT EXISTS integration_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'disconnected',
      configuration TEXT,
      last_verified_at TEXT,
      last_sync_started_at TEXT,
      last_sync_completed_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS integration_accounts (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'disconnected',
      configuration TEXT,
      last_verified_at TIMESTAMPTZ,
      last_sync_started_at TIMESTAMPTZ,
      last_sync_completed_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "integration_sync_runs",
    sqlite: `CREATE TABLE IF NOT EXISTS integration_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      triggered_by_operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'running',
      stats TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      error_message TEXT
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS integration_sync_runs (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      triggered_by_operator_id BIGINT REFERENCES operators(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'running',
      stats TEXT,
      started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ,
      error_message TEXT
    )`,
  },
  {
    name: "assets",
    sqlite: `CREATE TABLE IF NOT EXISTS assets (
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
      manager_name TEXT,
      occupancy_target_pct REAL DEFAULT 95,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS assets (
      id BIGSERIAL PRIMARY KEY,
      asset_id TEXT NOT NULL UNIQUE,
      name TEXT,
      asset_class TEXT NOT NULL,
      construction_year INTEGER,
      total_units INTEGER NOT NULL,
      address_line TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      manager_name TEXT,
      occupancy_target_pct DOUBLE PRECISION DEFAULT 95,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "units",
    sqlite: `CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      unit_number TEXT NOT NULL,
      key_return_status TEXT,
      unit_health_audit_score REAL,
      archive_readiness INTEGER DEFAULT 0,
      bedrooms INTEGER,
      bathrooms REAL,
      square_feet INTEGER,
      market_rent_cents INTEGER,
      status TEXT DEFAULT 'vacant',
      available_on TEXT,
      make_ready_progress INTEGER DEFAULT 0,
      UNIQUE(asset_id, unit_number)
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS units (
      id BIGSERIAL PRIMARY KEY,
      asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      unit_number TEXT NOT NULL,
      key_return_status TEXT,
      unit_health_audit_score DOUBLE PRECISION,
      archive_readiness INTEGER DEFAULT 0,
      bedrooms INTEGER,
      bathrooms DOUBLE PRECISION,
      square_feet INTEGER,
      market_rent_cents INTEGER,
      status TEXT DEFAULT 'vacant',
      available_on DATE,
      make_ready_progress INTEGER DEFAULT 0,
      UNIQUE(asset_id, unit_number)
    )`,
  },
  {
    name: "maintenance_snapshots",
    sqlite: `CREATE TABLE IF NOT EXISTS maintenance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      open_tickets INTEGER NOT NULL DEFAULT 0,
      unresolved_damages INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS maintenance_snapshots (
      id BIGSERIAL PRIMARY KEY,
      asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      open_tickets INTEGER NOT NULL DEFAULT 0,
      unresolved_damages INTEGER NOT NULL DEFAULT 0,
      recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "leases",
    sqlite: `CREATE TABLE IF NOT EXISTS leases (
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
      status TEXT DEFAULT 'ended',
      monthly_rent_cents INTEGER,
      deposit_cents INTEGER
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS leases (
      id BIGSERIAL PRIMARY KEY,
      unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      prior_tenant_name TEXT,
      prior_tenant_external_id TEXT,
      lease_ended_date DATE,
      term_of_occupancy_months INTEGER,
      rent_payment_schedule TEXT,
      early_exit_clause TEXT,
      pet_addendum TEXT,
      parking_stalls TEXT,
      storage_units TEXT,
      custom_clauses TEXT,
      status TEXT DEFAULT 'ended',
      monthly_rent_cents INTEGER,
      deposit_cents INTEGER
    )`,
  },
  {
    name: "workflow_jobs",
    sqlite: `CREATE TABLE IF NOT EXISTS workflow_jobs (
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
    postgres: `CREATE TABLE IF NOT EXISTS workflow_jobs (
      id BIGSERIAL PRIMARY KEY,
      job_name TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      step_total INTEGER NOT NULL,
      status TEXT NOT NULL,
      neural_load DOUBLE PRECISION,
      cpu_load DOUBLE PRECISION,
      meta TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "cache_health",
    sqlite: `CREATE TABLE IF NOT EXISTS cache_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      l1_pct REAL NOT NULL,
      l2_pct REAL NOT NULL,
      l3_pct REAL NOT NULL,
      memory_usage_mb REAL,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS cache_health (
      id BIGSERIAL PRIMARY KEY,
      l1_pct DOUBLE PRECISION NOT NULL,
      l2_pct DOUBLE PRECISION NOT NULL,
      l3_pct DOUBLE PRECISION NOT NULL,
      memory_usage_mb DOUBLE PRECISION,
      recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "seo_channels",
    sqlite: `CREATE TABLE IF NOT EXISTS seo_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_name TEXT NOT NULL,
      local_seo_score REAL NOT NULL,
      distribution_pct REAL NOT NULL,
      listing_completeness REAL NOT NULL,
      keyword_clusters TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS seo_channels (
      id BIGSERIAL PRIMARY KEY,
      channel_name TEXT NOT NULL,
      local_seo_score DOUBLE PRECISION NOT NULL,
      distribution_pct DOUBLE PRECISION NOT NULL,
      listing_completeness DOUBLE PRECISION NOT NULL,
      keyword_clusters TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "market_snapshots",
    sqlite: `CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submarket_id TEXT NOT NULL,
      submarket_label TEXT,
      market_avg_rent REAL,
      occupancy_avg_pct REAL,
      market_heat_score REAL,
      source TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS market_snapshots (
      id BIGSERIAL PRIMARY KEY,
      submarket_id TEXT NOT NULL,
      submarket_label TEXT,
      market_avg_rent DOUBLE PRECISION,
      occupancy_avg_pct DOUBLE PRECISION,
      market_heat_score DOUBLE PRECISION,
      source TEXT,
      fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "demographic_snapshots",
    sqlite: `CREATE TABLE IF NOT EXISTS demographic_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radius_miles REAL,
      average_hhi REAL,
      vacancy_rate_pct REAL,
      source TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS demographic_snapshots (
      id BIGSERIAL PRIMARY KEY,
      radius_miles DOUBLE PRECISION,
      average_hhi DOUBLE PRECISION,
      vacancy_rate_pct DOUBLE PRECISION,
      source TEXT,
      fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "crm_prospects",
    sqlite: `CREATE TABLE IF NOT EXISTS crm_prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      source TEXT,
      stage TEXT NOT NULL DEFAULT 'Lead',
      desired_bedrooms INTEGER,
      desired_move_in TEXT,
      budget_cents INTEGER,
      assigned_agent TEXT,
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      application_status TEXT,
      screening_score INTEGER,
      last_contact_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS crm_prospects (
      id BIGSERIAL PRIMARY KEY,
      prospect_id TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      source TEXT,
      stage TEXT NOT NULL DEFAULT 'Lead',
      desired_bedrooms INTEGER,
      desired_move_in DATE,
      budget_cents INTEGER,
      assigned_agent TEXT,
      asset_id BIGINT REFERENCES assets(id) ON DELETE SET NULL,
      unit_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
      application_status TEXT,
      screening_score INTEGER,
      last_contact_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "crm_activities",
    sqlite: `CREATE TABLE IF NOT EXISTS crm_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TEXT,
      completed_at TEXT,
      owner TEXT,
      summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS crm_activities (
      id BIGSERIAL PRIMARY KEY,
      prospect_id BIGINT NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      owner TEXT,
      summary TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "work_orders",
    sqlite: `CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to TEXT,
      vendor_name TEXT,
      due_date TEXT,
      estimated_cost_cents INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS work_orders (
      id BIGSERIAL PRIMARY KEY,
      asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      unit_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to TEXT,
      vendor_name TEXT,
      due_date DATE,
      estimated_cost_cents INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "screening_policies",
    sqlite: `CREATE TABLE IF NOT EXISTS screening_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      min_credit_score INTEGER NOT NULL,
      min_income_rent_ratio REAL NOT NULL,
      max_open_collections_cents INTEGER NOT NULL,
      eviction_lookback_years INTEGER NOT NULL,
      criminal_lookback_years INTEGER NOT NULL,
      requires_identity_pass INTEGER NOT NULL DEFAULT 1,
      require_income_docs INTEGER NOT NULL DEFAULT 1,
      max_occupants_per_bedroom REAL NOT NULL DEFAULT 2,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS screening_policies (
      id BIGSERIAL PRIMARY KEY,
      policy_code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      min_credit_score INTEGER NOT NULL,
      min_income_rent_ratio DOUBLE PRECISION NOT NULL,
      max_open_collections_cents INTEGER NOT NULL,
      eviction_lookback_years INTEGER NOT NULL,
      criminal_lookback_years INTEGER NOT NULL,
      requires_identity_pass BOOLEAN NOT NULL DEFAULT TRUE,
      require_income_docs BOOLEAN NOT NULL DEFAULT TRUE,
      max_occupants_per_bedroom DOUBLE PRECISION NOT NULL DEFAULT 2,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "screening_applications",
    sqlite: `CREATE TABLE IF NOT EXISTS screening_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
      unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      policy_id INTEGER REFERENCES screening_policies(id) ON DELETE SET NULL,
      gross_monthly_income_cents INTEGER,
      credit_score INTEGER,
      open_collections_cents INTEGER DEFAULT 0,
      occupants_count INTEGER DEFAULT 1,
      has_eviction INTEGER DEFAULT 0,
      has_felony INTEGER DEFAULT 0,
      identity_verified INTEGER DEFAULT 0,
      income_docs_verified INTEGER DEFAULT 0,
      decision TEXT DEFAULT 'pending',
      decision_reasons TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT
    )`,
    postgres: `CREATE TABLE IF NOT EXISTS screening_applications (
      id BIGSERIAL PRIMARY KEY,
      prospect_id BIGINT NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
      unit_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
      policy_id BIGINT REFERENCES screening_policies(id) ON DELETE SET NULL,
      gross_monthly_income_cents INTEGER,
      credit_score INTEGER,
      open_collections_cents INTEGER DEFAULT 0,
      occupants_count INTEGER DEFAULT 1,
      has_eviction BOOLEAN DEFAULT FALSE,
      has_felony BOOLEAN DEFAULT FALSE,
      identity_verified BOOLEAN DEFAULT FALSE,
      income_docs_verified BOOLEAN DEFAULT FALSE,
      decision TEXT DEFAULT 'pending',
      decision_reasons TEXT,
      submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMPTZ
    )`,
  },
];

const columnMigrations = {
  operators: [
    ["mfa_enabled", "INTEGER DEFAULT 0"],
    ["mfa_secret", "TEXT"],
    ["mfa_pending_secret", "TEXT"],
    ["mfa_recovery_codes", "TEXT"],
    ["mfa_pending_recovery_codes", "TEXT"],
    ["password_changed_at", "TEXT"],
  ],
  assets: [
    ["manager_name", "TEXT"],
    ["occupancy_target_pct", "REAL DEFAULT 95"],
    ["pms_provider", "TEXT"],
    ["pms_external_id", "TEXT"],
    ["pms_last_synced_at", "TEXT"],
  ],
  units: [
    ["bedrooms", "INTEGER"],
    ["bathrooms", "REAL"],
    ["square_feet", "INTEGER"],
    ["market_rent_cents", "INTEGER"],
    ["status", "TEXT DEFAULT 'vacant'"],
    ["available_on", "TEXT"],
    ["make_ready_progress", "INTEGER DEFAULT 0"],
    ["pms_external_id", "TEXT"],
    ["pms_last_synced_at", "TEXT"],
  ],
  leases: [
    ["monthly_rent_cents", "INTEGER"],
    ["deposit_cents", "INTEGER"],
    ["pms_external_id", "TEXT"],
    ["pms_last_synced_at", "TEXT"],
  ],
  work_orders: [
    ["pms_external_id", "TEXT"],
    ["pms_last_synced_at", "TEXT"],
  ],
};

function sqlForDialect(definition) {
  return isPostgres ? definition.postgres : definition.sqlite;
}

function normalizeParams(params = []) {
  return Array.isArray(params) ? params : [params];
}

function sqliteAlterType(type) {
  return type;
}

function postgresAlterType(type) {
  return type
    .replaceAll("REAL", "DOUBLE PRECISION")
    .replaceAll("TEXT DEFAULT (datetime('now'))", "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP")
    .replaceAll("TEXT", "TEXT");
}

export async function execute(sql, params = [], pgSql = sql) {
  const values = normalizeParams(params);
  if (isPostgres) {
    return pgPool.query(pgSql, values);
  }
  return sqliteDb.prepare(sql).run(...values);
}

export async function queryAll(sql, params = [], pgSql = sql) {
  const values = normalizeParams(params);
  if (isPostgres) {
    const result = await pgPool.query(pgSql, values);
    return result.rows;
  }
  return sqliteDb.prepare(sql).all(...values);
}

export async function queryOne(sql, params = [], pgSql = sql) {
  const rows = await queryAll(sql, params, pgSql);
  return rows[0] || null;
}

async function addColumnIfMissing(tableName, columnName, sqliteType) {
  if (isPostgres) {
    const existing = await queryOne(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `,
      [tableName, columnName],
    );
    if (!existing) {
      await execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${postgresAlterType(sqliteType)}`);
    }
    return;
  }

  const columns = sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    sqliteDb.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqliteAlterType(sqliteType)}`).run();
  }
}

export async function migrate() {
  for (const table of baseTables) {
    await execute(sqlForDialect(table));
  }

  for (const [tableName, columns] of Object.entries(columnMigrations)) {
    for (const [columnName, columnType] of columns) {
      await addColumnIfMissing(tableName, columnName, columnType);
    }
  }

  await execute(
    `
      UPDATE operators
      SET password_changed_at = COALESCE(password_changed_at, created_at, CURRENT_TIMESTAMP)
      WHERE password_changed_at IS NULL
    `,
  );
}

export async function resetTable(tableName) {
  if (isPostgres) {
    await execute(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
    return;
  }
  await execute(`DELETE FROM ${tableName}`);
  await execute(`DELETE FROM sqlite_sequence WHERE name = ?`, [tableName]);
}

export function nowExpression() {
  return isPostgres ? "CURRENT_TIMESTAMP" : "datetime('now')";
}

export function placeholder(index) {
  return isPostgres ? `$${index}` : "?";
}

export async function closeDb() {
  if (isPostgres) {
    await pgPool.end();
    return;
  }
  sqliteDb.close();
}
