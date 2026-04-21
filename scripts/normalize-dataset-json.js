import fs from "node:fs";
import path from "node:path";

const [, , inputPath, outputPath, sourcePathArg] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/normalize-dataset-json.js <input_json> <output_json> [source_file]");
  process.exit(1);
}

const rawInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const sourcePath = sourcePathArg || guessSourcePath(inputPath);
const sourceFields = sourcePath && fs.existsSync(sourcePath) ? parseSourceFields(fs.readFileSync(sourcePath, "utf8")) : {};

const normalized = normalizeRoot(rawInput, sourceFields, path.basename(inputPath));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);
console.log(`Normalized ${inputPath} -> ${outputPath}`);

function guessSourcePath(currentInputPath) {
  const baseName = path.basename(currentInputPath, ".json");
  const candidate = path.resolve(path.dirname(currentInputPath), "../../sources/chunks", `${baseName}-source.txt`);
  if (fs.existsSync(candidate)) return candidate;
  return "";
}

function normalizeRoot(value, fields, fileName) {
  if (value && typeof value === "object" && Array.isArray(value.market_snapshots)) {
    return { market_snapshots: value.market_snapshots.map((item) => normalizeMarket(item, fields)) };
  }
  if (value && typeof value === "object" && Array.isArray(value.demographic_snapshots)) {
    return { demographic_snapshots: value.demographic_snapshots.map((item) => normalizeDemographics(item, fields)) };
  }
  if (value && typeof value === "object" && Array.isArray(value.seo_channels)) {
    return { seo_channels: value.seo_channels.map((item) => normalizeSeo(item, fields)) };
  }

  if (Array.isArray(value)) {
    if (fileName.includes("seo")) return { seo_channels: value.map((item) => normalizeSeo(item, fields)) };
    if (fileName.includes("demo")) return { demographic_snapshots: value.map((item) => normalizeDemographics(item, fields)) };
    return { market_snapshots: value.map((item) => normalizeMarket(item, fields)) };
  }

  if (fileName.includes("seo")) return { seo_channels: [] };
  if (fileName.includes("demo")) return { demographic_snapshots: [] };
  return { market_snapshots: [] };
}

function normalizeMarket(item, fields) {
  return {
    submarket_id: stringOrFallback(item?.submarket_id, fields["submarket id"], fields.geography),
    submarket_label: nullableString(item?.submarket_label ?? fields["submarket label"] ?? null),
    market_avg_rent: numberOrNull(item?.market_avg_rent ?? fields["average rent for 2-bedroom units"] ?? null),
    occupancy_avg_pct: numberOrNull(item?.occupancy_avg_pct ?? fields["occupancy average percent"] ?? null),
    market_heat_score: numberOrNull(item?.market_heat_score ?? fields["market heat score"] ?? null),
    source: stringOrFallback(item?.source, fields["source type"], "unknown"),
    _meta: normalizeMeta(item?._meta, {
      source_url: "",
      source_title: stringOrFallback(fields["source label"], fields["market source"], "Market source"),
      source_date: null,
      evidence: stringOrFallback(fields["market source"], fields["source label"]),
      confidence: 0.9,
    }),
  };
}

function normalizeDemographics(item, fields) {
  return {
    radius_miles: numberOrNull(item?.radius_miles ?? fields["radius miles"] ?? null),
    average_hhi: numberOrNull(item?.average_hhi ?? fields["average household income"] ?? null),
    vacancy_rate_pct: numberOrNull(item?.vacancy_rate_pct ?? fields["vacancy rate percent"] ?? null),
    source: stringOrFallback(item?.source, fields["source type"], "unknown"),
    place_name: nullableString(item?.place_name ?? fields["place name"] ?? null),
    _meta: normalizeMeta(item?._meta, {
      source_url: "",
      source_title: stringOrFallback(fields["source label"], fields["demographic source"], "Demographic source"),
      source_date: null,
      evidence: stringOrFallback(fields["demographic source"], fields["source label"]),
      confidence: 0.9,
    }),
  };
}

function normalizeSeo(item, fields) {
  return {
    channel_name: stringOrFallback(item?.channel_name, fields["channel name"]),
    local_seo_score: numberOrNull(item?.local_seo_score ?? fields["local seo score"] ?? null),
    distribution_pct: numberOrNull(item?.distribution_pct ?? fields["distribution percent"] ?? null),
    listing_completeness: numberOrNull(item?.listing_completeness ?? fields["listing completeness"] ?? null),
    keyword_clusters: normalizeKeywordClusters(item?.keyword_clusters ?? fields["keyword clusters"] ?? []),
    _meta: normalizeMeta(item?._meta, {
      source_url: "",
      source_title: stringOrFallback(fields["source label"], "SEO source"),
      source_date: null,
      evidence: stringOrFallback(fields["source label"], "SEO listing scorecard"),
      confidence: 0.9,
    }),
  };
}

function normalizeMeta(value, defaults) {
  return {
    source_url: stringOrFallback(value?.source_url, defaults.source_url),
    source_title: stringOrFallback(value?.source_title, defaults.source_title),
    source_date: nullableString(value?.source_date ?? defaults.source_date ?? null),
    evidence: stringOrFallback(value?.evidence, defaults.evidence),
    confidence: clamp(numberOrDefault(value?.confidence, defaults.confidence), 0, 1),
  };
}

function normalizeKeywordClusters(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseSourceFields(text) {
  const fields = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    fields[trimmed.slice(0, idx).trim().toLowerCase()] = trimmed.slice(idx + 1).trim();
  }
  return fields;
}

function stringOrFallback(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function nullableString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrDefault(value, fallback) {
  const parsed = numberOrNull(value);
  return parsed ?? fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
