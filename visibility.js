/* ============================================================
   VISION & VIRTUE — Visibility customer area (Phase 1)
   Financial Structure: GL upload + mapping + Complete/Edit.
   ============================================================ */

const VIS_API = 'https://vv-marketing-api.onrender.com';

// Auth check — same sessionStorage handshake as the partner area.
if (sessionStorage.getItem('vv_customer_auth') !== '1') {
  window.location.replace('index.html');
}

document.getElementById('signOutBtn')?.addEventListener('click', () => {
  sessionStorage.clear();
  window.location.replace('index.html');
});

// Welcome subtitle with the customer name.
const welcomeName = sessionStorage.getItem('vv_customer_name');
if (welcomeName) {
  const sub = document.getElementById('visHelloSub');
  if (sub) sub.textContent = `Welcome, ${welcomeName}. Let's build your tailor-made budget.`;
}

const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
}, { passive: true });

// ── Helpers ──────────────────────────────────────────────────
function customerKey() { return sessionStorage.getItem('vv_customer_key') || ''; }
function htmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(path, opts = {}) {
  const res = await fetch(`${VIS_API}${path}`, {
    ...opts,
    headers: {
      'X-Customer-Key': customerKey(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('Auth expired');
  }
  return res;
}

// ── State ────────────────────────────────────────────────────
// Default dropdowns mirror the spec §2.3 table (single source of
// truth on the backend at visibility.controller.ts). They live here
// too so the UI keeps working even if the /api/visibility/dropdowns
// endpoint is briefly unavailable (e.g. the moments after a redeploy).
const DEFAULT_DROPDOWNS = {
  plSections: [
    'Revenues', 'COGS', 'R&D', 'S&M', 'G&A',
    'Financial Income/(Expenses)', 'Tax', 'Other Income/(Expenses)',
  ],
  yourBudgetCategoryToken: 'Your Budget Category',
  budgetCategoriesBySection: {
    'Revenues':                    ['License', 'Subscription', 'POC/NRE', 'Maintenance', 'Support', 'Other', 'Your Budget Category'],
    'COGS':                        ['Salaries and benefits', 'Subcontractors', 'Materials', 'Cloud/Hosting', 'Royalties', 'Depreciation', 'Other', 'Your Budget Category'],
    'R&D':                         ['Salaries and benefits', 'Subcontractors', 'Tools/Licenses', 'Cloud/Hosting', 'Materials', 'Travel', 'Other', 'Your Budget Category'],
    'S&M':                         ['Salaries and benefits', 'Marketing', 'Conferences', 'Travel', 'Commissions', 'Advertising', 'Other', 'Your Budget Category'],
    'G&A':                         ['Salaries and benefits', 'Professional services', 'Office', 'Insurance', 'Travel', 'Other', 'Your Budget Category'],
    'Financial Income/(Expenses)': ['Interest income', 'Interest expense', 'FX', 'Bank fees', 'Other', 'Your Budget Category'],
    'Tax':                         ['Current tax', 'Deferred tax', 'Other', 'Your Budget Category'],
    'Other Income/(Expenses)':     ['One-time gains', 'One-time losses', 'Other', 'Your Budget Category'],
  },
};
let dropdowns = DEFAULT_DROPDOWNS;
let glRows    = []; // [{id, glNumber, glName, plSection, budgetCategory, budgetCategoryCustom, orphan}]
let fsStatus  = 'editing';

// ── DOM refs ─────────────────────────────────────────────────
const fsHelp           = document.getElementById('fsHelp');
const fsFileInput      = document.getElementById('fsFileInput');
const fsUploadBtn      = document.getElementById('fsUploadBtn');
const fsErrorBanner    = document.getElementById('fsErrorBanner');
const fsOrphanBanner   = document.getElementById('fsOrphanBanner');
const fsInfoBanner     = document.getElementById('fsInfoBanner');
const fsTableWrap      = document.getElementById('fsTableWrap');
const fsTableBody      = document.getElementById('fsTableBody');
const fsEmpty          = document.getElementById('fsEmpty');
const fsCompleteBtn    = document.getElementById('fsCompleteBtn');
const fsEditBtn        = document.getElementById('fsEditBtn');
const fsStatusPill     = document.getElementById('fsStatusPill');
const fsValidationSum  = document.getElementById('fsValidationSummary');

// ── Banners ──────────────────────────────────────────────────
function showBanner(el, html) {
  if (!html) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = html;
  el.hidden = false;
}
function clearError() { showBanner(fsErrorBanner, ''); }

// ── Row rendering ────────────────────────────────────────────
function isRowComplete(r) {
  if (r.orphan) return true; // orphans don't block
  if (!r.plSection || !r.budgetCategory) return false;
  if (r.budgetCategory === dropdowns.yourBudgetCategoryToken && !(r.budgetCategoryCustom && r.budgetCategoryCustom.trim())) return false;
  return true;
}

function buildPLOptions(selected) {
  const opts = ['<option value="">— P&L Section —</option>'];
  for (const s of dropdowns.plSections) {
    opts.push(`<option value="${htmlEsc(s)}"${s === selected ? ' selected' : ''}>${htmlEsc(s)}</option>`);
  }
  return opts.join('');
}

function buildBCOptions(plSection, selected) {
  const opts = ['<option value="">— Budget Category —</option>'];
  if (plSection && dropdowns.budgetCategoriesBySection[plSection]) {
    for (const c of dropdowns.budgetCategoriesBySection[plSection]) {
      opts.push(`<option value="${htmlEsc(c)}"${c === selected ? ' selected' : ''}>${htmlEsc(c)}</option>`);
    }
  }
  return opts.join('');
}

function renderRow(r, index) {
  const tr = document.createElement('tr');
  tr.dataset.id = r.id;
  if (r.orphan) tr.classList.add('is-orphan');
  if (!isRowComplete(r)) tr.classList.add('is-incomplete');

  const yourBC = dropdowns.yourBudgetCategoryToken;
  const showCustom = r.budgetCategory === yourBC;

  tr.innerHTML = `
    <td class="vis-col-num">${index + 1}</td>
    <td class="vis-col-glnum">${htmlEsc(r.glNumber)}</td>
    <td class="vis-col-glname">${htmlEsc(r.glName)}</td>
    <td class="vis-col-pl">
      <select data-field="plSection">${buildPLOptions(r.plSection)}</select>
    </td>
    <td class="vis-col-bc">
      <div class="vis-bc-cell">
        <select data-field="budgetCategory">${buildBCOptions(r.plSection, r.budgetCategory)}</select>
        <input type="text" data-field="budgetCategoryCustom"
               placeholder="Type your custom category"
               value="${htmlEsc(r.budgetCategoryCustom || '')}"
               ${showCustom ? '' : 'hidden'} />
      </div>
    </td>
    <td class="vis-col-row-actions">
      <button type="button" class="vis-row-rm" title="Remove this row" aria-label="Remove">×</button>
    </td>
  `;
  return tr;
}

function render() {
  fsTableBody.innerHTML = '';
  if (glRows.length === 0) {
    fsTableWrap.hidden = true;
    fsEmpty.hidden = false;
  } else {
    fsTableWrap.hidden = false;
    fsEmpty.hidden = true;
    glRows.forEach((r, i) => fsTableBody.appendChild(renderRow(r, i)));
  }
  refreshOrphanBanner();
  refreshValidationSummary();
  refreshStatusUi();
}

function refreshOrphanBanner() {
  const orphans = glRows.filter(r => r.orphan).length;
  showBanner(
    fsOrphanBanner,
    orphans > 0
      ? `${orphans} GL${orphans === 1 ? '' : 's'} from your previous upload ${orphans === 1 ? 'is' : 'are'} not in this new file. They remain in your budgets as orphan GLs — review them below.`
      : '',
  );
}

function refreshValidationSummary() {
  const incomplete = glRows.filter(r => !isRowComplete(r));
  if (glRows.length === 0) {
    fsValidationSum.textContent = '';
    fsValidationSum.classList.remove('is-error', 'is-ready');
    fsCompleteBtn.disabled = true;
    return;
  }
  if (incomplete.length === 0) {
    fsValidationSum.textContent = `All ${glRows.length} GL${glRows.length === 1 ? '' : 's'} mapped. Ready to complete.`;
    fsValidationSum.classList.add('is-ready');
    fsValidationSum.classList.remove('is-error');
    fsCompleteBtn.disabled = false;
  } else {
    fsValidationSum.textContent = `${incomplete.length} GL${incomplete.length === 1 ? '' : 's'} still need a P&L Section + Budget Category.`;
    fsValidationSum.classList.add('is-error');
    fsValidationSum.classList.remove('is-ready');
    fsCompleteBtn.disabled = true;
  }
}

function refreshStatusUi() {
  fsStatusPill.dataset.status = fsStatus;
  fsStatusPill.textContent = fsStatus === 'completed' ? 'Completed' : 'Editing';
  document.body.classList.toggle('is-fs-completed', fsStatus === 'completed');
  fsEditBtn.hidden     = fsStatus !== 'completed';
  fsCompleteBtn.hidden = fsStatus === 'completed';
}

// ── Inline edit handlers ─────────────────────────────────────
async function patchRow(id, fields) {
  clearError();
  const res = await api(`/api/visibility/gl/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showBanner(fsErrorBanner, htmlEsc(body?.error?.message || `Save failed (${res.status}).`));
    return null;
  }
  const data = await res.json();
  return data.glAccount;
}

fsTableBody.addEventListener('change', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const tr = target.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;
  const row = glRows.find(r => r.id === id);
  if (!row) return;
  const field = target.getAttribute('data-field');
  if (!field) return;

  // Optimistic UI: apply the change locally and re-render BEFORE the
  // PATCH round-trip so the dependent dropdowns/inputs update instantly.
  // If the server rejects, we revert from the snapshot below.
  const snapshot = { ...row };

  if (field === 'plSection') {
    // Changing P&L Section invalidates Budget Category.
    row.plSection            = target.value || '';
    row.budgetCategory       = '';
    row.budgetCategoryCustom = '';
    render();
    const updated = await patchRow(id, {
      plSection:            target.value || null,
      budgetCategory:       null,
      budgetCategoryCustom: null,
    });
    if (updated) { Object.assign(row, normalize(updated)); render(); }
    else        { Object.assign(row, snapshot); render(); }
  } else if (field === 'budgetCategory') {
    const value  = target.value || '';
    const isYour = value === dropdowns.yourBudgetCategoryToken;
    row.budgetCategory       = value;
    row.budgetCategoryCustom = isYour ? (row.budgetCategoryCustom || '') : '';
    render();
    // Always send the full mapping triple so the server can validate the
    // combined state. Sending only `budgetCategory` would make the server
    // see `plSection` as unset and reject the patch.
    const updated = await patchRow(id, {
      plSection:            row.plSection || null,
      budgetCategory:       value || null,
      budgetCategoryCustom: isYour ? (row.budgetCategoryCustom || '') : null,
    });
    if (updated) { Object.assign(row, normalize(updated)); render(); }
    else        { Object.assign(row, snapshot); render(); }
  }
});

function normalize(r) {
  return {
    ...r,
    plSection:            r.plSection || '',
    budgetCategory:       r.budgetCategory || '',
    budgetCategoryCustom: r.budgetCategoryCustom || '',
    orphan:               !!r.orphan,
  };
}

// debounce free-text edits to avoid one PATCH per keystroke
let customDebounce = null;
fsTableBody.addEventListener('input', (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.getAttribute('data-field') !== 'budgetCategoryCustom') return;
  const tr = target.closest('tr');
  const id = tr?.dataset.id;
  const row = glRows.find(r => r.id === id);
  if (!row) return;
  row.budgetCategoryCustom = target.value;
  if (customDebounce) clearTimeout(customDebounce);
  customDebounce = setTimeout(async () => {
    const updated = await patchRow(id, {
      plSection:            row.plSection || null,
      budgetCategory:       row.budgetCategory || null,
      budgetCategoryCustom: target.value,
    });
    if (updated) Object.assign(row, normalize(updated));
    refreshValidationSummary();
  }, 350);
});

// Remove row
fsTableBody.addEventListener('click', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('vis-row-rm')) return;
  const tr = target.closest('tr');
  const id = tr?.dataset.id;
  const row = glRows.find(r => r.id === id);
  if (!row) return;
  const ok = confirm(`Remove GL "${row.glNumber} — ${row.glName}"?`);
  if (!ok) return;
  const res = await api(`/api/visibility/gl/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) {
    glRows = glRows.filter(r => r.id !== id);
    render();
  } else {
    showBanner(fsErrorBanner, 'Could not remove that row.');
  }
});

// ── Upload ───────────────────────────────────────────────────
fsUploadBtn.addEventListener('click', () => fsFileInput.click());

fsFileInput.addEventListener('change', async () => {
  const file = fsFileInput.files && fsFileInput.files[0];
  fsFileInput.value = '';
  if (!file) return;
  clearError();
  showBanner(fsInfoBanner, `Uploading <strong>${htmlEsc(file.name)}</strong>…`);

  fsUploadBtn.disabled = true;
  try {
    const res = await fetch(
      `${VIS_API}/api/visibility/gl/upload?key=${encodeURIComponent(customerKey())}&filename=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(fsInfoBanner, '');
      showBanner(fsErrorBanner, htmlEsc(body?.error?.message || `Upload failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    fsStatus = data.status || 'editing';
    glRows   = (data.glAccounts || []).map(toClientRow);
    showBanner(fsErrorBanner, '');
    showBanner(
      fsInfoBanner,
      `Imported ${data.uploaded} row${data.uploaded === 1 ? '' : 's'} — ${data.inserted} new, ${data.updated} updated${data.newlyOrphaned > 0 ? `, ${data.newlyOrphaned} marked as orphan` : ''}.`,
    );
    render();
  } catch (err) {
    showBanner(fsInfoBanner, '');
    showBanner(fsErrorBanner, htmlEsc(`Upload failed: ${(err && err.message) || err}`));
  } finally {
    fsUploadBtn.disabled = false;
  }
});

// ── Complete / Edit ──────────────────────────────────────────
fsCompleteBtn.addEventListener('click', async () => {
  clearError();
  fsCompleteBtn.disabled = true;
  const original = fsCompleteBtn.textContent;
  fsCompleteBtn.textContent = 'Completing…';
  try {
    const res = await api('/api/visibility/financial-structure/complete', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(fsErrorBanner, htmlEsc(body?.error?.message || `Could not complete (${res.status}).`));
      return;
    }
    const data = await res.json();
    fsStatus = data.status || 'completed';
    refreshStatusUi();
  } finally {
    fsCompleteBtn.textContent = original;
    fsCompleteBtn.disabled = false;
    refreshValidationSummary();
  }
});

fsEditBtn.addEventListener('click', async () => {
  const res = await api('/api/visibility/financial-structure/edit', { method: 'POST' });
  if (res.ok) {
    fsStatus = 'editing';
    refreshStatusUi();
  }
});

// ── Boot ─────────────────────────────────────────────────────
function toClientRow(r) {
  return {
    id: r.id,
    glNumber: r.glNumber,
    glName: r.glName,
    plSection: r.plSection || '',
    budgetCategory: r.budgetCategory || '',
    budgetCategoryCustom: r.budgetCategoryCustom || '',
    orphan: !!r.orphan,
  };
}

(async function boot() {
  // dropdowns is initialized to DEFAULT_DROPDOWNS at module load — no
  // need to fetch them. Spec §2.3 is a fixed table; the server keeps its
  // own authoritative copy for validation, but the UI doesn't depend on
  // the network to render the selects.
  try {
    const fsRes = await api('/api/visibility/financial-structure');
    if (fsRes.ok) {
      const data = await fsRes.json();
      fsStatus = data.status || 'editing';
      glRows   = (data.glAccounts || []).map(toClientRow);
    }
  } catch (err) {
    showBanner(fsErrorBanner, htmlEsc(`Could not load Financial Structure: ${(err && err.message) || err}`));
  }
  render();
})();
