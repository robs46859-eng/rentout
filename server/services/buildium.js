const DEFAULT_BASE_URL = "https://api.buildium.com";
const DEFAULT_PAGE_SIZE = 100;

function buildHeaders(env) {
  const clientId = String(env.BUILDIUM_CLIENT_ID || "").trim();
  const clientSecret = String(env.BUILDIUM_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Buildium credentials are not configured");
  }
  return {
    "Content-Type": "application/json",
    "x-buildium-client-id": clientId,
    "x-buildium-client-secret": clientSecret,
  };
}

function buildUrl(env, pathname, query = {}) {
  const base = String(env.BUILDIUM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${base}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function requestJson(env, pathname, query = {}) {
  const response = await fetch(buildUrl(env, pathname, query), {
    method: "GET",
    headers: buildHeaders(env),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Buildium request failed (${response.status}): ${body || response.statusText}`);
  }

  return response.json();
}

async function fetchCollection(env, pathname, query = {}) {
  const results = [];
  let offset = 0;
  while (true) {
    const page = await requestJson(env, pathname, { ...query, limit: DEFAULT_PAGE_SIZE, offset });
    const rows = Array.isArray(page) ? page : Array.isArray(page?.Value) ? page.Value : Array.isArray(page?.value) ? page.value : [];
    results.push(...rows);
    if (rows.length < DEFAULT_PAGE_SIZE) {
      break;
    }
    offset += DEFAULT_PAGE_SIZE;
  }
  return results;
}

export function buildiumConfigured(env) {
  return Boolean(String(env.BUILDIUM_CLIENT_ID || "").trim() && String(env.BUILDIUM_CLIENT_SECRET || "").trim());
}

export async function verifyBuildiumConnection(env) {
  const rentals = await fetchCollection(env, "/v1/rentals", { status: "Active" });
  return {
    ok: true,
    provider: "buildium",
    property_count: rentals.length,
  };
}

export async function fetchBuildiumPortfolio(env) {
  const [rentals, units, leases, workOrders] = await Promise.all([
    fetchCollection(env, "/v1/rentals", { status: "Active" }),
    fetchCollection(env, "/v1/rentals/units"),
    fetchCollection(env, "/v1/leases"),
    fetchCollection(env, "/v1/workorders"),
  ]);

  return {
    rentals,
    units,
    leases,
    work_orders: workOrders,
  };
}
