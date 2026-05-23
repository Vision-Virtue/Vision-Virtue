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
  // Clear any inline styles set by the Complete success path so the
  // pill/buttons can re-style themselves via CSS based on data-status.
  fsStatusPill.style.cssText  = '';
  fsCompleteBtn.style.display = '';
  fsEditBtn.style.display     = '';

  fsStatusPill.dataset.status = fsStatus;
  fsStatusPill.textContent    = fsStatus === 'completed' ? 'Completed' : 'Editing';
  document.body.classList.toggle('is-fs-completed', fsStatus === 'completed');
  fsEditBtn.hidden     = fsStatus !== 'completed';
  fsCompleteBtn.hidden = fsStatus === 'completed';
}

// ── Inline edit handlers ─────────────────────────────────────
async function patchRow(id, fields) {
  clearError();
  let res;
  try {
    res = await api(`/api/visibility/gl/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  } catch (err) {
    // Network / CORS errors throw before producing a Response. Surface
    // them so the user sees something instead of a silently-failing UI.
    showBanner(fsErrorBanner, htmlEsc(`Save failed: ${(err && err.message) || err}`));
    return null;
  }
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
  fsCompleteBtn.textContent = 'Saving rows…';

  try {
    // Sweep-save every non-orphan row from the current local state
    // before validating server-side. This catches any rows whose
    // individual PATCHes during typing silently failed (e.g. during
    // a Render redeploy) so the server's view matches the UI before
    // we ask it to validate completion.
    let sweepFailures = 0;
    for (const row of glRows) {
      if (row.orphan) continue;
      const updated = await patchRow(row.id, {
        plSection:            row.plSection            || null,
        budgetCategory:       row.budgetCategory       || null,
        budgetCategoryCustom: row.budgetCategoryCustom || null,
      });
      if (!updated) { sweepFailures++; continue; }
      Object.assign(row, normalize(updated));
    }
    if (sweepFailures > 0) {
      render();
      showBanner(
        fsErrorBanner,
        `Could not save ${sweepFailures} row${sweepFailures === 1 ? '' : 's'} — server rejected the mapping. Check each highlighted row above.`,
      );
      return;
    }
    render();

    fsCompleteBtn.textContent = 'Completing…';
    const res = await api('/api/visibility/financial-structure/complete', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const ids = Array.isArray(body?.error?.glIds) ? body.error.glIds : [];
      showBanner(
        fsErrorBanner,
        htmlEsc(body?.error?.message || `Could not complete (${res.status}).`)
        + (ids.length > 0 ? ' Refreshing the table to show the server\'s current state…' : ''),
      );
      if (ids.length > 0) {
        try {
          const fresh = await api('/api/visibility/financial-structure');
          if (fresh.ok) {
            const data = await fresh.json();
            glRows = (data.glAccounts || []).map(toClientRow);
            render();
          }
        } catch { /* keep existing local state */ }
      }
      return;
    }
    // 2xx from /complete is enough — the server already flipped state to
    // 'completed'. Don't trust the response shape to confirm it.
    await res.json().catch(() => ({}));
    fsStatus = 'completed';
    refreshStatusUi();
    // Belt-and-suspenders: set pill + banner via inline style so they
    // visibly update even if a stale cached CSS doesn't have the
    // [data-status="completed"] color rule yet.
    fsStatusPill.textContent     = 'Completed';
    fsStatusPill.style.cssText   = 'background: rgba(74,124,63,0.15); color: #8ed47b; border: 1px solid rgba(74,124,63,0.4);';
    fsCompleteBtn.style.display  = 'none';
    fsEditBtn.style.display      = 'inline-flex';
    fsInfoBanner.innerHTML = '<strong>✓ Financial Structure marked as completed.</strong> Use Edit to re-open it later.';
    fsInfoBanner.style.cssText   = 'display: block; padding: 0.75rem 1rem; border-radius: 6px; background: rgba(91,141,224,0.10); border: 1px solid rgba(91,141,224,0.35); color: #cfe0ff; margin-bottom: 1rem;';
    fsInfoBanner.removeAttribute('hidden');
    console.log('[visibility] Financial Structure completed.');
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
    // Drop the success banner + any remaining inline overrides on it.
    fsInfoBanner.style.cssText = '';
    showBanner(fsInfoBanner, '');
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

// ─────────────────────────────────────────────────────────────
//  PHASE 2 — Organizational Structure
// ─────────────────────────────────────────────────────────────

const ORG_DIMENSIONS = ['company', 'division', 'department', 'product', 'activity'];

// Module state.
let osStatus = 'editing';
let osEntities = {
  company: [], division: [], department: [], product: [], activity: [],
};

// DOM refs.
const tabs              = Array.from(document.querySelectorAll('.vis-tab'));
const panelFS           = document.getElementById('panelFinancialStructure');
const panelOS           = document.getElementById('panelOrgStructure');
const osStatusPill      = document.getElementById('osStatusPill');
const osErrorBanner     = document.getElementById('osErrorBanner');
const osInfoBanner      = document.getElementById('osInfoBanner');
const osSummary         = document.getElementById('osSummary');
const osCompleteBtn     = document.getElementById('osCompleteBtn');
const osEditBtn         = document.getElementById('osEditBtn');

// ── Tabs ──────────────────────────────────────────────────────
function activateTab(tabName) {
  for (const t of tabs) {
    if (t.classList.contains('is-disabled')) continue;
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle('is-active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  }
  if (panelFS) panelFS.hidden = tabName !== 'financial-structure';
  if (panelOS) panelOS.hidden = tabName !== 'org-structure';
  const panelB           = document.getElementById('panelBudget');
  const panelCfStructure = document.getElementById('panelCfStructure');
  const panelCfForecast  = document.getElementById('panelCfForecast');
  const panelCfDashboard = document.getElementById('panelCfDashboard');
  if (panelB)           panelB.hidden           = tabName !== 'budget';
  if (panelCfStructure) panelCfStructure.hidden = tabName !== 'cf-structure';
  if (panelCfForecast)  panelCfForecast.hidden  = tabName !== 'cf-forecast';
  if (panelCfDashboard) panelCfDashboard.hidden = tabName !== 'cf-dashboard';
  if (tabName === 'budget') void loadBudgetList();
  if (tabName === 'cf-structure' || tabName === 'cf-forecast' || tabName === 'cf-dashboard') {
    void refreshCfBudgetPickers();
  }
}
for (const t of tabs) {
  t.addEventListener('click', () => {
    if (t.classList.contains('is-disabled')) return;
    activateTab(t.dataset.tab);
  });
}

// ── Org Structure rendering ───────────────────────────────────
function renderOrg() {
  for (const dim of ORG_DIMENSIONS) {
    const listEl  = document.querySelector(`.vis-org-list[data-dimension="${dim}"]`);
    const emptyEl = document.querySelector(`.vis-org-empty[data-dimension="${dim}"]`);
    if (!listEl || !emptyEl) continue;
    const items = osEntities[dim] || [];
    listEl.innerHTML = '';
    if (items.length === 0) {
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      for (const e of items) {
        const li = document.createElement('li');
        li.className = 'vis-org-list-item';
        li.dataset.id = e.id;
        li.dataset.dimension = dim;
        li.innerHTML = `
          <input class="vis-org-list-name" type="text" value="${htmlEsc(e.name)}" maxlength="200" />
          <button type="button" class="vis-org-list-rm" title="Remove" aria-label="Remove">×</button>
        `;
        listEl.appendChild(li);
      }
    }
  }
  refreshOrgStatusUi();
  refreshOrgSummary();
}

function refreshOrgStatusUi() {
  // Clear inline overrides from previous success state.
  osStatusPill.style.cssText  = '';
  osCompleteBtn.style.display = '';
  osEditBtn.style.display     = '';
  osStatusPill.dataset.status = osStatus;
  osStatusPill.textContent    = osStatus === 'completed' ? 'Completed' : 'Editing';
  document.body.classList.toggle('is-os-completed', osStatus === 'completed');
  osEditBtn.hidden     = osStatus !== 'completed';
  osCompleteBtn.hidden = osStatus === 'completed';
}

function refreshOrgSummary() {
  const total = ORG_DIMENSIONS.reduce((n, d) => n + (osEntities[d] || []).length, 0);
  osSummary.textContent = total === 0
    ? 'All dimensions are optional. Complete leaves them blank.'
    : `${total} entr${total === 1 ? 'y' : 'ies'} defined across ${ORG_DIMENSIONS.filter(d => (osEntities[d] || []).length > 0).length} dimension${ORG_DIMENSIONS.filter(d => (osEntities[d] || []).length > 0).length === 1 ? '' : 's'}.`;
}

// ── Add ──────────────────────────────────────────────────────
document.querySelectorAll('.vis-org-add').forEach(form => {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dim   = form.dataset.dimension;
    const input = form.querySelector('input');
    const name  = (input?.value || '').trim();
    if (!name) return;
    showBanner(osErrorBanner, '');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const res = await api('/api/visibility/org-structure/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension: dim, name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(osErrorBanner, htmlEsc(body?.error?.message || `Add failed (${res.status}).`));
        return;
      }
      const data = await res.json();
      osEntities[dim].push(data.entity);
      input.value = '';
      renderOrg();
      input.focus();
    } catch (err) {
      showBanner(osErrorBanner, htmlEsc(`Add failed: ${(err && err.message) || err}`));
    } finally {
      submit.disabled = false;
    }
  });
});

// ── Rename (debounced) and Remove ─────────────────────────────
let osRenameDebounce = null;
document.querySelectorAll('.vis-org-list').forEach(list => {
  list.addEventListener('input', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('vis-org-list-name')) return;
    const li  = target.closest('.vis-org-list-item');
    const id  = li?.dataset.id;
    const dim = li?.dataset.dimension;
    if (!id || !dim) return;
    const name = target.value.trim();
    if (osRenameDebounce) clearTimeout(osRenameDebounce);
    osRenameDebounce = setTimeout(async () => {
      if (!name) return;
      try {
        const res = await api(`/api/visibility/org-structure/entities/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          showBanner(osErrorBanner, htmlEsc(body?.error?.message || `Rename failed (${res.status}).`));
          return;
        }
        const data = await res.json();
        const idx = osEntities[dim].findIndex(e => e.id === id);
        if (idx >= 0 && data.entity) osEntities[dim][idx] = data.entity;
      } catch (err) {
        showBanner(osErrorBanner, htmlEsc(`Rename failed: ${(err && err.message) || err}`));
      }
    }, 350);
  });
  list.addEventListener('click', async (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('vis-org-list-rm')) return;
    const li  = target.closest('.vis-org-list-item');
    const id  = li?.dataset.id;
    const dim = li?.dataset.dimension;
    if (!id || !dim) return;
    const entity = osEntities[dim].find(e => e.id === id);
    if (!entity) return;

    // Fetch reference count to decide whether to warn (spec §11).
    let refs = 0;
    try {
      const r = await api(`/api/visibility/org-structure/entities/${encodeURIComponent(id)}/references`);
      if (r.ok) refs = (await r.json()).referenceCount || 0;
    } catch { /* default to 0 */ }

    const dimLabel = dim.charAt(0).toUpperCase() + dim.slice(1);
    const warning = refs > 0
      ? `This ${dimLabel} is used in ${refs} budget row(s). Deleting it will leave those cells blank. Continue?`
      : `Remove ${dimLabel} "${entity.name}"?`;
    if (!(await confirmModal('Remove ' + dimLabel, warning))) return;

    try {
      const res = await api(`/api/visibility/org-structure/entities/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(osErrorBanner, htmlEsc(body?.error?.message || `Remove failed (${res.status}).`));
        return;
      }
      osEntities[dim] = osEntities[dim].filter(e => e.id !== id);
      renderOrg();
    } catch (err) {
      showBanner(osErrorBanner, htmlEsc(`Remove failed: ${(err && err.message) || err}`));
    }
  });
});

// ── Complete / Edit ───────────────────────────────────────────
osCompleteBtn.addEventListener('click', async () => {
  showBanner(osErrorBanner, '');
  osCompleteBtn.disabled = true;
  const original = osCompleteBtn.textContent;
  osCompleteBtn.textContent = 'Completing…';
  try {
    const res = await api('/api/visibility/org-structure/complete', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(osErrorBanner, htmlEsc(body?.error?.message || `Could not complete (${res.status}).`));
      return;
    }
    await res.json().catch(() => ({}));
    osStatus = 'completed';
    refreshOrgStatusUi();
    // Belt-and-suspenders inline styling so the green pill + banner
    // always paint, regardless of cached CSS.
    osStatusPill.textContent   = 'Completed';
    osStatusPill.style.cssText = 'background: rgba(74,124,63,0.15); color: #8ed47b; border: 1px solid rgba(74,124,63,0.4);';
    osCompleteBtn.style.display = 'none';
    osEditBtn.style.display     = 'inline-flex';
    osInfoBanner.innerHTML   = '<strong>✓ Organizational Structure marked as completed.</strong> Use Edit to add or remove dimensions later.';
    osInfoBanner.style.cssText = 'display: block; padding: 0.75rem 1rem; border-radius: 6px; background: rgba(91,141,224,0.10); border: 1px solid rgba(91,141,224,0.35); color: #cfe0ff; margin-bottom: 1rem;';
    osInfoBanner.removeAttribute('hidden');
  } catch (err) {
    showBanner(osErrorBanner, htmlEsc(`Could not complete: ${(err && err.message) || err}`));
  } finally {
    osCompleteBtn.textContent = original;
    osCompleteBtn.disabled = false;
  }
});

osEditBtn.addEventListener('click', async () => {
  try {
    const res = await api('/api/visibility/org-structure/edit', { method: 'POST' });
    if (res.ok) {
      osStatus = 'editing';
      refreshOrgStatusUi();
      osInfoBanner.style.cssText = '';
      showBanner(osInfoBanner, '');
    }
  } catch (err) {
    showBanner(osErrorBanner, htmlEsc(`Could not re-open: ${(err && err.message) || err}`));
  }
});

// ── Confirm modal ─────────────────────────────────────────────
const modal       = document.getElementById('visConfirmModal');
const modalTitle  = document.getElementById('visConfirmTitle');
const modalBody   = document.getElementById('visConfirmBody');
const modalOk     = document.getElementById('visConfirmOk');
const modalCancel = document.getElementById('visConfirmCancel');

function confirmModal(title, body) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalBody.textContent  = body;
    modal.hidden = false;
    const close = (result) => {
      modal.hidden = true;
      modalOk.removeEventListener('click', onOk);
      modalCancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk      = () => close(true);
    const onCancel  = () => close(false);
    const onBackdrop = (ev) => { if (ev.target === modal) close(false); };
    modalOk.addEventListener('click', onOk);
    modalCancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
  });
}

// ─────────────────────────────────────────────────────────────
//  PHASE 3a — Budgets
// ─────────────────────────────────────────────────────────────

const BUDGET_PERIOD_LABELS = {
  M01: 'Jan', M02: 'Feb', M03: 'Mar', M04: 'Apr', M05: 'May', M06: 'Jun',
  M07: 'Jul', M08: 'Aug', M09: 'Sep', M10: 'Oct', M11: 'Nov', M12: 'Dec',
  Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4',
  FY: 'FY',
};

const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', ILS: '₪' };

const bgListView         = document.getElementById('budgetListView');
const bgEditorView       = document.getElementById('budgetEditorView');
const bgList             = document.getElementById('budgetList');
const bgEmpty            = document.getElementById('budgetEmpty');
const bgListError        = document.getElementById('bgListErrorBanner');
const bgListInfo         = document.getElementById('bgListInfoBanner');
const bgEditorError      = document.getElementById('bgEditorErrorBanner');
const bgEditorInfo       = document.getElementById('bgEditorInfoBanner');
const newBudgetBtn       = document.getElementById('newBudgetBtn');
const budgetBackBtn      = document.getElementById('budgetBackBtn');
const budgetStatusPill   = document.getElementById('budgetStatusPill');
const budgetTableHead    = document.getElementById('budgetTableHead');
const budgetTableBody    = document.getElementById('budgetTableBody');
const budgetTableEmpty   = document.getElementById('budgetTableEmpty');
const addBudgetLineBtn   = document.getElementById('addBudgetLineBtn');
const budgetFinalizeBtn  = document.getElementById('budgetFinalizeBtn');
const budgetDeleteBtn    = document.getElementById('budgetDeleteBtn');
const bgFooterSummary    = document.getElementById('bgFooterSummary');

let budgetList = [];      // list-view cache
let currentBudget = null; // editor-view: { budget, periodKeys, lines: [{...,cells}] }
let bgCap = 5, bgRemaining = 5;

// ── List view ──────────────────────────────────────────────
async function loadBudgetList() {
  showBanner(bgListError, '');
  try {
    const res = await api('/api/visibility/budgets');
    if (!res.ok) {
      showBanner(bgListError, `Could not load budgets (${res.status}).`);
      return;
    }
    const data = await res.json();
    budgetList = data.budgets || [];
    bgCap = data.cap || 5;
    bgRemaining = data.remaining ?? Math.max(0, bgCap - budgetList.length);
    renderBudgetList();
  } catch (err) {
    showBanner(bgListError, htmlEsc(`Could not load budgets: ${(err && err.message) || err}`));
  }
}

function renderBudgetList() {
  bgList.innerHTML = '';
  bgEmpty.hidden = budgetList.length > 0;
  newBudgetBtn.disabled = bgRemaining <= 0;
  newBudgetBtn.title = bgRemaining > 0
    ? ''
    : `You've hit the ${bgCap}-budget cap. Delete one to make room.`;
  for (const b of budgetList) {
    const li = document.createElement('div');
    li.className = 'vis-budget-list-item';
    li.dataset.id = b.id;
    const sym = CURRENCY_SYMBOL[b.currency] || b.currency;
    const name = b.name || '(unnamed draft)';
    const statusBadge = b.status === 'finalized'
      ? '<span class="vis-status-pill" data-status="finalized">Finalized</span>'
      : '<span class="vis-status-pill" data-status="draft">Draft</span>';
    li.innerHTML = `
      <div class="vis-budget-list-info">
        <div class="vis-budget-list-name">${htmlEsc(name)}</div>
        <div class="vis-budget-list-meta">FY ${b.year} · ${b.granularity} · ${sym}${b.currency} · ${b.scale}${b.sbEnabled ? ' · S&B' : ''}</div>
      </div>
      ${statusBadge}
      <div class="vis-budget-list-actions">
        <button type="button" class="vis-btn vis-btn-primary vis-btn-sm" data-action="open">Open</button>
        <button type="button" class="vis-btn vis-btn-ghost vis-btn-sm" data-action="delete">Delete</button>
      </div>
    `;
    bgList.appendChild(li);
  }
}

bgList.addEventListener('click', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const item = target.closest('.vis-budget-list-item');
  const id = item?.dataset.id;
  if (!id || !action) return;
  if (action === 'open') {
    await openBudget(id);
  } else if (action === 'delete') {
    const b = budgetList.find(x => x.id === id);
    const ok = await confirmModal('Delete budget', `Delete "${b?.name || '(unnamed draft)'}"? This can't be undone.`);
    if (!ok) return;
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(bgListError, htmlEsc(body?.error?.message || `Delete failed (${res.status}).`));
        return;
      }
      await loadBudgetList();
    } catch (err) {
      showBanner(bgListError, htmlEsc(`Delete failed: ${(err && err.message) || err}`));
    }
  }
});

// ── Create new budget ──────────────────────────────────────
newBudgetBtn.addEventListener('click', async () => {
  showBanner(bgListError, '');
  if (bgRemaining <= 0) return;
  const thisYear = new Date().getFullYear();
  const body = {
    year: thisYear, granularity: 'monthly', currency: 'USD',
    scale: 'standard', sbEnabled: false,
  };
  try {
    const res = await api('/api/visibility/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgListError, htmlEsc(er?.error?.message || `Create failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    await openBudget(data.budget.id);
  } catch (err) {
    showBanner(bgListError, htmlEsc(`Create failed: ${(err && err.message) || err}`));
  }
});

// ── Editor view ────────────────────────────────────────────
async function openBudget(id) {
  showBanner(bgEditorError, '');
  showBanner(bgEditorInfo, '');
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgListError, htmlEsc(er?.error?.message || `Open failed (${res.status}).`));
      return;
    }
    currentBudget = await res.json();
    bgListView.hidden = true;
    bgEditorView.hidden = false;
    renderEditor();
  } catch (err) {
    showBanner(bgListError, htmlEsc(`Open failed: ${(err && err.message) || err}`));
  }
}

budgetBackBtn.addEventListener('click', async () => {
  bgEditorView.hidden = true;
  bgListView.hidden = false;
  currentBudget = null;
  await loadBudgetList();
});

function renderEditor() {
  if (!currentBudget) return;
  // Default to Structure view on every open (Phase 3c).
  if (typeof resetToStructureView === 'function') resetToStructureView();
  renderSetupPills();
  renderStatusPill();
  renderBudgetTable();
  renderFooterSummary();
  refreshSBSectionVisibility();
  if (currentBudget.budget.sbEnabled) void loadSalaries();
}

function renderStatusPill() {
  const status = currentBudget.budget.status;
  budgetStatusPill.dataset.status = status;
  budgetStatusPill.textContent = status === 'finalized' ? 'Finalized' : 'Draft';
  budgetFinalizeBtn.textContent = status === 'finalized' ? 'Rename / re-save' : 'Finalize';
}

function renderSetupPills() {
  const setup = currentBudget.budget;
  // Year pillgroup is filled dynamically: current year, next year.
  const yearGroup = document.querySelector('.vis-pillgroup[data-setup="year"]');
  if (yearGroup) {
    yearGroup.innerHTML = '';
    const yr = new Date().getFullYear();
    for (const y of [yr, yr + 1]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = String(y);
      b.textContent = String(y);
      yearGroup.appendChild(b);
    }
  }
  // Highlight active pills based on the current budget setup.
  const map = {
    year: String(setup.year),
    granularity: setup.granularity,
    currency: setup.currency,
    scale: setup.scale,
    sbEnabled: String(setup.sbEnabled),
  };
  for (const group of document.querySelectorAll('.vis-pillgroup')) {
    const key = group.dataset.setup;
    for (const btn of group.querySelectorAll('button')) {
      btn.classList.toggle('is-active', btn.dataset.value === map[key]);
    }
  }
}

// Setup pill change → PATCH budget
document.querySelectorAll('.vis-pillgroup').forEach(group => {
  group.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn || !currentBudget) return;
    const key = group.dataset.setup;
    const raw = btn.dataset.value;
    if (!key || raw == null) return;
    let value;
    if (key === 'year') value = parseInt(raw, 10);
    else if (key === 'sbEnabled') value = raw === 'true';
    else value = raw;
    const payload = { [key]: value };
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const er = await res.json().catch(() => ({}));
        showBanner(bgEditorError, htmlEsc(er?.error?.message || `Save failed (${res.status}).`));
        return;
      }
      // Granularity change requires a full reload because cells get remapped server-side.
      if (key === 'granularity') {
        await openBudget(currentBudget.budget.id);
        return;
      }
      const data = await res.json();
      currentBudget.budget = data.budget;
      renderSetupPills();
      renderStatusPill();
      // Scale and currency changes are display-only but the rendered
      // amounts and currency symbol need to refresh (§6).
      if (key === 'scale' || key === 'currency') {
        renderBudgetTable();
        renderFooterSummary();
      }
      // Toggling S&B reveals or hides the Salaries panel.
      if (key === 'sbEnabled') {
        refreshSBSectionVisibility();
        if (currentBudget.budget.sbEnabled) void loadSalaries();
      }
    } catch (err) {
      showBanner(bgEditorError, htmlEsc(`Save failed: ${(err && err.message) || err}`));
    }
  });
});

// ── Budget Structure table ────────────────────────────────
function buildOrgOptions(dim, selectedId) {
  const list = (osEntities[dim] || []);
  let html = '<option value="">—</option>';
  for (const e of list) {
    html += `<option value="${htmlEsc(e.id)}"${selectedId === e.id ? ' selected' : ''}>${htmlEsc(e.name)}</option>`;
  }
  return html;
}
function buildGLOptions(selectedId, opts) {
  // opts.onlySalaries → restrict the list to GLs that the customer
  //   tagged with the "Salaries and benefits" budget category in
  //   Financial Structure. Used by the S&B table per request.
  const onlySalaries = !!(opts && opts.onlySalaries);
  let html = '<option value="">—</option>';
  const filtered = glRows
    .filter(r => !r.orphan)
    .filter(r => !onlySalaries || r.budgetCategory === 'Salaries and benefits');
  for (const g of filtered) {
    const label = `${g.glNumber} ${g.glName}`;
    html += `<option value="${htmlEsc(g.id)}"${selectedId === g.id ? ' selected' : ''}>${htmlEsc(label)}</option>`;
  }
  return html;
}
function findGL(id) { return glRows.find(r => r.id === id) || null; }

// ── Percent helpers ────────────────────────────────────────
/** Render a numeric pct (0..100+) as "50%" / empty for zero. */
function fmtPct(n) {
  if (!Number.isFinite(n) || n === 0) return '';
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  return s + '%';
}
/** Parse a percent string ("50", "50%", " 50 ") into a number. */
function parsePct(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[%,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ── Scale-aware amount helpers ────────────────────────────
// `line.cells[period]` always stores the RAW underlying amount.
// Display = raw / 1000 when scale === 'thousands' (spec §6 says
// scale change is display-only; underlying values untouched).
function scaleFactor(scale) { return scale === 'thousands' ? 1000 : 1; }

/** Format a raw amount for display in a period input. Empty/zero → ''. */
function fmtCellDisplay(raw, scale) {
  if (!Number.isFinite(raw) || raw === 0) return '';
  return (raw / scaleFactor(scale)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Format an amount for display in read-only cells.
 *  Negative values render as (1,234.56) per accounting convention.
 *  Zero / empty → '—'. */
function fmtAmountAccounting(raw, scale) {
  if (!Number.isFinite(raw) || raw === 0) return '—';
  const abs = Math.abs(raw / scaleFactor(scale));
  const s = abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return raw < 0 ? `(${s})` : s;
}

/** Like fmtAmountAccounting but always returns the absolute value
 *  for display (Revenues / Gross Profit / Adjusted EBITDA per spec).
 *  Underlying signed value is preserved in the data + export. */
function fmtAmountAbsDisplay(raw, scale) {
  if (!Number.isFinite(raw) || raw === 0) return '—';
  return Math.abs(raw / scaleFactor(scale)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Format a percentage. Negative → (xx.xx%). */
function fmtPctSigned(n) {
  if (!Number.isFinite(n)) return '—';
  const v = Number(n.toFixed(2));
  if (v === 0) return '0.00%';
  return v < 0 ? `(${Math.abs(v).toFixed(2)}%)` : `${v.toFixed(2)}%`;
}

/** Parse a display string (with commas / currency syms) into a raw amount. */
function parseCellInput(str, scale) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[,$\s€£₪]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n * scaleFactor(scale);
}

function renderBudgetTable() {
  if (!currentBudget) return;
  clearRowSelection(budgetTableBody, deleteBudgetLineBtn);
  const periods = currentBudget.periodKeys || [];
  const scale   = currentBudget.budget.scale;
  // Head
  const head = ['#', 'Company', 'Service Provider Name', 'Service Description',
    'Division', 'Department', 'Product', 'Activity',
    'Account/GL Name', 'GL #', 'P&L Section', 'Budget Category',
    ...periods.map(p => BUDGET_PERIOD_LABELS[p] || p), 'FY total', ''];
  budgetTableHead.innerHTML = '<tr>' + head.map(h => `<th>${htmlEsc(h)}</th>`).join('') + '</tr>';

  // Body
  budgetTableBody.innerHTML = '';
  const lines = currentBudget.lines || [];
  budgetTableEmpty.hidden = lines.length > 0;

  lines.forEach((l, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = l.id;
    if (l.source === 'salaries') tr.classList.add('is-salaries-row');
    const gl = findGL(l.glAccountId);
    const totalFY = periods.reduce((s, p) => s + (Number(l.cells[p]) || 0), 0);

    const cellsHtml = periods.map(p => `
      <td class="is-period">
        <input type="text" inputmode="decimal" data-field="cell" data-period="${htmlEsc(p)}" value="${htmlEsc(fmtCellDisplay(Number(l.cells[p]) || 0, scale))}" />
      </td>`).join('');

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><select data-field="companyId">${buildOrgOptions('company', l.companyId)}</select></td>
      <td><input type="text" data-field="serviceProviderName" value="${htmlEsc(l.serviceProviderName)}" maxlength="200" /></td>
      <td><input type="text" data-field="serviceDescription" value="${htmlEsc(l.serviceDescription)}" maxlength="500" /></td>
      <td><select data-field="divisionId">${buildOrgOptions('division', l.divisionId)}</select></td>
      <td><select data-field="departmentId">${buildOrgOptions('department', l.departmentId)}</select></td>
      <td><select data-field="productId">${buildOrgOptions('product', l.productId)}</select></td>
      <td><select data-field="activityId">${buildOrgOptions('activity', l.activityId)}</select></td>
      <td><select data-field="glAccountId">${buildGLOptions(l.glAccountId)}</select></td>
      <td class="is-readonly">${gl ? htmlEsc(gl.glNumber) : '—'}</td>
      <td class="is-readonly">${gl ? htmlEsc(gl.plSection || '—') : '—'}</td>
      <td class="is-readonly">${gl ? htmlEsc((gl.budgetCategory === 'Your Budget Category' ? gl.budgetCategoryCustom : gl.budgetCategory) || '—') : '—'}</td>
      ${cellsHtml}
      <td class="is-total">${htmlEsc(fmtAmountAccounting(totalFY, scale))}</td>
      <td class="is-actions">
        <button type="button" class="vis-budget-line-dup" data-action="duplicate" title="Fill empty cells after the last entered value with that value">Duplicate</button>
        <button type="button" class="vis-budget-line-rm" data-action="remove" aria-label="Remove">×</button>
      </td>
    `;
    budgetTableBody.appendChild(tr);
  });
}

function fmtAmount(n) {
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function renderFooterSummary() {
  if (!currentBudget) return;
  const lines = currentBudget.lines || [];
  const periods = currentBudget.periodKeys || [];
  const scale = currentBudget.budget.scale;
  const grand = lines.reduce((s, l) => s + periods.reduce((a, p) => a + (Number(l.cells[p]) || 0), 0), 0);
  const sym = CURRENCY_SYMBOL[currentBudget.budget.currency] || currentBudget.budget.currency;
  const display = fmtAmountAccounting(grand, scale);
  bgFooterSummary.textContent =
    `${lines.length} row${lines.length === 1 ? '' : 's'} · Total ${sym}${display}` +
    (scale === 'thousands' ? ' (×1,000)' : '');
}

// Per-row edit handlers (delegated)
budgetTableBody.addEventListener('change', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const tr = target.closest('tr');
  if (!tr) return;
  const lineId = tr.dataset.id;
  const line = currentBudget?.lines.find(l => l.id === lineId);
  if (!line || line.source === 'salaries') return;
  const field = target.dataset.field;
  if (!field) return;

  if (field === 'cell') {
    const period = target.dataset.period;
    const raw = parseCellInput(target.value, currentBudget.budget.scale);
    line.cells[period] = raw;
    // Reformat the cell with commas now that the user has finished typing
    // (change event fires on blur for text inputs).
    target.value = fmtCellDisplay(raw, currentBudget.budget.scale);
    debouncedSaveCells(lineId);
    refreshRowTotal(tr, line);
    renderFooterSummary();
  } else if (field === 'glAccountId') {
    line.glAccountId = target.value || null;
    // Refresh the read-only auto-pulled columns by re-rendering the row.
    renderBudgetTable();
    await patchLine(lineId, { glAccountId: line.glAccountId });
  } else if (field === 'companyId' || field === 'divisionId' ||
             field === 'departmentId' || field === 'productId' || field === 'activityId') {
    line[field] = target.value || null;
    await patchLine(lineId, { [field]: line[field] });
  }
});

budgetTableBody.addEventListener('input', (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLInputElement)) return;
  const tr = target.closest('tr');
  const lineId = tr?.dataset.id;
  const line = currentBudget?.lines.find(l => l.id === lineId);
  if (!line || line.source === 'salaries') return;
  const field = target.dataset.field;
  if (field === 'serviceProviderName' || field === 'serviceDescription') {
    line[field] = target.value;
    debouncedSaveMeta(lineId);
  }
});

function refreshRowTotal(tr, line) {
  const periods = currentBudget.periodKeys || [];
  const total = periods.reduce((s, p) => s + (Number(line.cells[p]) || 0), 0);
  const totalCell = tr.querySelector('td.is-total');
  if (totalCell) totalCell.textContent = fmtAmountAccounting(total, currentBudget.budget.scale);
}

// Row-action buttons (duplicate / remove)
budgetTableBody.addEventListener('click', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const tr = target.closest('tr');
  if (!tr) return;
  const lineId = tr.dataset.id;
  const line = currentBudget?.lines.find(l => l.id === lineId);
  if (!line || line.source === 'salaries') return;

  if (target.dataset.action === 'duplicate') {
    const periods = currentBudget.periodKeys || [];
    // "Duplicate amount" per spec §5.2: take the value the user just
    // entered (the LAST non-zero entry, scanning left → right) and
    // fill every cell AFTER it that is still empty/zero.
    let lastIdx = -1;
    let lastVal = 0;
    for (let i = 0; i < periods.length; i++) {
      const v = Number(line.cells[periods[i]]);
      if (Number.isFinite(v) && v !== 0) {
        lastIdx = i;
        lastVal = v;
      }
    }
    if (lastIdx < 0) return; // nothing entered yet — nothing to duplicate
    for (let i = lastIdx + 1; i < periods.length; i++) {
      const v = Number(line.cells[periods[i]]);
      if (!Number.isFinite(v) || v === 0) line.cells[periods[i]] = lastVal;
    }
    // Re-render this row's inputs + total with the (possibly-scaled) display.
    for (const inp of tr.querySelectorAll('input[data-field="cell"]')) {
      const raw = Number(line.cells[inp.dataset.period]) || 0;
      inp.value = fmtCellDisplay(raw, currentBudget.budget.scale);
    }
    refreshRowTotal(tr, line);
    renderFooterSummary();
    debouncedSaveCells(lineId);
  } else if (target.dataset.action === 'remove') {
    const ok = await confirmModal('Remove row', 'Remove this budget row?');
    if (!ok) return;
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/lines/${encodeURIComponent(lineId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const er = await res.json().catch(() => ({}));
        showBanner(bgEditorError, htmlEsc(er?.error?.message || `Remove failed (${res.status}).`));
        return;
      }
      currentBudget.lines = currentBudget.lines.filter(l => l.id !== lineId);
      renderBudgetTable();
      renderFooterSummary();
    } catch (err) {
      showBanner(bgEditorError, htmlEsc(`Remove failed: ${(err && err.message) || err}`));
    }
  }
});

// ── Autosave (debounced) ──────────────────────────────────
const bgDebouncers = new Map();
function debounce(key, fn, ms) {
  if (bgDebouncers.has(key)) clearTimeout(bgDebouncers.get(key));
  bgDebouncers.set(key, setTimeout(fn, ms));
}
function debouncedSaveCells(lineId) {
  debounce(`cells:${lineId}`, async () => {
    const line = currentBudget?.lines.find(l => l.id === lineId);
    if (!line) return;
    await patchLine(lineId, { cells: { ...line.cells } });
  }, 400);
}
function debouncedSaveMeta(lineId) {
  debounce(`meta:${lineId}`, async () => {
    const line = currentBudget?.lines.find(l => l.id === lineId);
    if (!line) return;
    await patchLine(lineId, {
      serviceProviderName: line.serviceProviderName,
      serviceDescription:  line.serviceDescription,
    });
  }, 350);
}

async function patchLine(lineId, payload) {
  if (!currentBudget) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/lines/${encodeURIComponent(lineId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Save failed (${res.status}).`));
    } else {
      showBanner(bgEditorError, '');
    }
  } catch (err) {
    showBanner(bgEditorError, htmlEsc(`Save failed: ${(err && err.message) || err}`));
  }
}

// ── Add row / Finalize / Delete ────────────────────────────
addBudgetLineBtn.addEventListener('click', async () => {
  if (!currentBudget) return;
  showBanner(bgEditorError, '');
  // If a row is selected, ask the server to insert right after it
  // (the selected row shifts down by one and the new one lands below).
  const selected = budgetTableBody?.querySelector('tr.is-selected');
  const afterId  = selected?.dataset?.id || undefined;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(afterId ? { afterId } : {}),
    });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Add row failed (${res.status}).`));
      return;
    }
    // Re-fetch so the order on screen matches the server (other rows
    // got their order_index bumped) — simpler than splicing locally.
    await openBudget(currentBudget.budget.id);
  } catch (err) {
    showBanner(bgEditorError, htmlEsc(`Add row failed: ${(err && err.message) || err}`));
  }
});

budgetFinalizeBtn.addEventListener('click', async () => {
  if (!currentBudget) return;
  showBanner(bgEditorError, '');
  const currentName = currentBudget.budget.name || '';
  const name = await promptModal(
    currentBudget.budget.status === 'finalized' ? 'Rename budget' : 'Name this budget',
    'Saved budgets appear in the list and can be re-opened later. You can rename anytime.',
    currentName,
  );
  if (!name) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Finalize failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    currentBudget.budget = data.budget;
    renderStatusPill();
    showBanner(
      bgEditorInfo,
      `<strong>✓ "${htmlEsc(data.budget.name)}" saved.</strong> You can keep editing — every change auto-saves and overwrites the same budget.`,
    );
  } catch (err) {
    showBanner(bgEditorError, htmlEsc(`Finalize failed: ${(err && err.message) || err}`));
  }
});

budgetDeleteBtn.addEventListener('click', async () => {
  if (!currentBudget) return;
  const ok = await confirmModal('Delete budget', `Delete "${currentBudget.budget.name || '(unnamed draft)'}"? This can't be undone.`);
  if (!ok) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}`, { method: 'DELETE' });
    if (res.ok) {
      bgEditorView.hidden = true;
      bgListView.hidden = false;
      currentBudget = null;
      await loadBudgetList();
    } else {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Delete failed (${res.status}).`));
    }
  } catch (err) {
    showBanner(bgEditorError, htmlEsc(`Delete failed: ${(err && err.message) || err}`));
  }
});

// ─────────────────────────────────────────────────────────────
//  Row selection (powers the toolbar "Delete row" buttons on both
//  the Budget Structure and Salaries & Benefits tables).
// ─────────────────────────────────────────────────────────────

const deleteBudgetLineBtn = document.getElementById('deleteBudgetLineBtn');

function wireRowSelection(tbody, deleteBtn, opts) {
  if (!tbody || !deleteBtn) return;
  const multi = !!(opts && opts.multi);
  const onSelectionChange = opts && typeof opts.onSelectionChange === 'function' ? opts.onSelectionChange : null;
  const setSelected = (tr) => {
    if (!tr || !tr.dataset.id) return;
    if (!multi) {
      for (const sib of tbody.querySelectorAll('tr.is-selected')) {
        if (sib !== tr) sib.classList.remove('is-selected');
      }
    }
    tr.classList.add('is-selected');
    deleteBtn.disabled = false;
    onSelectionChange && onSelectionChange();
  };
  tbody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    // Clicking inside an editable cell shouldn't toggle the row —
    // the user is just placing the cursor. Make sure the row is at
    // least marked selected though.
    if (ev.target.closest('input, select, button, textarea')) {
      setSelected(tr);
      return;
    }
    if (multi) {
      tr.classList.toggle('is-selected');
      deleteBtn.disabled = !tbody.querySelector('tr.is-selected');
      onSelectionChange && onSelectionChange();
    } else {
      setSelected(tr);
    }
  });
  tbody.addEventListener('focusin', (ev) => {
    setSelected(ev.target.closest('tr'));
  });
}

function clearRowSelection(tbody, deleteBtn) {
  if (tbody) {
    for (const sib of tbody.querySelectorAll('tr.is-selected')) sib.classList.remove('is-selected');
  }
  if (deleteBtn) deleteBtn.disabled = true;
  refreshTranslateButtonState();
}

function refreshTranslateButtonState() {
  const btn = document.getElementById('translateBtn');
  if (!btn) return;
  const opEl = document.querySelector('.vis-pillgroup[data-translate="op"] button.is-active');
  const valEl = document.getElementById('translateValue');
  const v = valEl ? Number(String(valEl.value || '').replace(/[,\s]/g, '')) : NaN;
  const sel = budgetTableBody ? budgetTableBody.querySelectorAll('tr.is-selected').length : 0;
  btn.disabled = !(opEl && Number.isFinite(v) && v !== 0 && sel > 0);
}

// Wire selection for the Budget Structure table — multi-select so the
// new Translate tool can apply to many rows at once.
wireRowSelection(budgetTableBody, deleteBudgetLineBtn, {
  multi: true,
  onSelectionChange: refreshTranslateButtonState,
});

// ── Translate amounts tool ────────────────────────────────
// Operates on the currently-selected Budget Structure rows: each
// period cell becomes (cell × N) for Multiply or (cell ÷ N) for
// Divide. Salaries-source rows are skipped (their cells are owned
// by the S&B finalize pivot). Runs PATCHes in parallel.
for (const btn of document.querySelectorAll('.vis-pillgroup[data-translate="op"] button')) {
  btn.addEventListener('click', () => {
    for (const sib of btn.parentElement.querySelectorAll('button')) {
      sib.classList.toggle('is-active', sib === btn);
    }
    refreshTranslateButtonState();
  });
}
const translateValueEl = document.getElementById('translateValue');
translateValueEl?.addEventListener('input', refreshTranslateButtonState);

const translateBtn = document.getElementById('translateBtn');
translateBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  const opEl  = document.querySelector('.vis-pillgroup[data-translate="op"] button.is-active');
  const op    = opEl ? opEl.dataset.value : null;
  const value = Number(String((translateValueEl && translateValueEl.value) || '').replace(/[,\s]/g, ''));
  if (!op || !Number.isFinite(value) || value === 0) return;
  const selectedIds = Array.from(budgetTableBody.querySelectorAll('tr.is-selected'))
    .map(tr => tr.dataset.id)
    .filter(Boolean);
  if (selectedIds.length === 0) return;

  // Apply to every selected, non-salaries line.
  const lines = currentBudget.lines.filter(l => selectedIds.includes(l.id) && l.source !== 'salaries');
  if (lines.length === 0) {
    showBanner(bgEditorError, 'Translate skipped — all selected rows are managed by Salaries & Benefits and can\'t be edited here.');
    return;
  }
  translateBtn.disabled = true;
  const originalLabel = translateBtn.textContent;
  translateBtn.textContent = 'Translating…';
  try {
    const patches = lines.map(async (l) => {
      const next = {};
      for (const p of currentBudget.periodKeys) {
        const v = Number(l.cells[p]) || 0;
        next[p] = op === 'divide' ? v / value : v * value;
        l.cells[p] = next[p];
      }
      await patchLine(l.id, { cells: next });
    });
    await Promise.all(patches);
    renderBudgetTable();
    renderFooterSummary();
    showBanner(
      bgEditorInfo,
      `Translated ${lines.length} row${lines.length === 1 ? '' : 's'} — every period cell ${op === 'divide' ? '÷' : '×'} ${value}.`,
    );
  } finally {
    translateBtn.textContent = originalLabel;
    refreshTranslateButtonState();
  }
});

// Toolbar "Delete row" for Budget Structure.
deleteBudgetLineBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  const selected = budgetTableBody?.querySelector('tr.is-selected');
  if (!selected) return;
  const id = selected.dataset.id;
  const line = currentBudget.lines.find(l => l.id === id);
  if (!line) return;
  if (line.source === 'salaries') {
    showBanner(bgEditorError, 'Salaries-source rows are managed via the Salaries & Benefits tab.');
    return;
  }
  const ok = await confirmModal('Delete row', 'Delete the selected budget row?');
  if (!ok) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/lines/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Remove failed (${res.status}).`));
      return;
    }
    currentBudget.lines = currentBudget.lines.filter(l => l.id !== id);
    clearRowSelection(budgetTableBody, deleteBudgetLineBtn);
    renderBudgetTable();
    renderFooterSummary();
  } catch (err) {
    showBanner(bgEditorError, htmlEsc(`Remove failed: ${(err && err.message) || err}`));
  }
});

// ─────────────────────────────────────────────────────────────
//  PHASE 3b — Salaries & Benefits
// ─────────────────────────────────────────────────────────────

const sbSection     = document.getElementById('sbSection');
const sbStatusPill  = document.getElementById('sbStatusPill');
const sbTableBody   = document.getElementById('sbTableBody');
const sbEmpty       = document.getElementById('sbEmpty');
const sbErrorBanner = document.getElementById('sbErrorBanner');
const sbWarnBanner  = document.getElementById('sbWarnBanner');
const sbInfoBanner  = document.getElementById('sbInfoBanner');
const sbSummary     = document.getElementById('sbSummary');
const sbAddRowBtn   = document.getElementById('sbAddRowBtn');
const sbUploadBtn   = document.getElementById('sbUploadBtn');
const sbFileInput   = document.getElementById('sbFileInput');
const sbFinalizeBtn = document.getElementById('sbFinalizeBtn');
const sbEditBtn     = document.getElementById('sbEditBtn');

let sbState = { status: 'editing', rows: [], errors: [], warnings: [] };

function refreshSBSectionVisibility() {
  if (!sbSection || !currentBudget) return;
  sbSection.hidden = !currentBudget.budget.sbEnabled;
}

async function loadSalaries() {
  if (!currentBudget || !currentBudget.budget.sbEnabled) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries`);
    if (!res.ok) {
      showBanner(sbErrorBanner, `Could not load Salaries (${res.status}).`);
      return;
    }
    const data = await res.json();
    sbState.status   = data.status || 'editing';
    sbState.rows     = data.rows || [];
    sbState.errors   = data.errors || [];
    sbState.warnings = data.warnings || [];
    renderSBTable();
    refreshSBStatus();
    refreshSBValidation();
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Could not load Salaries: ${(err && err.message) || err}`));
  }
}

function refreshSBStatus() {
  if (!sbStatusPill) return;
  sbStatusPill.style.cssText = '';
  sbStatusPill.dataset.status = sbState.status;
  sbStatusPill.textContent    = sbState.status === 'finalized' ? 'Finalized' : 'Editing';
  document.body.classList.toggle('is-sb-finalized', sbState.status === 'finalized');
  sbEditBtn.hidden     = sbState.status !== 'finalized';
  sbFinalizeBtn.hidden = sbState.status === 'finalized';
}

function refreshSBValidation() {
  const errs  = sbState.errors  || [];
  const warns = sbState.warnings || [];
  showBanner(
    sbErrorBanner,
    errs.length > 0
      ? `<strong>${errs.length} validation issue${errs.length === 1 ? '' : 's'}:</strong><br>` +
        errs.map(e => `• ${htmlEsc(e.message)}`).join('<br>')
      : '',
  );
  showBanner(
    sbWarnBanner,
    warns.length > 0
      ? warns.map(w => `<em>Note:</em> ${htmlEsc(w.message)}`).join('<br>')
      : '',
  );
  const rowCount = (sbState.rows || []).length;
  sbSummary.textContent = rowCount === 0
    ? ''
    : `${rowCount} salary row${rowCount === 1 ? '' : 's'} · ${errs.length > 0 ? `${errs.length} issue${errs.length === 1 ? '' : 's'}` : 'Ready to finalize'}`;
  sbSummary.classList.toggle('is-error', errs.length > 0);
  sbSummary.classList.toggle('is-ready', rowCount > 0 && errs.length === 0);
  sbFinalizeBtn.disabled = rowCount === 0 || errs.length > 0;
}

// The "canonical" Monthly Salary is a property of the employee, not
// of a single row — multiple allocation rows for one employee should
// always show (canonical × pct / 100). Look up the canonical from
// any sibling row that has a non-zero monthlySalary stored, falling
// back to this row's own value when there are no siblings.
function canonicalSalary(employeeName, ownValue) {
  const trimmed = (employeeName || '').trim().toLowerCase();
  if (!trimmed) return Number(ownValue) || 0;
  for (const r of (sbState.rows || [])) {
    const v = Number(r.monthlySalary) || 0;
    if (v !== 0 && (r.employeeName || '').trim().toLowerCase() === trimmed) return v;
  }
  return Number(ownValue) || 0;
}

function renderSBTable() {
  if (!sbTableBody) return;
  const sbDeleteBtn = document.getElementById('sbDeleteRowBtn');
  clearRowSelection(sbTableBody, sbDeleteBtn);
  sbTableBody.innerHTML = '';
  const rows = sbState.rows || [];
  sbEmpty.hidden = rows.length > 0;
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    // Monthly Salary is canonical per employee — every row for the
    // same name shares the same underlying value. Allocated display
    // is (canonical × pct / 100).
    const monthly = canonicalSalary(r.employeeName, r.monthlySalary);
    const pct     = Number(r.productActivityPct) || 0;
    const allocated = pct > 0 ? monthly * (pct / 100) : monthly;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><select data-field="companyId">${buildOrgOptions('company', r.companyId)}</select></td>
      <td><input type="text" data-field="employeeName" value="${htmlEsc(r.employeeName)}" maxlength="200" /></td>
      <td><select data-field="divisionId">${buildOrgOptions('division', r.divisionId)}</select></td>
      <td><select data-field="departmentId">${buildOrgOptions('department', r.departmentId)}</select></td>
      <td><select data-field="productId">${buildOrgOptions('product', r.productId)}</select></td>
      <td><select data-field="activityId">${buildOrgOptions('activity', r.activityId)}</select></td>
      <td class="is-number"><input type="text" inputmode="decimal" data-field="productActivityPct" value="${htmlEsc(fmtPct(pct))}" /></td>
      <td class="is-number"><input type="text" inputmode="decimal" data-field="monthlySalary"
            data-full="${monthly}"
            value="${allocated === 0 ? '' : fmtCellDisplay(allocated, 'standard')}" /></td>
      <td><select data-field="glAccountId">${buildGLOptions(r.glAccountId, { onlySalaries: true })}</select></td>
      <td class="is-actions"><button type="button" class="vis-budget-line-rm" data-action="sb-remove" aria-label="Remove">×</button></td>
    `;
    sbTableBody.appendChild(tr);
  });
}

// Show the canonical full monthly salary while the cell is focused
// so the user can edit the underlying value. (Sibling rows for the
// same employee share the same canonical salary.)
sbTableBody?.addEventListener('focusin', (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.field !== 'monthlySalary') return;
  const tr  = target.closest('tr');
  const id  = tr?.dataset?.id;
  const row = sbState.rows.find(r => r.id === id);
  if (!row) return;
  const full = canonicalSalary(row.employeeName, row.monthlySalary);
  target.value = full === 0 ? '' : fmtCellDisplay(full, 'standard');
});

sbTableBody?.addEventListener('change', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const tr = target.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;
  const row = sbState.rows.find(r => r.id === id);
  if (!row) return;
  const field = target.dataset.field;
  if (!field) return;

  if (field === 'productActivityPct') {
    const n = parsePct(target.value);
    row.productActivityPct = n;
    // Reformat the input so the % suffix appears on blur.
    target.value = fmtPct(n);
    await sbPatch(id, { productActivityPct: n });
  } else if (field === 'monthlySalary') {
    // User-typed value is treated as the FULL monthly salary —
    // the canonical for this employee. Sync it to every sibling
    // row that shares the same employee name so allocations on
    // all rows compute against the same base.
    const full = parseCellInput(target.value, 'standard');
    row.monthlySalary = full;
    target.dataset.full = String(full);
    const pct = Number(row.productActivityPct) || 0;
    const allocated = pct > 0 ? full * (pct / 100) : full;
    target.value = allocated === 0 ? '' : fmtCellDisplay(allocated, 'standard');
    const trimmed = (row.employeeName || '').trim().toLowerCase();
    const siblings = trimmed
      ? sbState.rows.filter(r => r.id !== id && (r.employeeName || '').trim().toLowerCase() === trimmed)
      : [];
    await Promise.all([
      sbPatch(id, { monthlySalary: full }),
      ...siblings.map(async (r) => {
        r.monthlySalary = full;
        await sbPatch(r.id, { monthlySalary: full });
      }),
    ]);
  } else if (field === 'employeeName') {
    row.employeeName = target.value;
    // Auto-link rows for the same employee. Per spec §7.4 all rows
    // for one employee must share Company / Division / Department,
    // and they obviously share the same Monthly Salary too. When
    // the user types a name that already exists, copy those four
    // fields from the matching row so the user doesn't have to type
    // them again — and avoids the "I typed the allocated value by
    // mistake" calculation error.
    const trimmed = (row.employeeName || '').trim().toLowerCase();
    const match = trimmed
      ? sbState.rows.find(r => r.id !== id && (r.employeeName || '').trim().toLowerCase() === trimmed)
      : null;
    const patch = { employeeName: row.employeeName };
    if (match) {
      row.companyId    = match.companyId;
      row.divisionId   = match.divisionId;
      row.departmentId = match.departmentId;
      row.monthlySalary = match.monthlySalary;
      patch.companyId    = row.companyId;
      patch.divisionId   = row.divisionId;
      patch.departmentId = row.departmentId;
      patch.monthlySalary = row.monthlySalary;
    }
    await sbPatch(id, patch);
  } else {
    row[field] = target.value || null;
    await sbPatch(id, { [field]: row[field] });
  }
  await loadSalaries();
});

sbTableBody?.addEventListener('click', async (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action !== 'sb-remove') return;
  const tr = target.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  const ok = await confirmModal('Remove row', 'Remove this salary row?');
  if (!ok) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      await loadSalaries();
    } else {
      const er = await res.json().catch(() => ({}));
      showBanner(sbErrorBanner, htmlEsc(er?.error?.message || `Remove failed (${res.status}).`));
    }
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Remove failed: ${(err && err.message) || err}`));
  }
});

async function sbPatch(rowId, payload) {
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries/${encodeURIComponent(rowId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(sbErrorBanner, htmlEsc(er?.error?.message || `Save failed (${res.status}).`));
    }
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Save failed: ${(err && err.message) || err}`));
  }
}

sbAddRowBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  // Insert right after the selected row if any, else append.
  const selected = sbTableBody?.querySelector('tr.is-selected');
  const afterId  = selected?.dataset?.id || undefined;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(afterId ? { afterId } : {}),
    });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(sbErrorBanner, htmlEsc(er?.error?.message || `Add row failed (${res.status}).`));
      return;
    }
    await loadSalaries();
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Add row failed: ${(err && err.message) || err}`));
  }
});

sbUploadBtn?.addEventListener('click', () => sbFileInput?.click());

sbFileInput?.addEventListener('change', async () => {
  const file = sbFileInput.files && sbFileInput.files[0];
  sbFileInput.value = '';
  if (!file || !currentBudget) return;
  showBanner(sbErrorBanner, '');
  showBanner(sbInfoBanner, `Uploading <strong>${htmlEsc(file.name)}</strong>…`);
  try {
    const res = await fetch(
      `${VIS_API}/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries/upload?key=${encodeURIComponent(customerKey())}&filename=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file },
    );
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(sbInfoBanner, '');
      showBanner(sbErrorBanner, htmlEsc(er?.error?.message || `Upload failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    showBanner(
      sbInfoBanner,
      `Imported ${data.inserted} salary row${data.inserted === 1 ? '' : 's'}. Monthly Salary in budget currency = Employer's Cost ÷ Exchange rate.`,
    );
    await loadSalaries();
  } catch (err) {
    showBanner(sbInfoBanner, '');
    showBanner(sbErrorBanner, htmlEsc(`Upload failed: ${(err && err.message) || err}`));
  }
});

sbFinalizeBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  showBanner(sbErrorBanner, '');
  sbFinalizeBtn.disabled = true;
  const original = sbFinalizeBtn.textContent;
  sbFinalizeBtn.textContent = 'Finalizing…';
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries/finalize`, { method: 'POST' });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(sbErrorBanner, htmlEsc(er?.error?.message || `Finalize failed (${res.status}).`));
      await loadSalaries();
      return;
    }
    const data = await res.json();
    sbState.status = 'finalized';
    refreshSBStatus();
    showBanner(
      sbInfoBanner,
      `<strong>✓ Salaries pivoted into ${data.pivotCount} Budget Structure row${data.pivotCount === 1 ? '' : 's'}.</strong> Re-open via Edit to change allocations later.`,
    );
    await openBudget(currentBudget.budget.id);
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Finalize failed: ${(err && err.message) || err}`));
  } finally {
    sbFinalizeBtn.textContent = original;
    sbFinalizeBtn.disabled = false;
  }
});

sbEditBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries/edit`, { method: 'POST' });
    if (res.ok) {
      sbState.status = 'editing';
      refreshSBStatus();
      showBanner(sbInfoBanner, '');
    }
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Could not re-open: ${(err && err.message) || err}`));
  }
});

// Row selection + toolbar "Delete row" for the S&B table.
const sbDeleteRowBtn = document.getElementById('sbDeleteRowBtn');
wireRowSelection(sbTableBody, sbDeleteRowBtn);

sbDeleteRowBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  const selected = sbTableBody?.querySelector('tr.is-selected');
  if (!selected) return;
  const id = selected.dataset.id;
  const ok = await confirmModal('Delete row', 'Delete the selected salary row?');
  if (!ok) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/salaries/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(sbErrorBanner, htmlEsc(er?.error?.message || `Remove failed (${res.status}).`));
      return;
    }
    clearRowSelection(sbTableBody, sbDeleteRowBtn);
    await loadSalaries();
  } catch (err) {
    showBanner(sbErrorBanner, htmlEsc(`Remove failed: ${(err && err.message) || err}`));
  }
});

// ─────────────────────────────────────────────────────────────
//  PHASE 3c — Personal Area: view toggle + P&L Pivot + Export
// ─────────────────────────────────────────────────────────────

const PIVOT_PERIOD_LABEL = {
  M01: 'Jan', M02: 'Feb', M03: 'Mar', M04: 'Apr', M05: 'May', M06: 'Jun',
  M07: 'Jul', M08: 'Aug', M09: 'Sep', M10: 'Oct', M11: 'Nov', M12: 'Dec',
  Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4', FY: 'FY',
};

const viewTabs           = Array.from(document.querySelectorAll('.vis-view-tab'));
const structureSection   = document.querySelector('.vis-budget-table-section');
const pivotSection       = document.getElementById('pivotSection');
const pivotTableHead     = document.getElementById('pivotTableHead');
const pivotTableBody     = document.getElementById('pivotTableBody');
const pivotTableFoot     = document.getElementById('pivotTableFoot');
const pivotEmpty         = document.getElementById('pivotEmpty');
const pivotErrorBanner   = document.getElementById('pivotErrorBanner');
const pivotClearFiltersBtn = document.getElementById('pivotClearFiltersBtn');
const budgetExportBtn    = document.getElementById('budgetExportBtn');

let pivotFilters = {
  companies: [], divisions: [], departments: [], products: [], activities: [], gls: [],
  display: null, // null = follow budget granularity
};
// Section collapse state — survives between renders so toggling a
// section doesn't lose your collapse settings on every refetch.
const collapsedSections = new Set();
// The last pivot payload — used so collapse/expand re-renders locally
// without another network round-trip.
let lastPivotData = null;

function setView(view) {
  for (const t of viewTabs) {
    const a = t.dataset.view === view;
    t.classList.toggle('is-active', a);
    t.setAttribute('aria-selected', String(a));
  }
  if (structureSection) structureSection.hidden = view !== 'structure';
  if (sbSection)        sbSection.hidden        = view !== 'structure' || !currentBudget?.budget?.sbEnabled;
  if (pivotSection)     pivotSection.hidden     = view !== 'pivot';
  const dash = document.getElementById('dashboardSection');
  if (dash) dash.hidden = view !== 'dashboard';
  if (view === 'pivot')     void refreshPivot();
  if (view === 'dashboard') renderDashboard();
}

for (const t of viewTabs) {
  t.addEventListener('click', () => setView(t.dataset.view));
}

function populatePivotFilterDropdowns() {
  const fillSelect = (dim, key) => {
    const sel = document.querySelector(`select[data-pivot-filter="${key}"]`);
    if (!sel) return;
    const entries = osEntities[dim] || [];
    sel.innerHTML = entries.map(e =>
      `<option value="${htmlEsc(e.id)}"${pivotFilters[key].includes(e.id) ? ' selected' : ''}>${htmlEsc(e.name)}</option>`,
    ).join('');
  };
  fillSelect('company',    'companies');
  fillSelect('division',   'divisions');
  fillSelect('department', 'departments');
  fillSelect('product',    'products');
  fillSelect('activity',   'activities');
  // GL filter — populate from the customer's Financial Structure.
  const glSel = document.querySelector('select[data-pivot-filter="gls"]');
  if (glSel) {
    const gls = (glRows || []).filter(r => !r.orphan);
    glSel.innerHTML = gls.map(g =>
      `<option value="${htmlEsc(g.id)}"${pivotFilters.gls.includes(g.id) ? ' selected' : ''}>${htmlEsc(`${g.glNumber} ${g.glName}`)}</option>`,
    ).join('');
  }

  // Display granularity pills — disable any finer than the budget's native.
  const budgetGran = currentBudget?.budget?.granularity || 'monthly';
  const rank = { monthly: 0, quarterly: 1, yearly: 2 };
  for (const btn of document.querySelectorAll('.vis-pillgroup[data-pivot-filter="display"] button')) {
    const v = btn.dataset.value;
    const tooFine = rank[v] < rank[budgetGran];
    btn.disabled = tooFine;
    btn.classList.toggle('is-active', (pivotFilters.display || budgetGran) === v);
  }
}

// Custom toggle on multi-select: every click toggles just the
// clicked option without resetting other selections, AND clicking
// an already-selected option deselects it (per user request #5).
for (const sel of document.querySelectorAll('.vis-pivot-filter select[multiple]')) {
  sel.addEventListener('mousedown', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLOptionElement)) return;
    ev.preventDefault();           // suppress the browser default
    sel.focus();
    target.selected = !target.selected;
    const key = sel.dataset.pivotFilter;
    pivotFilters[key] = Array.from(sel.selectedOptions).map(o => o.value);
    void refreshPivot();
  });
  // Keyboard space/enter still toggles the focused option natively;
  // mirror our state into pivotFilters when that happens.
  sel.addEventListener('change', () => {
    const key = sel.dataset.pivotFilter;
    pivotFilters[key] = Array.from(sel.selectedOptions).map(o => o.value);
    void refreshPivot();
  });
}

for (const btn of document.querySelectorAll('.vis-pillgroup[data-pivot-filter="display"] button')) {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    pivotFilters.display = btn.dataset.value;
    for (const sib of btn.parentElement.querySelectorAll('button')) {
      sib.classList.toggle('is-active', sib === btn);
    }
    void refreshPivot();
  });
}

// Search input above any filter select — narrows the visible option
// list as the user types. Matches by substring (case-insensitive).
for (const inp of document.querySelectorAll('.vis-pivot-search')) {
  inp.addEventListener('input', () => {
    const key = inp.dataset.pivotSearch;
    const sel = document.querySelector(`select[data-pivot-filter="${key}"]`);
    if (!sel) return;
    const q = (inp.value || '').trim().toLowerCase();
    for (const opt of sel.options) {
      const visible = !q || opt.textContent.toLowerCase().includes(q);
      opt.hidden = !visible;
      // Belt-and-suspenders display:none in case the browser ignores
      // the hidden attribute on <option>.
      opt.style.display = visible ? '' : 'none';
    }
  });
}

// Section header toggle (click '+' / '−' to collapse/expand the
// categories under a P&L section in the pivot table).
pivotTableBody?.addEventListener('click', (ev) => {
  const btn = ev.target.closest && ev.target.closest('.vis-pivot-toggle-btn');
  if (!btn || !lastPivotData) return;
  const sec = btn.dataset.toggle;
  if (!sec) return;
  if (collapsedSections.has(sec)) collapsedSections.delete(sec);
  else collapsedSections.add(sec);
  renderPivot(lastPivotData);
});

pivotClearFiltersBtn?.addEventListener('click', () => {
  pivotFilters = { companies: [], divisions: [], departments: [], products: [], activities: [], gls: [], display: null };
  populatePivotFilterDropdowns();
  void refreshPivot();
});

function buildPivotQuery() {
  const parts = [];
  for (const k of ['companies', 'divisions', 'departments', 'products', 'activities', 'gls']) {
    if (pivotFilters[k] && pivotFilters[k].length > 0) parts.push(`${k}=${encodeURIComponent(pivotFilters[k].join(','))}`);
  }
  if (pivotFilters.display) parts.push(`display=${encodeURIComponent(pivotFilters.display)}`);
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

async function refreshPivot() {
  if (!currentBudget || (pivotSection && pivotSection.hidden)) return;
  populatePivotFilterDropdowns();
  showBanner(pivotErrorBanner, '');
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/pivot${buildPivotQuery()}`);
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(pivotErrorBanner, htmlEsc(er?.error?.message || `Pivot failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    lastPivotData = data;
    renderPivot(data);
  } catch (err) {
    showBanner(pivotErrorBanner, htmlEsc(`Pivot failed: ${(err && err.message) || err}`));
  }
}

function renderPivot(data) {
  const periodKeys = data.periodKeys || [];
  const scale = currentBudget.budget.scale;
  // Standard accounting display: negatives in parens, zeros as em-dash.
  const fmtAcct = (v) => fmtAmountAccounting(Number(v) || 0, scale);
  // Absolute-value display for Revenues / Gross Profit / Adjusted EBITDA
  // per user request — the underlying signed value flows through the
  // Excel export untouched.
  const fmtAbs = (v) => fmtAmountAbsDisplay(Number(v) || 0, scale);

  const headCells = ['P&L Section', 'Budget Category', ...periodKeys.map(p => PIVOT_PERIOD_LABEL[p] || p), 'FY Total'];
  pivotTableHead.innerHTML = '<tr>' + headCells.map(h => `<th>${htmlEsc(h)}</th>`).join('') + '</tr>';

  pivotTableBody.innerHTML = '';
  const groups = data.groups || [];
  pivotEmpty.hidden = groups.length > 0;

  // Quick lookups by section name. P&L convention here: every section
  // subtotal participates in calculations as an ABSOLUTE value, so the
  // user can enter Revenues as a credit (negative) and Costs as either
  // sign and still get a sensible Gross Profit / EBITDA / GM% / EBITDA%.
  const byName = new Map(groups.map(g => [g.plSection, g]));
  const absCell = (sec, p) => Math.abs(byName.get(sec)?.cells[p] || 0);
  const absFy   = (sec)    => Math.abs(byName.get(sec)?.fyTotal || 0);

  // Helper: write one P&L section (subtotal row + category rows).
  // If `fmtFn` is provided, it overrides the default accounting format
  // for the subtotal row (used for Revenues which displays as |abs|).
  // The section header carries a +/− toggle that collapses or expands
  // its category rows underneath.
  const writeSection = (sectionName, fmtFn) => {
    const g = byName.get(sectionName);
    if (!g) return;
    const collapsed = collapsedSections.has(sectionName);
    const subFmt = fmtFn || fmtAcct;
    const sectionRow = document.createElement('tr');
    sectionRow.className = 'is-section';
    sectionRow.dataset.section = sectionName;
    sectionRow.innerHTML =
      `<td>
        <button type="button" class="vis-pivot-toggle-btn" data-toggle="${htmlEsc(sectionName)}" aria-expanded="${!collapsed}">
          <span class="vis-pivot-toggle-icon">${collapsed ? '+' : '−'}</span>
          <span>${htmlEsc(g.plSection)}</span>
        </button>
      </td>
      <td>— subtotal —</td>` +
      periodKeys.map(p => `<td class="vis-pivot-num">${htmlEsc(subFmt(g.cells[p]))}</td>`).join('') +
      `<td class="vis-pivot-num">${htmlEsc(subFmt(g.fyTotal))}</td>`;
    pivotTableBody.appendChild(sectionRow);
    if (collapsed) return;
    for (const c of g.categories || []) {
      const catRow = document.createElement('tr');
      catRow.className = 'is-category';
      catRow.innerHTML =
        `<td></td><td class="vis-pivot-cat-label">${htmlEsc(c.name)}</td>` +
        periodKeys.map(p => `<td class="vis-pivot-num">${htmlEsc(fmtAcct(c.cells[p]))}</td>`).join('') +
        `<td class="vis-pivot-num">${htmlEsc(fmtAcct(c.fyTotal))}</td>`;
      pivotTableBody.appendChild(catRow);
    }
  };

  // Helper to write a computed (no categories) row with custom class.
  const writeComputed = (label, perPeriod, fyTotal, fmtFn, klass) => {
    const tr = document.createElement('tr');
    tr.className = klass || 'is-section';
    const fmt = fmtFn || fmtAcct;
    tr.innerHTML =
      `<td>${htmlEsc(label)}</td><td></td>` +
      periodKeys.map(p => `<td class="vis-pivot-num">${htmlEsc(fmt(perPeriod[p]))}</td>`).join('') +
      `<td class="vis-pivot-num">${htmlEsc(fmt(fyTotal))}</td>`;
    pivotTableBody.appendChild(tr);
  };

  // Helper to write a percentage row (e.g. Gross Margin %, EBITDA %).
  const writePct = (label, perPeriod, fyTotal, klass) => {
    const tr = document.createElement('tr');
    tr.className = klass || 'is-pct';
    tr.innerHTML =
      `<td>${htmlEsc(label)}</td><td></td>` +
      periodKeys.map(p => `<td class="vis-pivot-num">${htmlEsc(fmtPctSigned(perPeriod[p]))}</td>`).join('') +
      `<td class="vis-pivot-num">${htmlEsc(fmtPctSigned(fyTotal))}</td>`;
    pivotTableBody.appendChild(tr);
  };

  // 1) Revenues (display as abs)
  writeSection('Revenues', fmtAbs);
  // 2) COGS
  writeSection('COGS');

  // Gross Profit = |Revenues| - |COGS|
  const gpCells = {};
  for (const p of periodKeys) gpCells[p] = absCell('Revenues', p) - absCell('COGS', p);
  const gpFy = absFy('Revenues') - absFy('COGS');
  writeComputed('Gross Profit', gpCells, gpFy, fmtAbs, 'is-section is-gp');

  // Gross Margin % = Gross Profit / |Revenues| × 100
  const gmCells = {};
  for (const p of periodKeys) {
    const rev = absCell('Revenues', p);
    gmCells[p] = rev !== 0 ? (gpCells[p] / rev) * 100 : 0;
  }
  const gmFy = absFy('Revenues') !== 0 ? (gpFy / absFy('Revenues')) * 100 : 0;
  writePct('Gross Margin %', gmCells, gmFy);

  // 4) OPEX sections
  writeSection('R&D');
  writeSection('S&M');
  writeSection('G&A');

  // Total OPEX = |R&D| + |S&M| + |G&A|
  const opexCells = {};
  for (const p of periodKeys) opexCells[p] = absCell('R&D', p) + absCell('S&M', p) + absCell('G&A', p);
  const opexFy = absFy('R&D') + absFy('S&M') + absFy('G&A');
  writeComputed('Total OPEX', opexCells, opexFy, fmtAcct, 'is-section is-opex');

  // Total OPEX % = Total OPEX / |Revenues| × 100
  const opexPctCells = {};
  for (const p of periodKeys) {
    const rev = absCell('Revenues', p);
    opexPctCells[p] = rev !== 0 ? (opexCells[p] / rev) * 100 : 0;
  }
  const opexPctFy = absFy('Revenues') !== 0 ? (opexFy / absFy('Revenues')) * 100 : 0;
  writePct('Total OPEX %', opexPctCells, opexPctFy, 'is-pct is-opex-pct');

  // Adjusted EBITDA = |Revenues| - |COGS| - Total OPEX  (= GP - OPEX)
  const ebCells = {};
  for (const p of periodKeys) ebCells[p] = gpCells[p] - opexCells[p];
  const ebFy = gpFy - opexFy;
  writeComputed('Adjusted EBITDA', ebCells, ebFy, fmtAbs, 'is-section is-ebitda');

  // Adjusted EBITDA % = EBITDA / |Revenues| × 100
  const ebPct = {};
  for (const p of periodKeys) {
    const rev = absCell('Revenues', p);
    ebPct[p] = rev !== 0 ? (ebCells[p] / rev) * 100 : 0;
  }
  const ebPctFy = absFy('Revenues') !== 0 ? (ebFy / absFy('Revenues')) * 100 : 0;
  writePct('Adjusted EBITDA %', ebPct, ebPctFy, 'is-pct is-ebitda-pct');

  // Below-the-line sections (unchanged accounting display)
  writeSection('Financial Income/(Expenses)');
  writeSection('Tax');
  writeSection('Other Income/(Expenses)');

  // No tfoot rows in the new layout — clear any leftover.
  pivotTableFoot.innerHTML = '';
}

budgetExportBtn?.addEventListener('click', async () => {
  if (!currentBudget) return;
  const original = budgetExportBtn.textContent;
  budgetExportBtn.disabled = true;
  budgetExportBtn.textContent = 'Preparing…';
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/export${buildPivotQuery()}`);
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Export failed (${res.status}).`));
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const name = (currentBudget.budget.name || 'budget').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
    a.href = url;
    a.download = `${name}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showBanner(bgEditorError, htmlEsc(`Export failed: ${(err && err.message) || err}`));
  } finally {
    budgetExportBtn.textContent = original;
    budgetExportBtn.disabled = false;
  }
});

// Reset to Structure view + clear pivot filters whenever the editor
// renders. renderEditor() is called by openBudget() after fetching
// the budget, so this kicks in for every budget open.
function resetToStructureView() {
  pivotFilters = { companies: [], divisions: [], departments: [], products: [], activities: [], gls: [], display: null };
  if (structureSection) structureSection.hidden = false;
  if (pivotSection)     pivotSection.hidden     = true;
  const dash = document.getElementById('dashboardSection');
  if (dash) dash.hidden = true;
  if (typeof destroyDashCharts === 'function') destroyDashCharts();
  for (const t of viewTabs) {
    const a = t.dataset.view === 'structure';
    t.classList.toggle('is-active', a);
    t.setAttribute('aria-selected', String(a));
  }
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD — modern P&L visualizations
// ─────────────────────────────────────────────────────────────

// Vision & Virtue accent palette for charts.
const DASH_PALETTE = [
  '#5b8de0', // accent blue
  '#9bbdf2', // light blue
  '#8ed47b', // mint
  '#f0c763', // amber
  '#f2937f', // coral
  '#c39bf2', // lavender
  '#7bd4d0', // teal
  '#ffd6a0', // peach
];
const DASH_AXIS_COLOR  = 'rgba(255, 255, 255, 0.55)';
const DASH_GRID_COLOR  = 'rgba(255, 255, 255, 0.08)';
const DASH_LABEL_COLOR = 'rgba(255, 255, 255, 0.85)';

// Keep chart instances around so we can destroy + recreate cleanly on
// every render — Chart.js otherwise complains about reusing a canvas.
const dashCharts = new Map();

function setDashChart(id, chart) {
  const existing = dashCharts.get(id);
  if (existing) existing.destroy();
  dashCharts.set(id, chart);
}
function destroyDashCharts() {
  for (const c of dashCharts.values()) c.destroy();
  dashCharts.clear();
}

function fmtThousands(v) {
  if (!Number.isFinite(v) || v === 0) return '0';
  return Math.round(v / 1000).toLocaleString('en-US');
}
function fmtThousandsSigned(v) {
  if (!Number.isFinite(v) || v === 0) return '0';
  const n = Math.round(v / 1000);
  return n < 0
    ? `(${Math.abs(n).toLocaleString('en-US')})`
    : n.toLocaleString('en-US');
}

function computeDashboardAgg() {
  if (!currentBudget) return null;
  const lines = currentBudget.lines || [];
  const periods = currentBudget.periodKeys || [];
  const granularity = currentBudget.budget.granularity;
  const opexSections = ['R&D', 'S&M', 'G&A'];

  const glById = new Map((glRows || []).map(g => [g.id, g]));
  const orgById = new Map();
  for (const dim of ORG_DIMENSIONS) {
    for (const e of (osEntities[dim] || [])) orgById.set(e.id, e);
  }
  const sectionOf = (l) => {
    if (!l.glAccountId) return null;
    return glById.get(l.glAccountId)?.plSection || null;
  };
  const categoryOf = (l) => {
    const gl = l.glAccountId ? glById.get(l.glAccountId) : null;
    if (!gl) return null;
    return gl.budgetCategory === 'Your Budget Category'
      ? (gl.budgetCategoryCustom || 'Your Budget Category')
      : gl.budgetCategory;
  };
  const lineFy = (l) => periods.reduce((s, p) => s + (Number(l.cells[p]) || 0), 0);

  // Section subtotals (using |sum of lines in section| to be robust to
  // accounting credit/debit sign convention — Revenues entered negative).
  const sumSection = (sec) => Math.abs(
    lines.filter(l => sectionOf(l) === sec).reduce((s, l) => s + lineFy(l), 0),
  );
  const totalRev  = sumSection('Revenues');
  const totalCogs = sumSection('COGS');
  const totalRnd  = sumSection('R&D');
  const totalSm   = sumSection('S&M');
  const totalGa   = sumSection('G&A');
  const totalOpex = totalRnd + totalSm + totalGa;

  // Revenue by Budget Category.
  const revByCategoryMap = new Map();
  for (const l of lines) {
    if (sectionOf(l) !== 'Revenues') continue;
    const cat = categoryOf(l) || 'Uncategorized';
    revByCategoryMap.set(cat, (revByCategoryMap.get(cat) || 0) + Math.abs(lineFy(l)));
  }

  // Revenue trend by Quarter — works on monthly (roll up M01..M12 into 4
  // quarters), quarterly (passthrough), and yearly (split FY ÷ 4 to keep
  // the trend chart legible).
  const revByQuarter = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const l of lines) {
    if (sectionOf(l) !== 'Revenues') continue;
    if (granularity === 'monthly') {
      revByQuarter.Q1 += Math.abs((l.cells.M01 || 0) + (l.cells.M02 || 0) + (l.cells.M03 || 0));
      revByQuarter.Q2 += Math.abs((l.cells.M04 || 0) + (l.cells.M05 || 0) + (l.cells.M06 || 0));
      revByQuarter.Q3 += Math.abs((l.cells.M07 || 0) + (l.cells.M08 || 0) + (l.cells.M09 || 0));
      revByQuarter.Q4 += Math.abs((l.cells.M10 || 0) + (l.cells.M11 || 0) + (l.cells.M12 || 0));
    } else if (granularity === 'quarterly') {
      revByQuarter.Q1 += Math.abs(l.cells.Q1 || 0);
      revByQuarter.Q2 += Math.abs(l.cells.Q2 || 0);
      revByQuarter.Q3 += Math.abs(l.cells.Q3 || 0);
      revByQuarter.Q4 += Math.abs(l.cells.Q4 || 0);
    } else {
      const q = Math.abs(l.cells.FY || 0) / 4;
      revByQuarter.Q1 += q; revByQuarter.Q2 += q; revByQuarter.Q3 += q; revByQuarter.Q4 += q;
    }
  }

  // Revenue by Product (only lines with a productId set).
  const revByProductMap = new Map();
  for (const l of lines) {
    if (sectionOf(l) !== 'Revenues') continue;
    if (!l.productId) continue;
    const name = orgById.get(l.productId)?.name || '—';
    revByProductMap.set(name, (revByProductMap.get(name) || 0) + Math.abs(lineFy(l)));
  }

  // Salaries & benefits within OPEX sections.
  const salariesAndBenefits = Math.abs(lines
    .filter(l => opexSections.includes(sectionOf(l)) && categoryOf(l) === 'Salaries and benefits')
    .reduce((s, l) => s + lineFy(l), 0));

  // Per-Product Adjusted EBITDA  (|Rev| - |COGS| - |OPEX|, per product).
  const productAgg = new Map();
  for (const l of lines) {
    if (!l.productId) continue;
    const sec = sectionOf(l);
    if (!sec) continue;
    const isOpex = opexSections.includes(sec);
    if (sec !== 'Revenues' && sec !== 'COGS' && !isOpex) continue;
    let p = productAgg.get(l.productId);
    if (!p) { p = { rev: 0, cogs: 0, opex: 0 }; productAgg.set(l.productId, p); }
    const fy = Math.abs(lineFy(l));
    if (sec === 'Revenues') p.rev  += fy;
    else if (sec === 'COGS') p.cogs += fy;
    else                     p.opex += fy;
  }
  const ebitdaByProduct = Array.from(productAgg.entries())
    .map(([pid, x]) => ({ name: orgById.get(pid)?.name || '—', ebitda: x.rev - x.cogs - x.opex }))
    .sort((a, b) => b.ebitda - a.ebitda);

  // OPEX by Activity.
  const opexByActivityMap = new Map();
  for (const l of lines) {
    if (!l.activityId) continue;
    if (!opexSections.includes(sectionOf(l))) continue;
    const name = orgById.get(l.activityId)?.name || '—';
    opexByActivityMap.set(name, (opexByActivityMap.get(name) || 0) + Math.abs(lineFy(l)));
  }

  // Per-Division Adjusted EBITDA.
  const divAgg = new Map();
  for (const l of lines) {
    if (!l.divisionId) continue;
    const sec = sectionOf(l);
    if (!sec) continue;
    const isOpex = opexSections.includes(sec);
    if (sec !== 'Revenues' && sec !== 'COGS' && !isOpex) continue;
    let d = divAgg.get(l.divisionId);
    if (!d) { d = { rev: 0, cogs: 0, opex: 0 }; divAgg.set(l.divisionId, d); }
    const fy = Math.abs(lineFy(l));
    if (sec === 'Revenues') d.rev  += fy;
    else if (sec === 'COGS') d.cogs += fy;
    else                     d.opex += fy;
  }
  const ebitdaByDivision = Array.from(divAgg.entries())
    .map(([did, x]) => ({ name: orgById.get(did)?.name || '—', ebitda: x.rev - x.cogs - x.opex }))
    .sort((a, b) => b.ebitda - a.ebitda);

  // OPEX by Department.
  const opexByDepartmentMap = new Map();
  for (const l of lines) {
    if (!l.departmentId) continue;
    if (!opexSections.includes(sectionOf(l))) continue;
    const name = orgById.get(l.departmentId)?.name || '—';
    opexByDepartmentMap.set(name, (opexByDepartmentMap.get(name) || 0) + Math.abs(lineFy(l)));
  }

  return {
    totalRev, totalCogs, totalOpex, salariesAndBenefits,
    gmPct:   totalRev > 0 ? ((totalRev - totalCogs) / totalRev) * 100 : 0,
    opexPct: totalRev > 0 ? (totalOpex / totalRev) * 100               : 0,
    salariesOpexPct: totalOpex > 0 ? (salariesAndBenefits / totalOpex) * 100 : 0,
    revByCategory: [...revByCategoryMap.entries()].map(([name, value]) => ({ name, value })),
    revByQuarter,
    revByProduct:  [...revByProductMap.entries()]
                     .map(([name, value]) => ({ name, value }))
                     .sort((a, b) => b.value - a.value),
    ebitdaByProduct,
    opexByActivity:   [...opexByActivityMap.entries()]
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value),
    ebitdaByDivision,
    opexByDepartment: [...opexByDepartmentMap.entries()]
                        .map(([name, value]) => ({ name, value })),
  };
}

function dashEmptyCheck(agg) {
  if (!agg) return true;
  const sum = (agg.totalRev || 0) + (agg.totalCogs || 0) + (agg.totalOpex || 0);
  return sum === 0;
}

function renderDashboard() {
  const dash = document.getElementById('dashboardSection');
  if (!dash) return;
  // Chart.js loads via CDN with `defer`; if the user opens the
  // Dashboard tab before it lands, retry shortly.
  if (typeof Chart === 'undefined') {
    setTimeout(renderDashboard, 60);
    return;
  }
  const agg = computeDashboardAgg();
  const empty = dashEmptyCheck(agg);
  document.getElementById('dashEmpty').hidden = !empty;
  document.getElementById('dashScaleHint').hidden = empty;
  document.getElementById('dashScaleHint').innerHTML =
    `All amounts are shown in <strong>thousands</strong> (rounded). Source: this budget's Structure rows.`;
  destroyDashCharts();
  if (empty) {
    // Clear KPI text too.
    document.getElementById('dashTotalRev').textContent  = '—';
    document.getElementById('dashGmPct').textContent     = '—';
    document.getElementById('dashTotalOpex').textContent = '—';
    document.getElementById('dashOpexPct').textContent   = '—';
    document.getElementById('dashSalariesPct').textContent = '—';
    document.getElementById('dashSalariesAbs').textContent = '—';
    return;
  }

  // ── Top-line KPIs ─────────────────────────────────────────
  document.getElementById('dashTotalRev').textContent  = fmtThousands(agg.totalRev);
  document.getElementById('dashGmPct').textContent     = `${agg.gmPct.toFixed(1)}%`;
  document.getElementById('dashTotalOpex').textContent = fmtThousands(agg.totalOpex);
  document.getElementById('dashOpexPct').textContent   = `${agg.opexPct.toFixed(1)}% of revenues`;
  document.getElementById('dashSalariesPct').textContent = `${agg.salariesOpexPct.toFixed(1)}%`;
  document.getElementById('dashSalariesAbs').textContent = `${fmtThousands(agg.salariesAndBenefits)} in thousands`;

  // Shared chart options.
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: DASH_LABEL_COLOR, font: { family: 'Inter', size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(10, 18, 38, 0.92)',
        borderColor: 'rgba(91, 141, 224, 0.5)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: DASH_LABEL_COLOR,
      },
    },
  };
  const cartesianScales = {
    x: { ticks: { color: DASH_AXIS_COLOR }, grid: { color: DASH_GRID_COLOR } },
    y: { ticks: { color: DASH_AXIS_COLOR }, grid: { color: DASH_GRID_COLOR } },
  };

  // Revenue mix (pie)
  if (agg.revByCategory.length > 0) {
    const ctx = document.getElementById('dashRevByCategory');
    setDashChart('revByCategory', new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: agg.revByCategory.map(d => d.name),
        datasets: [{
          data: agg.revByCategory.map(d => d.value),
          backgroundColor: DASH_PALETTE,
          borderColor: 'rgba(10, 18, 38, 0.85)',
          borderWidth: 2,
        }],
      },
      options: {
        ...baseOpts,
        cutout: '60%',
        plugins: {
          ...baseOpts.plugins,
          legend: { ...baseOpts.plugins.legend, position: 'right' },
          tooltip: {
            ...baseOpts.plugins.tooltip,
            callbacks: {
              label: (item) => {
                const total = item.dataset.data.reduce((a, b) => a + b, 0) || 1;
                const pct = ((item.parsed / total) * 100).toFixed(1);
                return ` ${item.label}: ${pct}%  (${fmtThousands(item.parsed)}K)`;
              },
            },
          },
        },
      },
    }));
  }

  // Revenue trend (line)
  {
    const ctx = document.getElementById('dashRevTrend');
    const vals = ['Q1','Q2','Q3','Q4'].map(q => agg.revByQuarter[q]);
    setDashChart('revTrend', new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        datasets: [{
          label: 'Revenues (K)',
          data: vals.map(v => Math.round(v / 1000)),
          fill: true,
          backgroundColor: 'rgba(91, 141, 224, 0.18)',
          borderColor: '#5b8de0',
          borderWidth: 2,
          tension: 0.35,
          pointBackgroundColor: '#9bbdf2',
          pointRadius: 4,
        }],
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: cartesianScales,
      },
    }));
  }

  // Revenue by Product (horizontal bar)
  if (agg.revByProduct.length > 0) {
    const ctx = document.getElementById('dashRevByProduct');
    setDashChart('revByProduct', new Chart(ctx, {
      type: 'bar',
      data: {
        labels: agg.revByProduct.map(d => d.name),
        datasets: [{
          label: 'Revenue (K)',
          data: agg.revByProduct.map(d => Math.round(d.value / 1000)),
          backgroundColor: DASH_PALETTE[0],
          borderRadius: 6,
        }],
      },
      options: {
        ...baseOpts,
        indexAxis: 'y',
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: cartesianScales,
      },
    }));
  }

  // EBITDA by Product (vertical bar, signed)
  if (agg.ebitdaByProduct.length > 0) {
    const ctx = document.getElementById('dashEbitdaByProduct');
    setDashChart('ebitdaByProduct', new Chart(ctx, {
      type: 'bar',
      data: {
        labels: agg.ebitdaByProduct.map(d => d.name),
        datasets: [{
          label: 'Adjusted EBITDA (K)',
          data: agg.ebitdaByProduct.map(d => Math.round(d.ebitda / 1000)),
          backgroundColor: (ctx) => (ctx.raw >= 0 ? '#5b8de0' : '#f2937f'),
          borderRadius: 6,
        }],
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: {
          ...cartesianScales,
          y: { ...cartesianScales.y, grid: { color: DASH_GRID_COLOR, drawBorder: true } },
        },
      },
    }));
  }

  // OPEX by Activity (vertical bar)
  if (agg.opexByActivity.length > 0) {
    const ctx = document.getElementById('dashOpexByActivity');
    setDashChart('opexByActivity', new Chart(ctx, {
      type: 'bar',
      data: {
        labels: agg.opexByActivity.map(d => d.name),
        datasets: [{
          label: 'OPEX (K)',
          data: agg.opexByActivity.map(d => Math.round(d.value / 1000)),
          backgroundColor: DASH_PALETTE[3],
          borderRadius: 6,
        }],
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: cartesianScales,
      },
    }));
  }

  // EBITDA by Division (vertical bar, signed)
  if (agg.ebitdaByDivision.length > 0) {
    const ctx = document.getElementById('dashEbitdaByDivision');
    setDashChart('ebitdaByDivision', new Chart(ctx, {
      type: 'bar',
      data: {
        labels: agg.ebitdaByDivision.map(d => d.name),
        datasets: [{
          label: 'Adjusted EBITDA (K)',
          data: agg.ebitdaByDivision.map(d => Math.round(d.ebitda / 1000)),
          backgroundColor: (ctx) => (ctx.raw >= 0 ? '#8ed47b' : '#f2937f'),
          borderRadius: 6,
        }],
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: cartesianScales,
      },
    }));
  }

  // OPEX mix by Department (pie)
  if (agg.opexByDepartment.length > 0) {
    const ctx = document.getElementById('dashOpexByDepartment');
    setDashChart('opexByDepartment', new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: agg.opexByDepartment.map(d => d.name),
        datasets: [{
          data: agg.opexByDepartment.map(d => d.value),
          backgroundColor: DASH_PALETTE,
          borderColor: 'rgba(10, 18, 38, 0.85)',
          borderWidth: 2,
        }],
      },
      options: {
        ...baseOpts,
        cutout: '60%',
        plugins: {
          ...baseOpts.plugins,
          legend: { ...baseOpts.plugins.legend, position: 'right' },
          tooltip: {
            ...baseOpts.plugins.tooltip,
            callbacks: {
              label: (item) => {
                const total = item.dataset.data.reduce((a, b) => a + b, 0) || 1;
                const pct = ((item.parsed / total) * 100).toFixed(1);
                return ` ${item.label}: ${pct}%  (${fmtThousands(item.parsed)}K)`;
              },
            },
          },
        },
      },
    }));
  }
}

// ── Prompt modal ───────────────────────────────────────────
const promptEl     = document.getElementById('visPromptModal');
const promptTitle  = document.getElementById('visPromptTitle');
const promptBody   = document.getElementById('visPromptBody');
const promptInput  = document.getElementById('visPromptInput');
const promptOk     = document.getElementById('visPromptOk');
const promptCancel = document.getElementById('visPromptCancel');

function promptModal(title, body, initialValue) {
  return new Promise((resolve) => {
    promptTitle.textContent = title;
    promptBody.textContent  = body;
    promptInput.value       = initialValue || '';
    promptEl.hidden = false;
    setTimeout(() => promptInput.focus(), 30);
    const close = (result) => {
      promptEl.hidden = true;
      promptOk.removeEventListener('click', onOk);
      promptCancel.removeEventListener('click', onCancel);
      promptInput.removeEventListener('keydown', onKey);
      promptEl.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk      = () => close((promptInput.value || '').trim() || null);
    const onCancel  = () => close(null);
    const onKey     = (ev) => { if (ev.key === 'Enter') onOk(); else if (ev.key === 'Escape') onCancel(); };
    const onBackdrop = (ev) => { if (ev.target === promptEl) onCancel(); };
    promptOk.addEventListener('click', onOk);
    promptCancel.addEventListener('click', onCancel);
    promptInput.addEventListener('keydown', onKey);
    promptEl.addEventListener('click', onBackdrop);
  });
}

// ─────────────────────────────────────────────────────────────
//  CF (Cash Flow) — Phase 1 scaffolding + Phase 2 O.B Cash
// ─────────────────────────────────────────────────────────────

let selectedCfBudgetId = null;
let cfBudgetCache = []; // finalized budgets only
let currentCf = null;   // { cf, budget, periodKeys } for the selected budget

/**
 * Populate the three CF tabs' budget pickers from the budgets API.
 * CF can only attach to finalized budgets (§10).
 */
async function refreshCfBudgetPickers() {
  const selects = Array.from(document.querySelectorAll('[data-cf-budget-select]'));
  if (selects.length === 0) return;
  try {
    const res = await api('/api/visibility/budgets');
    if (!res.ok) return;
    const data = await res.json();
    cfBudgetCache = (data.budgets || []).filter(b => b.status === 'finalized');
  } catch (_err) {
    cfBudgetCache = [];
  }
  const hasAny = cfBudgetCache.length > 0;
  if (selectedCfBudgetId && !cfBudgetCache.some(b => b.id === selectedCfBudgetId)) {
    selectedCfBudgetId = null;
  }
  if (!selectedCfBudgetId && hasAny) {
    selectedCfBudgetId = cfBudgetCache[0].id;
  }
  for (const sel of selects) {
    sel.innerHTML = '';
    if (!hasAny) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No finalized budgets yet — finalize one in tab 3.';
      sel.appendChild(opt);
      sel.disabled = true;
      continue;
    }
    sel.disabled = false;
    for (const b of cfBudgetCache) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name || '(unnamed)'} · FY ${b.year} · ${b.granularity}`;
      if (b.id === selectedCfBudgetId) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  await loadCurrentCf();
}

/**
 * Fetch the CF for `selectedCfBudgetId` and render whichever CF
 * panel is currently active. Called on tab activation and after
 * the picker changes.
 */
async function loadCurrentCf() {
  const noBudget = !selectedCfBudgetId;
  if (noBudget) {
    currentCf = null;
    renderCfStructure();
    return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const banner = document.getElementById('cfStructureErrorBanner');
      showBanner(banner, htmlEsc(body?.error?.message || `Could not load CF (${res.status}).`));
      currentCf = null;
      renderCfStructure();
      return;
    }
    currentCf = await res.json();
    showBanner(document.getElementById('cfStructureErrorBanner'), '');
  } catch (err) {
    currentCf = null;
    showBanner(
      document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not load CF: ${(err && err.message) || err}`),
    );
  }
  renderCfStructure();
  await loadPayables(true);
}

function renderCfStructure() {
  const sectionsEl = document.getElementById('cfStructureSections');
  const emptyEl    = document.getElementById('cfStructureEmpty');
  const footerEl   = document.getElementById('cfStructureFooter');
  const pillEl     = document.getElementById('cfStructureStatusPill');
  const obInput    = document.getElementById('cfOpeningCashInput');
  if (!sectionsEl || !emptyEl || !footerEl) return;

  const haveCf = !!currentCf;
  sectionsEl.hidden = !haveCf;
  footerEl.hidden   = !haveCf;
  emptyEl.hidden    = haveCf;

  if (!haveCf) {
    emptyEl.textContent = cfBudgetCache.length === 0
      ? 'No finalized budgets yet. Finalize a budget in tab 3 to open Cash Flow.'
      : 'Select a finalized budget to begin configuring Cash Flow sections.';
    if (pillEl) {
      pillEl.dataset.status = 'draft';
      pillEl.textContent = 'Draft';
    }
    return;
  }

  // Status pill mirrors the CF's persisted status.
  const status = currentCf.cf?.status || 'draft';
  if (pillEl) {
    pillEl.dataset.status = status === 'finalized' ? 'finalized' : 'draft';
    pillEl.textContent = status === 'finalized' ? 'Finalized' : 'Draft';
  }

  // Section 1 — Opening Cash. Echo the persisted value into the
  // input only when it differs (avoids fighting the user mid-type).
  if (obInput) {
    const persisted = Number(currentCf.cf?.openingCash || 0);
    const formatted = formatCfAmount(persisted);
    if (document.activeElement !== obInput && obInput.value !== formatted) {
      obInput.value = persisted ? formatted : '';
    }
    obInput.disabled = status === 'finalized';
  }

  refreshCfSectionStatuses();
}

/** Section-level status badges (Filled / Required / Optional). */
function refreshCfSectionStatuses() {
  if (!currentCf) return;
  const ob = Number(currentCf.cf?.openingCash || 0);
  const obBadge = document.querySelector('[data-cf-status="opening-cash"]');
  if (obBadge) {
    if (ob > 0 || obBadge.dataset.userTouched === '1') {
      obBadge.textContent = ob !== 0 ? 'Filled' : 'Required';
      obBadge.classList.toggle('vis-cf-section-status-filled', ob !== 0);
    } else {
      obBadge.textContent = 'Required';
      obBadge.classList.remove('vis-cf-section-status-filled');
    }
  }
}

/** Format an amount with thousands separators, no currency symbol. */
function formatCfAmount(n) {
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US');
}

/** Parse a user-entered amount string back to a Number. Strips
 *  commas and whitespace; returns 0 for empty/invalid input. */
function parseCfAmount(s) {
  const cleaned = String(s || '').replace(/[,  ]/g, '').trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Debounced PATCH for Opening Cash. */
function patchCfOpeningCashSoon(value) {
  if (!selectedCfBudgetId) return;
  debounce(`cf:openingCash:${selectedCfBudgetId}`, async () => {
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ openingCash: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(
          document.getElementById('cfStructureErrorBanner'),
          htmlEsc(body?.error?.message || `Save failed (${res.status}).`),
        );
        return;
      }
      const data = await res.json();
      if (currentCf && data?.cf) currentCf.cf = data.cf;
      refreshCfSectionStatuses();
    } catch (err) {
      showBanner(
        document.getElementById('cfStructureErrorBanner'),
        htmlEsc(`Save failed: ${(err && err.message) || err}`),
      );
    }
  }, 400);
}

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLSelectElement)) return;
  if (!t.hasAttribute('data-cf-budget-select')) return;
  selectedCfBudgetId = t.value || null;
  for (const other of document.querySelectorAll('[data-cf-budget-select]')) {
    if (other !== t) other.value = selectedCfBudgetId || '';
  }
  void loadCurrentCf();
});

// Live edits on the Opening Cash field — debounced autosave; the
// input itself stays a plain text box while typing, gets reformatted
// with thousands separators on blur.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfOpeningCashInput') return;
  const badge = document.querySelector('[data-cf-status="opening-cash"]');
  if (badge) badge.dataset.userTouched = '1';
  const value = parseCfAmount(t.value);
  patchCfOpeningCashSoon(value);
  if (currentCf?.cf) currentCf.cf.openingCash = value;
  refreshCfSectionStatuses();
});

document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfOpeningCashInput') return;
  const value = parseCfAmount(t.value);
  t.value = value ? formatCfAmount(value) : '';
}, true);

// ─────────────────────────────────────────────────────────────
//  CF — Payables (spec §3)
// ─────────────────────────────────────────────────────────────

const CF_PAYMENT_TERMS = ['Cash', 'Current', '30+', '60+', '90+', '120+', '180+'];
let currentPayables = null;          // server response { payables, paymentTerms }
let lastPayablesBudgetId = null;     // remember which budget we loaded for

/** Format a positive magnitude as $X,XXX. Empty if zero AND blank=true. */
function fmtCfMag(n, blank) {
  const v = Math.round(Number(n) || 0);
  if (!v && blank) return '';
  return v.toLocaleString('en-US');
}

/** Format as ($X,XXX) for credit balances (Payables O.B/Expenses/C.B). */
function fmtCfCredit(n, blank) {
  const v = Math.round(Math.abs(Number(n) || 0));
  if (!v && blank) return '';
  return `(${v.toLocaleString('en-US')})`;
}

/** Friendly month label for an M01..M12 / Q1..Q4 / FY period key. */
function cfPeriodLabel(key, year) {
  const MMM = { M01:'Jan', M02:'Feb', M03:'Mar', M04:'Apr', M05:'May', M06:'Jun',
                M07:'Jul', M08:'Aug', M09:'Sep', M10:'Oct', M11:'Nov', M12:'Dec' }[key];
  if (MMM) {
    const yy = String(year).slice(-2);
    return `${MMM}-${yy}`;
  }
  if (key.startsWith('Q')) return key;
  if (key === 'FY') return 'FY';
  return key;
}

/** Company name lookup (Org Structure cache). */
function lookupCompanyName(id) {
  if (!id) return '—';
  const list = (osEntities && osEntities.company) || [];
  const found = list.find(e => e.id === id);
  return found ? found.name : '—';
}

async function loadPayables(force) {
  if (!selectedCfBudgetId) { currentPayables = null; renderPayables(); return; }
  if (!force && lastPayablesBudgetId === selectedCfBudgetId && currentPayables) {
    renderPayables(); return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/payables`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(
        document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not load Payables (${res.status}).`),
      );
      currentPayables = null;
      lastPayablesBudgetId = null;
      renderPayables();
      return;
    }
    currentPayables = await res.json();
    lastPayablesBudgetId = selectedCfBudgetId;
  } catch (err) {
    showBanner(
      document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not load Payables: ${(err && err.message) || err}`),
    );
    currentPayables = null;
  }
  renderPayables();
}

function renderPayables() {
  const body  = document.getElementById('cfPayablesBody');
  const warn  = document.getElementById('cfPayablesGranularityWarn');
  const empty = document.getElementById('cfPayablesEmpty');
  const tHead = document.getElementById('cfPayablesTableHead');
  const tBody = document.getElementById('cfPayablesTableBody');
  const sHead = document.getElementById('cfPayablesSummaryHead');
  const sBody = document.getElementById('cfPayablesSummaryBody');
  const obIn  = document.getElementById('cfPayablesObInput');
  if (!body || !tHead || !tBody) return;

  if (!currentPayables) {
    tHead.innerHTML = ''; tBody.innerHTML = '';
    sHead.innerHTML = ''; sBody.innerHTML = '';
    empty.hidden = true;
    if (warn) warn.hidden = true;
    if (obIn) obIn.value = '';
    refreshPayablesStatus();
    return;
  }

  const grid = currentPayables.payables;
  const { periodKeys, rows, summary, openingBalance, monthlySupported } = grid;
  const yr = currentCf?.budget?.year || new Date().getFullYear();

  // Granularity warning (Phase 3 supports monthly only).
  if (warn) {
    if (!monthlySupported) {
      warn.innerHTML = 'Payables computation is monthly-only in this phase. Switch the budget to <strong>Monthly</strong> granularity to see Expense / Payment values.';
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }
  }

  // Opening balance (preserve focus / avoid stomping mid-edit).
  if (obIn) {
    const formatted = fmtCfMag(openingBalance, true);
    if (document.activeElement !== obIn && obIn.value !== formatted) {
      obIn.value = formatted;
    }
  }

  // ── Allocation grid ───────────────────────────────────────
  // Header: Type | Company | P&L | Budget Category | Payment terms | <periods> | FY
  const headPeriods = periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('');
  tHead.innerHTML = `
    <tr>
      <th class="vis-cf-col-type">Type</th>
      <th>Company</th>
      <th>P&amp;L</th>
      <th>Budget Category</th>
      <th>Payment terms</th>
      ${headPeriods}
      <th class="vis-cf-num">FY</th>
    </tr>`;

  tBody.innerHTML = '';
  if (rows.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    for (const r of rows) {
      const company = htmlEsc(lookupCompanyName(r.companyId));
      const pl      = htmlEsc(r.plSection);
      const cat     = htmlEsc(r.budgetCategory);
      const termOpts = ['<option value="">—</option>']
        .concat(CF_PAYMENT_TERMS.map(t =>
          `<option value="${t}"${t === r.paymentTerm ? ' selected' : ''}>${t}</option>`))
        .join('');

      // ── Expense row ──
      const expCells = periodKeys.map(p => {
        const v = Number(r.expense[p] || 0);
        return `<td class="vis-cf-num">${v ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</td>`;
      }).join('');
      const expFy = Math.round(r.fyExpense || 0);
      tBody.innerHTML += `
        <tr class="vis-cf-row-expense" data-cf-row="${r.rowId}">
          <td class="vis-cf-col-type">Expense</td>
          <td>${company}</td>
          <td>${pl}</td>
          <td>${cat}</td>
          <td rowspan="2" class="vis-cf-col-term">
            <select class="vis-cf-term-select" data-cf-term="${r.rowId}">${termOpts}</select>
          </td>
          ${expCells}
          <td class="vis-cf-num">${expFy ? expFy.toLocaleString('en-US') : '—'}</td>
        </tr>`;

      // ── Payment row ──
      const payCells = periodKeys.map(p => {
        const needs = r.paymentNeedsCarry[p];
        if (needs) {
          const v = Number(r.priorCarry[p] || 0);
          return `<td class="vis-cf-num"><input
            type="text"
            inputmode="decimal"
            class="vis-cf-carry-input"
            data-cf-carry="${r.rowId}|${p}"
            placeholder="Enter"
            value="${v ? v.toLocaleString('en-US') : ''}"
          /></td>`;
        }
        const v = Number(r.payment[p] || 0);
        if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
        // Payment magnitudes are stored negative; display as ($X,XXX).
        const mag = Math.round(Math.abs(v));
        return `<td class="vis-cf-num vis-cf-num-out">(${mag.toLocaleString('en-US')})</td>`;
      }).join('');
      const payFy = Math.round(Math.abs(r.fyPayment || 0));
      tBody.innerHTML += `
        <tr class="vis-cf-row-payment" data-cf-row="${r.rowId}">
          <td class="vis-cf-col-type">Payment</td>
          <td colspan="3" class="vis-cf-row-payment-spacer"></td>
          ${payCells}
          <td class="vis-cf-num vis-cf-num-out">${payFy ? `(${payFy.toLocaleString('en-US')})` : '—'}</td>
        </tr>`;
    }
  }

  // ── Vendors summary (§3.8) ───────────────────────────────
  sHead.innerHTML = `
    <tr>
      <th>Row</th>
      ${periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('')}
      <th class="vis-cf-num">FY</th>
    </tr>`;
  const sumRow = (label, mode, values) => {
    const cells = periodKeys.map(p => {
      const v = Math.round(Number(values[p] || 0));
      if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
      return `<td class="vis-cf-num">${
        mode === 'credit' ? `(${v.toLocaleString('en-US')})` : v.toLocaleString('en-US')
      }</td>`;
    }).join('');
    // FY column rules per §3.8: O.B = Jan O.B, C.B = Dec C.B, others sum.
    let fy;
    if (label === 'O.B')      fy = Number(values[periodKeys[0]] || 0);
    else if (label === 'C.B') fy = Number(values[periodKeys[periodKeys.length - 1]] || 0);
    else                      fy = periodKeys.reduce((s, p) => s + Number(values[p] || 0), 0);
    fy = Math.round(fy);
    const fyCell = !fy
      ? `<td class="vis-cf-num vis-cf-num-muted">—</td>`
      : `<td class="vis-cf-num">${mode === 'credit' ? `(${fy.toLocaleString('en-US')})` : fy.toLocaleString('en-US')}</td>`;
    return `<tr><th>${label}</th>${cells}${fyCell}</tr>`;
  };
  sBody.innerHTML =
    sumRow('O.B',      'credit', summary.ob) +
    sumRow('Expenses', 'credit', summary.expenses) +
    sumRow('Payment',  'debit',  summary.payment) +
    sumRow('C.B',      'credit', summary.cb);

  refreshPayablesStatus();
}

/** Update the Payables section badge: Filled iff O.B set AND every
 *  row has a term AND every needed prior-carry cell has a value. */
function refreshPayablesStatus() {
  const badge = document.querySelector('[data-cf-status="payables"]');
  if (!badge) return;
  if (!currentPayables) {
    badge.textContent = 'Required';
    badge.classList.remove('vis-cf-section-status-filled');
    return;
  }
  const g = currentPayables.payables;
  const obOk = (g.openingBalance || 0) > 0;
  const allTerms = g.rows.every(r => !!r.paymentTerm);
  const allCarryFilled = g.rows.every(r =>
    Object.entries(r.paymentNeedsCarry).every(([p, needs]) =>
      !needs || (r.priorCarry[p] || 0) > 0),
  );
  const filled = obOk && allTerms && allCarryFilled && g.rows.length > 0;
  badge.textContent = filled ? 'Filled' : 'Required';
  badge.classList.toggle('vis-cf-section-status-filled', filled);
}

function patchPayablesSectionSoon(openingBalance) {
  if (!selectedCfBudgetId) return;
  debounce(`cf:payables:section:${selectedCfBudgetId}`, async () => {
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/payables`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ openingBalance }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(document.getElementById('cfStructureErrorBanner'),
          htmlEsc(body?.error?.message || `Save failed (${res.status}).`));
        return;
      }
      // Re-fetch so the summary refreshes against the new O.B.
      await loadPayables(true);
    } catch (err) {
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(`Save failed: ${(err && err.message) || err}`));
    }
  }, 400);
}

async function patchPayablesRow(rowId, fields) {
  if (!selectedCfBudgetId) return;
  try {
    const res = await api(
      `/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/payables/rows/${encodeURIComponent(rowId)}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Save failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    if (data?.payables) {
      currentPayables = { ...currentPayables, payables: data.payables };
      renderPayables();
    }
  } catch (err) {
    showBanner(document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Save failed: ${(err && err.message) || err}`));
  }
}

// O.B autosave + reformat on blur.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfPayablesObInput') return;
  patchPayablesSectionSoon(parseCfAmount(t.value));
});
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfPayablesObInput') return;
  const v = parseCfAmount(t.value);
  t.value = v ? fmtCfMag(v) : '';
}, true);

// Payment-term dropdown change.
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLSelectElement)) return;
  const rowId = t.getAttribute('data-cf-term');
  if (!rowId) return;
  const term = t.value || null;
  void patchPayablesRow(rowId, { paymentTerm: term });
});

// Prior-carry cell — debounced PATCH per row.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  const handle = t.getAttribute('data-cf-carry');
  if (!handle) return;
  const [rowId, periodKey] = handle.split('|');
  if (!rowId || !periodKey) return;
  const value = parseCfAmount(t.value);
  debounce(`cf:payables:carry:${rowId}:${periodKey}`, () => {
    void patchPayablesRow(rowId, { priorCarry: { [periodKey]: value } });
  }, 400);
});
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-carry')) return;
  const v = parseCfAmount(t.value);
  t.value = v ? fmtCfMag(v) : '';
}, true);


// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────

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

  // Org Structure boot.
  try {
    const osRes = await api('/api/visibility/org-structure');
    if (osRes.ok) {
      const data = await osRes.json();
      osStatus = data.status || 'editing';
      const ent = data.entities || {};
      for (const d of ORG_DIMENSIONS) osEntities[d] = ent[d] || [];
    }
  } catch (err) {
    showBanner(osErrorBanner, htmlEsc(`Could not load Organizational Structure: ${(err && err.message) || err}`));
  }
  renderOrg();
})();
