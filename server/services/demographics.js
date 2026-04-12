/**
 * US Census ACS 5-year — median household income & derived vacancy proxy.
 * https://api.census.gov/data/2022/acs/acs5
 */

function pickEnv(env) {
  return {
    key: env.CENSUS_API_KEY || "",
    state: env.MARKET_STATE_FIPS || "08",
    place: env.MARKET_PLACE || "20000",
    radiusMiles: Number(env.DEMO_RADIUS_MILES || 3),
  };
}

const FALLBACK = {
  radius_miles: 3,
  average_hhi: 98500,
  vacancy_rate_pct: 5.8,
  source: "mock",
};

export async function fetchDemographics(env) {
  const { key, state, place, radiusMiles } = pickEnv(env);
  const base = "https://api.census.gov/data/2022/acs/acs5";
  const vars = "NAME,B19013_001E,B25001_001E,B25004_001E";
  const geo = `for=place:${place}&in=state:${state}`;

  try {
    const q = key ? `${base}?get=${vars}&${geo}&key=${key}` : `${base}?get=${vars}&${geo}`;
    const res = await fetch(q);
    if (!res.ok) throw new Error(`Census HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length < 2) throw new Error("Unexpected Census shape");

    const header = rows[0];
    const data = rows[1];
    const idx = (name) => header.indexOf(name);
    const mhi = Number(data[idx("B19013_001E")]);
    const totalUnits = Number(data[idx("B25001_001E")]);
    const vacant = Number(data[idx("B25004_001E")]);
    const vacancyPct =
      totalUnits > 0 && Number.isFinite(vacant) ? (vacant / totalUnits) * 100 : FALLBACK.vacancy_rate_pct;

    return {
      radius_miles: radiusMiles,
      average_hhi: Number.isFinite(mhi) && mhi > 0 ? mhi : FALLBACK.average_hhi,
      vacancy_rate_pct: Number.isFinite(vacancyPct) ? Math.round(vacancyPct * 10) / 10 : FALLBACK.vacancy_rate_pct,
      source: "census_acs5",
      place_name: data[idx("NAME")],
    };
  } catch (e) {
    return {
      ...FALLBACK,
      radius_miles: radiusMiles,
      source: "mock (Census error)",
      error: String(e?.message || e),
    };
  }
}
