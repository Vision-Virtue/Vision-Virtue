/* ============================================================
   VISION & VIRTUE — Partner Customer Area
   Phase 1: client-only. Submission is stored in localStorage.
   Phase 2 will wire submit + status to the backend.
   ============================================================ */

// ── Auth check: must have a customer key in sessionStorage ───
if (sessionStorage.getItem('vv_customer_auth') !== '1') {
  window.location.replace('index.html');
}

// ── Storage keys ─────────────────────────────────────────────
const LS_SUBMISSION = 'vv_partner_submission';
// shape: { customerName, formData, status: 'review' | 'finalized', submittedAt, finalizedXlsxUrl? }

// ── Sign Out ─────────────────────────────────────────────────
document.getElementById('signOutBtn')?.addEventListener('click', () => {
  sessionStorage.removeItem('vv_customer_auth');
  sessionStorage.removeItem('vv_customer_key');
  window.location.replace('index.html');
});

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

// ── Render submission state on tiles ─────────────────────────
function renderTileState() {
  const sub = readSubmission();
  const statusEl = document.getElementById('statusFinancialModel');
  const tile = document.getElementById('tileFinancialModel');
  if (!statusEl || !tile) return;

  if (!sub) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Get Started</span>';
    tile.classList.remove('is-review', 'is-finalized');
    return;
  }
  if (sub.status === 'finalized' && sub.finalizedXlsxUrl) {
    statusEl.innerHTML = `
      <span class="partner-status-pill partner-status-finalized">Finalized</span>
      <a class="partner-tile-download" href="${sub.finalizedXlsxUrl}" download="${(sub.customerName || 'Customer')} - Financial Model.xlsx">Download Model</a>
    `;
    tile.classList.add('is-finalized');
    tile.classList.remove('is-review');
  } else {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Under Vision’s Review</span>';
    tile.classList.add('is-review');
    tile.classList.remove('is-finalized');
  }

  // Update welcome line with the customer name if known
  if (sub.customerName) {
    const welcome = document.getElementById('partnerWelcome');
    if (welcome) welcome.textContent = `Welcome, ${sub.customerName}. Select a product below to view its status.`;
  }
}

function readSubmission() {
  try {
    const raw = localStorage.getItem(LS_SUBMISSION);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSubmission(sub) {
  localStorage.setItem(LS_SUBMISSION, JSON.stringify(sub));
}

// ── Tile click → questionnaire or status view ────────────────
const tile     = document.getElementById('tileFinancialModel');
const products = document.querySelector('.partner-products-section');
const qSection = document.getElementById('questionnaireSection');
const qForm    = document.getElementById('customerQuestionnaire');
const qThanks  = document.getElementById('questionnaireThanks');

tile?.addEventListener('click', () => {
  const sub = readSubmission();
  if (sub) {
    // Already submitted — keep them on the products view (status pill already
    // shown on the tile). In Phase 3, finalized state shows download link too.
    return;
  }
  showQuestionnaire();
});

function showQuestionnaire() {
  products.hidden = true;
  qSection.hidden = false;
  qForm.hidden = false;
  qThanks.hidden = true;
  seedQuestionnaireTables();
  syncYearLabels();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showProducts() {
  products.hidden = false;
  qSection.hidden = true;
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
qForm?.addEventListener('submit', e => {
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

  const submission = {
    customerName: name,
    customerKey:  sessionStorage.getItem('vv_customer_key') || null,
    submittedAt:  new Date().toISOString(),
    status:       'review',
    formData: {
      general,
      customers:  getCustomers(),
      products:   getProducts(),
      letsScale:  collectLetsScale(),
      unitCosts:  collectUnitCosts(),
      fte,
    },
  };
  writeSubmission(submission);

  // Switch to thank-you view and update tile
  qForm.hidden = true;
  qThanks.hidden = false;
  renderTileState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Initial render ───────────────────────────────────────────
renderTileState();
