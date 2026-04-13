import { queryAll, queryOne } from "../db.js";
import { listCrmPipeline } from "./crm.js";
import { fetchDemographics } from "./demographics.js";
import { fetchMarketAnalytics } from "./market.js";
import { listPropertyManagement } from "./property.js";
import { listScreeningOverview } from "./screening.js";

export async function buildConsolidatedResponse(env) {
  const propertyManagement = await listPropertyManagement();

  const jobs = (await queryAll(`SELECT * FROM workflow_jobs ORDER BY id`)).map((job) => ({
    ...job,
    meta: parseJsonSafe(job.meta),
    step_label: `Step ${job.step_number}/${job.step_total}`,
  }));

  const cache = await queryOne(`SELECT * FROM cache_health ORDER BY recorded_at DESC, id DESC LIMIT 1`);
  const seo = (await queryAll(`SELECT * FROM seo_channels ORDER BY id`)).map((row) => ({
    ...row,
    keyword_clusters: parseJsonSafe(row.keyword_clusters) || [],
  }));

  const marketRow = await queryOne(`SELECT * FROM market_snapshots ORDER BY fetched_at DESC, id DESC LIMIT 1`);
  const demoRow = await queryOne(`SELECT * FROM demographic_snapshots ORDER BY fetched_at DESC, id DESC LIMIT 1`);

  const [marketLive, demoLive, crm, screening] = await Promise.all([
    fetchMarketAnalytics(env),
    fetchDemographics(env),
    listCrmPipeline(),
    listScreeningOverview(),
  ]);

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
    property_management: propertyManagement,
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
    crm,
    screening,
    seo_distribution: seo,
    meta: {
      external_providers: {
        market: "RentCast API (optional key)",
        demographics: "US Census ACS5",
        seo_listings: "Internal + GA/GSC hooks (metrics stored in DB)",
        crm: "Native pipeline + activity tracking",
        screening: "Policy-driven applicant review stored in DB",
      },
    },
  };
}

function parseJsonSafe(value) {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
