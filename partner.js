/* ============================================================
   VISION & VIRTUE â€” Partner Customer Area
   Phase 2: submissions live on the backend
   (vv-marketing-api.onrender.com), keyed by customer key.
   ============================================================ */

const PARTNER_API = 'https://vv-marketing-api.onrender.com';

// â”€â”€ Auth check: must have a customer key in sessionStorage â”€â”€â”€
if (sessionStorage.getItem('vv_customer_auth') !== '1') {
  window.location.replace('index.html');
}

// â”€â”€ Cache the latest fetched submission to drive tile-click logic â”€â”€
let _latestSubmission = null;

// â”€â”€ Sign Out â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('signOutBtn')?.addEventListener('click', () => {
  sessionStorage.removeItem('vv_customer_auth');
  sessionStorage.removeItem('vv_customer_key');
  sessionStorage.removeItem('vv_customer_name');
  window.location.replace('index.html');
});

// â”€â”€ API helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Navbar scroll effect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
}, { passive: true });

// â”€â”€ Money input formatting (handles whole $ and decimals) â”€â”€â”€â”€
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

// â”€â”€ Render submission state on the Financial Model tile â”€â”€â”€â”€â”€â”€
async function renderTileState() {
  const statusEl = document.getElementById('statusFinancialModel');
  const tile     = document.getElementById('tileFinancialModel');
  if (!statusEl || !tile) return;

  // Loading placeholder while we fetch
  statusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Loadingâ€¦</span>';

  let subs;
  try { subs = await apiFetchMySubmissions(); }
  catch (err) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Connection error â€” retry</span>';
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
      btn.disabled = true; btn.textContent = 'Downloadingâ€¦';
      try {
        await downloadFinalizedXlsx(sub.id, sub.customerName);
      } catch (err) {
        alert('Download failed.\n\n' + (err && err.message ? err.message : ''));
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    });
  } else {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Under Visionâ€™s Review</span>';
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

// â”€â”€ Tile click â†’ questionnaire or status view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const tile     = document.getElementById('tileFinancialModel');
const products = document.querySelector('.partner-products-section');
const qSection = document.getElementById('questionnaireSection');
const qForm    = document.getElementById('customerQuestionnaire');
const qThanks  = document.getElementById('questionnaireThanks');

tile?.addEventListener('click', () => {
  // If a submission already exists, keep them on the products view â€”
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

// â”€â”€ HTML escape helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// â”€â”€ ID counter for customer/product rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _idSeed = 0;
function nextId(prefix) { return `${prefix}-${++_idSeed}`; }

// â”€â”€ Customer row (6.a) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        <option value="">â€” Select â€”</option>
        ${CUSTOMER_TYPES.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="partner-q-select partner-q-cell" data-cust-territory>
        <option value="">â€” Select â€”</option>
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

// â”€â”€ Product row (6.b) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeProductRow() {
  const tr = document.createElement('tr');
  tr.dataset.prodId = nextId('prod');
  tr.innerHTML = `
    <td><input type="text" class="partner-q-input partner-q-cell" data-prod-name placeholder="Product name" /></td>
    <td>
      <select class="partner-q-select partner-q-cell" data-prod-revtype>
        <option value="">â€” Select â€”</option>
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

// â”€â”€ Let's Scale row (section 7) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeLetsScaleRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="partner-q-select partner-q-cell" data-ls-cust>
        <option value="">â€” Select â€”</option>
      </select>
    </td>
    <td><span class="partner-q-readonly" data-ls-type>â€”</span></td>
    <td><span class="partner-q-readonly" data-ls-territory>â€”</span></td>
    <td>
      <select class="partner-q-select partner-q-cell" data-ls-prod>
        <option value="">â€” Select â€”</option>
      </select>
    </td>
    <td><span class="partner-q-readonly" data-ls-revtype>â€”</span></td>
    <td><span class="partner-q-readonly" data-ls-price>â€”</span></td>
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

// â”€â”€ Read state from the Customer/Product tables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Refill a <select> with id-keyed options for named items â”€â”€
function fillIdSelect(select, items) {
  const prev = select.value;
  const opts = ['<option value="">â€” Select â€”</option>']
    .concat(items.filter(i => i.name).map(i => `<option value="${i.id}">${escHtml(i.name)}</option>`));
  select.innerHTML = opts.join('');
  if (prev && items.some(i => i.id === prev && i.name)) select.value = prev;
  else select.value = '';
}

// â”€â”€ Update one Let's Scale row's auto-fill cells â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateLetsScaleRow(tr) {
  const customers = getCustomers();
  const products  = getProducts();
  const cust = customers.find(c => c.id === tr.querySelector('[data-ls-cust]').value);
  const prod = products.find(p => p.id === tr.querySelector('[data-ls-prod]').value);
  tr.querySelector('[data-ls-type]').textContent      = cust?.type      || 'â€”';
  tr.querySelector('[data-ls-territory]').textContent = cust?.territory || 'â€”';
  tr.querySelector('[data-ls-revtype]').textContent   = prod?.revenueType || 'â€”';
  tr.querySelector('[data-ls-price]').textContent     = prod?.price ? formatPriceDisplay(prod.price) : 'â€”';
}

// â”€â”€ Reactive sync: 6.a/6.b â†’ section 7 dropdowns + section 8 â”€
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

// â”€â”€ Format a stored money string for read-only display â”€â”€â”€â”€â”€â”€â”€
function formatPriceDisplay(raw) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return 'â€”';
  const [intPart, decPart] = cleaned.split('.');
  const intFmt = parseInt(intPart || '0', 10).toLocaleString('en-US');
  return '$ ' + (decPart !== undefined ? `${intFmt}.${decPart}` : intFmt);
}

// â”€â”€ Section 8 (Unit Costs): mirror products from 6.b â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Wire add-row buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelector('[data-add-customer]')?.addEventListener('click', addCustomerRow);
document.querySelector('[data-add-product]')?.addEventListener('click', addProductRow);
document.querySelector('[data-add-letsscale]')?.addEventListener('click', addLetsScaleRow);

// â”€â”€ Seed initial empty rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function seedQuestionnaireTables() {
  const cBody = document.querySelector('tbody[data-customers-body]');
  const pBody = document.querySelector('tbody[data-products-body]');
  const lBody = document.querySelector('tbody[data-letsscale-body]');
  if (cBody && cBody.children.length === 0) cBody.appendChild(makeCustomerRow());
  if (pBody && pBody.children.length === 0) pBody.appendChild(makeProductRow());
  if (lBody && lBody.children.length === 0) lBody.appendChild(makeLetsScaleRow());
  syncDerivedSections();
}

// â”€â”€ Year labels track section 5 (First Year of Financial Model) â”€
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

// â”€â”€ Bind money formatting on form fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
bindMoneyInputs(qForm);

// â”€â”€ Collect Let's Scale rows into structured records â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  };

  const submitBtn = qForm.querySelector('.partner-q-submit');
  const originalText = submitBtn?.textContent;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submittingâ€¦'; }

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

// ---- Initial render ------------------------------------------------------
// Clean up any leftover localStorage from Phase 1 (now backend-backed).
try { localStorage.removeItem('vv_partner_submission'); } catch { /* ignore */ }
renderTileState();


/* ============================================================================
   Section 10 — Supporting Materials drag-and-drop
   Replaces the old per-placeholder Investor Deck form. Customer drops PDF /
   DOCX / PPTX / XLSX; we POST raw bytes to /api/customer/deck-upload with the
   filename in the query string. Server-side text extraction happens lazily
   when AI Finance generates the deck.
   ========================================================================== */

const DECK_UPLOAD_ACCEPT = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i;
const DECK_UPLOAD_MAX    = 30 * 1024 * 1024;

function deckUpFmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function deckUpExtPill(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const m = { pdf:'PDF', doc:'DOC', docx:'DOC', ppt:'PPT', pptx:'PPT', xls:'XLS', xlsx:'XLS' };
  return m[ext] || ext.toUpperCase();
}
function deckUpEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function deckUploadsRefresh() {
  const list = document.getElementById('deckUploadsList');
  if (!list) return;
  const key  = customerKey();
  if (!key) { list.innerHTML = ''; return; }
  try {
    const res = await fetch(`${PARTNER_API}/api/customer/deck-upload`, {
      headers: { 'X-Customer-Key': key },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data.uploads) ? data.uploads : [];
    list.innerHTML = rows.length === 0
      ? '<p class="partner-q-empty">No files uploaded yet.</p>'
      : rows.map((u) => `
          <div class="partner-q-upload-row" data-upload-id="${deckUpEscape(u.id)}">
            <span class="partner-q-upload-pill">${deckUpEscape(deckUpExtPill(u.originalName))}</span>
            <span class="partner-q-upload-name" title="${deckUpEscape(u.originalName)}">${deckUpEscape(u.originalName)}</span>
            <span class="partner-q-upload-size">${deckUpEscape(deckUpFmtSize(u.sizeBytes))}</span>
            <button type="button" class="partner-q-upload-remove" aria-label="Remove" title="Remove">&#x2715;</button>
          </div>
        `).join('');
    list.querySelectorAll('.partner-q-upload-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-upload-id]');
        const id  = row?.getAttribute('data-upload-id');
        if (!id) return;
        btn.disabled = true;
        try {
          await fetch(`${PARTNER_API}/api/customer/deck-upload/${encodeURIComponent(id)}`, {
            method: 'DELETE', headers: { 'X-Customer-Key': customerKey() },
          });
          await deckUploadsRefresh();
        } catch { btn.disabled = false; }
      });
    });
  } catch {
    list.innerHTML = '<p class="partner-q-empty">Could not load uploads.</p>';
  }
}

async function deckUploadOne(file, statusEl) {
  if (!DECK_UPLOAD_ACCEPT.test(file.name)) {
    if (statusEl) statusEl.textContent = `Skipped ${file.name} — unsupported type`;
    return;
  }
  if (file.size > DECK_UPLOAD_MAX) {
    if (statusEl) statusEl.textContent = `Skipped ${file.name} — too large (max 30 MB)`;
    return;
  }
  if (statusEl) statusEl.textContent = `Uploading ${file.name}…`;
  const buf = await file.arrayBuffer();
  const res = await fetch(
    `${PARTNER_API}/api/customer/deck-upload?filename=${encodeURIComponent(file.name)}`,
    {
      method:  'POST',
      headers: {
        'X-Customer-Key': customerKey(),
        'Content-Type':   file.type || 'application/octet-stream',
      },
      body: buf,
    },
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* ignore */ }
    if (statusEl) statusEl.textContent = `Failed ${file.name}: ${msg}`;
    return;
  }
  if (statusEl) statusEl.textContent = `Uploaded ${file.name}`;
}

(function wireDeckDropzone() {
  const zone   = document.getElementById('deckDropzone');
  const input  = document.getElementById('deckFileInput');
  if (!zone || !input) return;

  const status = document.createElement('div');
  status.className = 'partner-q-drop-status';
  zone.appendChild(status);

  zone.addEventListener('click', (e) => { if (e.target === input) return; input.click(); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-drag-over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('is-drag-over');
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) await deckUploadOne(f, status);
    await deckUploadsRefresh();
  });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    for (const f of files) await deckUploadOne(f, status);
    input.value = '';
    await deckUploadsRefresh();
  });

  const qSection = document.getElementById('questionnaireSection');
  if (qSection) {
    const obs = new MutationObserver(() => { if (!qSection.hidden) deckUploadsRefresh(); });
    obs.observe(qSection, { attributes: true, attributeFilter: ['hidden'] });
    if (!qSection.hidden) deckUploadsRefresh();
  }
})();