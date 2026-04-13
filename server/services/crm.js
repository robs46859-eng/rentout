import { execute, queryAll, queryOne } from "../db.js";

export const CRM_STAGE_ORDER = [
  "Lead",
  "Qualified",
  "Tour Scheduled",
  "Application Submitted",
  "Approved",
  "Lease Sent",
  "Closed Won",
  "Closed Lost",
];

function normalizeStage(stage) {
  const input = String(stage || "").trim().toLowerCase();
  const match = CRM_STAGE_ORDER.find((candidate) => candidate.toLowerCase() === input);
  if (!match) {
    throw new Error(`Invalid CRM stage. Expected one of: ${CRM_STAGE_ORDER.join(", ")}`);
  }
  return match;
}

function normalizeActivityStatus(status) {
  const input = String(status || "pending").trim().toLowerCase();
  if (!["pending", "done", "canceled"].includes(input)) {
    throw new Error("Invalid activity status. Expected pending, done, or canceled");
  }
  return input;
}

function mapProspect(row) {
  return {
    ...row,
    full_name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    budget_monthly: row.budget_cents != null ? row.budget_cents / 100 : null,
  };
}

function baseProspectQuery() {
  return `
    SELECT
      p.*,
      a.asset_id AS asset_code,
      a.name AS asset_name,
      u.unit_number,
      sa.decision AS screening_decision,
      sa.credit_score AS application_credit_score,
      sa.gross_monthly_income_cents,
      (
        SELECT ca.activity_type
        FROM crm_activities ca
        WHERE ca.prospect_id = p.id AND ca.status = 'pending'
        ORDER BY COALESCE(ca.scheduled_for, ca.created_at), ca.id
        LIMIT 1
      ) AS next_activity_type,
      (
        SELECT ca.scheduled_for
        FROM crm_activities ca
        WHERE ca.prospect_id = p.id AND ca.status = 'pending'
        ORDER BY COALESCE(ca.scheduled_for, ca.created_at), ca.id
        LIMIT 1
      ) AS next_activity_at,
      (
        SELECT ca.summary
        FROM crm_activities ca
        WHERE ca.prospect_id = p.id AND ca.status = 'pending'
        ORDER BY COALESCE(ca.scheduled_for, ca.created_at), ca.id
        LIMIT 1
      ) AS next_activity_summary
    FROM crm_prospects p
    LEFT JOIN assets a ON p.asset_id = a.id
    LEFT JOIN units u ON p.unit_id = u.id
    LEFT JOIN screening_applications sa ON sa.prospect_id = p.id
  `;
}

export async function listCrmPipeline() {
  const prospects = (await queryAll(`
    ${baseProspectQuery()}
    ORDER BY
      CASE p.stage
        WHEN 'Lead' THEN 0
        WHEN 'Qualified' THEN 1
        WHEN 'Tour Scheduled' THEN 2
        WHEN 'Application Submitted' THEN 3
        WHEN 'Approved' THEN 4
        WHEN 'Lease Sent' THEN 5
        WHEN 'Closed Won' THEN 6
        WHEN 'Closed Lost' THEN 7
        ELSE 999
      END,
      p.updated_at DESC,
      p.id DESC
  `)).map(mapProspect);

  const activities = await queryAll(`
    SELECT
      ca.*,
      p.prospect_id,
      p.first_name,
      p.last_name,
      p.stage
    FROM crm_activities ca
    JOIN crm_prospects p ON p.id = ca.prospect_id
    ORDER BY
      CASE ca.status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
      COALESCE(ca.scheduled_for, ca.created_at),
      ca.id
  `);

  const stages = await Promise.all(
    CRM_STAGE_ORDER.map(async (stage) => ({
      stage,
      count: Number((await queryOne(`SELECT COUNT(*) AS count FROM crm_prospects WHERE stage = ?`, [stage], `SELECT COUNT(*) AS count FROM crm_prospects WHERE stage = $1`)).count || 0),
    })),
  );

  return {
    stages,
    prospects,
    next_actions: activities
      .filter((activity) => activity.status === "pending")
      .slice(0, 8)
      .map((activity) => ({
        ...activity,
        prospect_name: [activity.first_name, activity.last_name].filter(Boolean).join(" "),
      })),
    recent_activity: activities.slice(0, 12).map((activity) => ({
      ...activity,
      prospect_name: [activity.first_name, activity.last_name].filter(Boolean).join(" "),
    })),
  };
}

export async function createProspect(input) {
  const firstName = String(input.first_name || "").trim();
  const lastName = String(input.last_name || "").trim();
  if (!firstName || !lastName) {
    throw new Error("first_name and last_name are required");
  }

  const stage = normalizeStage(input.stage || "Lead");
  const prospectId = input.prospect_id || `LEAD-${Date.now()}`;
  const budgetMonthly = input.budget_monthly == null ? null : Number(input.budget_monthly);
  const budgetCents = Number.isFinite(budgetMonthly) ? Math.round(budgetMonthly * 100) : null;
  const desiredBedrooms = input.desired_bedrooms == null ? null : Number(input.desired_bedrooms);
  const screeningScore = input.screening_score == null ? null : Number(input.screening_score);

  const result = await execute(
    `
      INSERT INTO crm_prospects (
        prospect_id, first_name, last_name, email, phone, source, stage,
        desired_bedrooms, desired_move_in, budget_cents, assigned_agent,
        asset_id, unit_id, application_status, screening_score, last_contact_at, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      prospectId,
      firstName,
      lastName,
      input.email || null,
      input.phone || null,
      input.source || "manual",
      stage,
      Number.isFinite(desiredBedrooms) ? desiredBedrooms : null,
      input.desired_move_in || null,
      budgetCents,
      input.assigned_agent || null,
      input.asset_id || null,
      input.unit_id || null,
      input.application_status || null,
      Number.isFinite(screeningScore) ? screeningScore : null,
      input.last_contact_at || null,
      input.notes || null,
    ],
    `
      INSERT INTO crm_prospects (
        prospect_id, first_name, last_name, email, phone, source, stage,
        desired_bedrooms, desired_move_in, budget_cents, assigned_agent,
        asset_id, unit_id, application_status, screening_score, last_contact_at, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
      RETURNING id
    `,
  );

  const id = result.lastInsertRowid || result.rows?.[0]?.id;
  return getProspectById(Number(id));
}

export async function logProspectActivity(prospectId, input) {
  const prospect = await getProspectById(prospectId);
  if (!prospect) {
    throw new Error("Prospect not found");
  }

  const activityType = String(input.activity_type || "").trim();
  if (!activityType) {
    throw new Error("activity_type is required");
  }

  await execute(
    `
      INSERT INTO crm_activities (
        prospect_id, activity_type, status, scheduled_for, completed_at, owner, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      prospectId,
      activityType,
      normalizeActivityStatus(input.status),
      input.scheduled_for || null,
      input.completed_at || null,
      input.owner || null,
      input.summary || null,
    ],
    `
      INSERT INTO crm_activities (
        prospect_id, activity_type, status, scheduled_for, completed_at, owner, summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
  );

  await execute(
    `UPDATE crm_prospects SET last_contact_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [prospectId],
    `UPDATE crm_prospects SET last_contact_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
  );

  return getProspectById(prospectId);
}

export async function updateProspectStage(prospectId, input) {
  const prospect = await getProspectById(prospectId);
  if (!prospect) {
    throw new Error("Prospect not found");
  }

  const stage = normalizeStage(input.stage || prospect.stage);
  const screeningScore = input.screening_score == null ? prospect.screening_score : Number(input.screening_score);
  const budgetMonthly = input.budget_monthly == null ? prospect.budget_monthly : Number(input.budget_monthly);
  const budgetCents = Number.isFinite(budgetMonthly) ? Math.round(budgetMonthly * 100) : null;

  await execute(
    `
      UPDATE crm_prospects
      SET stage = ?, assigned_agent = ?, application_status = ?, screening_score = ?, budget_cents = ?, last_contact_at = COALESCE(?, last_contact_at), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      stage,
      input.assigned_agent || prospect.assigned_agent || null,
      input.application_status || prospect.application_status || null,
      Number.isFinite(screeningScore) ? screeningScore : null,
      budgetCents,
      input.last_contact_at || null,
      input.notes || null,
      prospectId,
    ],
    `
      UPDATE crm_prospects
      SET stage = $1, assigned_agent = $2, application_status = $3, screening_score = $4, budget_cents = $5, last_contact_at = COALESCE($6, last_contact_at), notes = COALESCE($7, notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `,
  );

  return getProspectById(prospectId);
}

export async function getProspectById(prospectId) {
  const row = await queryOne(
    `${baseProspectQuery()} WHERE p.id = ?`,
    [prospectId],
    `${baseProspectQuery()} WHERE p.id = $1`,
  );
  return row ? mapProspect(row) : null;
}
