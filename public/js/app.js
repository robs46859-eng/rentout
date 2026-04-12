const $ = (sel) => document.querySelector(sel);

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

function renderAssets(data) {
  const tbody = $("#assets-body");
  tbody.replaceChildren();
  for (const a of data.property_management.assets) {
    const tr = document.createElement("tr");
    tr.appendChild(td(a.asset_id, "mono"));
    tr.appendChild(td(a.name || ""));
    tr.appendChild(td(a.asset_class));
    tr.appendChild(td(a.construction_year != null ? String(a.construction_year) : "—", "mono"));
    tr.appendChild(td(String(a.total_units), "mono"));
    tr.appendChild(td(a.open_tickets != null ? String(a.open_tickets) : "—", "mono"));
    tr.appendChild(td(a.unresolved_damages != null ? String(a.unresolved_damages) : "—", "mono"));
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
    tr.appendChild(td(u.key_return_status || "—"));
    tr.appendChild(td(u.unit_health_audit_score != null ? String(u.unit_health_audit_score) : "—", "mono"));
    tr.appendChild(td(u.archive_readiness ? "Ready" : "Hold"));
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
    tr.appendChild(td(l.prior_tenant_external_id || "—", "mono"));
    tr.appendChild(td(l.lease_ended_date || "—"));
    tr.appendChild(td(l.term_of_occupancy_months != null ? String(l.term_of_occupancy_months) : "—", "mono"));
    tr.appendChild(td(l.rent_payment_schedule || ""));
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

async function load() {
  const banner = $("#error-banner");
  banner.hidden = true;
  $("#main-loader").hidden = false;
  try {
    const res = await fetch("/api/v1/consolidated");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    $("#gen-at").textContent = new Date(data.generated_at).toLocaleString();

    renderAssets(data);
    renderUnits(data);
    renderLeases(data);
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
  } catch (e) {
    banner.hidden = false;
    banner.textContent = String(e?.message || e);
  } finally {
    $("#main-loader").hidden = true;
  }
}

$("#btn-refresh").addEventListener("click", () => load());
document.addEventListener("DOMContentLoaded", load);
