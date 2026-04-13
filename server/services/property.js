import { execute, queryAll, queryOne } from "../db.js";

const workOrderStatuses = new Set(["open", "in_progress", "vendor_scheduled", "completed", "canceled"]);
const workOrderPriorities = new Set(["low", "medium", "high", "urgent"]);

function normalizeWorkOrder(row) {
  return {
    ...row,
    estimated_cost: row.estimated_cost_cents != null ? row.estimated_cost_cents / 100 : null,
  };
}

export async function listPropertyManagement() {
  const assets = await queryAll(`
    SELECT a.*,
      (
        SELECT COUNT(*)
        FROM units u
        WHERE u.asset_id = a.id AND COALESCE(u.status, 'vacant') IN ('occupied', 'notice')
      ) AS occupied_units,
      (
        SELECT COUNT(*)
        FROM units u
        WHERE u.asset_id = a.id AND COALESCE(u.status, 'vacant') = 'vacant'
      ) AS vacant_units,
      (
        SELECT COUNT(*)
        FROM work_orders wo
        WHERE wo.asset_id = a.id AND wo.status NOT IN ('completed', 'canceled')
      ) AS active_work_orders,
      (
        SELECT open_tickets
        FROM maintenance_snapshots m
        WHERE m.asset_id = a.id
        ORDER BY m.recorded_at DESC, m.id DESC
        LIMIT 1
      ) AS open_tickets,
      (
        SELECT unresolved_damages
        FROM maintenance_snapshots m
        WHERE m.asset_id = a.id
        ORDER BY m.recorded_at DESC, m.id DESC
        LIMIT 1
      ) AS unresolved_damages
    FROM assets a
    ORDER BY a.asset_id
  `);

  const units = await queryAll(`
    SELECT u.*, a.asset_id AS asset_code, a.name AS asset_name
    FROM units u
    JOIN assets a ON u.asset_id = a.id
    ORDER BY a.asset_id, u.unit_number
  `);

  const leases = await queryAll(`
    SELECT l.*, u.unit_number, a.asset_id AS asset_code
    FROM leases l
    JOIN units u ON l.unit_id = u.id
    JOIN assets a ON u.asset_id = a.id
    ORDER BY l.lease_ended_date DESC, l.id DESC
  `);

  const workOrders = (await queryAll(`
    SELECT
      wo.*,
      a.asset_id AS asset_code,
      a.name AS asset_name,
      u.unit_number
    FROM work_orders wo
    JOIN assets a ON wo.asset_id = a.id
    LEFT JOIN units u ON wo.unit_id = u.id
    ORDER BY
      CASE wo.priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      COALESCE(wo.due_date, wo.created_at),
      wo.id
  `)).map(normalizeWorkOrder);

  return {
    assets,
    units: units.map((unit) => ({
      ...unit,
      market_rent: unit.market_rent_cents != null ? unit.market_rent_cents / 100 : null,
    })),
    leases: leases.map((lease) => ({
      ...lease,
      monthly_rent: lease.monthly_rent_cents != null ? lease.monthly_rent_cents / 100 : null,
      deposit: lease.deposit_cents != null ? lease.deposit_cents / 100 : null,
      custom_clauses: parseJsonSafe(lease.custom_clauses),
    })),
    work_orders: workOrders,
    summary: {
      open_work_orders: workOrders.filter((row) => !["completed", "canceled"].includes(row.status)).length,
      ready_units: units.filter((row) => Number(row.make_ready_progress || 0) >= 100).length,
      vacant_units: units.filter((row) => row.status === "vacant").length,
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

export async function createWorkOrder(input) {
  const title = String(input.title || "").trim();
  const category = String(input.category || "").trim();
  const priority = String(input.priority || "medium").trim().toLowerCase();
  const status = String(input.status || "open").trim().toLowerCase();

  if (!title || !category) {
    throw new Error("title and category are required");
  }
  if (!workOrderPriorities.has(priority)) {
    throw new Error("Invalid work order priority");
  }
  if (!workOrderStatuses.has(status)) {
    throw new Error("Invalid work order status");
  }
  if (!input.asset_id) {
    throw new Error("asset_id is required");
  }

  const estimatedCost = input.estimated_cost == null ? null : Number(input.estimated_cost);
  const estimatedCostCents = Number.isFinite(estimatedCost) ? Math.round(estimatedCost * 100) : null;

  const insertSql = `
    INSERT INTO work_orders (
      asset_id, unit_id, title, category, priority, status, assigned_to,
      vendor_name, due_date, estimated_cost_cents, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const pgInsertSql = `
    INSERT INTO work_orders (
      asset_id, unit_id, title, category, priority, status, assigned_to,
      vendor_name, due_date, estimated_cost_cents, notes, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    RETURNING id
  `;

  const result = await execute(insertSql, [
    input.asset_id,
    input.unit_id || null,
    title,
    category,
    priority,
    status,
    input.assigned_to || null,
    input.vendor_name || null,
    input.due_date || null,
    estimatedCostCents,
    input.notes || null,
  ], pgInsertSql);

  const id = result.lastInsertRowid || result.rows?.[0]?.id;
  return getWorkOrderById(Number(id));
}

export async function updateWorkOrder(workOrderId, input) {
  const existing = await getWorkOrderById(workOrderId);
  if (!existing) {
    throw new Error("Work order not found");
  }

  const priority = input.priority ? String(input.priority).trim().toLowerCase() : existing.priority;
  const status = input.status ? String(input.status).trim().toLowerCase() : existing.status;
  if (!workOrderPriorities.has(priority)) {
    throw new Error("Invalid work order priority");
  }
  if (!workOrderStatuses.has(status)) {
    throw new Error("Invalid work order status");
  }

  const estimatedCost = input.estimated_cost == null ? existing.estimated_cost : Number(input.estimated_cost);
  const estimatedCostCents = Number.isFinite(estimatedCost) ? Math.round(estimatedCost * 100) : null;

  await execute(
    `
      UPDATE work_orders
      SET priority = ?, status = ?, assigned_to = ?, vendor_name = ?, due_date = ?, estimated_cost_cents = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      priority,
      status,
      input.assigned_to ?? existing.assigned_to ?? null,
      input.vendor_name ?? existing.vendor_name ?? null,
      input.due_date ?? existing.due_date ?? null,
      estimatedCostCents,
      input.notes ?? existing.notes ?? null,
      workOrderId,
    ],
    `
      UPDATE work_orders
      SET priority = $1, status = $2, assigned_to = $3, vendor_name = $4, due_date = $5, estimated_cost_cents = $6, notes = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `,
  );

  return getWorkOrderById(workOrderId);
}

export async function getWorkOrderById(workOrderId) {
  const rows = await queryAll(
    `
      SELECT
        wo.*,
        a.asset_id AS asset_code,
        a.name AS asset_name,
        u.unit_number
      FROM work_orders wo
      JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN units u ON wo.unit_id = u.id
      WHERE wo.id = ?
    `,
    [workOrderId],
    `
      SELECT
        wo.*,
        a.asset_id AS asset_code,
        a.name AS asset_name,
        u.unit_number
      FROM work_orders wo
      JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN units u ON wo.unit_id = u.id
      WHERE wo.id = $1
    `,
  );
  return rows[0] ? normalizeWorkOrder(rows[0]) : null;
}
