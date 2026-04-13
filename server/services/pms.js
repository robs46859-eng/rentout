import { execute, queryAll, queryOne } from "../db.js";
import { buildiumConfigured, fetchBuildiumPortfolio, verifyBuildiumConnection } from "./buildium.js";

const PROVIDER = "buildium";

function parseJsonSafe(value) {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function toMoneyCents(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

function wordToNumber(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    studio: 0,
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  if (normalized in map) return map[normalized];
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function statusFromUnit(unit) {
  if (unit.IsUnitOccupied === true) return "occupied";
  if (unit.IsUnitListed === true) return "vacant";
  return "vacant";
}

function normalizePriority(value) {
  const normalized = String(value || "medium").trim().toLowerCase();
  if (["low", "medium", "high", "urgent"].includes(normalized)) return normalized;
  return "medium";
}

function normalizeWorkOrderStatus(value) {
  const normalized = String(value || "open").trim().toLowerCase();
  if (["open", "in progress", "in_progress"].includes(normalized)) return "in_progress";
  if (["completed", "complete", "closed"].includes(normalized)) return "completed";
  if (["cancelled", "canceled"].includes(normalized)) return "canceled";
  if (["vendor_scheduled", "vendor scheduled"].includes(normalized)) return "vendor_scheduled";
  return "open";
}

function leaseStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "active";
  if (normalized.includes("past") || normalized.includes("ended") || normalized.includes("expired")) return "ended";
  if (normalized.includes("future")) return "future";
  return "active";
}

function extractTenantName(lease) {
  const currentTenant = Array.isArray(lease?.CurrentTenants) ? lease.CurrentTenants[0] : null;
  if (currentTenant) {
    return [currentTenant.FirstName, currentTenant.LastName].filter(Boolean).join(" ") || currentTenant.Name || null;
  }
  return lease?.TenantName || null;
}

function rentalAddress(rental) {
  const address = rental?.Address || {};
  return {
    address_line: address.AddressLine1 || rental?.AddressLine1 || null,
    city: address.City || rental?.City || null,
    state: address.State || rental?.State || null,
    postal_code: address.PostalCode || rental?.PostalCode || null,
  };
}

async function ensureIntegrationAccount(provider, configuration = {}) {
  const existing = await queryOne(
    `SELECT * FROM integration_accounts WHERE provider = ?`,
    [provider],
    `SELECT * FROM integration_accounts WHERE provider = $1`,
  );

  if (existing) {
    await execute(
      `
        UPDATE integration_accounts
        SET configuration = ?, updated_at = CURRENT_TIMESTAMP
        WHERE provider = ?
      `,
      [JSON.stringify(configuration), provider],
      `
        UPDATE integration_accounts
        SET configuration = $1, updated_at = CURRENT_TIMESTAMP
        WHERE provider = $2
      `,
    );
    return;
  }

  await execute(
    `
      INSERT INTO integration_accounts (provider, status, configuration, updated_at)
      VALUES (?, 'configured', ?, CURRENT_TIMESTAMP)
    `,
    [provider, JSON.stringify(configuration)],
    `
      INSERT INTO integration_accounts (provider, status, configuration, updated_at)
      VALUES ($1, 'configured', $2, CURRENT_TIMESTAMP)
    `,
  );
}

async function updateIntegrationState(provider, fields) {
  const assignments = [];
  const params = [];
  const pgParams = [];
  let index = 1;
  for (const [key, value] of Object.entries(fields)) {
    assignments.push(`${key} = ?`);
    params.push(value);
    pgParams.push(value);
    index += 1;
  }
  assignments.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(provider);
  pgParams.push(provider);
  await execute(
    `UPDATE integration_accounts SET ${assignments.join(", ")} WHERE provider = ?`,
    params,
    `UPDATE integration_accounts SET ${assignments.map((assignment, i) => assignment.replace("?", `$${i + 1}`)).join(", ")} WHERE provider = $${index}`,
  );
}

async function createSyncRun(provider, operatorId) {
  const result = await execute(
    `
      INSERT INTO integration_sync_runs (provider, triggered_by_operator_id, status)
      VALUES (?, ?, 'running')
    `,
    [provider, operatorId || null],
    `
      INSERT INTO integration_sync_runs (provider, triggered_by_operator_id, status)
      VALUES ($1, $2, 'running')
      RETURNING id
    `,
  );
  return Number(result.lastInsertRowid || result.rows?.[0]?.id);
}

async function completeSyncRun(runId, status, stats = null, errorMessage = null) {
  await execute(
    `
      UPDATE integration_sync_runs
      SET status = ?, stats = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [status, stats ? JSON.stringify(stats) : null, errorMessage, runId],
    `
      UPDATE integration_sync_runs
      SET status = $1, stats = $2, error_message = $3, completed_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `,
  );
}

async function findAssetByExternalId(externalId) {
  return queryOne(
    `SELECT * FROM assets WHERE pms_provider = ? AND pms_external_id = ?`,
    [PROVIDER, externalId],
    `SELECT * FROM assets WHERE pms_provider = $1 AND pms_external_id = $2`,
  );
}

async function upsertAsset(rental, unitCountByProperty, syncedAt) {
  const externalId = String(rental.Id);
  const existing = await findAssetByExternalId(externalId);
  const address = rentalAddress(rental);
  const totalUnits = toInteger(
    rental.TotalUnitCount ?? rental.UnitCount ?? rental.NumberOfUnits ?? unitCountByProperty.get(Number(rental.Id)) ?? 1,
  );
  const asset = {
    asset_id: existing?.asset_id || `BUILDIUM-${externalId}`,
    name: rental.Name || rental.PropertyName || `Buildium Property ${externalId}`,
    asset_class: [rental.Type, rental.SubType].filter(Boolean).join(" / ") || "Rental",
    construction_year: toInteger(rental.YearBuilt),
    total_units: totalUnits || 1,
    manager_name: rental.PropertyManagerName || rental.ManagerName || null,
    occupancy_target_pct: 95,
    ...address,
    pms_provider: PROVIDER,
    pms_external_id: externalId,
    pms_last_synced_at: syncedAt,
  };

  if (existing) {
    await execute(
      `
        UPDATE assets
        SET
          name = ?, asset_class = ?, construction_year = ?, total_units = ?,
          address_line = ?, city = ?, state = ?, postal_code = ?,
          manager_name = ?, occupancy_target_pct = ?, pms_provider = ?, pms_external_id = ?, pms_last_synced_at = ?
        WHERE id = ?
      `,
      [
        asset.name,
        asset.asset_class,
        asset.construction_year,
        asset.total_units,
        asset.address_line,
        asset.city,
        asset.state,
        asset.postal_code,
        asset.manager_name,
        asset.occupancy_target_pct,
        asset.pms_provider,
        asset.pms_external_id,
        asset.pms_last_synced_at,
        existing.id,
      ],
      `
        UPDATE assets
        SET
          name = $1, asset_class = $2, construction_year = $3, total_units = $4,
          address_line = $5, city = $6, state = $7, postal_code = $8,
          manager_name = $9, occupancy_target_pct = $10, pms_provider = $11, pms_external_id = $12, pms_last_synced_at = $13
        WHERE id = $14
      `,
    );
    return Number(existing.id);
  }

  const result = await execute(
    `
      INSERT INTO assets (
        asset_id, name, asset_class, construction_year, total_units,
        address_line, city, state, postal_code, manager_name,
        occupancy_target_pct, pms_provider, pms_external_id, pms_last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      asset.asset_id,
      asset.name,
      asset.asset_class,
      asset.construction_year,
      asset.total_units,
      asset.address_line,
      asset.city,
      asset.state,
      asset.postal_code,
      asset.manager_name,
      asset.occupancy_target_pct,
      asset.pms_provider,
      asset.pms_external_id,
      asset.pms_last_synced_at,
    ],
    `
      INSERT INTO assets (
        asset_id, name, asset_class, construction_year, total_units,
        address_line, city, state, postal_code, manager_name,
        occupancy_target_pct, pms_provider, pms_external_id, pms_last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `,
  );
  return Number(result.lastInsertRowid || result.rows?.[0]?.id);
}

async function findUnitByExternalId(externalId) {
  return queryOne(
    `SELECT * FROM units WHERE pms_external_id = ?`,
    [externalId],
    `SELECT * FROM units WHERE pms_external_id = $1`,
  );
}

async function upsertUnit(unit, assetId, syncedAt) {
  const externalId = String(unit.Id);
  const existing =
    (await findUnitByExternalId(externalId)) ||
    (await queryOne(
      `SELECT * FROM units WHERE asset_id = ? AND unit_number = ?`,
      [assetId, String(unit.UnitNumber || unit.Name || externalId)],
      `SELECT * FROM units WHERE asset_id = $1 AND unit_number = $2`,
    ));

  const bedrooms = wordToNumber(unit.UnitBedrooms ?? unit.Bedrooms);
  const bathrooms = wordToNumber(unit.UnitBathrooms ?? unit.Bathrooms);
  const model = {
    asset_id: assetId,
    unit_number: String(unit.UnitNumber || unit.Name || externalId),
    bedrooms,
    bathrooms,
    square_feet: toInteger(unit.UnitSize ?? unit.SquareFeet),
    market_rent_cents: toMoneyCents(unit.MarketRent),
    status: statusFromUnit(unit),
    available_on: toDateOnly(unit.AvailableDate),
    make_ready_progress: existing?.make_ready_progress ?? 0,
    key_return_status: existing?.key_return_status ?? null,
    unit_health_audit_score: existing?.unit_health_audit_score ?? null,
    archive_readiness: existing?.archive_readiness ?? 0,
    pms_external_id: externalId,
    pms_last_synced_at: syncedAt,
  };

  if (existing) {
    await execute(
      `
        UPDATE units
        SET
          asset_id = ?, unit_number = ?, bedrooms = ?, bathrooms = ?, square_feet = ?, market_rent_cents = ?,
          status = ?, available_on = ?, make_ready_progress = ?, key_return_status = ?, unit_health_audit_score = ?,
          archive_readiness = ?, pms_external_id = ?, pms_last_synced_at = ?
        WHERE id = ?
      `,
      [
        model.asset_id,
        model.unit_number,
        model.bedrooms,
        model.bathrooms,
        model.square_feet,
        model.market_rent_cents,
        model.status,
        model.available_on,
        model.make_ready_progress,
        model.key_return_status,
        model.unit_health_audit_score,
        model.archive_readiness,
        model.pms_external_id,
        model.pms_last_synced_at,
        existing.id,
      ],
      `
        UPDATE units
        SET
          asset_id = $1, unit_number = $2, bedrooms = $3, bathrooms = $4, square_feet = $5, market_rent_cents = $6,
          status = $7, available_on = $8, make_ready_progress = $9, key_return_status = $10, unit_health_audit_score = $11,
          archive_readiness = $12, pms_external_id = $13, pms_last_synced_at = $14
        WHERE id = $15
      `,
    );
    return Number(existing.id);
  }

  const result = await execute(
    `
      INSERT INTO units (
        asset_id, unit_number, key_return_status, unit_health_audit_score, archive_readiness,
        bedrooms, bathrooms, square_feet, market_rent_cents, status, available_on, make_ready_progress,
        pms_external_id, pms_last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      model.asset_id,
      model.unit_number,
      model.key_return_status,
      model.unit_health_audit_score,
      model.archive_readiness,
      model.bedrooms,
      model.bathrooms,
      model.square_feet,
      model.market_rent_cents,
      model.status,
      model.available_on,
      model.make_ready_progress,
      model.pms_external_id,
      model.pms_last_synced_at,
    ],
    `
      INSERT INTO units (
        asset_id, unit_number, key_return_status, unit_health_audit_score, archive_readiness,
        bedrooms, bathrooms, square_feet, market_rent_cents, status, available_on, make_ready_progress,
        pms_external_id, pms_last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `,
  );
  return Number(result.lastInsertRowid || result.rows?.[0]?.id);
}

async function upsertLease(lease, unitId, syncedAt) {
  const externalId = String(lease.Id);
  const existing = await queryOne(
    `SELECT * FROM leases WHERE pms_external_id = ?`,
    [externalId],
    `SELECT * FROM leases WHERE pms_external_id = $1`,
  );
  const model = {
    unit_id: unitId,
    prior_tenant_name: extractTenantName(lease),
    prior_tenant_external_id: lease.TenantId != null ? String(lease.TenantId) : existing?.prior_tenant_external_id ?? null,
    lease_ended_date: toDateOnly(lease.EndDate ?? lease.LeaseToDate),
    term_of_occupancy_months: toInteger(lease.TermMonths),
    rent_payment_schedule: lease.PaymentSchedule || existing?.rent_payment_schedule || null,
    early_exit_clause: existing?.early_exit_clause ?? null,
    pet_addendum: existing?.pet_addendum ?? null,
    parking_stalls: existing?.parking_stalls ?? null,
    storage_units: existing?.storage_units ?? null,
    custom_clauses: existing?.custom_clauses ?? null,
    status: leaseStatus(lease.Status ?? lease.LeaseTermStatus),
    monthly_rent_cents: toMoneyCents(lease.Rent ?? lease.MonthlyRent),
    deposit_cents: toMoneyCents(lease.SecurityDeposit),
    pms_external_id: externalId,
    pms_last_synced_at: syncedAt,
  };

  if (existing) {
    await execute(
      `
        UPDATE leases
        SET
          unit_id = ?, prior_tenant_name = ?, prior_tenant_external_id = ?, lease_ended_date = ?,
          term_of_occupancy_months = ?, rent_payment_schedule = ?, early_exit_clause = ?, pet_addendum = ?,
          parking_stalls = ?, storage_units = ?, custom_clauses = ?, status = ?, monthly_rent_cents = ?,
          deposit_cents = ?, pms_external_id = ?, pms_last_synced_at = ?
        WHERE id = ?
      `,
      [
        model.unit_id,
        model.prior_tenant_name,
        model.prior_tenant_external_id,
        model.lease_ended_date,
        model.term_of_occupancy_months,
        model.rent_payment_schedule,
        model.early_exit_clause,
        model.pet_addendum,
        model.parking_stalls,
        model.storage_units,
        model.custom_clauses,
        model.status,
        model.monthly_rent_cents,
        model.deposit_cents,
        model.pms_external_id,
        model.pms_last_synced_at,
        existing.id,
      ],
      `
        UPDATE leases
        SET
          unit_id = $1, prior_tenant_name = $2, prior_tenant_external_id = $3, lease_ended_date = $4,
          term_of_occupancy_months = $5, rent_payment_schedule = $6, early_exit_clause = $7, pet_addendum = $8,
          parking_stalls = $9, storage_units = $10, custom_clauses = $11, status = $12, monthly_rent_cents = $13,
          deposit_cents = $14, pms_external_id = $15, pms_last_synced_at = $16
        WHERE id = $17
      `,
    );
    return Number(existing.id);
  }

  const result = await execute(
    `
      INSERT INTO leases (
        unit_id, prior_tenant_name, prior_tenant_external_id, lease_ended_date, term_of_occupancy_months,
        rent_payment_schedule, early_exit_clause, pet_addendum, parking_stalls, storage_units, custom_clauses,
        status, monthly_rent_cents, deposit_cents, pms_external_id, pms_last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      model.unit_id,
      model.prior_tenant_name,
      model.prior_tenant_external_id,
      model.lease_ended_date,
      model.term_of_occupancy_months,
      model.rent_payment_schedule,
      model.early_exit_clause,
      model.pet_addendum,
      model.parking_stalls,
      model.storage_units,
      model.custom_clauses,
      model.status,
      model.monthly_rent_cents,
      model.deposit_cents,
      model.pms_external_id,
      model.pms_last_synced_at,
    ],
    `
      INSERT INTO leases (
        unit_id, prior_tenant_name, prior_tenant_external_id, lease_ended_date, term_of_occupancy_months,
        rent_payment_schedule, early_exit_clause, pet_addendum, parking_stalls, storage_units, custom_clauses,
        status, monthly_rent_cents, deposit_cents, pms_external_id, pms_last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `,
  );
  return Number(result.lastInsertRowid || result.rows?.[0]?.id);
}

async function upsertWorkOrder(workOrder, assetId, unitId, syncedAt) {
  const externalId = String(workOrder.Id);
  const existing = await queryOne(
    `SELECT * FROM work_orders WHERE pms_external_id = ?`,
    [externalId],
    `SELECT * FROM work_orders WHERE pms_external_id = $1`,
  );
  const model = {
    asset_id: assetId,
    unit_id: unitId,
    title: workOrder.Title || workOrder.Subject || `Buildium Work Order ${externalId}`,
    category: workOrder.Category || workOrder.TaskCategory || "maintenance",
    priority: normalizePriority(workOrder.Priority),
    status: normalizeWorkOrderStatus(workOrder.Status),
    assigned_to: workOrder.AssignedToUser?.Name || workOrder.AssignedTo || null,
    vendor_name: workOrder.Vendor?.CompanyName || workOrder.VendorName || null,
    due_date: toDateOnly(workOrder.DueDate),
    estimated_cost_cents: toMoneyCents(workOrder.EstimatedCost),
    notes: workOrder.Description || workOrder.Notes || existing?.notes || null,
    pms_external_id: externalId,
    pms_last_synced_at: syncedAt,
  };

  if (existing) {
    await execute(
      `
        UPDATE work_orders
        SET
          asset_id = ?, unit_id = ?, title = ?, category = ?, priority = ?, status = ?, assigned_to = ?,
          vendor_name = ?, due_date = ?, estimated_cost_cents = ?, notes = ?, pms_external_id = ?, pms_last_synced_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        model.asset_id,
        model.unit_id,
        model.title,
        model.category,
        model.priority,
        model.status,
        model.assigned_to,
        model.vendor_name,
        model.due_date,
        model.estimated_cost_cents,
        model.notes,
        model.pms_external_id,
        model.pms_last_synced_at,
        existing.id,
      ],
      `
        UPDATE work_orders
        SET
          asset_id = $1, unit_id = $2, title = $3, category = $4, priority = $5, status = $6, assigned_to = $7,
          vendor_name = $8, due_date = $9, estimated_cost_cents = $10, notes = $11, pms_external_id = $12, pms_last_synced_at = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
      `,
    );
    return Number(existing.id);
  }

  const result = await execute(
    `
      INSERT INTO work_orders (
        asset_id, unit_id, title, category, priority, status, assigned_to, vendor_name, due_date,
        estimated_cost_cents, notes, pms_external_id, pms_last_synced_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      model.asset_id,
      model.unit_id,
      model.title,
      model.category,
      model.priority,
      model.status,
      model.assigned_to,
      model.vendor_name,
      model.due_date,
      model.estimated_cost_cents,
      model.notes,
      model.pms_external_id,
      model.pms_last_synced_at,
    ],
    `
      INSERT INTO work_orders (
        asset_id, unit_id, title, category, priority, status, assigned_to, vendor_name, due_date,
        estimated_cost_cents, notes, pms_external_id, pms_last_synced_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      RETURNING id
    `,
  );
  return Number(result.lastInsertRowid || result.rows?.[0]?.id);
}

export async function getPmsStatus(env) {
  const account = await queryOne(
    `SELECT * FROM integration_accounts WHERE provider = ?`,
    [PROVIDER],
    `SELECT * FROM integration_accounts WHERE provider = $1`,
  );
  const runs = await queryAll(
    `
      SELECT
        r.*,
        o.email AS triggered_by_email,
        o.full_name AS triggered_by_name
      FROM integration_sync_runs r
      LEFT JOIN operators o ON o.id = r.triggered_by_operator_id
      WHERE r.provider = ?
      ORDER BY r.started_at DESC, r.id DESC
      LIMIT 10
    `,
    [PROVIDER],
    `
      SELECT
        r.*,
        o.email AS triggered_by_email,
        o.full_name AS triggered_by_name
      FROM integration_sync_runs r
      LEFT JOIN operators o ON o.id = r.triggered_by_operator_id
      WHERE r.provider = $1
      ORDER BY r.started_at DESC, r.id DESC
      LIMIT 10
    `,
  );

  return {
    provider: PROVIDER,
    configured: buildiumConfigured(env),
    account: account
      ? {
          ...account,
          configuration: parseJsonSafe(account.configuration),
        }
      : null,
    recent_runs: runs.map((run) => ({
      ...run,
      stats: parseJsonSafe(run.stats),
    })),
  };
}

export async function testPmsConnection(env) {
  if (!buildiumConfigured(env)) {
    throw new Error("Buildium credentials are not configured");
  }

  await ensureIntegrationAccount(PROVIDER, {
    base_url: String(env.BUILDIUM_BASE_URL || "https://api.buildium.com"),
    has_client_id: true,
    has_client_secret: true,
  });

  try {
    const result = await verifyBuildiumConnection(env);
    await updateIntegrationState(PROVIDER, {
      status: "connected",
      last_verified_at: new Date().toISOString(),
      last_error: null,
    });
    return result;
  } catch (error) {
    await updateIntegrationState(PROVIDER, {
      status: "error",
      last_verified_at: new Date().toISOString(),
      last_error: String(error?.message || error),
    });
    throw error;
  }
}

export async function syncBuildiumPortfolio(env, actor) {
  if (!buildiumConfigured(env)) {
    throw new Error("Buildium credentials are not configured");
  }

  const syncStartedAt = new Date().toISOString();
  await ensureIntegrationAccount(PROVIDER, {
    base_url: String(env.BUILDIUM_BASE_URL || "https://api.buildium.com"),
    has_client_id: true,
    has_client_secret: true,
  });
  await updateIntegrationState(PROVIDER, {
    status: "syncing",
    last_sync_started_at: syncStartedAt,
    last_error: null,
  });

  const runId = await createSyncRun(PROVIDER, actor?.id);

  try {
    const snapshot = await fetchBuildiumPortfolio(env);
    const syncedAt = new Date().toISOString();
    const unitCountByProperty = new Map();
    for (const unit of snapshot.units) {
      const propertyId = Number(unit.PropertyId);
      unitCountByProperty.set(propertyId, (unitCountByProperty.get(propertyId) || 0) + 1);
    }

    const assetIdsByExternal = new Map();
    for (const rental of snapshot.rentals) {
      const assetId = await upsertAsset(rental, unitCountByProperty, syncedAt);
      assetIdsByExternal.set(Number(rental.Id), assetId);
    }

    const unitIdsByExternal = new Map();
    for (const unit of snapshot.units) {
      const assetId = assetIdsByExternal.get(Number(unit.PropertyId));
      if (!assetId) continue;
      const unitId = await upsertUnit(unit, assetId, syncedAt);
      unitIdsByExternal.set(Number(unit.Id), unitId);
    }

    let leaseCount = 0;
    for (const lease of snapshot.leases) {
      const unitId = unitIdsByExternal.get(Number(lease.UnitId));
      if (!unitId) continue;
      await upsertLease(lease, unitId, syncedAt);
      leaseCount += 1;
    }

    let workOrderCount = 0;
    for (const workOrder of snapshot.work_orders) {
      const assetId = assetIdsByExternal.get(Number(workOrder.PropertyId));
      if (!assetId) continue;
      const unitId = workOrder.UnitId != null ? unitIdsByExternal.get(Number(workOrder.UnitId)) || null : null;
      await upsertWorkOrder(workOrder, assetId, unitId, syncedAt);
      workOrderCount += 1;
    }

    const stats = {
      rentals: snapshot.rentals.length,
      units: snapshot.units.length,
      leases: leaseCount,
      work_orders: workOrderCount,
    };

    await completeSyncRun(runId, "succeeded", stats, null);
    await updateIntegrationState(PROVIDER, {
      status: "connected",
      last_verified_at: syncedAt,
      last_sync_completed_at: syncedAt,
      last_error: null,
    });

    return {
      provider: PROVIDER,
      synced_at: syncedAt,
      stats,
    };
  } catch (error) {
    await completeSyncRun(runId, "failed", null, String(error?.message || error));
    await updateIntegrationState(PROVIDER, {
      status: "error",
      last_sync_completed_at: new Date().toISOString(),
      last_error: String(error?.message || error),
    });
    throw error;
  }
}
