import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(process.argv[2] || "datasets/sources/raw");
const state = process.env.MARKET_STATE_FIPS || "08";
const place = process.env.MARKET_PLACE || "20000";
const zip = process.env.MARKET_ZIP || "80202";
const marketLabel = process.env.MARKET_LABEL || "Denver city, Colorado";

fs.mkdirSync(outputDir, { recursive: true });

await fetchCensus(outputDir, state, place);
writeSeoManualTemplate(outputDir, marketLabel);
writeMarketManualTemplate(outputDir, zip, marketLabel);

async function fetchCensus(dir, stateFips, placeFips) {
  const base = "https://api.census.gov/data/2022/acs/acs5";
  const vars = "NAME,B19013_001E,B25001_001E,B25004_001E";
  const url = `${base}?get=${vars}&for=place:${placeFips}&in=state:${stateFips}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Census HTTP ${res.status}`);
  const rows = await res.json();
  const header = rows[0];
  const data = rows[1];
  const idx = (name) => header.indexOf(name);

  const text = [
    `Entity type: demographic_snapshots`,
    `Name: ${data[idx("NAME")]}`,
    `Title: US Census ACS 5-Year`,
    `URL: ${url}`,
    `Fetched at: ${new Date().toISOString()}`,
    "",
    `Demographic source: ACS 5-year summary`,
    `Place name: ${data[idx("NAME")]}`,
    `Radius miles: ${process.env.DEMO_RADIUS_MILES || "3"}`,
    `Average household income: ${data[idx("B19013_001E")]}`,
    `Total housing units: ${data[idx("B25001_001E")]}`,
    `Vacant housing units: ${data[idx("B25004_001E")]}`,
    `Vacancy rate percent: ${vacancyPct(data[idx("B25001_001E")], data[idx("B25004_001E")])}`,
    `Source type: census_acs5`,
    `Source label: Imported ACS summary`,
  ].join("\n");

  const outPath = path.join(dir, "demographic_snapshots-census-denver-source.txt");
  fs.writeFileSync(outPath, `${text}\n`);
  console.log(`Wrote ${outPath}`);
}

function writeMarketManualTemplate(dir, zipCode, label) {
  const outPath = path.join(dir, "market_snapshots-manual-template-source.txt");
  if (fs.existsSync(outPath)) return;
  const text = [
    `Entity type: market_snapshots`,
    `Name: ${label}`,
    `Title: Manual market source template`,
    `URL: `,
    `Fetched at: ${new Date().toISOString()}`,
    "",
    `Market source: public report or API response`,
    `Geography: ZIP ${zipCode}`,
    `Submarket id: ZIP-${zipCode}`,
    `Submarket label: ZIP ${zipCode}`,
    `Average rent for 2-bedroom units: `,
    `Occupancy average percent: `,
    `Market heat score: `,
    `Source type: `,
    `Source label: Manual market source`,
  ].join("\n");
  fs.writeFileSync(outPath, `${text}\n`);
  console.log(`Wrote ${outPath}`);
}

function writeSeoManualTemplate(dir, label) {
  const outPath = path.join(dir, "seo_channels-manual-template-source.txt");
  if (fs.existsSync(outPath)) return;
  const text = [
    `Entity type: seo_channels`,
    `Name: ${label}`,
    `Title: Manual SEO scorecard template`,
    `URL: `,
    `Fetched at: ${new Date().toISOString()}`,
    "",
    `SEO listing scorecard`,
    `Channel name: `,
    `Local SEO score: `,
    `Distribution percent: `,
    `Listing completeness: `,
    `Keyword clusters: `,
    `Source label: Manual SEO worksheet`,
  ].join("\n");
  fs.writeFileSync(outPath, `${text}\n`);
  console.log(`Wrote ${outPath}`);
}

function vacancyPct(totalUnits, vacantUnits) {
  const total = Number(totalUnits);
  const vacant = Number(vacantUnits);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(vacant)) return "";
  return ((vacant / total) * 100).toFixed(1);
}
