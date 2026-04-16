'use strict';

const API_BASE = 'https://rentout-app.onrender.com';
const VISIBLE_STATUSES = new Set(['vacant', 'make_ready', 'notice']);

let currentUnit      = null;
let currentProspectId = null;

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initScrollReveal();
  loadListings();
  bindModalEvents();
  document.getElementById('btn-retry')?.addEventListener('click', loadListings);
});

// ─── Custom Cursor ───────────────────────────────────────────────────────────

function initCursor() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;
  let mx = 0, my = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });
  const tick = () => {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(tick);
  };
  tick();
}

// ─── Scroll Reveal ───────────────────────────────────────────────────────────

function initScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

function observeCard(el) {
  new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); }
    });
  }, { threshold: 0.05 }).observe(el);
}

// ─── Listings ────────────────────────────────────────────────────────────────

async function loadListings() {
  const grid     = document.getElementById('listings-grid');
  const loader   = document.getElementById('listings-loader');
  const errorEl  = document.getElementById('listings-error');
  const errorMsg = document.getElementById('listings-error-msg');
  const countEl  = document.getElementById('listings-count');

  grid.replaceChildren();
  loader.style.display  = 'flex';
  errorEl.style.display = 'none';
  countEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/public/listings`);
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    const { listings } = await res.json();

    const available = (listings ?? []).filter(u => VISIBLE_STATUSES.has(u.status));

    loader.style.display  = 'none';
    countEl.style.display = 'block';

    const strong = document.createElement('strong');
    strong.textContent = String(available.length);
    countEl.replaceChildren(
      strong,
      document.createTextNode(` unit${available.length !== 1 ? 's' : ''} available`)
    );

    if (available.length === 0) {
      const wrap = document.createElement('div');
      wrap.className = 'no-units';
      const icon = document.createElement('div');
      icon.className = 'no-units-icon';
      icon.textContent = '—';
      const msg = document.createElement('p');
      msg.className = 'no-units-text';
      msg.textContent = 'No units currently available. Check back soon.';
      wrap.append(icon, msg);
      grid.appendChild(wrap);
      return;
    }

    available.forEach((unit, i) => {
      const card = buildUnitCard(unit);
      card.style.transitionDelay = `${i * 0.06}s`;
      grid.appendChild(card);
      observeCard(card);
    });

  } catch (err) {
    loader.style.display  = 'none';
    errorEl.style.display = 'flex';
    errorMsg.textContent  = err.message || 'Unable to load listings. Please try again.';
  }
}

// ─── Unit Card ───────────────────────────────────────────────────────────────

function buildUnitCard(unit) {
  const frag = cloneTpl('tpl-unit-card');
  const card = frag.querySelector('.unit-card');

  setField(card, 'unit_number', String(unit.unit_number ?? ''));
  setField(card, 'asset_name',  unit.asset_name ?? '');
  setField(card, 'bedrooms',    unit.bedrooms  != null ? String(unit.bedrooms)  : '—');
  setField(card, 'bathrooms',   unit.bathrooms != null ? String(unit.bathrooms) : '—');
  setField(card, 'square_feet',
    unit.square_feet != null ? Number(unit.square_feet).toLocaleString('en-US') : '—');
  setField(card, 'rent',
    unit.market_rent_cents != null
      ? '$' + (unit.market_rent_cents / 100).toLocaleString('en-US')
      : '—');

  const statusMap = {
    vacant:     { label: 'Vacant',     cls: 'status-vacant' },
    make_ready: { label: 'Make Ready', cls: 'status-make-ready' },
    notice:     { label: 'Notice',     cls: 'status-notice' },
  };
  const st   = statusMap[unit.status] ?? { label: unit.status, cls: '' };
  const badge = card.querySelector('[data-field="status_badge"]');
  badge.textContent = st.label;
  if (st.cls) badge.classList.add(st.cls);

  card.querySelector('.btn-tour').addEventListener('click', () => openModal(unit));
  return card;
}

// ─── Modal Shell ─────────────────────────────────────────────────────────────

function openModal(unit) {
  currentUnit       = unit;
  currentProspectId = null;
  const overlay = document.getElementById('modal-overlay');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderIntakeForm();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentUnit       = null;
  currentProspectId = null;
}

function bindModalEvents() {
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// Replaces modal content with a header frag + body frag
function setModal(...frags) {
  const content = document.getElementById('modal-content');
  content.replaceChildren(...frags);
  document.getElementById('modal-scroll').scrollTop = 0;
}

// ─── Modal Unit Header ───────────────────────────────────────────────────────

function buildModalHeader(unit) {
  const frag = cloneTpl('tpl-modal-header');
  const rent  = unit.market_rent_cents != null
    ? '$' + (unit.market_rent_cents / 100).toLocaleString('en-US')
    : null;
  const parts = [
    unit.asset_name,
    unit.bedrooms != null && unit.bathrooms != null
      ? `${unit.bedrooms}bd / ${unit.bathrooms}ba`
      : null,
    rent ? `${rent}/mo` : null,
  ].filter(Boolean);

  setField(frag, 'unit_number', `UNIT ${unit.unit_number ?? ''}`);
  setField(frag, 'unit_detail', parts.join(' · '));
  return frag;
}

// ─── Intake Form ─────────────────────────────────────────────────────────────

function renderIntakeForm() {
  const bodyFrag = cloneTpl('tpl-intake-form');
  const form     = bodyFrag.querySelector('#intake-form');

  // Pre-select unit's bedroom count if known
  if (currentUnit.bedrooms != null) {
    const sel = bodyFrag.querySelector('#f-beds');
    if (sel) sel.value = String(currentUnit.bedrooms);
  }

  setModal(buildModalHeader(currentUnit), bodyFrag);
  document.getElementById('intake-form').addEventListener('submit', handleIntakeSubmit);
}

async function handleIntakeSubmit(e) {
  e.preventDefault();
  const form      = e.target;
  const errEl     = document.getElementById('intake-error');
  const btnText   = document.getElementById('intake-btn-text');
  const btnLoader = document.getElementById('intake-btn-loader');

  const payload = {
    first_name:       form.first_name.value.trim(),
    last_name:        form.last_name.value.trim(),
    email:            form.email.value.trim(),
    phone:            form.phone.value.trim()           || undefined,
    desired_bedrooms: form.desired_bedrooms.value !== ''
      ? parseInt(form.desired_bedrooms.value, 10) : undefined,
    desired_move_in:  form.desired_move_in.value        || undefined,
    budget_monthly:   form.budget_monthly.value
      ? parseFloat(form.budget_monthly.value) : undefined,
    notes:            form.notes.value.trim()           || undefined,
  };

  if (!payload.first_name || !payload.last_name || !payload.email) {
    showError(errEl, 'First name, last name, and email are required.');
    return;
  }

  setFormBusy(form, true);
  btnText.style.display   = 'none';
  btnLoader.style.display = 'inline-block';
  hideError(errEl);

  try {
    const res  = await fetch(`${API_BASE}/api/public/intake`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
    currentProspectId = json.prospect_id ?? json.id;
    renderIntakeSuccess(payload.first_name);
  } catch (err) {
    setFormBusy(form, false);
    btnText.style.display   = '';
    btnLoader.style.display = 'none';
    showError(errEl, err.message || 'Something went wrong. Please try again.');
  }
}

// ─── Intake Success ───────────────────────────────────────────────────────────

function renderIntakeSuccess(firstName) {
  const bodyFrag = cloneTpl('tpl-intake-success');

  // Personalise the sub text with the first name
  const sub = bodyFrag.querySelector('.success-sub');
  if (sub) {
    sub.replaceChildren(
      document.createTextNode(`Thanks, ${firstName}. Your tour request has been logged. `),
      document.createTextNode('Our leasing team will be in touch shortly.')
    );
  }

  setModal(buildModalHeader(currentUnit), bodyFrag);
  document.getElementById('btn-open-apply').addEventListener('click', renderApplyForm);
}

// ─── Apply Form ──────────────────────────────────────────────────────────────

function renderApplyForm() {
  const bodyFrag = cloneTpl('tpl-apply-form');
  setModal(buildModalHeader(currentUnit), bodyFrag);
  document.getElementById('apply-form').addEventListener('submit', handleApplySubmit);
}

async function handleApplySubmit(e) {
  e.preventDefault();
  const form      = e.target;
  const errEl     = document.getElementById('apply-error');
  const btnText   = document.getElementById('apply-btn-text');
  const btnLoader = document.getElementById('apply-btn-loader');

  const creditScore   = parseInt(form.credit_score.value, 10);
  const monthlyIncome = parseFloat(form.gross_monthly_income.value);

  if (!creditScore || creditScore < 300 || creditScore > 850) {
    showError(errEl, 'Please enter a valid credit score between 300 and 850.');
    return;
  }
  if (!monthlyIncome || monthlyIncome < 0) {
    showError(errEl, 'Please enter your gross monthly income.');
    return;
  }

  const payload = {
    prospect_id:          currentProspectId,
    unit_id:              currentUnit.id,
    policy_id:            1,
    credit_score:         creditScore,
    gross_monthly_income: monthlyIncome,
    open_collections:     parseInt(form.open_collections.value, 10)  || 0,
    occupants_count:      parseInt(form.occupants_count.value, 10)   || 1,
    has_eviction:         form.has_eviction.checked,
    has_felony:           form.has_felony.checked,
    identity_verified:    form.identity_verified.checked,
    income_docs_verified: form.income_docs_verified.checked,
  };

  setFormBusy(form, true);
  btnText.style.display   = 'none';
  btnLoader.style.display = 'inline-block';
  hideError(errEl);

  try {
    const res  = await fetch(`${API_BASE}/api/public/apply`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
    const { decision, decision_reasons } = json.application ?? {};
    renderDecision(decision, decision_reasons);
  } catch (err) {
    setFormBusy(form, false);
    btnText.style.display   = '';
    btnLoader.style.display = 'none';
    showError(errEl, err.message || 'Submission failed. Please try again.');
  }
}

// ─── Decision ────────────────────────────────────────────────────────────────

function renderDecision(decision, reasons) {
  const configs = {
    approved: {
      cls: 'decision-approved',
      label: 'APPROVED',
      sub: 'Congratulations — your application has been approved. Our leasing team will follow up with next steps.',
    },
    conditional: {
      cls: 'decision-conditional',
      label: 'CONDITIONAL APPROVAL',
      sub: 'Your application has been conditionally approved. Additional documentation may be required before finalizing.',
    },
    denied: {
      cls: 'decision-denied',
      label: 'NOT APPROVED',
      sub: 'We were unable to approve this application at this time. Please review the details below.',
    },
  };
  const cfg = configs[decision] ?? {
    cls: 'decision-conditional',
    label: (decision ?? 'UNKNOWN').toUpperCase(),
    sub: '',
  };

  const bodyFrag = cloneTpl('tpl-decision');

  const resultEl = bodyFrag.querySelector('#decision-result');
  resultEl.classList.add(cfg.cls);

  setField(bodyFrag, 'decision-label', cfg.label);
  setField(bodyFrag, 'decision-sub',   cfg.sub);
  setField(bodyFrag, 'decision-unit',
    [currentUnit.unit_number ? `Unit ${currentUnit.unit_number}` : null, currentUnit.asset_name]
      .filter(Boolean).join(' · ')
  );

  if (Array.isArray(reasons) && reasons.length) {
    const wrap = bodyFrag.querySelector('#decision-reasons-wrap');
    const list = bodyFrag.querySelector('#decision-reasons-list');
    wrap.style.display = 'block';
    reasons.forEach(r => {
      const li = document.createElement('li');
      li.textContent = String(r);
      list.appendChild(li);
    });
  }

  setModal(buildModalHeader(currentUnit), bodyFrag);
  document.getElementById('btn-close-decision').addEventListener('click', closeModal);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function cloneTpl(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function setField(root, fieldName, value) {
  const el = root.querySelector(`[data-field="${fieldName}"]`);
  if (el) el.textContent = value;
}

function showError(el, msg) {
  el.textContent   = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError(el) {
  el.textContent   = '';
  el.style.display = 'none';
}

function setFormBusy(form, busy) {
  form.querySelectorAll('input, select, textarea, button').forEach(el => {
    el.disabled = busy;
  });
}
