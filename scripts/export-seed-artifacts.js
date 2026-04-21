import fs from "node:fs";
import path from "node:path";

const FINAL_DIR = path.resolve("datasets/output/final");
const EXPORT_DIR = path.resolve("datasets/export");
const JSON_OUTPUT = path.join(EXPORT_DIR, "generated-seed-payload.json");
const SQL_OUTPUT = path.join(EXPORT_DIR, "generated-seed.sql");

fs.mkdirSync(EXPORT_DIR, { recursive: true });

const market = collectFinal("market_snapshots").map(stripMeta);
const demographics = collectFinal("demographic_snapshots").map(stripMeta);
const seo = collectFinal("seo_channels").map(stripMeta);

const payload = {
  generated_at: new Date().toISOString(),
  market_snapshots: market,
  demographic_snapshots: demographics,
  seo_channels: seo,
};

fs.writeFileSync(JSON_OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(SQL_OUTPUT, buildSql({ market, demographics, seo }));

console.log(`Wrote ${JSON_OUTPUT}`);
console.log(`Wrote ${SQL_OUTPUT}`);

function readCollection(filePath, key) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed?.[key]) ? parsed[key] : [];
}

function collectFinal(key) {
  if (!fs.existsSync(FINAL_DIR)) return [];
  const files = fs
    .readdirSync(FINAL_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();
  return files.flatMap((file) => readCollection(path.join(FINAL_DIR, file), key));
}

function buildSql({ market, demographics, seo }) {
  const lines = ["BEGIN;"];

  for (const row of market) {
    lines.push(
      `INSERT INTO market_snapshots (submarket_id, submarket_label, market_avg_rent, occupancy_avg_pct, market_heat_score, source) VALUES (${sql(row.submarket_id)}, ${sql(row.submarket_label)}, ${sqlNum(row.market_avg_rent)}, ${sqlNum(row.occupancy_avg_pct)}, ${sqlNum(row.market_heat_score)}, ${sql(row.source)});`,
    );
  }

  for (const row of demographics) {
    lines.push(
      `INSERT INTO demographic_snapshots (radius_miles, average_hhi, vacancy_rate_pct, source) VALUES (${sqlNum(row.radius_miles)}, ${sqlNum(row.average_hhi)}, ${sqlNum(row.vacancy_rate_pct)}, ${sql(row.source)});`,
    );
  }

  for (const row of seo) {
    lines.push(
      `INSERT INTO seo_channels (channel_name, local_seo_score, distribution_pct, listing_completeness, keyword_clusters) VALUES (${sql(row.channel_name)}, ${sqlNum(row.local_seo_score)}, ${sqlNum(row.distribution_pct)}, ${sqlNum(row.listing_completeness)}, ${sql(JSON.stringify(row.keyword_clusters || []))});`,
    );
  }

  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

function sql(value) {
  if (value == null || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNum(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "NULL";
}

function stripMeta(item) {
  const clone = { ...item };
  delete clone._meta;
  return clone;
}
