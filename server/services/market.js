/**
 * Market analytics via RentCast (or mock when RENTCAST_API_KEY is unset).
 * Docs: https://developers.rentcast.io/
 */

const FALLBACK = {
  submarket_id: "ATL-MIDTOWN-01",
  submarket_label: "Atlanta — Midtown / Buckhead",
  market_avg_rent: 2100,
  occupancy_avg_pct: 95.1,
  market_heat_score: 82,
  source: "mock",
};

export async function fetchMarketAnalytics(env) {
  const key = env.RENTCAST_API_KEY;
  const zip = env.MARKET_ZIP || "80202";

  if (!key) {
    return { ...FALLBACK, source: "mock (set RENTCAST_API_KEY)" };
  }

  try {
    const url = `https://api.rentcast.io/v1/average-rent?zipCode=${encodeURIComponent(zip)}&bedrooms=2`;
    const res = await fetch(url, {
      headers: { "X-Api-Key": key, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RentCast ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const rent = Number(data?.rent ?? data?.averageRent ?? FALLBACK.market_avg_rent);
    return {
      submarket_id: `ZIP-${zip}`,
      submarket_label: `ZIP ${zip} — RentCast`,
      market_avg_rent: Number.isFinite(rent) ? rent : FALLBACK.market_avg_rent,
      occupancy_avg_pct: FALLBACK.occupancy_avg_pct,
      market_heat_score: FALLBACK.market_heat_score,
      source: "rentcast",
    };
  } catch (e) {
    return {
      ...FALLBACK,
      source: "mock (RentCast error)",
      error: String(e?.message || e),
    };
  }
}
