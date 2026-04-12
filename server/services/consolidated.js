import { db } from "../db.js";
import { fetchMarketAnalytics } from "./market.js";
import { fetchDemographics } from "./demographics.js";

function parseJsonSafe(s) {
  if (s == null || s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export async function buildConsolidatedResponse(env) {
  const assets = db
    .prepare(
      `
    SELECT a.*,
      (SELECT open_tickets FROM maintenance_snapshots m WHERE m.asset_id = a.id ORDER BY m.recorded_at DESC LIMIT 1) AS open_tickets,
      (SELECT unresolved_damages FROM maintenance_snapshots m WHERE m.asset_id = a.id ORDER BY m.recorded_at DESC LIMIT 1) AS unresolved_damages
    FROM assets a ORDER BY a.asset_id
  `,
    )
    .all();

  const units = db
    .prepare(
      `
    SELECT u.*, a.asset_id AS asset_code
    FROM units u JOIN assets a ON u.asset_id = a.id ORDER BY a.asset_id, u.unit_number
  `,
    )
    .all();

  const leases = db
    .prepare(
      `
    SELECT l.*, u.unit_number, a.asset_id AS asset_code
    FROM leases l
    JOIN units u ON l.unit_id = u.id
    JOIN assets a ON u.asset_id = a.id
    ORDER BY l.lease_ended_date DESC
  `,
    )
    .all()
    .map((row) => ({
      ...row,
      custom_clauses: parseJsonSafe(row.custom_clauses),
    }));

  const jobs = db
    .prepare(`SELECT * FROM workflow_jobs ORDER BY id`)
    .all()
    .map((j) => ({
      ...j,
      meta: parseJsonSafe(j.meta),
      step_label: `Step ${j.step_number}/${j.step_total}`,
    }));

  const cache = db.prepare(`SELECT * FROM cache_health ORDER BY id DESC LIMIT 1`).get();
  const seo = db
    .prepare(`SELECT * FROM seo_channels ORDER BY id`)
    .all()
    .map((s) => ({
      ...s,
      keyword_clusters: parseJsonSafe(s.keyword_clusters) || [],
    }));

  const marketRow = db.prepare(`SELECT * FROM market_snapshots ORDER BY id DESC LIMIT 1`).get();
  const demoRow = db.prepare(`SELECT * FROM demographic_snapshots ORDER BY id DESC LIMIT 1`).get();

  const [marketLive, demoLive] = await Promise.all([fetchMarketAnalytics(env), fetchDemographics(env)]);

  const market = {
    ...marketRow,
    market_avg_rent: marketLive.market_avg_rent ?? marketRow?.market_avg_rent,
    occupancy_avg_pct: marketLive.occupancy_avg_pct ?? marketRow?.occupancy_avg_pct,
    market_heat_score: marketLive.market_heat_score ?? marketRow?.market_heat_score,
    submarket_id: marketLive.submarket_id ?? marketRow?.submarket_id,
    submarket_label: marketLive.submarket_label ?? marketRow?.submarket_label,
    live_source: marketLive.source,
    live_error: marketLive.error,
  };

  const demographics = {
    ...demoRow,
    radius_miles: demoLive.radius_miles ?? demoRow?.radius_miles,
    average_hhi: demoLive.average_hhi ?? demoRow?.average_hhi,
    vacancy_rate_pct: demoLive.vacancy_rate_pct ?? demoRow?.vacancy_rate_pct,
    live_source: demoLive.source,
    place_name: demoLive.place_name,
    live_error: demoLive.error,
  };

  return {
    generated_at: new Date().toISOString(),
    property_management: {
      assets,
      units,
      leases,
    },
    market_analytics: market,
    demographics,
    workflow: {
      jobs,
      system_health: {
        cache_l1_pct: cache?.l1_pct,
        cache_l2_pct: cache?.l2_pct,
        cache_l3_pct: cache?.l3_pct,
        memory_usage_mb: cache?.memory_usage_mb,
      },
    },
    seo_distribution: seo,
    meta: {
      external_providers: {
        market: "RentCast API (optional key)",
        demographics: "US Census ACS5",
        seo_listings: "Internal + GA/GSC hooks (metrics stored in DB)",
      },
    },
  };
}
