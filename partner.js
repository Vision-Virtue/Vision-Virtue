/* ============================================================
   VISION & VIRTUE — Partner Customer Area
   Phase 2: submissions live on the backend
   (vv-marketing-api.onrender.com), keyed by customer key.
   ============================================================ */

const PARTNER_API = 'https://vv-marketing-api.onrender.com';

// ── Auth check: must have a customer key in sessionStorage ───
if (sessionStorage.getItem('vv_customer_auth') !== '1') {
  window.location.replace('index.html');
}

// ── Cache the latest fetched submission to drive tile-click logic ──
let _latestSubmission = null;

// ── Sign Out ─────────────────────────────────────────────────
document.getElementById('signOutBtn')?.addEventListener('click', () => {
  sessionStorage.removeItem('vv_customer_auth');
  sessionStorage.removeItem('vv_customer_key');
  sessionStorage.removeItem('vv_customer_name');
  window.location.replace('index.html');
});

// ── API helpers ──────────────────────────────────────────────
function customerKey() { return sessionStorage.getItem('vv_customer_key') || ''; }

async function apiFetchMySubmissions() {
  const key = customerKey();
  if (!key) return [];
  const res = await fetch(`${PARTNER_API}/api/customer/me/submissions`, {
    headers: { 'X-Customer-Key': key },
  });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.replace('index.html');
    return [];
  }
  if (!res.ok) throw new Error(`Failed to load submissions (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.submissions) ? data.submissions : [];
}

async function apiSubmitQuestionnaire(customerName, formData) {
  const key = customerKey();
  if (!key) throw new Error('Missing customer key');
  const res = await fetch(`${PARTNER_API}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Customer-Key': key },
    body: JSON.stringify({ customerName, formData }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Submission failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Navbar scroll effect ─────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
}, { passive: true });

// ── Money input formatting (handles whole $ and decimals) ────
function formatMoney(el) {
  let raw = el.value.replace(/[^\d.]/g, '');
  // Keep only the first dot
  const firstDot = raw.indexOf('.');
  if (firstDot !== -1) {
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
  }
  if (!raw || raw === '.') { el.value = ''; return; }
  const [intPartRaw, decPart] = raw.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  const intFormatted = parseInt(intPart, 10).toLocaleString('en-US');
  el.value = '$ ' + (decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted);
}
function bindMoneyInputs(scope) {
  scope.querySelectorAll('.partner-q-money').forEach(el => {
    if (el.dataset.moneyBound === '1') return;
    el.dataset.moneyBound = '1';
    el.addEventListener('input', () => formatMoney(el));
    el.addEventListener('blur',  () => {
      const raw = el.value.replace(/[^\d.]/g, '');
      if (!raw || raw === '.') el.value = '';
    });
  });
}

// ── Render submission state on the Financial Model tile ──────
async function renderTileState() {
  const statusEl = document.getElementById('statusFinancialModel');
  const tile     = document.getElementById('tileFinancialModel');
  if (!statusEl || !tile) return;

  // Loading placeholder while we fetch
  statusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Loading…</span>';

  let subs;
  try { subs = await apiFetchMySubmissions(); }
  catch (err) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Connection error — retry</span>';
    return;
  }

  // Most recent submission drives the tile state
  const sub = subs[0] || null;
  _latestSubmission = sub;

  // Welcome line uses the customer name we got from the auth response
  const knownName = sessionStorage.getItem('vv_customer_name') || sub?.customerName || '';
  if (knownName) {
    const welcome = document.getElementById('partnerWelcome');
    if (welcome) welcome.textContent = `Welcome, ${knownName}. Select a product below to view its status.`;
  }

  if (!sub) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Get Started</span>';
    tile.classList.remove('is-review', 'is-finalized');
    return;
  }

  if (sub.status === 'finalized' && sub.hasFinalizedXlsx) {
    statusEl.innerHTML = `
      <span class="partner-status-pill partner-status-finalized">Finalized</span>
      <button type="button" class="partner-tile-download" data-download-id="${sub.id}">Download Model</button>
    `;
    tile.classList.add('is-finalized');
    tile.classList.remove('is-review');
    statusEl.querySelector('[data-download-id]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const btn = ev.currentTarget;
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Downloading…';
      try {
        await downloadFinalizedXlsx(sub.id, sub.customerName);
      } catch (err) {
        alert('Download failed.\n\n' + (err && err.message ? err.message : ''));
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });
  } else {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Under Vision’s Review</span>';
    tile.classList.add('is-review');
    tile.classList.remove('is-finalized');
  }
}

async function downloadFinalizedXlsx(submissionId, customerName) {
  const key = customerKey();
  const res = await fetch(`${PARTNER_API}/api/customer/me/submissions/${encodeURIComponent(submissionId)}/xlsx`, {
    headers: { 'X-Customer-Key': key },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${customerName || 'Customer'} - Financial Model.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Tile click → questionnaire or status view ────────────────
const tile     = document.getElementById('tileFinancialModel');
const products = document.querySelector('.partner-products-section');
const qSection = document.getElementById('questionnaireSection');
const qForm    = document.getElementById('customerQuestionnaire');
const qThanks  = document.getElementById('questionnaireThanks');

tile?.addEventListener('click', () => {
  // If a submission already exists, keep them on the products view —
  // the tile pill already shows status.
  if (_latestSubmission) return;
  showQuestionnaire();
});

function showQuestionnaire() {
  products.hidden = true;
  qSection.hidden = false;
  qForm.hidden = false;
  qThanks.hidden = true;
  document.body.classList.add('is-questionnaire-open');
  seedQuestionnaireTables();
  syncYearLabels();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showProducts() {
  products.hidden = false;
  qSection.hidden = true;
  document.body.classList.remove('is-questionnaire-open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('questionnaireBack')?.addEventListener('click', showProducts);
document.getElementById('thanksBack')?.addEventListener('click', showProducts);

// ── HTML escape helper ───────────────────────────────────────
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── ID counter for customer/product rows ─────────────────────
let _idSeed = 0;
function nextId(prefix) { return `${prefix}-${++_idSeed}`; }

// ── Customer row (6.a) ───────────────────────────────────────
const CUSTOMER_TYPES = ['Direct', 'CP', 'B2C', 'B2B', 'Distributor', 'Other'];
const TERRITORIES    = ['EU', 'US', 'ROW', 'APAC', 'LATAM', 'MEA'];
const REVENUE_TYPES  = ['HW', 'SW', 'Other'];

function makeCustomerRow() {
  const tr = document.createElement('tr');
  tr.dataset.custId = nextId('cust');
  tr.innerHTML = `
    <td><input type="text" class="partner-q-input partner-q-cell" data-cust-name placeholder="Customer name" /></td>
    <td>
      <select class="partner-q-select partner-q-cell" data-cust-type>
        <option value="">— Select —</option>
        ${CUSTOMER_TYPES.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="partner-q-select partner-q-cell" data-cust-territory>
        <option value="">— Select —</option>
        ${TERRITORIES.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </td>
    <td><button type="button" class="partner-q-rmrow" aria-label="Remove row">&#x2715;</button></td>
  `;
  tr.querySelector('.partner-q-rmrow').addEventListener('click', () => {
    tr.remove();
    syncDerivedSections();
  });
  // Any change in this row triggers a derived-section sync
  tr.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', syncDerivedSections);
    el.addEventListener('change', syncDerivedSections);
  });
  return tr;
}

function addCustomerRow() {
  const body = document.querySelector('tbody[data-customers-body]');
  body.appendChild(makeCustomerRow());
  syncDerivedSections();
}

// ── Product row (6.b) ────────────────────────────────────────
function makeProductRow() {
  const tr = document.createElement('tr');
  tr.dataset.prodId = nextId('prod');
  tr.innerHTML = `
    <td><input type="text" class="partner-q-input partner-q-cell" data-prod-name placeholder="Product name" /></td>
    <td>
      <select class="partner-q-select partner-q-cell" data-prod-revtype>
        <option value="">— Select —</option>
        ${REVENUE_TYPES.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </td>
    <td><input type="text" class="partner-q-input partner-q-cell partner-q-money" data-prod-price inputmode="decimal" autocomplete="off" placeholder="$ 0" /></td>
    <td><button type="button" class="partner-q-rmrow" aria-label="Remove row">&#x2715;</button></td>
  `;
  tr.querySelector('.partner-q-rmrow').addEventListener('click', () => {
    tr.remove();
    syncDerivedSections();
  });
  tr.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', syncDerivedSections);
    el.addEventListener('change', syncDerivedSections);
  });
  bindMoneyInputs(tr);
  return tr;
}

function addProductRow() {
  const body = document.querySelector('tbody[data-products-body]');
  body.appendChild(makeProductRow());
  syncDerivedSections();
}

// ── Let's Scale row (section 7) ──────────────────────────────
function makeLetsScaleRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="partner-q-select partner-q-cell" data-ls-cust>
        <option value="">— Select —</option>
      </select>
    </td>
    <td><span class="partner-q-readonly" data-ls-type>—</span></td>
    <td><span class="partner-q-readonly" data-ls-territory>—</span></td>
    <td>
      <select class="partner-q-select partner-q-cell" data-ls-prod>
        <option value="">— Select —</option>
      </select>
    </td>
    <td><span class="partner-q-readonly" data-ls-revtype>—</span></td>
    <td><span class="partner-q-readonly" data-ls-price>—</span></td>
    <td><input type="number" class="partner-q-input partner-q-cell" data-ls-q1 min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" data-ls-q2 min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" data-ls-q3 min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" data-ls-q4 min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" data-ls-y2 min="0" step="1" placeholder="0" /></td>
    <td><button type="button" class="partner-q-rmrow" aria-label="Remove row">&#x2715;</button></td>
  `;
  tr.querySelector('.partner-q-rmrow').addEventListener('click', () => tr.remove());
  // When the customer or product dropdown changes, refresh that row's auto-fill cells
  tr.querySelector('[data-ls-cust]').addEventListener('change', () => updateLetsScaleRow(tr));
  tr.querySelector('[data-ls-prod]').addEventListener('change', () => updateLetsScaleRow(tr));
  return tr;
}

function addLetsScaleRow() {
  const body = document.querySelector('tbody[data-letsscale-body]');
  body.appendChild(makeLetsScaleRow());
  syncDerivedSections(); // populates the dropdowns
}

// ── Read state from the Customer/Product tables ──────────────
function getCustomers() {
  return Array.from(document.querySelectorAll('tbody[data-customers-body] tr'))
    .map(tr => ({
      id:        tr.dataset.custId,
      name:      tr.querySelector('[data-cust-name]')?.value.trim() || '',
      type:      tr.querySelector('[data-cust-type]')?.value || '',
      territory: tr.querySelector('[data-cust-territory]')?.value || '',
    }));
}
function getProducts() {
  return Array.from(document.querySelectorAll('tbody[data-products-body] tr'))
    .map(tr => ({
      id:          tr.dataset.prodId,
      name:        tr.querySelector('[data-prod-name]')?.value.trim() || '',
      revenueType: tr.querySelector('[data-prod-revtype]')?.value || '',
      price:       tr.querySelector('[data-prod-price]')?.value || '',
    }));
}

// ── Refill a <select> with id-keyed options for named items ──
function fillIdSelect(select, items) {
  const prev = select.value;
  const opts = ['<option value="">— Select —</option>']
    .concat(items.filter(i => i.name).map(i => `<option value="${i.id}">${escHtml(i.name)}</option>`));
  select.innerHTML = opts.join('');
  if (prev && items.some(i => i.id === prev && i.name)) select.value = prev;
  else select.value = '';
}

// ── Update one Let's Scale row's auto-fill cells ─────────────
function updateLetsScaleRow(tr) {
  const customers = getCustomers();
  const products  = getProducts();
  const cust = customers.find(c => c.id === tr.querySelector('[data-ls-cust]').value);
  const prod = products.find(p => p.id === tr.querySelector('[data-ls-prod]').value);
  tr.querySelector('[data-ls-type]').textContent      = cust?.type      || '—';
  tr.querySelector('[data-ls-territory]').textContent = cust?.territory || '—';
  tr.querySelector('[data-ls-revtype]').textContent   = prod?.revenueType || '—';
  tr.querySelector('[data-ls-price]').textContent     = prod?.price ? formatPriceDisplay(prod.price) : '—';
}

// ── Reactive sync: 6.a/6.b → section 7 dropdowns + section 8 ─
function syncDerivedSections() {
  const customers = getCustomers();
  const products  = getProducts();

  document.querySelectorAll('tbody[data-letsscale-body] tr').forEach(tr => {
    fillIdSelect(tr.querySelector('[data-ls-cust]'), customers);
    fillIdSelect(tr.querySelector('[data-ls-prod]'), products);
    updateLetsScaleRow(tr);
  });

  syncUnitCosts(products);
}

// ── Format a stored money string for read-only display ───────
function formatPriceDisplay(raw) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return '—';
  const [intPart, decPart] = cleaned.split('.');
  const intFmt = parseInt(intPart || '0', 10).toLocaleString('en-US');
  return '$ ' + (decPart !== undefined ? `${intFmt}.${decPart}` : intFmt);
}

// ── Section 8 (Unit Costs): mirror products from 6.b ─────────
function syncUnitCosts(products) {
  const body = document.querySelector('tbody[data-unitcost-body]');
  if (!body) return;
  // Preserve any cost values the user already entered, keyed by product id
  const prevCosts = {};
  body.querySelectorAll('tr[data-prod-id]').forEach(tr => {
    prevCosts[tr.dataset.prodId] = tr.querySelector('[data-uc-cost]')?.value || '';
  });
  body.innerHTML = '';
  const valid = products.filter(p => p.name);
  if (valid.length === 0) {
    body.innerHTML = '<tr><td colspan="2" class="partner-q-empty">Define products in section 6.b to populate this table.</td></tr>';
    return;
  }
  valid.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.prodId = p.id;
    tr.innerHTML = `
      <td class="partner-q-readonly-cell">${escHtml(p.name)}</td>
      <td><input type="text" class="partner-q-input partner-q-cell partner-q-money" data-uc-cost inputmode="decimal" autocomplete="off" placeholder="$ 0" value="${escHtml(prevCosts[p.id] || '')}" /></td>
    `;
    body.appendChild(tr);
  });
  bindMoneyInputs(body);
}

// ── Wire add-row buttons ─────────────────────────────────────
document.querySelector('[data-add-customer]')?.addEventListener('click', addCustomerRow);
document.querySelector('[data-add-product]')?.addEventListener('click', addProductRow);
document.querySelector('[data-add-letsscale]')?.addEventListener('click', addLetsScaleRow);

// ── Seed initial empty rows ──────────────────────────────────
function seedQuestionnaireTables() {
  const cBody = document.querySelector('tbody[data-customers-body]');
  const pBody = document.querySelector('tbody[data-products-body]');
  const lBody = document.querySelector('tbody[data-letsscale-body]');
  if (cBody && cBody.children.length === 0) cBody.appendChild(makeCustomerRow());
  if (pBody && pBody.children.length === 0) pBody.appendChild(makeProductRow());
  if (lBody && lBody.children.length === 0) lBody.appendChild(makeLetsScaleRow());
  syncDerivedSections();
}

// ── Year labels track section 5 (First Year of Financial Model) ─
function syncYearLabels() {
  const firstYearEl = document.getElementById('qFirstYear');
  const fteY1 = document.getElementById('fteY1Label');
  const fteY2 = document.getElementById('fteY2Label');
  const lsQ1  = document.querySelector('[data-ls-q1]');
  const lsQ2  = document.querySelector('[data-ls-q2]');
  const lsQ3  = document.querySelector('[data-ls-q3]');
  const lsQ4  = document.querySelector('[data-ls-q4]');
  const lsY2  = document.querySelector('[data-ls-y2]');
  if (!firstYearEl) return;
  const y1 = parseInt(firstYearEl.value, 10);
  const valid = Number.isFinite(y1) && y1 >= 2020 && y1 <= 2050;
  if (fteY1) fteY1.textContent = valid ? String(y1)     : 'Year 1';
  if (fteY2) fteY2.textContent = valid ? String(y1 + 1) : 'Year 2';
  if (lsQ1)  lsQ1.textContent  = valid ? `Q1-${y1}` : 'Q1';
  if (lsQ2)  lsQ2.textContent  = valid ? `Q2-${y1}` : 'Q2';
  if (lsQ3)  lsQ3.textContent  = valid ? `Q3-${y1}` : 'Q3';
  if (lsQ4)  lsQ4.textContent  = valid ? `Q4-${y1}` : 'Q4';
  if (lsY2)  lsY2.textContent  = valid ? String(y1 + 1) : 'Year+1';
}
document.getElementById('qFirstYear')?.addEventListener('input', syncYearLabels);

// ── Bind money formatting on form fields ─────────────────────
bindMoneyInputs(qForm);

// ── Collect Let's Scale rows into structured records ─────────
function collectLetsScale() {
  const customers = getCustomers();
  const products  = getProducts();
  return Array.from(document.querySelectorAll('tbody[data-letsscale-body] tr')).map(tr => {
    const custId = tr.querySelector('[data-ls-cust]')?.value || '';
    const prodId = tr.querySelector('[data-ls-prod]')?.value || '';
    const cust   = customers.find(c => c.id === custId);
    const prod   = products.find(p => p.id === prodId);
    return {
      customerId:   custId,
      customerName: cust?.name || '',
      type:         cust?.type || '',
      territory:    cust?.territory || '',
      productId:    prodId,
      productName:  prod?.name || '',
      revenueType:  prod?.revenueType || '',
      price:        prod?.price || '',
      q1:           tr.querySelector('[data-ls-q1]')?.value || '',
      q2:           tr.querySelector('[data-ls-q2]')?.value || '',
      q3:           tr.querySelector('[data-ls-q3]')?.value || '',
      q4:           tr.querySelector('[data-ls-q4]')?.value || '',
      y2:           tr.querySelector('[data-ls-y2]')?.value || '',
    };
  });
}

function collectUnitCosts() {
  return Array.from(document.querySelectorAll('tbody[data-unitcost-body] tr[data-prod-id]')).map(tr => ({
    productId:   tr.dataset.prodId,
    productName: tr.querySelector('.partner-q-readonly-cell')?.textContent || '',
    cost:        tr.querySelector('[data-uc-cost]')?.value || '',
  }));
}

// ── Submit ───────────────────────────────────────────────────
qForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const name = (document.getElementById('qName')?.value || '').trim();
  if (!name) {
    document.getElementById('qName')?.focus();
    return;
  }

  const general = {
    sector:           document.getElementById('qSector')?.value           || '',
    round:            document.getElementById('qRound')?.value            || '',
    capitalGoal:      document.getElementById('qCapitalGoal')?.value      || '',
    yearsSinceFound:  document.getElementById('qYearsSinceFound')?.value  || '',
    firstYear:        document.getElementById('qFirstYear')?.value        || '',
  };
  const fte = {
    cogs_y1: qForm.elements['fte_cogs_y1']?.value || '',
    cogs_y2: qForm.elements['fte_cogs_y2']?.value || '',
    rd_y1:   qForm.elements['fte_rd_y1']?.value   || '',
    rd_y2:   qForm.elements['fte_rd_y2']?.value   || '',
    sm_y1:   qForm.elements['fte_sm_y1']?.value   || '',
    sm_y2:   qForm.elements['fte_sm_y2']?.value   || '',
    ga_y1:   qForm.elements['fte_ga_y1']?.value   || '',
    ga_y2:   qForm.elements['fte_ga_y2']?.value   || '',
  };

  const formData = {
    general,
    customers: getCustomers(),
    products:  getProducts(),
    letsScale: collectLetsScale(),
    unitCosts: collectUnitCosts(),
    fte,
    investorDeck: collectInvestorDeck(),
  };

  const submitBtn = qForm.querySelector('.partner-q-submit');
  const originalText = submitBtn?.textContent;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

  try {
    await apiSubmitQuestionnaire(name, formData);
    sessionStorage.setItem('vv_customer_name', name);
    qForm.hidden = true;
    qThanks.hidden = false;
    await renderTileState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Submit Questionnaire'; }
    alert('Submission failed. Please check your connection and try again.\n\n' + (err && err.message ? err.message : ''));
  }
});

// ── Initial render ───────────────────────────────────────────
// Clean up any leftover localStorage from Phase 1 (now backend-backed).
try { localStorage.removeItem('vv_partner_submission'); } catch { /* ignore */ }
renderTileState();

// ════════════════════════════════════════════════════════════════════════════
//  INVESTOR DECK — schema-driven section renderer
//
//  Fetches the placeholder schema from /api/customer/deck-schema and renders
//  one collapsible section per InvestorDeckField.section. Image inputs upload
//  to /api/customer/deck-asset and store the returned URL as the field value.
//  Everything else is captured into a flat {fieldKey: value} map on submit.
// ════════════════════════════════════════════════════════════════════════════

const DECK_STATE = {
  schema:    null,                 // { sections, fields, total }
  values:    new Map(),            // fieldKey -> string (or URL for images)
  loaded:    false,
};

function deckEscapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadDeckSchema() {
  if (DECK_STATE.loaded) return DECK_STATE.schema;
  try {
    const res = await fetch(`${PARTNER_API}/api/customer/deck-schema`);
    if (!res.ok) throw new Error(`schema fetch failed (${res.status})`);
    DECK_STATE.schema = await res.json();
    DECK_STATE.loaded = true;
    return DECK_STATE.schema;
  } catch (e) {
    DECK_STATE.loaded = false;
    throw e;
  }
}

function deckGroupBySection(fields) {
  const map = new Map();
  for (const f of fields) {
    if (!map.has(f.section)) map.set(f.section, []);
    map.get(f.section).push(f);
  }
  return map;
}

function deckFieldId(fieldKey) { return `deck-${fieldKey}`; }

function deckRenderField(f) {
  const id  = deckFieldId(f.fieldKey);
  const req = f.required ? '<span class="partner-q-req">*</span>' : '';
  const guide = f.guidance ? `<p class="partner-q-help">${deckEscapeHtml(f.guidance)}</p>` : '';
  switch (f.inputType) {
    case 'shortText':
      return `<div class="partner-q-field">
        <label class="partner-q-label" for="${id}">${deckEscapeHtml(f.question)} ${req}</label>
        <input id="${id}" type="text" class="partner-q-input" data-deck-key="${f.fieldKey}" ${f.required ? 'data-deck-required="1"' : ''} autocomplete="off" />
        ${guide}
      </div>`;
    case 'longText':
      return `<div class="partner-q-field partner-q-field-wide">
        <label class="partner-q-label" for="${id}">${deckEscapeHtml(f.question)} ${req}</label>
        <textarea id="${id}" class="partner-q-input partner-q-textarea" rows="3" data-deck-key="${f.fieldKey}" ${f.required ? 'data-deck-required="1"' : ''}></textarea>
        ${guide}
      </div>`;
    case 'number':
    case 'year':
      return `<div class="partner-q-field">
        <label class="partner-q-label" for="${id}">${deckEscapeHtml(f.question)} ${req}</label>
        <input id="${id}" type="number" class="partner-q-input" data-deck-key="${f.fieldKey}" ${f.required ? 'data-deck-required="1"' : ''} ${f.inputType === 'year' ? 'min="1900" max="2100" step="1"' : ''} />
        ${guide}
      </div>`;
    case 'date':
      return `<div class="partner-q-field">
        <label class="partner-q-label" for="${id}">${deckEscapeHtml(f.question)} ${req}</label>
        <input id="${id}" type="date" class="partner-q-input" data-deck-key="${f.fieldKey}" ${f.required ? 'data-deck-required="1"' : ''} />
        ${guide}
      </div>`;
    case 'email':
      return `<div class="partner-q-field">
        <label class="partner-q-label" for="${id}">${deckEscapeHtml(f.question)} ${req}</label>
        <input id="${id}" type="email" class="partner-q-input" data-deck-key="${f.fieldKey}" ${f.required ? 'data-deck-required="1"' : ''} autocomplete="off" />
        ${guide}
      </div>`;
    case 'image':
      return `<div class="partner-q-field partner-q-field-wide" data-deck-image="${f.fieldKey}">
        <label class="partner-q-label">${deckEscapeHtml(f.question)} ${req}</label>
        <div class="partner-q-image-row">
          <input id="${id}" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" data-deck-key="${f.fieldKey}" data-deck-placeholder="${deckEscapeHtml(f.placeholder)}" />
          <span class="partner-q-image-status" data-deck-image-status="${f.fieldKey}"></span>
        </div>
        <input type="text" class="partner-q-input partner-q-image-url" placeholder="…or paste a public image URL" data-deck-url-key="${f.fieldKey}" />
        ${guide}
      </div>`;
    case 'table':
      // For now, a structured longText. We'll upgrade to a real grid in a
      // follow-up; the placeholder name is preserved so V&V can fill it
      // manually in Excel if needed.
      return `<div class="partner-q-field partner-q-field-wide">
        <label class="partner-q-label" for="${id}">${deckEscapeHtml(f.question)} ${req}</label>
        <textarea id="${id}" class="partner-q-input partner-q-textarea" rows="4" data-deck-key="${f.fieldKey}" ${f.required ? 'data-deck-required="1"' : ''} placeholder='e.g. Speed: Us=F, CompA=P, CompB=N'></textarea>
        ${guide}
      </div>`;
    default:
      return '';
  }
}

function deckRenderSections() {
  const root = document.getElementById('deckSections');
  const summary = document.getElementById('deckSummary');
  if (!root || !DECK_STATE.schema) return;
  const grouped = deckGroupBySection(DECK_STATE.schema.fields);

  const html = [];
  for (const sectionName of DECK_STATE.schema.sections) {
    const fields = grouped.get(sectionName) || [];
    if (!fields.length) continue;
    const requiredCount = fields.filter(f => f.required).length;
    html.push(`
      <details class="partner-q-deck-section">
        <summary>
          <span class="partner-q-deck-section-name">${deckEscapeHtml(sectionName)}</span>
          <span class="partner-q-deck-section-meta">${fields.length} fields · ${requiredCount} required</span>
        </summary>
        <div class="partner-q-grid">
          ${fields.map(deckRenderField).join('')}
        </div>
      </details>
    `);
  }
  root.innerHTML = html.join('');
  if (summary) {
    summary.textContent = `${DECK_STATE.schema.total} placeholders across ${DECK_STATE.schema.sections.length} sections.`;
  }

  wireDeckImageUploads(root);
}

function wireDeckImageUploads(root) {
  const inputs = root.querySelectorAll('input[type="file"][data-deck-key]');
  inputs.forEach((inp) => {
    inp.addEventListener('change', async (e) => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const fieldKey = inp.getAttribute('data-deck-key');
      const placeholder = inp.getAttribute('data-deck-placeholder');
      const status = root.querySelector(`[data-deck-image-status="${fieldKey}"]`);
      if (status) status.textContent = `Uploading ${file.name}…`;
      try {
        const key = customerKey();
        if (!key) throw new Error('Missing customer key — sign in again.');
        const url = await apiUploadDeckAsset(file, placeholder, key);
        DECK_STATE.values.set(fieldKey, url);
        // Sync the visible URL field too so the user sees what was stored.
        const urlInput = root.querySelector(`[data-deck-url-key="${fieldKey}"]`);
        if (urlInput) urlInput.value = url;
        if (status) status.textContent = '✓ uploaded';
      } catch (err) {
        if (status) status.textContent = `✗ ${err.message || 'upload failed'}`;
      } finally {
        // Allow re-selecting the same file later.
        inp.value = '';
      }
    });
  });
  // Also let the user paste a URL directly (no upload).
  root.querySelectorAll('input[data-deck-url-key]').forEach((urlInput) => {
    urlInput.addEventListener('input', () => {
      const fieldKey = urlInput.getAttribute('data-deck-url-key');
      const v = urlInput.value.trim();
      if (v) DECK_STATE.values.set(fieldKey, v);
      else   DECK_STATE.values.delete(fieldKey);
    });
  });
}

async function apiUploadDeckAsset(file, placeholderName, key) {
  const buf = await file.arrayBuffer();
  const res = await fetch(
    `${PARTNER_API}/api/customer/deck-asset?placeholder=${encodeURIComponent(placeholderName)}`,
    {
      method:  'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Customer-Key': key },
      body:    buf,
    },
  );
  if (!res.ok) {
    let msg = `upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = body.error.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.url;
}

// Called on submit — grabs every text/number/longText/email/date/year input
// plus the values cached from image uploads.
function collectInvestorDeck() {
  const root = document.getElementById('deckSections');
  if (!root || !DECK_STATE.schema) return {};
  const out = {};
  for (const f of DECK_STATE.schema.fields) {
    if (f.inputType === 'image') {
      const v = DECK_STATE.values.get(f.fieldKey);
      if (v) out[f.fieldKey] = v;
      continue;
    }
    const el = root.querySelector(`[data-deck-key="${f.fieldKey}"]`);
    if (!el) continue;
    const v = String(el.value || '').trim();
    if (v) out[f.fieldKey] = (f.inputType === 'number' || f.inputType === 'year')
      ? (Number.isFinite(+v) ? +v : v)
      : v;
  }
  return out;
}

// Kick off schema load when the questionnaire panel becomes visible.
// The existing flow shows it via `questionnaireSection.hidden = false`.
const _qSection = document.getElementById('questionnaireSection');
const _summary  = document.getElementById('deckSummary');
async function tryLoadDeckSchema() {
  try {
    await loadDeckSchema();
    deckRenderSections();
  } catch (e) {
    if (_summary) _summary.textContent = `Could not load investor-deck sections — refresh to retry. (${e.message || e})`;
  }
}
if (_qSection) {
  // MutationObserver fires as soon as the section is un-hidden, even on the
  // first user click. Cheap, no polling.
  const obs = new MutationObserver(() => {
    if (!_qSection.hidden && !DECK_STATE.loaded) tryLoadDeckSchema();
  });
  obs.observe(_qSection, { attributes: true, attributeFilter: ['hidden'] });
  // If the section is already visible at page load (e.g. deep link), load now.
  if (!_qSection.hidden) tryLoadDeckSchema();
}
