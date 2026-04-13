import { execute, queryAll, queryOne } from "../db.js";

const screeningDecisions = new Set(["pending", "approved", "conditional", "denied"]);

function parseReasons(value) {
  if (value == null || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [String(value)];
  }
}

function normalizeApplication(row) {
  return {
    ...row,
    gross_monthly_income: row.gross_monthly_income_cents != null ? row.gross_monthly_income_cents / 100 : null,
    open_collections: row.open_collections_cents != null ? row.open_collections_cents / 100 : null,
    decision_reasons: parseReasons(row.decision_reasons),
    meets_credit_policy:
      row.credit_score != null && row.min_credit_score != null ? Number(row.credit_score) >= Number(row.min_credit_score) : null,
    meets_income_policy:
      row.gross_monthly_income_cents != null && row.market_rent_cents != null && row.min_income_rent_ratio != null
        ? row.gross_monthly_income_cents / Math.max(row.market_rent_cents, 1) >= Number(row.min_income_rent_ratio)
        : null,
  };
}

export async function listScreeningOverview() {
  const policies = await queryAll(`
    SELECT *
    FROM screening_policies
    WHERE is_active IN (1, TRUE)
    ORDER BY policy_code
  `);

  const applications = (await queryAll(`
    SELECT
      sa.*,
      cp.prospect_id AS lead_code,
      cp.first_name,
      cp.last_name,
      cp.stage,
      sp.policy_code,
      sp.label AS policy_label,
      sp.min_credit_score,
      sp.min_income_rent_ratio,
      sp.max_open_collections_cents,
      sp.requires_identity_pass,
      sp.require_income_docs,
      u.unit_number,
      u.market_rent_cents,
      a.asset_id AS asset_code
    FROM screening_applications sa
    JOIN crm_prospects cp ON sa.prospect_id = cp.id
    LEFT JOIN screening_policies sp ON sa.policy_id = sp.id
    LEFT JOIN units u ON sa.unit_id = u.id
    LEFT JOIN assets a ON u.asset_id = a.id
    ORDER BY
      CASE sa.decision
        WHEN 'pending' THEN 0
        WHEN 'conditional' THEN 1
        WHEN 'approved' THEN 2
        ELSE 3
      END,
      sa.submitted_at DESC,
      sa.id DESC
  `)).map((row) => ({
    ...normalizeApplication(row),
    prospect_name: [row.first_name, row.last_name].filter(Boolean).join(" "),
  }));

  return {
    policies,
    applications,
    summary: {
      pending: applications.filter((application) => application.decision === "pending").length,
      approved: applications.filter((application) => application.decision === "approved").length,
      conditional: applications.filter((application) => application.decision === "conditional").length,
      denied: applications.filter((application) => application.decision === "denied").length,
    },
  };
}

export async function createScreeningApplication(input) {
  if (!input.prospect_id) {
    throw new Error("prospect_id is required");
  }

  const decision = String(input.decision || "pending").trim().toLowerCase();
  if (!screeningDecisions.has(decision)) {
    throw new Error("Invalid screening decision");
  }

  const reasons = Array.isArray(input.decision_reasons) ? JSON.stringify(input.decision_reasons) : null;

  const result = await execute(
    `
      INSERT INTO screening_applications (
        prospect_id, unit_id, policy_id, gross_monthly_income_cents, credit_score,
        open_collections_cents, occupants_count, has_eviction, has_felony,
        identity_verified, income_docs_verified, decision, decision_reasons, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.prospect_id,
      input.unit_id || null,
      input.policy_id || null,
      input.gross_monthly_income == null ? null : Math.round(Number(input.gross_monthly_income) * 100),
      input.credit_score == null ? null : Number(input.credit_score),
      input.open_collections == null ? 0 : Math.round(Number(input.open_collections) * 100),
      input.occupants_count == null ? 1 : Number(input.occupants_count),
      input.has_eviction ? 1 : 0,
      input.has_felony ? 1 : 0,
      input.identity_verified ? 1 : 0,
      input.income_docs_verified ? 1 : 0,
      decision,
      reasons,
      decision === "pending" ? null : new Date().toISOString(),
    ],
    `
      INSERT INTO screening_applications (
        prospect_id, unit_id, policy_id, gross_monthly_income_cents, credit_score,
        open_collections_cents, occupants_count, has_eviction, has_felony,
        identity_verified, income_docs_verified, decision, decision_reasons, reviewed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `,
  );

  const id = result.lastInsertRowid || result.rows?.[0]?.id;
  return getScreeningApplicationById(Number(id));
}

export async function updateScreeningDecision(applicationId, input) {
  const existing = await getScreeningApplicationById(applicationId);
  if (!existing) {
    throw new Error("Screening application not found");
  }

  const decision = String(input.decision || existing.decision).trim().toLowerCase();
  if (!screeningDecisions.has(decision)) {
    throw new Error("Invalid screening decision");
  }

  const reasons = Array.isArray(input.decision_reasons)
    ? JSON.stringify(input.decision_reasons)
    : JSON.stringify(existing.decision_reasons || []);

  await execute(
    `
      UPDATE screening_applications
      SET decision = ?, decision_reasons = ?, reviewed_at = ?, identity_verified = ?, income_docs_verified = ?
      WHERE id = ?
    `,
    [
      decision,
      reasons,
      decision === "pending" ? null : new Date().toISOString(),
      input.identity_verified == null ? (existing.identity_verified ? 1 : 0) : input.identity_verified ? 1 : 0,
      input.income_docs_verified == null ? (existing.income_docs_verified ? 1 : 0) : input.income_docs_verified ? 1 : 0,
      applicationId,
    ],
    `
      UPDATE screening_applications
      SET decision = $1, decision_reasons = $2, reviewed_at = $3, identity_verified = $4, income_docs_verified = $5
      WHERE id = $6
    `,
  );

  return getScreeningApplicationById(applicationId);
}

export async function getScreeningApplicationById(applicationId) {
  const row = await queryOne(
    `
      SELECT
        sa.*,
        cp.prospect_id AS lead_code,
        cp.first_name,
        cp.last_name,
        cp.stage,
        sp.policy_code,
        sp.label AS policy_label,
        sp.min_credit_score,
        sp.min_income_rent_ratio,
        sp.max_open_collections_cents,
        sp.requires_identity_pass,
        sp.require_income_docs,
        u.unit_number,
        u.market_rent_cents,
        a.asset_id AS asset_code
      FROM screening_applications sa
      JOIN crm_prospects cp ON sa.prospect_id = cp.id
      LEFT JOIN screening_policies sp ON sa.policy_id = sp.id
      LEFT JOIN units u ON sa.unit_id = u.id
      LEFT JOIN assets a ON u.asset_id = a.id
      WHERE sa.id = ?
    `,
    [applicationId],
    `
      SELECT
        sa.*,
        cp.prospect_id AS lead_code,
        cp.first_name,
        cp.last_name,
        cp.stage,
        sp.policy_code,
        sp.label AS policy_label,
        sp.min_credit_score,
        sp.min_income_rent_ratio,
        sp.max_open_collections_cents,
        sp.requires_identity_pass,
        sp.require_income_docs,
        u.unit_number,
        u.market_rent_cents,
        a.asset_id AS asset_code
      FROM screening_applications sa
      JOIN crm_prospects cp ON sa.prospect_id = cp.id
      LEFT JOIN screening_policies sp ON sa.policy_id = sp.id
      LEFT JOIN units u ON sa.unit_id = u.id
      LEFT JOIN assets a ON u.asset_id = a.id
      WHERE sa.id = $1
    `,
  );
  return row
    ? {
        ...normalizeApplication(row),
        prospect_name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      }
    : null;
}
