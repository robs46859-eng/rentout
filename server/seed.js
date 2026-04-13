import "dotenv/config";
import { closeDb, execute, migrate, queryOne, resetTable } from "./db.js";

await migrate();

const tables = [
  "integration_sync_runs",
  "integration_accounts",
  "auth_login_challenges",
  "auth_sessions",
  "audit_logs",
  "screening_applications",
  "screening_policies",
  "crm_activities",
  "crm_prospects",
  "work_orders",
  "leases",
  "units",
  "maintenance_snapshots",
  "assets",
  "workflow_jobs",
  "cache_health",
  "seo_channels",
  "market_snapshots",
  "demographic_snapshots",
];

for (const table of tables) {
  await resetTable(table);
}

for (const asset of [
  {
    asset_id: "AST-PHX-01",
    name: "Project Phoenix",
    asset_class: "Class B Multifamily",
    construction_year: 2014,
    total_units: 186,
    address_line: "1200 Blake St",
    city: "Denver",
    state: "CO",
    postal_code: "80205",
    manager_name: "A. Carter",
    occupancy_target_pct: 95,
  },
  {
    asset_id: "AST-DEN-44",
    name: "Blake Yard Lofts",
    asset_class: "Class A Mixed-Use",
    construction_year: 2019,
    total_units: 92,
    address_line: "44 W 12th Ave",
    city: "Denver",
    state: "CO",
    postal_code: "80204",
    manager_name: "R. Smith",
    occupancy_target_pct: 96,
  },
]) {
  await execute(
    `
      INSERT INTO assets (
        asset_id, name, asset_class, construction_year, total_units,
        address_line, city, state, postal_code, manager_name, occupancy_target_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ],
    `
      INSERT INTO assets (
        asset_id, name, asset_class, construction_year, total_units,
        address_line, city, state, postal_code, manager_name, occupancy_target_pct
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
  );
}

const assetIds = {
  "AST-PHX-01": Number((await queryOne(`SELECT id FROM assets WHERE asset_id = ?`, ["AST-PHX-01"], `SELECT id FROM assets WHERE asset_id = $1`)).id),
  "AST-DEN-44": Number((await queryOne(`SELECT id FROM assets WHERE asset_id = ?`, ["AST-DEN-44"], `SELECT id FROM assets WHERE asset_id = $1`)).id),
};

for (const unit of [
  {
    asset_id: assetIds["AST-PHX-01"],
    unit_number: "204",
    key_return_status: "Received",
    unit_health_audit_score: 88,
    archive_readiness: 1,
    bedrooms: 2,
    bathrooms: 2,
    square_feet: 1035,
    market_rent_cents: 248000,
    status: "make_ready",
    available_on: "2026-04-28",
    make_ready_progress: 80,
  },
  {
    asset_id: assetIds["AST-PHX-01"],
    unit_number: "305",
    key_return_status: "Outstanding",
    unit_health_audit_score: 72,
    archive_readiness: 0,
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 918,
    market_rent_cents: 239500,
    status: "vacant",
    available_on: "2026-05-06",
    make_ready_progress: 55,
  },
  {
    asset_id: assetIds["AST-DEN-44"],
    unit_number: "12B",
    key_return_status: "Received",
    unit_health_audit_score: 94,
    archive_readiness: 1,
    bedrooms: 1,
    bathrooms: 1,
    square_feet: 740,
    market_rent_cents: 225000,
    status: "notice",
    available_on: "2026-05-01",
    make_ready_progress: 100,
  },
]) {
  await execute(
    `
      INSERT INTO units (
        asset_id, unit_number, key_return_status, unit_health_audit_score, archive_readiness,
        bedrooms, bathrooms, square_feet, market_rent_cents, status, available_on, make_ready_progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      unit.asset_id,
      unit.unit_number,
      unit.key_return_status,
      unit.unit_health_audit_score,
      unit.archive_readiness,
      unit.bedrooms,
      unit.bathrooms,
      unit.square_feet,
      unit.market_rent_cents,
      unit.status,
      unit.available_on,
      unit.make_ready_progress,
    ],
    `
      INSERT INTO units (
        asset_id, unit_number, key_return_status, unit_health_audit_score, archive_readiness,
        bedrooms, bathrooms, square_feet, market_rent_cents, status, available_on, make_ready_progress
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
  );
}

const unitIds = {
  "AST-PHX-01#204": Number(
    (await queryOne(
      `SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = ? AND u.unit_number = ?`,
      ["AST-PHX-01", "204"],
      `SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = $1 AND u.unit_number = $2`,
    )).id,
  ),
  "AST-PHX-01#305": Number(
    (await queryOne(
      `SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = ? AND u.unit_number = ?`,
      ["AST-PHX-01", "305"],
      `SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = $1 AND u.unit_number = $2`,
    )).id,
  ),
  "AST-DEN-44#12B": Number(
    (await queryOne(
      `SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = ? AND u.unit_number = ?`,
      ["AST-DEN-44", "12B"],
      `SELECT u.id FROM units u JOIN assets a ON u.asset_id = a.id WHERE a.asset_id = $1 AND u.unit_number = $2`,
    )).id,
  ),
};

for (const snapshot of [
  { asset_id: assetIds["AST-PHX-01"], open_tickets: 7, unresolved_damages: 3 },
  { asset_id: assetIds["AST-DEN-44"], open_tickets: 2, unresolved_damages: 0 },
]) {
  await execute(
    `INSERT INTO maintenance_snapshots (asset_id, open_tickets, unresolved_damages) VALUES (?, ?, ?)`,
    [snapshot.asset_id, snapshot.open_tickets, snapshot.unresolved_damages],
    `INSERT INTO maintenance_snapshots (asset_id, open_tickets, unresolved_damages) VALUES ($1, $2, $3)`,
  );
}

await execute(
  `
    INSERT INTO leases (
      unit_id, prior_tenant_name, prior_tenant_external_id, lease_ended_date, term_of_occupancy_months,
      rent_payment_schedule, early_exit_clause, pet_addendum, parking_stalls, storage_units, custom_clauses,
      status, monthly_rent_cents, deposit_cents
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    unitIds["AST-PHX-01#204"],
    "Jordan Ellis",
    "TNT-88421",
    "2025-11-30",
    14,
    "Monthly ACH on 1st; $2,480.00 base",
    "90-day notice; fee 1.5x monthly after month 6",
    "1 cat; $35/mo; deposit $400",
    "P2-18",
    "S-12",
    JSON.stringify({ noise: "Quiet hours 10pm-7am", insurance: "Renter liability $100k min" }),
    "ended",
    248000,
    180000,
  ],
  `
    INSERT INTO leases (
      unit_id, prior_tenant_name, prior_tenant_external_id, lease_ended_date, term_of_occupancy_months,
      rent_payment_schedule, early_exit_clause, pet_addendum, parking_stalls, storage_units, custom_clauses,
      status, monthly_rent_cents, deposit_cents
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `,
);

for (const order of [
  {
    asset_id: assetIds["AST-PHX-01"],
    unit_id: unitIds["AST-PHX-01#204"],
    title: "Paint turnover and patch drywall",
    category: "turn",
    priority: "high",
    status: "in_progress",
    assigned_to: "Make Ready Team",
    vendor_name: "Denver Paint Co",
    due_date: "2026-04-22",
    estimated_cost_cents: 185000,
    notes: "Complete before tour traffic starts.",
  },
  {
    asset_id: assetIds["AST-PHX-01"],
    unit_id: unitIds["AST-PHX-01#305"],
    title: "HVAC filter replacement and thermostat test",
    category: "hvac",
    priority: "medium",
    status: "open",
    assigned_to: "J. Morales",
    vendor_name: null,
    due_date: "2026-04-18",
    estimated_cost_cents: 24000,
    notes: "Needed before marketing photos.",
  },
  {
    asset_id: assetIds["AST-DEN-44"],
    unit_id: unitIds["AST-DEN-44#12B"],
    title: "Re-key unit after resident move-out",
    category: "security",
    priority: "urgent",
    status: "vendor_scheduled",
    assigned_to: "S. Lee",
    vendor_name: "Front Range Locksmith",
    due_date: "2026-04-14",
    estimated_cost_cents: 32000,
    notes: "Resident keys due back by noon.",
  },
]) {
  await execute(
    `
      INSERT INTO work_orders (
        asset_id, unit_id, title, category, priority, status, assigned_to,
        vendor_name, due_date, estimated_cost_cents, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      order.asset_id,
      order.unit_id,
      order.title,
      order.category,
      order.priority,
      order.status,
      order.assigned_to,
      order.vendor_name,
      order.due_date,
      order.estimated_cost_cents,
      order.notes,
    ],
    `
      INSERT INTO work_orders (
        asset_id, unit_id, title, category, priority, status, assigned_to,
        vendor_name, due_date, estimated_cost_cents, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
  );
}

for (const policy of [
  {
    policy_code: "STD-DENVER",
    label: "Denver Standard Multifamily",
    min_credit_score: 650,
    min_income_rent_ratio: 3,
    max_open_collections_cents: 150000,
    eviction_lookback_years: 5,
    criminal_lookback_years: 7,
    requires_identity_pass: 1,
    require_income_docs: 1,
    max_occupants_per_bedroom: 2,
    is_active: 1,
  },
  {
    policy_code: "LUX-LEASEUP",
    label: "Lease-Up Premium Assets",
    min_credit_score: 700,
    min_income_rent_ratio: 3.25,
    max_open_collections_cents: 75000,
    eviction_lookback_years: 7,
    criminal_lookback_years: 7,
    requires_identity_pass: 1,
    require_income_docs: 1,
    max_occupants_per_bedroom: 2,
    is_active: 1,
  },
]) {
  await execute(
    `
      INSERT INTO screening_policies (
        policy_code, label, min_credit_score, min_income_rent_ratio, max_open_collections_cents,
        eviction_lookback_years, criminal_lookback_years, requires_identity_pass, require_income_docs,
        max_occupants_per_bedroom, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      policy.policy_code,
      policy.label,
      policy.min_credit_score,
      policy.min_income_rent_ratio,
      policy.max_open_collections_cents,
      policy.eviction_lookback_years,
      policy.criminal_lookback_years,
      policy.requires_identity_pass,
      policy.require_income_docs,
      policy.max_occupants_per_bedroom,
      policy.is_active,
    ],
    `
      INSERT INTO screening_policies (
        policy_code, label, min_credit_score, min_income_rent_ratio, max_open_collections_cents,
        eviction_lookback_years, criminal_lookback_years, requires_identity_pass, require_income_docs,
        max_occupants_per_bedroom, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
  );
}

const policyIds = {
  "STD-DENVER": Number((await queryOne(`SELECT id FROM screening_policies WHERE policy_code = ?`, ["STD-DENVER"], `SELECT id FROM screening_policies WHERE policy_code = $1`)).id),
  "LUX-LEASEUP": Number((await queryOne(`SELECT id FROM screening_policies WHERE policy_code = ?`, ["LUX-LEASEUP"], `SELECT id FROM screening_policies WHERE policy_code = $1`)).id),
};

for (const prospect of [
  {
    prospect_id: "LEAD-1001",
    first_name: "Maya",
    last_name: "Thompson",
    email: "maya.thompson@example.com",
    phone: "(303) 555-0141",
    source: "Zillow",
    stage: "Lead",
    desired_bedrooms: 1,
    desired_move_in: "2026-05-01",
    budget_cents: 210000,
    assigned_agent: "R. Smith",
    asset_id: assetIds["AST-DEN-44"],
    unit_id: null,
    application_status: "not_started",
    screening_score: null,
    last_contact_at: "2026-04-12T15:30:00Z",
    notes: "Wants walkable location and covered parking.",
  },
  {
    prospect_id: "LEAD-1002",
    first_name: "Andre",
    last_name: "Lopez",
    email: "andre.lopez@example.com",
    phone: "(720) 555-0182",
    source: "Google Business",
    stage: "Qualified",
    desired_bedrooms: 2,
    desired_move_in: "2026-05-15",
    budget_cents: 255000,
    assigned_agent: "R. Smith",
    asset_id: assetIds["AST-PHX-01"],
    unit_id: unitIds["AST-PHX-01#305"],
    application_status: "tour_pending",
    screening_score: null,
    last_contact_at: "2026-04-13T08:10:00Z",
    notes: "Self-employed; can provide 6 months bank statements.",
  },
  {
    prospect_id: "LEAD-1003",
    first_name: "Priya",
    last_name: "Patel",
    email: "priya.patel@example.com",
    phone: "(970) 555-0124",
    source: "Apartments.com",
    stage: "Tour Scheduled",
    desired_bedrooms: 2,
    desired_move_in: "2026-05-20",
    budget_cents: 265000,
    assigned_agent: "A. Carter",
    asset_id: assetIds["AST-PHX-01"],
    unit_id: unitIds["AST-PHX-01#204"],
    application_status: "tour_booked",
    screening_score: null,
    last_contact_at: "2026-04-13T09:45:00Z",
    notes: "Tour confirmed for April 14 at 4:30 PM.",
  },
  {
    prospect_id: "LEAD-1004",
    first_name: "Ethan",
    last_name: "Brooks",
    email: "ethan.brooks@example.com",
    phone: "(303) 555-0165",
    source: "Referral",
    stage: "Application Submitted",
    desired_bedrooms: 1,
    desired_move_in: "2026-04-25",
    budget_cents: 235000,
    assigned_agent: "A. Carter",
    asset_id: assetIds["AST-DEN-44"],
    unit_id: unitIds["AST-DEN-44#12B"],
    application_status: "screening",
    screening_score: 714,
    last_contact_at: "2026-04-13T07:20:00Z",
    notes: "Employment verified. Waiting on landlord reference.",
  },
  {
    prospect_id: "LEAD-1005",
    first_name: "Sofia",
    last_name: "Nguyen",
    email: "sofia.nguyen@example.com",
    phone: "(303) 555-0199",
    source: "Instagram",
    stage: "Lease Sent",
    desired_bedrooms: 2,
    desired_move_in: "2026-04-28",
    budget_cents: 248000,
    assigned_agent: "R. Smith",
    asset_id: assetIds["AST-PHX-01"],
    unit_id: unitIds["AST-PHX-01#204"],
    application_status: "approved",
    screening_score: 742,
    last_contact_at: "2026-04-13T06:55:00Z",
    notes: "Approved. Lease package sent for countersignature.",
  },
]) {
  await execute(
    `
      INSERT INTO crm_prospects (
        prospect_id, first_name, last_name, email, phone, source, stage, desired_bedrooms,
        desired_move_in, budget_cents, assigned_agent, asset_id, unit_id, application_status,
        screening_score, last_contact_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      prospect.prospect_id,
      prospect.first_name,
      prospect.last_name,
      prospect.email,
      prospect.phone,
      prospect.source,
      prospect.stage,
      prospect.desired_bedrooms,
      prospect.desired_move_in,
      prospect.budget_cents,
      prospect.assigned_agent,
      prospect.asset_id,
      prospect.unit_id,
      prospect.application_status,
      prospect.screening_score,
      prospect.last_contact_at,
      prospect.notes,
    ],
    `
      INSERT INTO crm_prospects (
        prospect_id, first_name, last_name, email, phone, source, stage, desired_bedrooms,
        desired_move_in, budget_cents, assigned_agent, asset_id, unit_id, application_status,
        screening_score, last_contact_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `,
  );
}

const prospectIds = {};
for (const leadCode of ["LEAD-1001", "LEAD-1002", "LEAD-1003", "LEAD-1004", "LEAD-1005"]) {
  prospectIds[leadCode] = Number(
    (await queryOne(`SELECT id FROM crm_prospects WHERE prospect_id = ?`, [leadCode], `SELECT id FROM crm_prospects WHERE prospect_id = $1`)).id,
  );
}

for (const activity of [
  {
    prospect_id: prospectIds["LEAD-1001"],
    activity_type: "Call lead",
    status: "pending",
    scheduled_for: "2026-04-13T16:00:00Z",
    completed_at: null,
    owner: "R. Smith",
    summary: "First outreach within 24 hours of Zillow inquiry.",
  },
  {
    prospect_id: prospectIds["LEAD-1002"],
    activity_type: "Collect proof of income",
    status: "pending",
    scheduled_for: "2026-04-13T18:30:00Z",
    completed_at: null,
    owner: "R. Smith",
    summary: "Send secure upload link after qualification call.",
  },
  {
    prospect_id: prospectIds["LEAD-1003"],
    activity_type: "Tour reminder SMS",
    status: "pending",
    scheduled_for: "2026-04-14T14:30:00Z",
    completed_at: null,
    owner: "A. Carter",
    summary: "Automated reminder two hours before showing.",
  },
  {
    prospect_id: prospectIds["LEAD-1004"],
    activity_type: "Run screening review",
    status: "pending",
    scheduled_for: "2026-04-13T19:00:00Z",
    completed_at: null,
    owner: "A. Carter",
    summary: "Finalize landlord reference and income ratio.",
  },
  {
    prospect_id: prospectIds["LEAD-1005"],
    activity_type: "Lease follow-up",
    status: "pending",
    scheduled_for: "2026-04-13T17:00:00Z",
    completed_at: null,
    owner: "R. Smith",
    summary: "Confirm countersignature ETA and deposit timing.",
  },
  {
    prospect_id: prospectIds["LEAD-1003"],
    activity_type: "Pre-tour call completed",
    status: "done",
    scheduled_for: "2026-04-13T13:00:00Z",
    completed_at: "2026-04-13T13:12:00Z",
    owner: "A. Carter",
    summary: "Confirmed parking, pets, and preferred lease term.",
  },
]) {
  await execute(
    `
      INSERT INTO crm_activities (
        prospect_id, activity_type, status, scheduled_for, completed_at, owner, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      activity.prospect_id,
      activity.activity_type,
      activity.status,
      activity.scheduled_for,
      activity.completed_at,
      activity.owner,
      activity.summary,
    ],
    `
      INSERT INTO crm_activities (
        prospect_id, activity_type, status, scheduled_for, completed_at, owner, summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
  );
}

for (const application of [
  {
    prospect_id: prospectIds["LEAD-1004"],
    unit_id: unitIds["AST-DEN-44#12B"],
    policy_id: policyIds["LUX-LEASEUP"],
    gross_monthly_income_cents: 780000,
    credit_score: 714,
    open_collections_cents: 0,
    occupants_count: 1,
    has_eviction: 0,
    has_felony: 0,
    identity_verified: 1,
    income_docs_verified: 1,
    decision: "conditional",
    decision_reasons: JSON.stringify(["Waiting on prior landlord reference"]),
    reviewed_at: "2026-04-13T11:00:00Z",
  },
  {
    prospect_id: prospectIds["LEAD-1005"],
    unit_id: unitIds["AST-PHX-01#204"],
    policy_id: policyIds["STD-DENVER"],
    gross_monthly_income_cents: 820000,
    credit_score: 742,
    open_collections_cents: 0,
    occupants_count: 2,
    has_eviction: 0,
    has_felony: 0,
    identity_verified: 1,
    income_docs_verified: 1,
    decision: "approved",
    decision_reasons: JSON.stringify(["Meets credit, income, and identity checks"]),
    reviewed_at: "2026-04-13T10:40:00Z",
  },
]) {
  await execute(
    `
      INSERT INTO screening_applications (
        prospect_id, unit_id, policy_id, gross_monthly_income_cents, credit_score,
        open_collections_cents, occupants_count, has_eviction, has_felony, identity_verified,
        income_docs_verified, decision, decision_reasons, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      application.prospect_id,
      application.unit_id,
      application.policy_id,
      application.gross_monthly_income_cents,
      application.credit_score,
      application.open_collections_cents,
      application.occupants_count,
      application.has_eviction,
      application.has_felony,
      application.identity_verified,
      application.income_docs_verified,
      application.decision,
      application.decision_reasons,
      application.reviewed_at,
    ],
    `
      INSERT INTO screening_applications (
        prospect_id, unit_id, policy_id, gross_monthly_income_cents, credit_score,
        open_collections_cents, occupants_count, has_eviction, has_felony, identity_verified,
        income_docs_verified, decision, decision_reasons, reviewed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `,
  );
}

for (const job of [
  {
    job_name: "Contract Rendering: Project Phoenix",
    step_number: 4,
    step_total: 6,
    status: "Running",
    neural_load: 0.62,
    cpu_load: 0.41,
    meta: JSON.stringify({ pipeline: "docgen-v3" }),
  },
  {
    job_name: "PMS Sync — Yardi Voyager",
    step_number: 1,
    step_total: 3,
    status: "Queued",
    neural_load: 0.08,
    cpu_load: 0.12,
    meta: null,
  },
  {
    job_name: "Unit Health Audit — Batch 12",
    step_number: 6,
    step_total: 6,
    status: "Partial",
    neural_load: 0.33,
    cpu_load: 0.58,
    meta: JSON.stringify({ failed_units: ["305"] }),
  },
]) {
  await execute(
    `
      INSERT INTO workflow_jobs (job_name, step_number, step_total, status, neural_load, cpu_load, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [job.job_name, job.step_number, job.step_total, job.status, job.neural_load, job.cpu_load, job.meta],
    `
      INSERT INTO workflow_jobs (job_name, step_number, step_total, status, neural_load, cpu_load, meta)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
  );
}

await execute(
  `INSERT INTO cache_health (l1_pct, l2_pct, l3_pct, memory_usage_mb) VALUES (?, ?, ?, ?)`,
  [94.2, 87.5, 76.1, 512.4],
  `INSERT INTO cache_health (l1_pct, l2_pct, l3_pct, memory_usage_mb) VALUES ($1, $2, $3, $4)`,
);

for (const seo of [
  {
    channel_name: "Zillow / StreetEasy syndication",
    local_seo_score: 82,
    distribution_pct: 34,
    listing_completeness: 91,
    keyword_clusters: JSON.stringify(["denver lofts", "blake st apartments", "pet friendly downtown"]),
  },
  {
    channel_name: "Apartments.com / CoStar",
    local_seo_score: 76,
    distribution_pct: 28,
    listing_completeness: 88,
    keyword_clusters: JSON.stringify(["2br denver", "washer dryer included"]),
  },
  {
    channel_name: "Google Business / Local Pack",
    local_seo_score: 88,
    distribution_pct: 22,
    listing_completeness: 95,
    keyword_clusters: JSON.stringify(["near union station", "RiNo apartments"]),
  },
]) {
  await execute(
    `
      INSERT INTO seo_channels (channel_name, local_seo_score, distribution_pct, listing_completeness, keyword_clusters)
      VALUES (?, ?, ?, ?, ?)
    `,
    [seo.channel_name, seo.local_seo_score, seo.distribution_pct, seo.listing_completeness, seo.keyword_clusters],
    `
      INSERT INTO seo_channels (channel_name, local_seo_score, distribution_pct, listing_completeness, keyword_clusters)
      VALUES ($1, $2, $3, $4, $5)
    `,
  );
}

await execute(
  `
    INSERT INTO market_snapshots (submarket_id, submarket_label, market_avg_rent, occupancy_avg_pct, market_heat_score, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ["DEN-RINO-01", "Denver — RiNo / Five Points", 2450, 94.2, 78, "seed"],
  `
    INSERT INTO market_snapshots (submarket_id, submarket_label, market_avg_rent, occupancy_avg_pct, market_heat_score, source)
    VALUES ($1, $2, $3, $4, $5, $6)
  `,
);

await execute(
  `
    INSERT INTO demographic_snapshots (radius_miles, average_hhi, vacancy_rate_pct, source)
    VALUES (?, ?, ?, ?)
  `,
  [3, 98500, 5.8, "seed"],
  `
    INSERT INTO demographic_snapshots (radius_miles, average_hhi, vacancy_rate_pct, source)
    VALUES ($1, $2, $3, $4)
  `,
);

console.log("Seed complete.");
await closeDb();
