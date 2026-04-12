import "dotenv/config";
import { db, migrate } from "./db.js";

migrate();

const wipe = db.transaction(() => {
  const tables = [
    "leases",
    "units",
    "maintenance_snapshots",
    "assets",
    "workflow_jobs",
    "cache_health",
    "seo_channels",
    "market_snapshots",
    "demographic_snapshots",
  ];
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
});
wipe();

const insertAsset = db.prepare(`
  INSERT INTO assets (asset_id, name, asset_class, construction_year, total_units, address_line, city, state, postal_code)
  VALUES (@asset_id, @name, @asset_class, @construction_year, @total_units, @address_line, @city, @state, @postal_code)
`);

const insertUnit = db.prepare(`
  INSERT INTO units (asset_id, unit_number, key_return_status, unit_health_audit_score, archive_readiness)
  VALUES ((SELECT id FROM assets WHERE asset_id = @asset_key), @unit_number, @key_return_status, @unit_health_audit_score, @archive_readiness)
`);

const insertMaint = db.prepare(`
  INSERT INTO maintenance_snapshots (asset_id, open_tickets, unresolved_damages)
  VALUES ((SELECT id FROM assets WHERE asset_id = @asset_key), @open_tickets, @unresolved_damages)
`);

const insertLease = db.prepare(`
  INSERT INTO leases (
    unit_id, prior_tenant_name, prior_tenant_external_id, lease_ended_date, term_of_occupancy_months,
    rent_payment_schedule, early_exit_clause, pet_addendum, parking_stalls, storage_units, custom_clauses
  ) VALUES (
    (SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = @asset_key AND u.unit_number = @unit_number),
    @prior_tenant_name, @prior_tenant_external_id, @lease_ended_date, @term_of_occupancy_months,
    @rent_payment_schedule, @early_exit_clause, @pet_addendum, @parking_stalls, @storage_units, @custom_clauses
  )
`);

insertAsset.run({
  asset_id: "AST-PHX-01",
  name: "Project Phoenix",
  asset_class: "Class B Multifamily",
  construction_year: 2014,
  total_units: 186,
  address_line: "1200 Blake St",
  city: "Denver",
  state: "CO",
  postal_code: "80205",
});

insertAsset.run({
  asset_id: "AST-DEN-44",
  name: "Blake Yard Lofts",
  asset_class: "Class A Mixed-Use",
  construction_year: 2019,
  total_units: 92,
  address_line: "44 W 12th Ave",
  city: "Denver",
  state: "CO",
  postal_code: "80204",
});

for (const u of [
  { asset_key: "AST-PHX-01", unit_number: "204", key_return_status: "Received", unit_health_audit_score: 88, archive_readiness: 1 },
  { asset_key: "AST-PHX-01", unit_number: "305", key_return_status: "Outstanding", unit_health_audit_score: 72, archive_readiness: 0 },
  { asset_key: "AST-DEN-44", unit_number: "12B", key_return_status: "Received", unit_health_audit_score: 94, archive_readiness: 1 },
]) {
  insertUnit.run(u);
}

insertMaint.run({ asset_key: "AST-PHX-01", open_tickets: 7, unresolved_damages: 3 });
insertMaint.run({ asset_key: "AST-DEN-44", open_tickets: 2, unresolved_damages: 0 });

insertLease.run({
  asset_key: "AST-PHX-01",
  unit_number: "204",
  prior_tenant_name: "Jordan Ellis",
  prior_tenant_external_id: "TNT-88421",
  lease_ended_date: "2025-11-30",
  term_of_occupancy_months: 14,
  rent_payment_schedule: "Monthly ACH on 1st; $2,450.00 base",
  early_exit_clause: "90-day notice; fee 1.5x monthly after month 6",
  pet_addendum: "1 cat; $35/mo; deposit $400",
  parking_stalls: "P2-18",
  storage_units: "S-12",
  custom_clauses: JSON.stringify({ noise: "Quiet hours 10pm-7am", insurance: "Renter liability $100k min" }),
});

const jobStmt = db.prepare(`
  INSERT INTO workflow_jobs (job_name, step_number, step_total, status, neural_load, cpu_load, meta)
  VALUES (@job_name, @step_number, @step_total, @status, @neural_load, @cpu_load, @meta)
`);

jobStmt.run({
  job_name: "Contract Rendering: Project Phoenix",
  step_number: 4,
  step_total: 6,
  status: "Running",
  neural_load: 0.62,
  cpu_load: 0.41,
  meta: JSON.stringify({ pipeline: "docgen-v3" }),
});
jobStmt.run({
  job_name: "PMS Sync — Yardi Voyager",
  step_number: 1,
  step_total: 3,
  status: "Queued",
  neural_load: 0.08,
  cpu_load: 0.12,
  meta: null,
});
jobStmt.run({
  job_name: "Unit Health Audit — Batch 12",
  step_number: 6,
  step_total: 6,
  status: "Partial",
  neural_load: 0.33,
  cpu_load: 0.58,
  meta: JSON.stringify({ failed_units: ["305"] }),
});

db.prepare(`
  INSERT INTO cache_health (l1_pct, l2_pct, l3_pct, memory_usage_mb)
  VALUES (94.2, 87.5, 76.1, 512.4)
`).run();

const seo = db.prepare(`
  INSERT INTO seo_channels (channel_name, local_seo_score, distribution_pct, listing_completeness, keyword_clusters)
  VALUES (@channel_name, @local_seo_score, @distribution_pct, @listing_completeness, @keyword_clusters)
`);

seo.run({
  channel_name: "Zillow / StreetEasy syndication",
  local_seo_score: 82,
  distribution_pct: 34,
  listing_completeness: 91,
  keyword_clusters: JSON.stringify(["denver lofts", "blake st apartments", "pet friendly downtown"]),
});
seo.run({
  channel_name: "Apartments.com / CoStar",
  local_seo_score: 76,
  distribution_pct: 28,
  listing_completeness: 88,
  keyword_clusters: JSON.stringify(["2br denver", "washer dryer included"]),
});
seo.run({
  channel_name: "Google Business / Local Pack",
  local_seo_score: 88,
  distribution_pct: 22,
  listing_completeness: 95,
  keyword_clusters: JSON.stringify(["near union station", "RiNo apartments"]),
});

db.prepare(`
  INSERT INTO market_snapshots (submarket_id, submarket_label, market_avg_rent, occupancy_avg_pct, market_heat_score, source)
  VALUES ('DEN-RINO-01', 'Denver — RiNo / Five Points', 2450, 94.2, 78, 'seed')
`).run();

db.prepare(`
  INSERT INTO demographic_snapshots (radius_miles, average_hhi, vacancy_rate_pct, source)
  VALUES (3, 98500, 5.8, 'seed')
`).run();

console.log("Seed complete.");
