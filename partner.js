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
  // Seed each table with one empty row if empty
  ['hw', 'sw', 'other'].forEach(seedRevRowIfEmpty);
  seedCostRowIfEmpty('unit');
  syncFteYearLabels();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showProducts() {
  products.hidden = false;
  qSection.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('questionnaireBack')?.addEventListener('click', showProducts);
document.getElementById('thanksBack')?.addEventListener('click', showProducts);

// ── Revenue table row management ─────────────────────────────
function makeRevRow(group) {
  const tr = document.createElement('tr');
  const territoryOpts = ['', 'EU', 'US', 'ROW', 'APAC', 'LATAM', 'MEA'];
  const typeOpts      = ['', 'Direct', 'CP', 'B2C', 'B2B', 'Distributor', 'Other'];

  tr.innerHTML = `
    <td><input type="text"   class="partner-q-input partner-q-cell" name="${group}_customer[]" placeholder="Customer name" /></td>
    <td>
      <select class="partner-q-select partner-q-cell" name="${group}_type[]">
        ${typeOpts.map(o => `<option value="${o}">${o || '— Select —'}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="partner-q-select partner-q-cell" name="${group}_territory[]">
        ${territoryOpts.map(o => `<option value="${o}">${o || '— Select —'}</option>`).join('')}
      </select>
    </td>
    <td><input type="text"   class="partner-q-input partner-q-cell" name="${group}_product[]" placeholder="Product" /></td>
    <td><input type="text"   class="partner-q-input partner-q-cell partner-q-money" name="${group}_price[]" inputmode="decimal" autocomplete="off" placeholder="$ 0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" name="${group}_q1[]" min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" name="${group}_q2[]" min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" name="${group}_q3[]" min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" name="${group}_q4[]" min="0" step="1" placeholder="0" /></td>
    <td><input type="number" class="partner-q-input partner-q-cell" name="${group}_y2[]" min="0" step="1" placeholder="0" /></td>
    <td><button type="button" class="partner-q-rmrow" aria-label="Remove row">&#x2715;</button></td>
  `;
  tr.querySelector('.partner-q-rmrow').addEventListener('click', () => tr.remove());
  return tr;
}

function seedRevRowIfEmpty(group) {
  const body = document.querySelector(`tbody[data-rev-body="${group}"]`);
  if (body && body.children.length === 0) {
    const row = makeRevRow(group);
    body.appendChild(row);
    bindMoneyInputs(row);
  }
}

document.querySelectorAll('[data-add-row]').forEach(btn => {
  const group = btn.getAttribute('data-add-row');
  btn.addEventListener('click', () => {
    const row = makeRevRow(group);
    document.querySelector(`tbody[data-rev-body="${group}"]`).appendChild(row);
    bindMoneyInputs(row);
  });
});

// ── Unit cost table row management ───────────────────────────
let costRowSeed = 0;
function makeCostRow() {
  const tr = document.createElement('tr');
  const idx = ++costRowSeed;
  const defaultLetter = idx <= 26 ? String.fromCharCode(64 + idx) : `${idx}`;
  tr.innerHTML = `
    <td><input type="text" class="partner-q-input partner-q-cell" name="cost_product[]" placeholder="Product ${defaultLetter}" /></td>
    <td><input type="text" class="partner-q-input partner-q-cell partner-q-money" name="cost_unit[]" inputmode="decimal" autocomplete="off" placeholder="$ 0" /></td>
    <td><button type="button" class="partner-q-rmrow" aria-label="Remove row">&#x2715;</button></td>
  `;
  tr.querySelector('.partner-q-rmrow').addEventListener('click', () => tr.remove());
  return tr;
}
function seedCostRowIfEmpty() {
  const body = document.querySelector('tbody[data-cost-body="unit"]');
  if (body && body.children.length === 0) {
    // Seed five rows (Product A–E) to match the template layout
    for (let i = 0; i < 5; i++) {
      const row = makeCostRow();
      body.appendChild(row);
      bindMoneyInputs(row);
    }
  }
}
document.querySelectorAll('[data-add-cost-row]').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = makeCostRow();
    document.querySelector('tbody[data-cost-body="unit"]').appendChild(row);
    bindMoneyInputs(row);
  });
});

// ── FTE year labels track section 5 (First Year of Financial Model) ─
function syncFteYearLabels() {
  const firstYearEl = document.getElementById('qFirstYear');
  const y1Label     = document.getElementById('fteY1Label');
  const y2Label     = document.getElementById('fteY2Label');
  if (!firstYearEl || !y1Label || !y2Label) return;
  const y1 = parseInt(firstYearEl.value, 10);
  if (Number.isFinite(y1) && y1 >= 2020 && y1 <= 2050) {
    y1Label.textContent = String(y1);
    y2Label.textContent = String(y1 + 1);
  } else {
    y1Label.textContent = 'Year 1';
    y2Label.textContent = 'Year 2';
  }
}
document.getElementById('qFirstYear')?.addEventListener('input', syncFteYearLabels);

// ── Bind money formatting on form fields ─────────────────────
bindMoneyInputs(qForm);

// ── Submit ───────────────────────────────────────────────────
qForm?.addEventListener('submit', e => {
  e.preventDefault();
  const name = (document.getElementById('qName')?.value || '').trim();
  if (!name) {
    document.getElementById('qName')?.focus();
    return;
  }

  // Collect all fields into a plain object (multi-value names become arrays)
  const data = {};
  const fd = new FormData(qForm);
  for (const [key, val] of fd.entries()) {
    if (key.endsWith('[]')) {
      const k = key.slice(0, -2);
      if (!Array.isArray(data[k])) data[k] = [];
      data[k].push(val);
    } else {
      data[key] = val;
    }
  }

  const submission = {
    customerName: name,
    customerKey:  sessionStorage.getItem('vv_customer_key') || null,
    submittedAt:  new Date().toISOString(),
    status:       'review',
    formData:     data,
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
