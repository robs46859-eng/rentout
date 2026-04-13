const $ = (sel) => document.querySelector(sel);

const state = {
  actor: null,
  pendingChallenge: null,
  mfaSetup: null,
};

function setBanner(id, message = "") {
  const node = $(id);
  if (!node) return;
  if (message) {
    node.hidden = false;
    node.textContent = message;
  } else {
    node.hidden = true;
    node.textContent = "";
  }
}

function setAuthPanels(mode) {
  $("#auth-login-panel").hidden = mode !== "login";
  $("#auth-mfa-panel").hidden = mode !== "mfa";
}

function setAuthState({ locked, actor = null, error = "", mode = "login" }) {
  state.actor = actor;
  $("#auth-gate").hidden = !locked;
  document.body.classList.toggle("auth-locked", locked);
  setAuthPanels(locked ? mode : "login");
  setBanner("#auth-error", error);

  if (actor) {
    $("#auth-actor").textContent = `${actor.full_name} · ${actor.role}`;
    $("#auth-security").textContent = actor.mfa_enabled ? "MFA enabled" : "MFA not enabled";
  } else {
    $("#auth-actor").textContent = "Locked";
    $("#auth-security").textContent = "MFA unavailable";
  }

  const isAdmin = actor?.role === "admin";
  $("#admin").hidden = !isAdmin;
  $("#nav-admin-link").hidden = !isAdmin;
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401) {
    state.pendingChallenge = null;
    setAuthState({ locked: true, error: "Your session is not active.", mode: "login" });
    throw new Error("Unauthorized");
  }
  return response;
}

async function verifySession() {
  try {
    const response = await apiFetch("/api/session");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const session = await response.json();
    setAuthState({ locked: false, actor: session.actor });
    renderAccountState(session.actor);
    return session.actor;
  } catch {
    setAuthState({ locked: true, mode: "login" });
    renderAccountState(null);
    return null;
  }
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number(n),
  );
}

function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "running") return "status-bar--run";
  if (s === "queued") return "status-bar--queue";
  if (s === "partial") return "status-bar--partial";
  return "status-bar--queue";
}

function td(text, extraClass) {
  const el = document.createElement("td");
  if (extraClass) el.className = extraClass;
  el.textContent = text;
  return el;
}

function inputCell({ type = "text", value = "", className = "" }) {
  const tdEl = document.createElement("td");
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.className = `auth-input table-input ${className}`.trim();
  tdEl.appendChild(input);
  return { td: tdEl, input };
}

function selectCell(value, options) {
  const tdEl = document.createElement("td");
  const select = document.createElement("select");
  select.className = "auth-input table-input";
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    if (optionValue === value) option.selected = true;
    select.appendChild(option);
  }
  tdEl.appendChild(select);
  return { td: tdEl, select };
}

function checkboxCell(value) {
  const tdEl = document.createElement("td");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.className = "table-checkbox";
  tdEl.appendChild(input);
  return { td: tdEl, input };
}

function renderAssets(data) {
  const tbody = $("#assets-body");
  tbody.replaceChildren();
  for (const a of data.property_management.assets) {
    const tr = document.createElement("tr");
    tr.appendChild(td(a.asset_id, "mono"));
    tr.appendChild(td(a.name || ""));
    tr.appendChild(td(a.manager_name || "—"));
    tr.appendChild(td(a.asset_class));
    tr.appendChild(td(String(a.total_units), "mono"));
    tr.appendChild(td(a.occupied_units != null ? String(a.occupied_units) : "—", "mono"));
    tr.appendChild(td(a.vacant_units != null ? String(a.vacant_units) : "—", "mono"));
    tr.appendChild(td(a.active_work_orders != null ? String(a.active_work_orders) : "—", "mono"));
    tbody.appendChild(tr);
  }
}

function renderUnits(data) {
  const tbody = $("#units-body");
  tbody.replaceChildren();
  for (const u of data.property_management.units) {
    const tr = document.createElement("tr");
    tr.appendChild(td(u.asset_code, "mono"));
    tr.appendChild(td(u.unit_number, "mono"));
    tr.appendChild(td(u.status || "—"));
    tr.appendChild(td(`${u.bedrooms || "—"}/${u.bathrooms || "—"}`, "mono"));
    tr.appendChild(td(u.market_rent != null ? fmtMoney(u.market_rent) : "—", "mono"));
    tr.appendChild(td(u.key_return_status || "—"));
    tr.appendChild(td(u.make_ready_progress != null ? `${u.make_ready_progress}%` : "—", "mono"));
    tbody.appendChild(tr);
  }
}

function renderLeases(data) {
  const tbody = $("#leases-body");
  tbody.replaceChildren();
  for (const l of data.property_management.leases) {
    const tr = document.createElement("tr");
    const unitLabel = `${l.asset_code} #${l.unit_number}`;
    tr.appendChild(td(unitLabel, "mono"));
    tr.appendChild(td(l.prior_tenant_name || "—"));
    tr.appendChild(td(l.lease_ended_date || "—"));
    tr.appendChild(td(l.monthly_rent != null ? fmtMoney(l.monthly_rent) : "—", "mono"));
    tr.appendChild(td(l.deposit != null ? fmtMoney(l.deposit) : "—", "mono"));
    tr.appendChild(td(l.status || "—"));
    tbody.appendChild(tr);
  }
}

function renderWorkOrders(data) {
  const tbody = $("#work-orders-body");
  tbody.replaceChildren();
  for (const order of data.property_management.work_orders) {
    const tr = document.createElement("tr");
    tr.appendChild(td(order.asset_code, "mono"));
    tr.appendChild(td(order.unit_number || "—", "mono"));
    tr.appendChild(td(order.title));
    tr.appendChild(td(order.priority));
    tr.appendChild(td(order.status));
    tr.appendChild(td(order.assigned_to || order.vendor_name || "—"));
    tr.appendChild(td(order.due_date || "—", "mono"));
    tbody.appendChild(tr);
  }
}

function renderMarket(data) {
  const m = data.market_analytics;
  $("#m-rent").textContent = fmtMoney(m.market_avg_rent);
  $("#m-occ").textContent = fmtPct(m.occupancy_avg_pct);
  $("#m-heat").textContent = m.market_heat_score != null ? String(m.market_heat_score) : "—";
  $("#m-sub").textContent = [m.submarket_id, m.submarket_label].filter(Boolean).join(" · ") || "—";
  $("#m-src").textContent = m.live_source ? `Source: ${m.live_source}` : "";
}

function renderCrm(data) {
  const stageHost = $("#crm-stage-host");
  stageHost.replaceChildren();
  for (const stage of data.crm.stages) {
    const card = document.createElement("div");
    card.className = "card card--inset";

    const label = document.createElement("p");
    label.className = "label-sm";
    label.textContent = stage.stage;
    card.appendChild(label);

    const metric = document.createElement("p");
    metric.className = "metric mono";
    metric.textContent = String(stage.count);
    card.appendChild(metric);

    stageHost.appendChild(card);
  }

  const prospectsBody = $("#crm-prospects-body");
  prospectsBody.replaceChildren();
  for (const prospect of data.crm.prospects) {
    const tr = document.createElement("tr");
    const unitTarget = [prospect.asset_code, prospect.unit_number ? `#${prospect.unit_number}` : null].filter(Boolean).join(" ");
    const nextStep = [prospect.next_activity_type, prospect.next_activity_at ? new Date(prospect.next_activity_at).toLocaleString() : null]
      .filter(Boolean)
      .join(" · ");
    tr.appendChild(td(prospect.full_name, "mono"));
    tr.appendChild(td(prospect.stage));
    tr.appendChild(td(unitTarget || "—", "mono"));
    tr.appendChild(td(prospect.budget_monthly != null ? fmtMoney(prospect.budget_monthly) : "—", "mono"));
    tr.appendChild(td(prospect.assigned_agent || "—"));
    tr.appendChild(td(nextStep || "—"));
    prospectsBody.appendChild(tr);
  }

  const actionsHost = $("#crm-actions-host");
  actionsHost.replaceChildren();
  for (const action of data.crm.next_actions) {
    const row = document.createElement("article");
    row.className = "stack-item";

    const top = document.createElement("p");
    top.className = "label-sm";
    top.textContent = `${action.activity_type} · ${action.stage}`;
    row.appendChild(top);

    const title = document.createElement("p");
    title.className = "metric";
    title.style.fontSize = "1rem";
    title.textContent = action.prospect_name;
    row.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "metric-sub";
    const when = action.scheduled_for ? new Date(action.scheduled_for).toLocaleString() : "Unscheduled";
    sub.textContent = `${when} · ${action.owner || "Unassigned"}`;
    row.appendChild(sub);

    if (action.summary) {
      const summary = document.createElement("p");
      summary.className = "metric-sub";
      summary.textContent = action.summary;
      row.appendChild(summary);
    }

    actionsHost.appendChild(row);
  }
}

function renderScreening(data) {
  const summaryHost = $("#screening-summary-host");
  summaryHost.replaceChildren();
  for (const [label, value] of Object.entries(data.screening.summary)) {
    const card = document.createElement("div");
    card.className = "card card--inset";

    const heading = document.createElement("p");
    heading.className = "label-sm";
    heading.textContent = label.replaceAll("_", " ");
    card.appendChild(heading);

    const metric = document.createElement("p");
    metric.className = "metric mono";
    metric.textContent = String(value);
    card.appendChild(metric);

    summaryHost.appendChild(card);
  }

  const policiesBody = $("#screening-policies-body");
  policiesBody.replaceChildren();
  for (const policy of data.screening.policies) {
    const tr = document.createElement("tr");
    tr.appendChild(td(policy.label));
    tr.appendChild(td(String(policy.min_credit_score), "mono"));
    tr.appendChild(td(`${policy.min_income_rent_ratio}x`, "mono"));
    tr.appendChild(td(fmtMoney((policy.max_open_collections_cents || 0) / 100), "mono"));
    tr.appendChild(td(policy.requires_identity_pass ? "Required" : "Optional"));
    policiesBody.appendChild(tr);
  }

  const appsBody = $("#screening-applications-body");
  appsBody.replaceChildren();
  for (const app of data.screening.applications) {
    const tr = document.createElement("tr");
    tr.appendChild(td(app.prospect_name));
    tr.appendChild(td([app.asset_code, app.unit_number ? `#${app.unit_number}` : null].filter(Boolean).join(" "), "mono"));
    tr.appendChild(td(app.decision));
    tr.appendChild(td(app.credit_score != null ? String(app.credit_score) : "—", "mono"));
    tr.appendChild(td(app.gross_monthly_income != null ? fmtMoney(app.gross_monthly_income) : "—", "mono"));
    tr.appendChild(td((app.decision_reasons || []).join("; ") || "—"));
    appsBody.appendChild(tr);
  }
}

function renderDemo(data) {
  const d = data.demographics;
  $("#d-rad").textContent = d.radius_miles != null ? `${d.radius_miles} mi` : "—";
  $("#d-hhi").textContent = d.average_hhi != null ? fmtMoney(d.average_hhi) : "—";
  $("#d-vac").textContent = fmtPct(d.vacancy_rate_pct);
  $("#d-place").textContent = d.place_name ? String(d.place_name) : d.live_source || "";
}

function renderWorkflow(data) {
  const host = $("#jobs-host");
  host.replaceChildren();
  for (const j of data.workflow.jobs) {
    const el = document.createElement("article");
    el.className = "card";
    el.style.paddingLeft = "28px";

    const bar = document.createElement("div");
    bar.className = `status-bar ${statusClass(j.status)}`;
    bar.setAttribute("aria-hidden", "true");
    el.appendChild(bar);

    const step = document.createElement("p");
    step.className = "label-sm";
    step.textContent = `${j.step_label} · ${j.status}`;
    el.appendChild(step);

    const title = document.createElement("h3");
    title.className = "metric";
    title.style.fontSize = "1.1rem";
    title.textContent = j.job_name;
    el.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "metric-sub mono";
    const nl = j.neural_load != null ? (j.neural_load * 100).toFixed(0) : "—";
    const cl = j.cpu_load != null ? (j.cpu_load * 100).toFixed(0) : "—";
    sub.textContent = `Neural ${nl}% · CPU ${cl}%`;
    el.appendChild(sub);

    host.appendChild(el);
  }

  const sh = data.workflow.system_health;
  $("#c-l1").textContent = sh.cache_l1_pct != null ? fmtPct(sh.cache_l1_pct, 1) : "—";
  $("#c-l2").textContent = sh.cache_l2_pct != null ? fmtPct(sh.cache_l2_pct, 1) : "—";
  $("#c-l3").textContent = sh.cache_l3_pct != null ? fmtPct(sh.cache_l3_pct, 1) : "—";
  $("#c-mem").textContent = sh.memory_usage_mb != null ? `${sh.memory_usage_mb.toFixed(1)} MB` : "—";
}

function renderSeo(data) {
  const host = $("#seo-host");
  host.replaceChildren();
  for (const s of data.seo_distribution) {
    const card = document.createElement("div");
    card.className = "card";

    const label = document.createElement("p");
    label.className = "label-sm";
    label.textContent = s.channel_name;
    card.appendChild(label);

    const score = document.createElement("p");
    score.className = "metric";
    score.textContent = fmtPct(s.local_seo_score, 0);
    card.appendChild(score);

    const sub = document.createElement("p");
    sub.className = "metric-sub";
    sub.textContent = `Distribution ${fmtPct(s.distribution_pct, 0)} · Completeness ${fmtPct(s.listing_completeness, 0)}`;
    card.appendChild(sub);

    const ul = document.createElement("ul");
    ul.className = "tag-list";
    ul.style.marginTop = "16px";
    const clusters = Array.isArray(s.keyword_clusters) ? s.keyword_clusters : [];
    for (const k of clusters) {
      const li = document.createElement("li");
      li.textContent = k;
      ul.appendChild(li);
    }
    card.appendChild(ul);

    host.appendChild(card);
  }
}

function renderAccountState(actor) {
  $("#mfa-status-text").textContent = actor
    ? actor.mfa_enabled
      ? "MFA is active for this operator account."
      : "MFA is not active. Enroll an authenticator before launch."
    : "Sign in to manage account security.";
  $("#mfa-disable-panel").hidden = !actor?.mfa_enabled;
  if (!actor?.mfa_enabled) {
    $("#mfa-setup-panel").hidden = state.mfaSetup == null;
  }
}

function renderPmsStatus(status) {
  if (!status) {
    $("#admin-pms-status").textContent = "Buildium connection not checked.";
    $("#admin-pms-meta").textContent = "—";
    return;
  }
  const account = status.account || {};
  $("#admin-pms-status").textContent = `${status.provider} · ${account.status || (status.configured ? "configured" : "disconnected")}`;
  const lastRun = status.recent_runs?.[0];
  $("#admin-pms-meta").textContent = [
    status.configured ? "credentials present" : "credentials missing",
    account.last_verified_at ? `verified ${new Date(account.last_verified_at).toLocaleString()}` : null,
    lastRun?.completed_at ? `last sync ${new Date(lastRun.completed_at).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "—";
}

function renderAuditLogs(rows) {
  const tbody = $("#admin-audit-body");
  tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.appendChild(td(row.created_at ? new Date(row.created_at).toLocaleString() : "—", "mono"));
    tr.appendChild(td(row.operator_name || row.operator_email || "System"));
    tr.appendChild(td(row.action, "mono"));
    tr.appendChild(td([row.entity_type, row.entity_id].filter(Boolean).join(" · "), "mono"));
    tr.appendChild(td(row.payload ? JSON.stringify(row.payload) : "—", "mono pre-wrap"));
    tbody.appendChild(tr);
  }
}

function renderOperators(rows) {
  const tbody = $("#admin-operators-body");
  tbody.replaceChildren();

  for (const operator of rows) {
    const tr = document.createElement("tr");
    const nameCell = inputCell({ value: operator.full_name });
    const roleCell = selectCell(operator.role, ["viewer", "operator", "admin"]);
    const activeCell = checkboxCell(operator.is_active);

    tr.appendChild(nameCell.td);
    tr.appendChild(td(operator.email, "mono"));
    tr.appendChild(roleCell.td);
    tr.appendChild(activeCell.td);
    tr.appendChild(td(operator.mfa_enabled ? "Enabled" : "Off"));
    tr.appendChild(td(operator.last_login_at ? new Date(operator.last_login_at).toLocaleString() : "—", "mono"));
    tr.appendChild(td(operator.password_changed_at ? new Date(operator.password_changed_at).toLocaleString() : "—", "mono"));

    const actions = document.createElement("td");
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "row-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "btn-secondary";
    saveButton.textContent = "Save access";
    saveButton.addEventListener("click", async () => {
      setBanner("#admin-operator-error");
      try {
        const response = await apiFetch(`/api/v1/admin/operators/${operator.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            full_name: nameCell.input.value.trim(),
            role: roleCell.select.value,
            is_active: activeCell.input.checked,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        await loadAdminData();
      } catch (error) {
        setBanner("#admin-operator-error", String(error?.message || error));
      }
    });
    actionsWrap.appendChild(saveButton);

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "New password";
    passwordInput.className = "auth-input table-input";
    actionsWrap.appendChild(passwordInput);

    const resetMfaLabel = document.createElement("label");
    resetMfaLabel.className = "table-flag";
    const resetMfaCheckbox = document.createElement("input");
    resetMfaCheckbox.type = "checkbox";
    resetMfaLabel.appendChild(resetMfaCheckbox);
    resetMfaLabel.append(" reset MFA");
    actionsWrap.appendChild(resetMfaLabel);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "btn-secondary";
    resetButton.textContent = "Reset password";
    resetButton.addEventListener("click", async () => {
      setBanner("#admin-operator-error");
      try {
        const nextPassword = passwordInput.value;
        if (!nextPassword) throw new Error("Enter a new password first.");
        const response = await apiFetch(`/api/v1/admin/operators/${operator.id}/reset-password`, {
          method: "POST",
          body: JSON.stringify({
            new_password: nextPassword,
            revoke_sessions: true,
            reset_mfa: resetMfaCheckbox.checked,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        passwordInput.value = "";
        resetMfaCheckbox.checked = false;
        await loadAdminData();
      } catch (error) {
        setBanner("#admin-operator-error", String(error?.message || error));
      }
    });
    actionsWrap.appendChild(resetButton);

    actions.appendChild(actionsWrap);
    tr.appendChild(actions);
    tbody.appendChild(tr);
  }
}

async function loadAdminData() {
  if (state.actor?.role !== "admin") return;
  const [operatorsResponse, auditResponse, pmsResponse] = await Promise.all([
    apiFetch("/api/v1/admin/operators"),
    apiFetch("/api/v1/admin/audit-logs?limit=100"),
    apiFetch("/api/v1/admin/integrations/pms"),
  ]);

  if (!operatorsResponse.ok) {
    const body = await operatorsResponse.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${operatorsResponse.status}`);
  }
  if (!auditResponse.ok) {
    const body = await auditResponse.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${auditResponse.status}`);
  }
  if (!pmsResponse.ok) {
    const body = await pmsResponse.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${pmsResponse.status}`);
  }

  renderOperators(await operatorsResponse.json());
  renderAuditLogs(await auditResponse.json());
  renderPmsStatus(await pmsResponse.json());
}

async function load() {
  const banner = $("#error-banner");
  banner.hidden = true;
  $("#main-loader").hidden = false;
  try {
    const response = await apiFetch("/api/v1/consolidated");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    $("#gen-at").textContent = new Date(data.generated_at).toLocaleString();

    renderAssets(data);
    renderUnits(data);
    renderLeases(data);
    renderWorkOrders(data);
    renderCrm(data);
    renderScreening(data);
    renderMarket(data);
    renderDemo(data);
    renderWorkflow(data);
    renderSeo(data);

    const errs = [];
    if (data.market_analytics?.live_error) errs.push(`Market: ${data.market_analytics.live_error}`);
    if (data.demographics?.live_error) errs.push(`Demographics: ${data.demographics.live_error}`);
    if (errs.length) {
      banner.hidden = false;
      banner.textContent = errs.join(" · ");
    }
  } catch (error) {
    if (String(error?.message || error) !== "Unauthorized") {
      banner.hidden = false;
      banner.textContent = String(error?.message || error);
    }
  } finally {
    $("#main-loader").hidden = true;
  }
}

async function loadSuite() {
  await load();
  if (state.actor?.role === "admin") {
    await loadAdminData();
  }
}

async function handleLogin() {
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  if (!email || !password) {
    setAuthState({ locked: true, error: "Enter both email and password.", mode: "login" });
    return;
  }

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const body = await response.json().catch(() => ({}));
    if (response.status === 202 && body.requires_mfa) {
      state.pendingChallenge = body.challenge_token;
      $("#auth-password").value = "";
      $("#auth-mfa-code").value = "";
      $("#auth-mfa-message").textContent = `Enter the authenticator code for ${body.actor_hint?.email || email}, or use a recovery code.`;
      setAuthState({ locked: true, error: "", mode: "mfa" });
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    $("#auth-password").value = "";
    const actor = await verifySession();
    if (actor) {
      await loadSuite();
    }
  } catch (error) {
    setAuthState({ locked: true, error: String(error?.message || error), mode: "login" });
  }
}

async function handleLoginMfaVerify() {
  if (!state.pendingChallenge) {
    setAuthState({ locked: true, error: "Start sign in again.", mode: "login" });
    return;
  }
  const code = $("#auth-mfa-code").value.trim();
  if (!code) {
    setAuthState({ locked: true, error: "Enter the authenticator or recovery code.", mode: "mfa" });
    return;
  }
  try {
    const response = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        challenge_token: state.pendingChallenge,
        code,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    state.pendingChallenge = null;
    $("#auth-mfa-code").value = "";
    const actor = await verifySession();
    if (actor) {
      await loadSuite();
    }
  } catch (error) {
    setAuthState({ locked: true, error: String(error?.message || error), mode: "mfa" });
  }
}

function resetLoginFlow() {
  state.pendingChallenge = null;
  $("#auth-password").value = "";
  $("#auth-mfa-code").value = "";
  setAuthState({ locked: true, error: "", mode: "login" });
}

async function handleLogout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {}
  state.pendingChallenge = null;
  state.mfaSetup = null;
  $("#gen-at").textContent = "—";
  renderAccountState(null);
  setAuthState({ locked: true, mode: "login" });
}

async function handlePasswordChange() {
  setBanner("#account-password-error");
  try {
    const response = await apiFetch("/api/v1/account/password/change", {
      method: "POST",
      body: JSON.stringify({
        current_password: $("#account-current-password").value,
        new_password: $("#account-new-password").value,
        mfa_code: $("#account-mfa-code").value.trim(),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    $("#account-current-password").value = "";
    $("#account-new-password").value = "";
    $("#account-mfa-code").value = "";
    await verifySession();
  } catch (error) {
    setBanner("#account-password-error", String(error?.message || error));
  }
}

async function handleMfaSetup() {
  setBanner("#account-mfa-error");
  try {
    const response = await apiFetch("/api/v1/account/mfa/setup", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    state.mfaSetup = body;
    $("#mfa-secret").textContent = body.secret;
    $("#mfa-uri").textContent = body.otp_auth_uri;
    $("#mfa-recovery-codes").textContent = (body.recovery_codes || []).join("\n");
    $("#mfa-setup-panel").hidden = false;
  } catch (error) {
    setBanner("#account-mfa-error", String(error?.message || error));
  }
}

async function handleMfaVerifySetup() {
  setBanner("#account-mfa-error");
  try {
    const response = await apiFetch("/api/v1/account/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code: $("#mfa-verify-code").value.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    state.mfaSetup = null;
    $("#mfa-verify-code").value = "";
    $("#mfa-setup-panel").hidden = true;
    await verifySession();
    if (state.actor?.role === "admin") {
      await loadAdminData();
    }
  } catch (error) {
    setBanner("#account-mfa-error", String(error?.message || error));
  }
}

async function handleMfaDisable() {
  setBanner("#account-mfa-error");
  try {
    const response = await apiFetch("/api/v1/account/mfa/disable", {
      method: "POST",
      body: JSON.stringify({
        password: $("#mfa-disable-password").value,
        code: $("#mfa-disable-code").value.trim(),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    $("#mfa-disable-password").value = "";
    $("#mfa-disable-code").value = "";
    state.mfaSetup = null;
    $("#mfa-setup-panel").hidden = true;
    await verifySession();
    if (state.actor?.role === "admin") {
      await loadAdminData();
    }
  } catch (error) {
    setBanner("#account-mfa-error", String(error?.message || error));
  }
}

async function handleCreateOperator() {
  setBanner("#admin-operator-error");
  try {
    const response = await apiFetch("/api/v1/admin/operators", {
      method: "POST",
      body: JSON.stringify({
        full_name: $("#admin-create-name").value.trim(),
        email: $("#admin-create-email").value.trim(),
        role: $("#admin-create-role").value,
        password: $("#admin-create-password").value,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    $("#admin-create-name").value = "";
    $("#admin-create-email").value = "";
    $("#admin-create-role").value = "operator";
    $("#admin-create-password").value = "";
    await loadAdminData();
  } catch (error) {
    setBanner("#admin-operator-error", String(error?.message || error));
  }
}

async function handlePmsAction(path, errorTarget) {
  setBanner(errorTarget);
  try {
    const response = await apiFetch(path, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    await loadAdminData();
    await load();
  } catch (error) {
    setBanner(errorTarget, String(error?.message || error));
  }
}

$("#btn-refresh").addEventListener("click", () => loadSuite());
$("#btn-auth-login").addEventListener("click", () => handleLogin());
$("#btn-auth-mfa-verify").addEventListener("click", () => handleLoginMfaVerify());
$("#btn-auth-back").addEventListener("click", () => resetLoginFlow());
$("#btn-logout").addEventListener("click", () => handleLogout());
$("#btn-password-change").addEventListener("click", () => handlePasswordChange());
$("#btn-mfa-setup").addEventListener("click", () => handleMfaSetup());
$("#btn-mfa-verify-setup").addEventListener("click", () => handleMfaVerifySetup());
$("#btn-mfa-disable").addEventListener("click", () => handleMfaDisable());
$("#btn-admin-create-operator").addEventListener("click", () => handleCreateOperator());
$("#btn-admin-refresh-audit").addEventListener("click", () => loadAdminData().catch((error) => setBanner("#admin-operator-error", String(error?.message || error))));
$("#btn-admin-test-pms").addEventListener("click", () => handlePmsAction("/api/v1/admin/integrations/pms/test", "#admin-pms-error"));
$("#btn-admin-sync-pms").addEventListener("click", () => handlePmsAction("/api/v1/admin/integrations/pms/sync", "#admin-pms-error"));

$("#auth-password").addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleLogin();
});
$("#auth-email").addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleLogin();
});
$("#auth-mfa-code").addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleLoginMfaVerify();
});

document.addEventListener("DOMContentLoaded", async () => {
  const actor = await verifySession();
  if (actor) {
    await loadSuite();
  }
});
