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
let glRows    = []; // [{id, glNumber, glName, plSection, budgetCategory, budgetCategoryCustom, inventoryRelated, orphan}]
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
    <td class="vis-col-inv">
      <input type="checkbox" data-field="inventoryRelated"
             ${r.inventoryRelated ? 'checked' : ''}
             aria-label="Inventory related" />
    </td>
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
  } else if (field === 'inventoryRelated') {
    const checked = target.checked;
    row.inventoryRelated = checked;
    render();
    const updated = await patchRow(id, { inventoryRelated: checked });
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
    inventoryRelated:     !!r.inventoryRelated,
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
    inventoryRelated: !!r.inventoryRelated,
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
  if (tabName === 'cf-forecast') void loadForecast(true);
  if (tabName === 'cf-dashboard') void loadDashboard(true);
  if (tabName === 'cf-structure') maybeShowCfHelp();
}

/** Show the pre-entry CF Structure help (§17) on first visit.
 *  Dismissal is remembered in localStorage. */
function maybeShowCfHelp() {
  const help = document.getElementById('cfStructureHelp');
  if (!help) return;
  try {
    if (localStorage.getItem('vv-cf-help-dismissed') === '1') {
      help.hidden = true;
      return;
    }
  } catch (_e) { /* private mode — show every time */ }
  help.hidden = false;
}
document.getElementById('cfStructureHelpClose')?.addEventListener('click', () => {
  const help = document.getElementById('cfStructureHelp');
  if (help) help.hidden = true;
  try { localStorage.setItem('vv-cf-help-dismissed', '1'); } catch (_e) { /* ignore */ }
});
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
      // Reload rows from server so the table reflects the current state
      await loadSalaries();
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
  if (view === 'dashboard') void renderBudgetDashboard();
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

  // Adjusted EBITDA = |Revenues| - |COGS| - Total OPEX  (= GP - OPEX).
  // Display in accounting format so a loss renders as ($X,XXX).
  const ebCells = {};
  for (const p of periodKeys) ebCells[p] = gpCells[p] - opexCells[p];
  const ebFy = gpFy - opexFy;
  writeComputed('Adjusted EBITDA', ebCells, ebFy, fmtAcct, 'is-section is-ebitda');

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

// Derive dashboard KPIs from the server-computed P&L pivot (groups array).
// Works with any section names — matches by substring so 'Financial Income/(Expenses)'
// and similar non-standard names are still counted.
function computeDashboardAggFromPivot(pivotData) {
  if (!pivotData) return null;
  const groups = pivotData.groups || [];
  if (groups.length === 0) return null;

  // Verify there's ANY non-zero data in the pivot at all
  const hasData = groups.some(g => Math.abs(g.fyTotal || 0) > 0);
  if (!hasData) return null;

  const byName = new Map(groups.map(g => [g.plSection, g]));
  const absTotal = (sec) => Math.abs(byName.get(sec)?.fyTotal || 0);

  // Standard P&L sections
  const totalRev  = absTotal('Revenues');
  const totalCogs = absTotal('COGS');
  const totalRnd  = absTotal('R&D');
  const totalSm   = absTotal('S&M');
  const totalGa   = absTotal('G&A');
  const totalOpex = totalRnd + totalSm + totalGa;

  // Revenue by category from pivot — Revenues section categories
  const revGroup = byName.get('Revenues');
  const revByCategory = (revGroup?.categories || []).map(c => ({
    name: c.name, value: Math.abs(c.fyTotal || 0),
  })).filter(d => d.value > 0);

  // If no standard Revenues group, build a "Total Revenue" category from all revenue-like groups
  // by showing ALL sections in the mix chart
  const finalRevByCategory = revByCategory.length > 0 ? revByCategory :
    groups.filter(g => Math.abs(g.fyTotal || 0) > 0).map(g => ({
      name: g.plSection, value: Math.abs(g.fyTotal || 0),
    }));

  // Revenue by quarter from pivot period cells
  const periodKeys = pivotData.periodKeys || [];
  const revCells = revGroup?.cells || {};
  const sumMonths = (...keys) => keys.reduce((s, k) => s + Math.abs(revCells[k] || 0), 0);
  let revByQuarter;
  if (periodKeys.some(k => k.startsWith('M'))) {
    revByQuarter = {
      Q1: sumMonths('M01','M02','M03'), Q2: sumMonths('M04','M05','M06'),
      Q3: sumMonths('M07','M08','M09'), Q4: sumMonths('M10','M11','M12'),
    };
  } else if (periodKeys.some(k => k.startsWith('Q'))) {
    revByQuarter = {
      Q1: Math.abs(revCells.Q1||0), Q2: Math.abs(revCells.Q2||0),
      Q3: Math.abs(revCells.Q3||0), Q4: Math.abs(revCells.Q4||0),
    };
  } else {
    const q = totalRev / 4;
    revByQuarter = { Q1: q, Q2: q, Q3: q, Q4: q };
  }

  // Salaries & benefits from all sections' categories
  let salariesAndBenefits = 0;
  for (const g of groups) {
    for (const c of g.categories || []) {
      if (c.name === 'Salaries and benefits') salariesAndBenefits += Math.abs(c.fyTotal || 0);
    }
  }

  // If no standard OPEX, treat all non-Revenue non-COGS groups as OPEX
  const effectiveTotalOpex = totalOpex > 0 ? totalOpex :
    groups.filter(g => g.plSection !== 'Revenues' && g.plSection !== 'COGS')
          .reduce((s, g) => s + Math.abs(g.fyTotal || 0), 0);

  // Effective revenue = largest value among all groups (Revenues preferred)
  const effectiveTotalRev = totalRev > 0 ? totalRev :
    Math.max(...groups.map(g => Math.abs(g.fyTotal || 0)), 0);

  return {
    totalRev: effectiveTotalRev,
    totalCogs,
    totalOpex: effectiveTotalOpex,
    salariesAndBenefits,
    gmPct: effectiveTotalRev > 0 ? ((effectiveTotalRev - totalCogs) / effectiveTotalRev) * 100 : 0,
    opexPct: effectiveTotalRev > 0 ? (effectiveTotalOpex / effectiveTotalRev) * 100 : 0,
    salariesOpexPct: effectiveTotalOpex > 0 ? (salariesAndBenefits / effectiveTotalOpex) * 100 : 0,
    revByCategory: finalRevByCategory,
    revByQuarter,
    revByProduct:    [],
    ebitdaByProduct: [],
    opexByActivity:  [],
    ebitdaByDivision:[],
    opexByDepartment:[],
    _fromPivot: true,
  };
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

async function renderBudgetDashboard() {
  const dash = document.getElementById('dashboardSection');
  if (!dash) return;
  // Chart.js loads via CDN with `defer`; retry shortly if the user
  // opens the Dashboard tab before it lands.
  if (typeof Chart === 'undefined') {
    setTimeout(() => void renderBudgetDashboard(), 100);
    return;
  }
  // Register the datalabels plugin if available.
  try {
    if (typeof ChartDataLabels !== 'undefined'
        && Chart.registry?.plugins?.get
        && !Chart.registry.plugins.get('datalabels')) {
      Chart.register(ChartDataLabels);
    }
  } catch (_e) { /* best-effort */ }

  // Show a loading hint while we fetch
  const dashEmpty = document.getElementById('dashEmpty');
  const scaleHint = document.getElementById('dashScaleHint');
  dashEmpty.hidden = false;
  dashEmpty.textContent = 'Loading dashboard…';
  if (scaleHint) scaleHint.hidden = true;

  // ── Always fetch the authoritative server-computed pivot ──────
  // (Do this even if lastPivotData is already set — ensures fresh data
  //  and is the ONLY reliable way to populate the dashboard regardless
  //  of whether glRows has plSection mappings loaded client-side.)
  if (currentBudget) {
    try {
      const pvRes = await api(
        `/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/pivot`,
      );
      if (pvRes.ok) lastPivotData = await pvRes.json();
    } catch (_e) { /* best-effort — fall through to client-side path */ }
  }

  // Primary path: server pivot (authoritative for top-line KPIs)
  let agg = lastPivotData ? computeDashboardAggFromPivot(lastPivotData) : null;

  // Client-side path: always run so we have dimensional data
  // (per-Product / per-Activity / per-Department / per-Division breakdowns
  //  are derived from currentBudget.lines org FKs — the pivot API doesn't expose them).
  const clientAgg = computeDashboardAgg();

  if (agg && clientAgg) {
    // Merge: keep pivot's accurate totals but fill in dimensional arrays from client-side.
    agg = Object.assign({}, agg, {
      revByProduct:    clientAgg.revByProduct,
      ebitdaByProduct: clientAgg.ebitdaByProduct,
      opexByActivity:  clientAgg.opexByActivity,
      ebitdaByDivision: clientAgg.ebitdaByDivision,
      opexByDepartment: clientAgg.opexByDepartment,
      // Prefer client-side category breakdown (handles granularity) unless pivot gave one
      revByCategory: agg.revByCategory.length > 0 ? agg.revByCategory : clientAgg.revByCategory,
      // Client-side quarterly split respects the budget's granularity setting
      revByQuarter: clientAgg.revByQuarter,
      // Client-side salaries computation is more precise (category-level filter)
      salariesAndBenefits: clientAgg.salariesAndBenefits > 0
        ? clientAgg.salariesAndBenefits : agg.salariesAndBenefits,
    });
  } else if (!agg) {
    // No pivot data — fall back entirely to client-side
    agg = clientAgg;
  }

  const empty = dashEmptyCheck(agg);
  dashEmpty.hidden = !empty;
  // Be specific about *why* the dashboard is empty so the user knows
  // whether to add Structure rows or fill in amounts.
  if (empty) {
    const lineCount = (currentBudget?.lines || []).length;
    const pivotGroups = lastPivotData?.groups?.length || 0;
    if (lineCount === 0) {
      dashEmpty.textContent = 'No data to visualize. Add Budget Structure rows first.';
    } else if (pivotGroups > 0) {
      dashEmpty.textContent = 'Budget structure exists but all amounts are zero. Fill in the monthly cell values to see the dashboard.';
    } else {
      dashEmpty.textContent = `Structure has ${lineCount} row${lineCount === 1 ? '' : 's'} but no amounts have been entered yet. Fill in monthly cells to see the dashboard.`;
    }
    // Early return — agg may be null here so we must not access agg._fromPivot below.
    document.getElementById('dashScaleHint').hidden = true;
    destroyDashCharts();
    document.getElementById('dashTotalRev').textContent  = '—';
    document.getElementById('dashGmPct').textContent     = '—';
    document.getElementById('dashTotalOpex').textContent = '—';
    document.getElementById('dashOpexPct').textContent   = '—';
    document.getElementById('dashSalariesPct').textContent = '—';
    document.getElementById('dashSalariesAbs').textContent = '—';
    return;
  }
  // agg is guaranteed non-null past this point.
  document.getElementById('dashScaleHint').hidden = false;
  document.getElementById('dashScaleHint').innerHTML = agg._fromPivot
    ? `All amounts are shown in <strong>thousands</strong> (rounded). Source: P&L Pivot (server-computed). Product/division charts require GL → plSection mapping in Financial Structure.`
    : `All amounts are shown in <strong>thousands</strong> (rounded). Source: this budget's Structure rows.`;
  destroyDashCharts();

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
      // Datalabels — small "$NK" numbers on top of bars / outside line
      // points. Dashboard chart data is already in thousands so the
      // formatter appends "K". Charts can opt-out by setting
      // `plugins.datalabels.display = false`.
      datalabels: {
        color: '#ffffff',
        font: { family: 'Inter', size: 10, weight: '600' },
        anchor: 'end',
        align: 'end',
        offset: 4,
        clamp: true,
        formatter: (v) => (Number.isFinite(v) && v !== 0 ? `${Math.round(v).toLocaleString('en-US')}K` : ''),
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
          datalabels: { display: false },
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
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          datalabels: { ...baseOpts.plugins.datalabels, align: 'top' },
        },
        scales: cartesianScales,
      },
    }));
  }

  // Revenue by Product (horizontal bar). Cap the bar thickness so a
  // single product doesn't balloon to the full canvas height; leaves
  // visible space for additional products.
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
          maxBarThickness: 28,
          categoryPercentage: 0.6,
          barPercentage: 0.7,
        }],
      },
      options: {
        ...baseOpts,
        indexAxis: 'y',
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          datalabels: { ...baseOpts.plugins.datalabels, align: 'right' },
        },
        scales: cartesianScales,
      },
    }));
  }

  // Shared dataset sizing for vertical bar charts. We cap the bar
  // thickness so a single bar doesn't fill the canvas, but leave it
  // free to shrink when many categories are present.
  const verticalBarSizing = {
    maxBarThickness: 36,
    categoryPercentage: 0.65,
    barPercentage: 0.75,
  };
  // Datalabels override for vertical bars: keep anchor at the value
  // endpoint regardless of sign, flip only the align so negative-value
  // labels sit below the bar (not inside it).
  const verticalBarLabels = {
    ...baseOpts.plugins.datalabels,
    anchor: 'end',
    align:  (ctx) => (ctx.raw >= 0 ? 'top' : 'bottom'),
  };

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
          ...verticalBarSizing,
        }],
      },
      options: {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          datalabels: verticalBarLabels,
        },
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
          ...verticalBarSizing,
        }],
      },
      options: {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          datalabels: verticalBarLabels,
        },
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
          ...verticalBarSizing,
        }],
      },
      options: {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          datalabels: verticalBarLabels,
        },
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
          datalabels: { display: false },
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
  await loadReceivables(true);
  await loadInventory(true);
  await loadSalaries(true);
  await loadManualSection('other-adj', true);
  await loadManualSection('financing', true);
  await loadManualSection('capex', true);
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
    // Per §10: finalized CFs remain editable — section saves overwrite
    // the same CF (no version history). Don't lock the input.
    obInput.disabled = false;
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
  refreshCfFinalizeBtn();
}

/** Format an amount with thousands separators, no currency symbol. */
function formatCfAmount(n) {
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US');
}

/** Parse a user-entered amount string back to a Number. Strips
 *  commas, whitespace, parens, and a leading minus. Returns 0 for
 *  empty/invalid input. */
function parseCfAmount(s) {
  const cleaned = String(s || '').replace(/[,  ()\-]/g, '').trim();
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
  void loadForecast(true);
  void loadDashboard(true);
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

/**
 * Sign-aware accounting format. Positive numbers display as plain
 * $X,XXX (debit balance / debit movement); negative numbers display
 * as ($X,XXX) (credit balance / credit movement); zero returns the
 * dash placeholder or empty when `blank=true`.
 */
function fmtCfSigned(n, blank) {
  const num = Number(n) || 0;
  const v = Math.round(Math.abs(num));
  if (!v) return blank ? '' : '—';
  return num < 0 ? `(${v.toLocaleString('en-US')})` : v.toLocaleString('en-US');
}

/**
 * Parse a possibly-signed user-entered amount. Recognizes both an
 * explicit minus (e.g. "-5,000") and the accounting parens form
 * ("(5,000)") as negative. Returns 0 for blank/invalid input.
 */
function parseCfSigned(s) {
  const raw = String(s || '').trim();
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const cleaned = raw.replace(/[,  ()\-]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
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

  // Granularity warning is no longer relevant (§14 — all granularities
  // now compute payment lag). Banner kept hidden for back-compat.
  if (warn) warn.hidden = true;
  void monthlySupported;

  // Orphan-rows banner (§16).
  renderOrphansBanner('payables', grid.orphans || []);

  // Opening balance — signed display. Positive = debit balance
  // (no parens), negative = credit balance (parens). Preserve focus
  // so we don't stomp the user mid-edit.
  if (obIn) {
    const formatted = fmtCfSigned(openingBalance, true);
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
          // Display the user-entered amount with the same sign
          // convention as the auto-computed payments around it
          // (negative → parens, positive → plain).
          const display = fmtCfSigned(v, true);
          return `<td class="vis-cf-num"><input
            type="text"
            inputmode="decimal"
            class="vis-cf-carry-input"
            data-cf-carry="${r.rowId}|${p}"
            placeholder="Enter"
            value="${display}"
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
  // mode = 'signed' → render based on the value's sign (debit if
  //                   positive, credit-in-parens if negative).
  //                   Used for O.B and C.B which can be either.
  // mode = 'credit' → always parens. Expenses row in §3.8 is a
  //                   credit movement on A/P (liability grows).
  // mode = 'debit'  → always plain positive. Payment row in §3.8
  //                   is a debit movement on A/P (liability shrinks).
  const sumRow = (label, mode, values) => {
    const cellHtml = (v) => {
      if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
      let text;
      if (mode === 'signed')      text = fmtCfSigned(v, false);
      else if (mode === 'credit') text = `(${Math.abs(v).toLocaleString('en-US')})`;
      else                        text = Math.abs(v).toLocaleString('en-US');
      return `<td class="vis-cf-num">${text}</td>`;
    };
    const cells = periodKeys.map(p => cellHtml(Math.round(Number(values[p] || 0)))).join('');
    // FY column rules per §3.8: O.B = Jan O.B, C.B = Dec C.B, others sum.
    let fy;
    if (label === 'O.B')      fy = Number(values[periodKeys[0]] || 0);
    else if (label === 'C.B') fy = Number(values[periodKeys[periodKeys.length - 1]] || 0);
    else                      fy = periodKeys.reduce((s, p) => s + Number(values[p] || 0), 0);
    return `<tr><th>${label}</th>${cells}${cellHtml(Math.round(fy))}</tr>`;
  };
  sBody.innerHTML =
    sumRow('O.B',      'signed', summary.ob) +
    sumRow('Expenses', 'credit', summary.expenses) +
    sumRow('Payment',  'debit',  summary.payment) +
    sumRow('C.B',      'signed', summary.cb);

  refreshPayablesStatus();
}

/** Render the orphan-rows banner (§16) for a given WC section.
 *  `section` is 'payables' or 'receivables'. */
function renderOrphansBanner(section, orphans) {
  const banner = document.getElementById(section === 'payables'
    ? 'cfPayablesOrphansBanner'
    : 'cfReceivablesOrphansBanner');
  if (!banner) return;
  if (!orphans || orphans.length === 0) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  const listItems = orphans.map(o => {
    const tag = `${htmlEsc(o.plSection)} · ${htmlEsc(o.budgetCategory)}`;
    return `<li>
      <span class="vis-cf-orphan-label">${tag}</span>
      <button type="button"
              class="vis-cf-manual-delete"
              data-cf-orphan-section="${section}"
              data-cf-orphan-row="${o.rowId}"
              aria-label="Delete orphan row">×</button>
    </li>`;
  }).join('');
  banner.innerHTML = `
    <div class="vis-cf-orphan-head">
      <strong>${orphans.length} ${section} row${orphans.length === 1 ? '' : 's'} reference combinations no longer in the budget.</strong>
      Review or delete below.
    </div>
    <ul class="vis-cf-orphan-list">${listItems}</ul>`;
  banner.hidden = false;
}

// Delete-orphan click handler.
document.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  if (!t.hasAttribute('data-cf-orphan-row')) return;
  ev.preventDefault();
  const section = t.getAttribute('data-cf-orphan-section');
  const rowId   = t.getAttribute('data-cf-orphan-row');
  if (!section || !rowId || !selectedCfBudgetId) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/${section}/rows/${encodeURIComponent(rowId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not delete orphan row (${res.status}).`));
      return;
    }
    const data = await res.json();
    if (section === 'payables' && data?.payables) {
      currentPayables = data;
      renderPayables();
    } else if (section === 'receivables' && data?.receivables) {
      currentReceivables = data;
      renderReceivables();
    }
  } catch (err) {
    showBanner(document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not delete orphan row: ${(err && err.message) || err}`));
  }
});

/** Update the Payables section badge: Filled iff O.B set AND every
 *  row has a term. Prior-carry cells are optional — empty means 0. */
function refreshPayablesStatus() {
  const badge = document.querySelector('[data-cf-status="payables"]');
  if (!badge) return;
  if (!currentPayables) {
    badge.textContent = 'Required';
    badge.title = '';
    badge.classList.remove('vis-cf-section-status-filled');
    return;
  }
  const g = currentPayables.payables;
  const obOk = (g.openingBalance || 0) !== 0;
  const rowsWithoutTerm = g.rows.filter(r => !r.paymentTerm).length;
  const filled = obOk && rowsWithoutTerm === 0 && g.rows.length > 0;

  const reasons = [];
  if (!obOk)                reasons.push('O.B missing');
  if (rowsWithoutTerm > 0)  reasons.push(`${rowsWithoutTerm} row${rowsWithoutTerm === 1 ? '' : 's'} missing terms`);
  if (g.rows.length === 0)  reasons.push('no rows');

  badge.textContent = filled ? 'Filled' : (reasons.length ? `Required — ${reasons[0]}` : 'Required');
  badge.title = filled ? '' : `Still needed: ${reasons.join(', ')}`;
  badge.classList.toggle('vis-cf-section-status-filled', filled);
  refreshWcStatus();
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

// Payables O.B — signed input. Parser recognises both "-N" and "(N)"
// as negative. Focused state shows the value with a minus sign for
// negatives (easier to edit than parens); blurred state shows the
// accounting format.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfPayablesObInput') return;
  patchPayablesSectionSoon(parseCfSigned(t.value));
});
document.addEventListener('focus', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfPayablesObInput') return;
  const v = parseCfSigned(t.value);
  if (!v) { t.value = ''; return; }
  const abs = Math.round(Math.abs(v)).toLocaleString('en-US');
  t.value = v < 0 ? `-${abs}` : abs;
}, true);
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfPayablesObInput') return;
  const v = parseCfSigned(t.value);
  t.value = fmtCfSigned(v, true);
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

// Prior-carry cell — debounced PATCH per row. Accepts signed input;
// recognises both an explicit "-N" and the accounting "(N)" form.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  const handle = t.getAttribute('data-cf-carry');
  if (!handle) return;
  const [rowId, periodKey] = handle.split('|');
  if (!rowId || !periodKey) return;
  const value = parseCfSigned(t.value);
  debounce(`cf:payables:carry:${rowId}:${periodKey}`, () => {
    void patchPayablesRow(rowId, { priorCarry: { [periodKey]: value } });
  }, 400);
});
// Focus → show with minus sign for negatives (matches the negative
// display of the auto-computed payment cells around it, but easier
// to edit than parens). Blur → reformat to the accounting form.
document.addEventListener('focus', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-carry')) return;
  const v = parseCfSigned(t.value);
  if (!v) { t.value = ''; return; }
  const abs = Math.round(Math.abs(v)).toLocaleString('en-US');
  t.value = v < 0 ? `-${abs}` : abs;
}, true);
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-carry')) return;
  const v = parseCfSigned(t.value);
  t.value = fmtCfSigned(v, true);
}, true);

// ─────────────────────────────────────────────────────────────
//  CF — Receivables (spec §4)  — mirror of Payables
// ─────────────────────────────────────────────────────────────

let currentReceivables = null;
let lastReceivablesBudgetId = null;

async function loadReceivables(force) {
  if (!selectedCfBudgetId) { currentReceivables = null; renderReceivables(); return; }
  if (!force && lastReceivablesBudgetId === selectedCfBudgetId && currentReceivables) {
    renderReceivables(); return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/receivables`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(
        document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not load Receivables (${res.status}).`),
      );
      currentReceivables = null;
      lastReceivablesBudgetId = null;
      renderReceivables();
      return;
    }
    currentReceivables = await res.json();
    lastReceivablesBudgetId = selectedCfBudgetId;
  } catch (err) {
    showBanner(
      document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not load Receivables: ${(err && err.message) || err}`),
    );
    currentReceivables = null;
  }
  renderReceivables();
}

function renderReceivables() {
  const warn  = document.getElementById('cfReceivablesGranularityWarn');
  const empty = document.getElementById('cfReceivablesEmpty');
  const tHead = document.getElementById('cfReceivablesTableHead');
  const tBody = document.getElementById('cfReceivablesTableBody');
  const sHead = document.getElementById('cfReceivablesSummaryHead');
  const sBody = document.getElementById('cfReceivablesSummaryBody');
  const obIn  = document.getElementById('cfReceivablesObInput');
  if (!tHead || !tBody) return;

  if (!currentReceivables) {
    tHead.innerHTML = ''; tBody.innerHTML = '';
    sHead.innerHTML = ''; sBody.innerHTML = '';
    if (empty) empty.hidden = true;
    if (warn)  warn.hidden  = true;
    if (obIn)  obIn.value   = '';
    refreshReceivablesStatus();
    return;
  }

  const grid = currentReceivables.receivables;
  const { periodKeys, rows, summary, openingBalance, monthlySupported } = grid;
  const yr = currentCf?.budget?.year || new Date().getFullYear();

  if (warn) warn.hidden = true;
  void monthlySupported;

  // Orphan-rows banner (§16).
  renderOrphansBanner('receivables', grid.orphans || []);

  if (obIn) {
    const formatted = fmtCfSigned(openingBalance, true);
    if (document.activeElement !== obIn && obIn.value !== formatted) {
      obIn.value = formatted;
    }
  }

  // ── Allocation grid ───────────────────────────────────────
  const headPeriods = periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('');
  tHead.innerHTML = `
    <tr>
      <th class="vis-cf-col-type">Type</th>
      <th>Company</th>
      <th>Budget Category</th>
      <th>Payment terms</th>
      ${headPeriods}
      <th class="vis-cf-num">FY</th>
    </tr>`;

  tBody.innerHTML = '';
  if (rows.length === 0) {
    if (empty) empty.hidden = false;
  } else {
    if (empty) empty.hidden = true;
    for (const r of rows) {
      const company = htmlEsc(lookupCompanyName(r.companyId));
      const cat     = htmlEsc(r.budgetCategory || '—');
      const termOpts = ['<option value="">—</option>']
        .concat(CF_PAYMENT_TERMS.map(t =>
          `<option value="${t}"${t === r.paymentTerm ? ' selected' : ''}>${t}</option>`))
        .join('');

      // Revenue row — preserves the budget's negative sign.
      const revCells = periodKeys.map(p => {
        const v = Number(r.revenue[p] || 0);
        if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
        const mag = Math.round(Math.abs(v));
        return v < 0
          ? `<td class="vis-cf-num vis-cf-num-out">(${mag.toLocaleString('en-US')})</td>`
          : `<td class="vis-cf-num">${mag.toLocaleString('en-US')}</td>`;
      }).join('');
      const revFy = Math.round(Math.abs(r.fyRevenue || 0));
      tBody.innerHTML += `
        <tr class="vis-cf-row-expense" data-cf-rec-row="${r.rowId}">
          <td class="vis-cf-col-type">Revenue</td>
          <td>${company}</td>
          <td>${cat}</td>
          <td rowspan="2" class="vis-cf-col-term">
            <select class="vis-cf-term-select" data-cf-rec-term="${r.rowId}">${termOpts}</select>
          </td>
          ${revCells}
          <td class="vis-cf-num vis-cf-num-out">${revFy ? `(${revFy.toLocaleString('en-US')})` : '—'}</td>
        </tr>`;

      // Payment row — cash-in, positive.
      const payCells = periodKeys.map(p => {
        const needs = r.paymentNeedsCarry[p];
        if (needs) {
          const v = Number(r.priorCarry[p] || 0);
          const display = fmtCfSigned(v, true);
          return `<td class="vis-cf-num"><input
            type="text"
            inputmode="decimal"
            class="vis-cf-carry-input vis-cf-carry-input-in"
            data-cf-rec-carry="${r.rowId}|${p}"
            placeholder="Enter"
            value="${display}"
          /></td>`;
        }
        const v = Number(r.payment[p] || 0);
        if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
        return `<td class="vis-cf-num">${Math.round(v).toLocaleString('en-US')}</td>`;
      }).join('');
      const payFy = Math.round(r.fyPayment || 0);
      tBody.innerHTML += `
        <tr class="vis-cf-row-payment" data-cf-rec-row="${r.rowId}">
          <td class="vis-cf-col-type">Payment</td>
          <td colspan="2" class="vis-cf-row-payment-spacer"></td>
          ${payCells}
          <td class="vis-cf-num">${payFy ? payFy.toLocaleString('en-US') : '—'}</td>
        </tr>`;
    }
  }

  // ── Customers summary (§4.6) ──────────────────────────────
  sHead.innerHTML = `
    <tr>
      <th>Row</th>
      ${periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('')}
      <th class="vis-cf-num">FY</th>
    </tr>`;
  // mode = 'signed' → sign-aware (O.B / C.B; can be either).
  // mode = 'debit'  → always positive plain (Revenues row — debit
  //                   movement growing A/R).
  // mode = 'credit' → always parens (Payment row — credit
  //                   movement shrinking A/R).
  const sumRow = (label, mode, values) => {
    const cellHtml = (v) => {
      if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
      let text;
      if (mode === 'signed')      text = fmtCfSigned(v, false);
      else if (mode === 'credit') text = `(${Math.abs(v).toLocaleString('en-US')})`;
      else                        text = Math.abs(v).toLocaleString('en-US');
      return `<td class="vis-cf-num">${text}</td>`;
    };
    const cells = periodKeys.map(p => cellHtml(Math.round(Number(values[p] || 0)))).join('');
    let fy;
    if (label === 'O.B')      fy = Number(values[periodKeys[0]] || 0);
    else if (label === 'C.B') fy = Number(values[periodKeys[periodKeys.length - 1]] || 0);
    else                      fy = periodKeys.reduce((s, p) => s + Number(values[p] || 0), 0);
    return `<tr><th>${label}</th>${cells}${cellHtml(Math.round(fy))}</tr>`;
  };
  sBody.innerHTML =
    sumRow('O.B',      'signed', summary.ob) +
    sumRow('Revenues', 'debit',  summary.revenues) +
    sumRow('Payment',  'credit', summary.payment) +
    sumRow('C.B',      'signed', summary.cb);

  refreshReceivablesStatus();
}

function refreshReceivablesStatus() {
  const badge = document.querySelector('[data-cf-status="receivables"]');
  if (!badge) return;
  if (!currentReceivables) {
    badge.textContent = 'Required';
    badge.title = '';
    badge.classList.remove('vis-cf-section-status-filled');
    return;
  }
  const g = currentReceivables.receivables;
  const obOk = (g.openingBalance || 0) !== 0;
  const rowsWithoutTerm = g.rows.filter(r => !r.paymentTerm).length;
  // Prior-carry cells are optional — empty means 0.
  const filled = obOk && rowsWithoutTerm === 0 && g.rows.length > 0;

  const reasons = [];
  if (!obOk)                reasons.push('O.B missing');
  if (rowsWithoutTerm > 0)  reasons.push(`${rowsWithoutTerm} row${rowsWithoutTerm === 1 ? '' : 's'} missing terms`);
  if (g.rows.length === 0)  reasons.push('no rows');

  badge.textContent = filled ? 'Filled' : (reasons.length ? `Required — ${reasons[0]}` : 'Required');
  badge.title = filled ? '' : `Still needed: ${reasons.join(', ')}`;
  badge.classList.toggle('vis-cf-section-status-filled', filled);
  refreshWcStatus();
}

function patchReceivablesSectionSoon(openingBalance) {
  if (!selectedCfBudgetId) return;
  debounce(`cf:receivables:section:${selectedCfBudgetId}`, async () => {
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/receivables`, {
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
      await loadReceivables(true);
    } catch (err) {
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(`Save failed: ${(err && err.message) || err}`));
    }
  }, 400);
}

async function patchReceivablesRow(rowId, fields) {
  if (!selectedCfBudgetId) return;
  try {
    const res = await api(
      `/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/receivables/rows/${encodeURIComponent(rowId)}`,
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
    if (data?.receivables) {
      currentReceivables = { ...currentReceivables, receivables: data.receivables };
      renderReceivables();
    }
  } catch (err) {
    showBanner(document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Save failed: ${(err && err.message) || err}`));
  }
}

// Receivables O.B — signed input.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfReceivablesObInput') return;
  patchReceivablesSectionSoon(parseCfSigned(t.value));
});
document.addEventListener('focus', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfReceivablesObInput') return;
  const v = parseCfSigned(t.value);
  if (!v) { t.value = ''; return; }
  const abs = Math.round(Math.abs(v)).toLocaleString('en-US');
  t.value = v < 0 ? `-${abs}` : abs;
}, true);
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfReceivablesObInput') return;
  const v = parseCfSigned(t.value);
  t.value = fmtCfSigned(v, true);
}, true);

// Payment-term dropdown change.
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLSelectElement)) return;
  const rowId = t.getAttribute('data-cf-rec-term');
  if (!rowId) return;
  void patchReceivablesRow(rowId, { paymentTerm: t.value || null });
});

// Prior-carry cell — debounced PATCH per row.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  const handle = t.getAttribute('data-cf-rec-carry');
  if (!handle) return;
  const [rowId, periodKey] = handle.split('|');
  if (!rowId || !periodKey) return;
  const value = parseCfSigned(t.value);
  debounce(`cf:receivables:carry:${rowId}:${periodKey}`, () => {
    void patchReceivablesRow(rowId, { priorCarry: { [periodKey]: value } });
  }, 400);
});
document.addEventListener('focus', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-rec-carry')) return;
  const v = parseCfSigned(t.value);
  if (!v) { t.value = ''; return; }
  const abs = Math.round(Math.abs(v)).toLocaleString('en-US');
  t.value = v < 0 ? `-${abs}` : abs;
}, true);
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-rec-carry')) return;
  const v = parseCfSigned(t.value);
  t.value = fmtCfSigned(v, true);
}, true);

// ─────────────────────────────────────────────────────────────
//  CF — Inventory (spec §5)
// ─────────────────────────────────────────────────────────────

let currentInventory = null;
let lastInventoryBudgetId = null;

async function loadInventory(force) {
  if (!selectedCfBudgetId) { currentInventory = null; renderInventory(); return; }
  if (!force && lastInventoryBudgetId === selectedCfBudgetId && currentInventory) {
    renderInventory(); return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/inventory`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(
        document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not load Inventory (${res.status}).`),
      );
      currentInventory = null;
      lastInventoryBudgetId = null;
      renderInventory();
      return;
    }
    currentInventory = await res.json();
    lastInventoryBudgetId = selectedCfBudgetId;
  } catch (err) {
    showBanner(
      document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not load Inventory: ${(err && err.message) || err}`),
    );
    currentInventory = null;
  }
  renderInventory();
}

function renderInventory() {
  const warn  = document.getElementById('cfInventoryNegativeWarn');
  const tHead = document.getElementById('cfInventoryHead');
  const tBody = document.getElementById('cfInventoryBodyTable');
  const obIn  = document.getElementById('cfInventoryObInput');
  if (!tHead || !tBody) return;

  if (!currentInventory) {
    tHead.innerHTML = ''; tBody.innerHTML = '';
    if (warn) warn.hidden = true;
    if (obIn) obIn.value = '';
    refreshInventoryStatus();
    return;
  }

  const grid = currentInventory.inventory;
  const { periodKeys, summary, openingBalance, negativeMonths } = grid;
  const yr = currentCf?.budget?.year || new Date().getFullYear();

  // Negative-C.B warning (§5.3).
  if (warn) {
    if (negativeMonths && negativeMonths.length > 0) {
      const labels = negativeMonths.map(p => cfPeriodLabel(p, yr)).join(', ');
      warn.innerHTML = `Inventory goes negative in <strong>${htmlEsc(labels)}</strong>. Increase Purchases or check the COGS mapping (Finished goods category under COGS).`;
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }
  }

  if (obIn) {
    const formatted = fmtCfSigned(openingBalance, true);
    if (document.activeElement !== obIn && obIn.value !== formatted) {
      obIn.value = formatted;
    }
  }

  // ── Summary table ─────────────────────────────────────────
  tHead.innerHTML = `
    <tr>
      <th>Row</th>
      ${periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('')}
      <th class="vis-cf-num">FY</th>
    </tr>`;

  // mode = 'signed' | 'debit' | 'credit' (see Payables for the convention).
  const fmtCell = (v, mode) => {
    if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
    if (mode === 'signed') return `<td class="vis-cf-num">${fmtCfSigned(v, false)}</td>`;
    if (mode === 'credit') return `<td class="vis-cf-num">(${Math.abs(v).toLocaleString('en-US')})</td>`;
    return `<td class="vis-cf-num">${Math.abs(v).toLocaleString('en-US')}</td>`;
  };
  const obCells   = periodKeys.map(p => fmtCell(Math.round(Number(summary.ob[p]   || 0)), 'signed')).join('');
  const cogsCells = periodKeys.map(p => fmtCell(Math.round(Number(summary.cogs[p] || 0)), 'credit')).join('');
  const cbCells   = periodKeys.map(p => fmtCell(Math.round(Number(summary.cb[p]   || 0)), 'signed')).join('');

  // Purchases row — editable inputs per period.
  const purchasesCells = periodKeys.map(p => {
    const v = Number(summary.purchases[p] || 0);
    const display = v ? Math.round(v).toLocaleString('en-US') : '';
    return `<td class="vis-cf-num"><input
      type="text"
      inputmode="decimal"
      class="vis-cf-carry-input vis-cf-purchases-input"
      data-cf-inv-purchases="${p}"
      placeholder="0"
      value="${display}"
    /></td>`;
  }).join('');

  const obFy   = Math.round(Number(summary.ob[periodKeys[0]]                    || 0));
  const purFy  = periodKeys.reduce((s, p) => s + Number(summary.purchases[p]    || 0), 0);
  const cogsFy = periodKeys.reduce((s, p) => s + Number(summary.cogs[p]         || 0), 0);
  const cbFy   = Math.round(Number(summary.cb[periodKeys[periodKeys.length - 1]] || 0));

  tBody.innerHTML =
    `<tr><th>O.B</th>${obCells}${fmtCell(obFy, 'signed')}</tr>` +
    `<tr><th>Purchases</th>${purchasesCells}${fmtCell(Math.round(purFy), 'debit')}</tr>` +
    `<tr><th>COGS</th>${cogsCells}${fmtCell(Math.round(cogsFy), 'credit')}</tr>` +
    `<tr><th>C.B</th>${cbCells}${fmtCell(cbFy, 'signed')}</tr>`;

  refreshInventoryStatus();
}

function refreshInventoryStatus() {
  const badge = document.querySelector('[data-cf-status="inventory"]');
  if (!badge) return;
  if (!currentInventory) {
    badge.textContent = 'Required';
    badge.classList.remove('vis-cf-section-status-filled');
    return;
  }
  const g = currentInventory.inventory;
  const obOk = (g.openingBalance || 0) !== 0;
  // Per §10: every Purchases cell must be filled (or 0). We treat any
  // user-touched value as "filled". Since 0 is allowed, we just look
  // for the section to have any rows of activity.
  const filled = obOk;  // O.B is the binding required value
  badge.textContent = filled ? 'Filled' : 'Required';
  badge.classList.toggle('vis-cf-section-status-filled', filled);
  refreshWcStatus();
}

/** WC parent badge: Filled iff Payables, Receivables and Inventory
 *  are all Filled. Mirrors the same Required ↔ Filled visual states
 *  used by leaf sections. */
function refreshWcStatus() {
  const wcBadge = document.querySelector('[data-cf-status="wc"]');
  if (!wcBadge) return;
  const childIds = ['payables', 'receivables', 'inventory'];
  const allFilled = childIds.every(id => {
    const b = document.querySelector(`[data-cf-status="${id}"]`);
    return b && b.classList.contains('vis-cf-section-status-filled');
  });
  wcBadge.textContent = allFilled ? 'Filled' : 'Required';
  wcBadge.classList.toggle('vis-cf-section-status-filled', allFilled);
  refreshCfFinalizeBtn();
}

/** Enable the Finalize button iff every required CF section is Filled:
 *  Opening Cash + Payables + Receivables + Inventory + Salaries.
 *  Other Adjustments / Financing / Capex are optional and don't gate. */
function refreshCfFinalizeBtn() {
  const btn = document.getElementById('cfStructureFinalizeBtn');
  const summary = document.getElementById('cfStructureSummary');
  if (!btn) return;
  // While finalized, the button becomes a re-edit / re-finalize action;
  // for now we just keep it disabled when finalized (no edit flow yet).
  const finalizedAlready = currentCf?.cf?.status === 'finalized';
  if (finalizedAlready) {
    btn.disabled = true;
    btn.textContent = 'Finalized';
    if (summary) summary.textContent = 'Cash Flow is finalized.';
    return;
  }
  const requiredIds = ['opening-cash', 'payables', 'receivables', 'inventory', 'salaries'];
  const missing = requiredIds.filter(id => {
    const b = document.querySelector(`[data-cf-status="${id}"]`);
    return !b || !b.classList.contains('vis-cf-section-status-filled');
  });
  btn.disabled = missing.length > 0;
  btn.textContent = 'Finalize';
  if (summary) {
    summary.textContent = missing.length === 0
      ? 'All required sections filled — ready to finalize.'
      : `Finalize unlocks after every required section is filled (${missing.length} remaining).`;
  }
}

function patchInventorySoon(fields) {
  if (!selectedCfBudgetId) return;
  // Distinct debounce key per logical change set so concurrent O.B
  // and per-period edits don't stomp each other.
  const key = fields.openingBalance !== undefined
    ? `cf:inv:ob:${selectedCfBudgetId}`
    : `cf:inv:purchases:${selectedCfBudgetId}:${Object.keys(fields.purchases || {}).join(',')}`;
  debounce(key, async () => {
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/inventory`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(document.getElementById('cfStructureErrorBanner'),
          htmlEsc(body?.error?.message || `Save failed (${res.status}).`));
        return;
      }
      const data = await res.json();
      if (data?.inventory) {
        currentInventory = { ...currentInventory, inventory: data.inventory };
        renderInventory();
      }
    } catch (err) {
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(`Save failed: ${(err && err.message) || err}`));
    }
  }, 400);
}

// Inventory O.B (signed) handlers.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfInventoryObInput') return;
  patchInventorySoon({ openingBalance: parseCfSigned(t.value) });
});
document.addEventListener('focus', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfInventoryObInput') return;
  const v = parseCfSigned(t.value);
  if (!v) { t.value = ''; return; }
  const abs = Math.round(Math.abs(v)).toLocaleString('en-US');
  t.value = v < 0 ? `-${abs}` : abs;
}, true);
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfInventoryObInput') return;
  const v = parseCfSigned(t.value);
  t.value = fmtCfSigned(v, true);
}, true);

// Inventory Purchases (positive magnitude per period) handlers.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  const periodKey = t.getAttribute('data-cf-inv-purchases');
  if (!periodKey) return;
  // parseCfSigned strips parens / minus → magnitude. We force-abs
  // so a stray paren / minus can't push purchases negative.
  const value = Math.abs(parseCfSigned(t.value));
  patchInventorySoon({ purchases: { [periodKey]: value } });
});
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-inv-purchases')) return;
  const v = Math.abs(parseCfSigned(t.value));
  t.value = v ? Math.round(v).toLocaleString('en-US') : '';
}, true);

// ─────────────────────────────────────────────────────────────
//  CF — Salaries & Benefits (spec §6)
// ─────────────────────────────────────────────────────────────

let currentSalaries = null;
let lastSalariesBudgetId = null;

async function loadSalaries(force) {
  if (!selectedCfBudgetId) { currentSalaries = null; renderSalaries(); return; }
  if (!force && lastSalariesBudgetId === selectedCfBudgetId && currentSalaries) {
    renderSalaries(); return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/salaries`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(
        document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not load Salaries (${res.status}).`),
      );
      currentSalaries = null;
      lastSalariesBudgetId = null;
      renderSalaries();
      return;
    }
    currentSalaries = await res.json();
    lastSalariesBudgetId = selectedCfBudgetId;
  } catch (err) {
    showBanner(
      document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not load Salaries: ${(err && err.message) || err}`),
    );
    currentSalaries = null;
  }
  renderSalaries();
}

function renderSalaries() {
  const tHead = document.getElementById('cfSalariesHead');
  const tBody = document.getElementById('cfSalariesBodyTable');
  const obIn  = document.getElementById('cfSalariesObInput');
  if (!tHead || !tBody) return;

  if (!currentSalaries) {
    tHead.innerHTML = ''; tBody.innerHTML = '';
    if (obIn) obIn.value = '';
    refreshSalariesStatus();
    return;
  }

  const grid = currentSalaries.salaries;
  const { periodKeys, summary, openingBalance, januaryPayment } = grid;
  const yr = currentCf?.budget?.year || new Date().getFullYear();

  // O.B input — render as ($X,XXX) magnitude.
  if (obIn) {
    const mag = Math.round(Math.abs(openingBalance || 0));
    const formatted = mag ? `(${mag.toLocaleString('en-US')})` : '';
    if (document.activeElement !== obIn && obIn.value !== formatted) {
      obIn.value = formatted;
    }
  }

  // ── Summary table ────────────────────────────────────────
  tHead.innerHTML = `
    <tr>
      <th>Row</th>
      ${periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('')}
      <th class="vis-cf-num">FY</th>
    </tr>`;

  const fmtCell = (v, mode) => {
    if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
    if (mode === 'credit') return `<td class="vis-cf-num">(${Math.abs(v).toLocaleString('en-US')})</td>`;
    if (mode === 'debit')  return `<td class="vis-cf-num">${Math.abs(v).toLocaleString('en-US')}</td>`;
    return `<td class="vis-cf-num">(${Math.abs(v).toLocaleString('en-US')})</td>`;
  };

  // Payment row — first period (Jan, typically) is the only free
  // input. Subsequent periods are auto = − previous Expenses.
  const paymentCells = periodKeys.map((p, idx) => {
    if (idx === 0) {
      const v = Number(januaryPayment || 0);
      const display = v ? Math.round(v).toLocaleString('en-US') : '';
      return `<td class="vis-cf-num"><input
        type="text"
        inputmode="decimal"
        class="vis-cf-carry-input"
        data-cf-sal-january="1"
        placeholder="Enter"
        value="${display}"
      /></td>`;
    }
    const v = Number(summary.payment[p] || 0);
    if (!v) return `<td class="vis-cf-num vis-cf-num-muted">—</td>`;
    return `<td class="vis-cf-num vis-cf-num-out">${Math.round(Math.abs(v)).toLocaleString('en-US')}</td>`;
  }).join('');

  const obCells   = periodKeys.map(p => fmtCell(Math.round(Number(summary.ob[p]       || 0)), 'credit')).join('');
  const expCells  = periodKeys.map(p => fmtCell(Math.round(Number(summary.expenses[p] || 0)), 'credit')).join('');
  const cbCells   = periodKeys.map(p => fmtCell(Math.round(Number(summary.cb[p]       || 0)), 'credit')).join('');

  const obFy   = Math.round(Number(summary.ob[periodKeys[0]]                          || 0));
  const expFy  = periodKeys.reduce((s, p) => s + Number(summary.expenses[p] || 0), 0);
  const payFy  = periodKeys.reduce((s, p) => s + Number(summary.payment[p]  || 0), 0);
  const cbFy   = Math.round(Number(summary.cb[periodKeys[periodKeys.length - 1]]      || 0));

  tBody.innerHTML =
    `<tr><th>O.B</th>${obCells}${fmtCell(obFy,  'credit')}</tr>` +
    `<tr><th>Expenses</th>${expCells}${fmtCell(Math.round(expFy), 'credit')}</tr>` +
    `<tr><th>Payment</th>${paymentCells}<td class="vis-cf-num vis-cf-num-out">${payFy ? Math.round(Math.abs(payFy)).toLocaleString('en-US') : '—'}</td></tr>` +
    `<tr><th>C.B</th>${cbCells}${fmtCell(cbFy, 'credit')}</tr>`;

  refreshSalariesStatus();
}

function refreshSalariesStatus() {
  const badge = document.querySelector('[data-cf-status="salaries"]');
  if (!badge) return;
  if (!currentSalaries) {
    badge.textContent = 'Required';
    badge.classList.remove('vis-cf-section-status-filled');
    return;
  }
  const g = currentSalaries.salaries;
  // Per §10: O.B + Jan Payment both filled.
  const obOk      = (g.openingBalance || 0) !== 0;
  const janPayOk  = (g.januaryPayment || 0) !== 0;
  const filled    = obOk && janPayOk;
  badge.textContent = filled ? 'Filled' : 'Required';
  badge.classList.toggle('vis-cf-section-status-filled', filled);
  refreshCfFinalizeBtn();
}

function patchSalariesSoon(fields) {
  if (!selectedCfBudgetId) return;
  // Distinct debounce key per logical input so the two fields don't
  // step on each other.
  const key = fields.openingBalance !== undefined
    ? `cf:sal:ob:${selectedCfBudgetId}`
    : `cf:sal:jan:${selectedCfBudgetId}`;
  debounce(key, async () => {
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/salaries`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(document.getElementById('cfStructureErrorBanner'),
          htmlEsc(body?.error?.message || `Save failed (${res.status}).`));
        return;
      }
      const data = await res.json();
      if (data?.salaries) {
        currentSalaries = { ...currentSalaries, salaries: data.salaries };
        renderSalaries();
      }
    } catch (err) {
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(`Save failed: ${(err && err.message) || err}`));
    }
  }, 400);
}

// Salaries O.B (positive magnitude; user may type with or without parens).
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.id !== 'cfSalariesObInput') return;
  patchSalariesSoon({ openingBalance: Math.abs(parseCfSigned(t.value)) });
});

// Salaries January payment (positive magnitude).
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-sal-january')) return;
  patchSalariesSoon({ januaryPayment: Math.abs(parseCfSigned(t.value)) });
});
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-sal-january')) return;
  const v = Math.abs(parseCfSigned(t.value));
  t.value = v ? Math.round(v).toLocaleString('en-US') : '';
}, true);


// ─────────────────────────────────────────────────────────────
//  PHASE 7 — CF Manual sections (spec §7 / §8 / §9)
//  Other Adjustments / Financing / Capex.
//  All three share the same UX, so a single renderer is used,
//  keyed by `kind` ('other-adj' | 'financing' | 'capex').
// ─────────────────────────────────────────────────────────────

const CF_MANUAL_KINDS = ['other-adj', 'financing', 'capex'];

// Per-kind cache: { kind: grid }. grid shape mirrors the server.
const cfManualCache = Object.create(null);
const cfManualLastBudgetId = Object.create(null);

function manualTableEl(kind) {
  return document.querySelector(`[data-cf-manual-kind="${kind}"]`);
}

async function loadManualSection(kind, force = false) {
  if (!CF_MANUAL_KINDS.includes(kind)) return;
  if (!selectedCfBudgetId) { cfManualCache[kind] = null; renderManualSection(kind); return; }
  if (!force && cfManualLastBudgetId[kind] === selectedCfBudgetId && cfManualCache[kind]) {
    renderManualSection(kind); return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/manual/${encodeURIComponent(kind)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(
        document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not load ${kind} (${res.status}).`),
      );
      cfManualCache[kind] = null;
      cfManualLastBudgetId[kind] = null;
      renderManualSection(kind);
      return;
    }
    const data = await res.json();
    cfManualCache[kind] = data.manual;
    cfManualLastBudgetId[kind] = selectedCfBudgetId;
  } catch (err) {
    showBanner(
      document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not load ${kind}: ${(err && err.message) || err}`),
    );
    cfManualCache[kind] = null;
  }
  renderManualSection(kind);
}

function renderManualSection(kind) {
  const table = manualTableEl(kind);
  if (!table) return;
  const tHead = table.querySelector('thead');
  const tBody = table.querySelector('tbody');
  const tFoot = table.querySelector('tfoot');
  const grid  = cfManualCache[kind];

  if (!grid) {
    tHead.innerHTML = ''; tBody.innerHTML = ''; tFoot.innerHTML = '';
    refreshManualStatus(kind);
    return;
  }
  const { periodKeys, rows, totals, totalFy } = grid;
  const yr = currentCf?.budget?.year || new Date().getFullYear();

  // ── Header ─────────────────────────────────────────────────
  tHead.innerHTML = `
    <tr>
      <th>Description</th>
      ${periodKeys.map(p => `<th class="vis-cf-num">${cfPeriodLabel(p, yr)}</th>`).join('')}
      <th class="vis-cf-num">FY</th>
      <th aria-label="Actions"></th>
    </tr>`;

  // ── Body ───────────────────────────────────────────────────
  if (!rows || rows.length === 0) {
    const cols = 2 + periodKeys.length + 1;
    tBody.innerHTML = `<tr><td class="vis-cf-manual-empty" colspan="${cols}">No rows yet. Click "+ Add row" to add one.</td></tr>`;
  } else {
    tBody.innerHTML = rows.map(r => {
      const cells = periodKeys.map(p => {
        const v = Number(r.amounts[p]) || 0;
        const display = v ? formatCfSigned(v) : '';
        return `<td class="vis-cf-num"><input
          type="text"
          inputmode="decimal"
          class="vis-cf-carry-input"
          data-cf-manual-amount="1"
          data-cf-manual-period="${p}"
          data-cf-manual-row="${r.id}"
          placeholder="0"
          value="${display}"
        /></td>`;
      }).join('');
      const fyDisplay = r.fy ? formatCfSigned(r.fy) : '—';
      const fyClass   = r.fy && r.fy < 0 ? 'vis-cf-num vis-cf-num-out' : 'vis-cf-num';
      return `<tr data-cf-manual-row-id="${r.id}">
        <td><input
          type="text"
          class="vis-cf-manual-desc"
          data-cf-manual-desc="1"
          data-cf-manual-row="${r.id}"
          placeholder="Description"
          value="${htmlEsc(r.description || '')}"
        /></td>
        ${cells}
        <td class="${fyClass}">${fyDisplay}</td>
        <td><button type="button" class="vis-cf-manual-delete" data-cf-manual-del="1" data-cf-manual-row="${r.id}" aria-label="Delete row">×</button></td>
      </tr>`;
    }).join('');
  }

  // ── Footer total ───────────────────────────────────────────
  if (!rows || rows.length === 0) {
    tFoot.innerHTML = '';
  } else {
    const totalCells = periodKeys.map(p => {
      const v = Number(totals[p]) || 0;
      const cls = v < 0 ? 'vis-cf-num vis-cf-num-out' : 'vis-cf-num';
      return `<td class="${cls}">${v ? formatCfSigned(v) : '—'}</td>`;
    }).join('');
    const fyCls = totalFy < 0 ? 'vis-cf-num vis-cf-num-out' : 'vis-cf-num';
    tFoot.innerHTML = `
      <tr>
        <th>Total</th>
        ${totalCells}
        <td class="${fyCls}">${totalFy ? formatCfSigned(totalFy) : '—'}</td>
        <td></td>
      </tr>`;
  }

  refreshManualStatus(kind);
}

/** Format a signed CF amount: positive → "1,234", negative → "(1,234)". */
function formatCfSigned(n) {
  if (!Number.isFinite(n) || n === 0) return '';
  const mag = Math.round(Math.abs(n)).toLocaleString('en-US');
  return n < 0 ? `(${mag})` : mag;
}

function refreshManualStatus(kind) {
  const badge = document.querySelector(`[data-cf-status="${kind}"]`);
  if (!badge) return;
  const grid = cfManualCache[kind];
  // Optional unless the user added at least one row. Empty period
  // cells are treated as zero — no obligation to fill them.
  const hasRows = !!(grid && grid.rows && grid.rows.length > 0);
  if (!hasRows) {
    badge.textContent = 'Optional';
    badge.classList.remove('vis-cf-section-status-filled');
    badge.classList.add('vis-cf-section-status-optional');
    return;
  }
  badge.textContent = 'Filled';
  badge.classList.add('vis-cf-section-status-filled');
  badge.classList.remove('vis-cf-section-status-optional');
}

// ─── Mutations ─────────────────────────────────────────────────

async function addManualRow(kind) {
  if (!selectedCfBudgetId) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/manual/${encodeURIComponent(kind)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not add row (${res.status}).`));
      return;
    }
    const data = await res.json();
    cfManualCache[kind] = data.manual;
    renderManualSection(kind);
  } catch (err) {
    showBanner(document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not add row: ${(err && err.message) || err}`));
  }
}

async function deleteManualRow(kind, rowId) {
  if (!selectedCfBudgetId || !rowId) return;
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/manual/${encodeURIComponent(kind)}/rows/${encodeURIComponent(rowId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Could not delete row (${res.status}).`));
      return;
    }
    const data = await res.json();
    cfManualCache[kind] = data.manual;
    renderManualSection(kind);
  } catch (err) {
    showBanner(document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Could not delete row: ${(err && err.message) || err}`));
  }
}

function patchManualRowSoon(kind, rowId, fields) {
  if (!selectedCfBudgetId || !rowId) return;
  // Distinct debounce key per (kind, row, field) so concurrent edits
  // to different cells coalesce independently.
  const fieldKey = fields.description !== undefined
    ? 'desc'
    : `amt:${Object.keys(fields.amounts || {})[0] || ''}`;
  const key = `cf:manual:${kind}:${rowId}:${fieldKey}`;
  debounce(key, async () => {
    try {
      const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/manual/${encodeURIComponent(kind)}/rows/${encodeURIComponent(rowId)}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showBanner(document.getElementById('cfStructureErrorBanner'),
          htmlEsc(body?.error?.message || `Save failed (${res.status}).`));
        return;
      }
      const data = await res.json();
      cfManualCache[kind] = data.manual;
      // Re-render only the totals + FY (don't blow away inputs the user
      // is still typing into). Cheapest correct option: full re-render
      // only if the user isn't currently focused on an input in this
      // table.
      const tbl  = manualTableEl(kind);
      const live = tbl && tbl.contains(document.activeElement);
      if (!live) renderManualSection(kind);
      else {
        // Recompute totals row in place.
        const tFoot = tbl.querySelector('tfoot');
        const grid  = data.manual;
        if (tFoot && grid && grid.rows.length > 0) {
          const totalCells = grid.periodKeys.map(p => {
            const v = Number(grid.totals[p]) || 0;
            const cls = v < 0 ? 'vis-cf-num vis-cf-num-out' : 'vis-cf-num';
            return `<td class="${cls}">${v ? formatCfSigned(v) : '—'}</td>`;
          }).join('');
          const fyCls = grid.totalFy < 0 ? 'vis-cf-num vis-cf-num-out' : 'vis-cf-num';
          tFoot.innerHTML = `<tr><th>Total</th>${totalCells}<td class="${fyCls}">${grid.totalFy ? formatCfSigned(grid.totalFy) : '—'}</td><td></td></tr>`;
        }
        // And the focused row's FY cell.
        const row = grid && grid.rows.find(r => r.id === document.activeElement?.dataset?.cfManualRow);
        if (row) {
          const tr = tbl.querySelector(`tr[data-cf-manual-row-id="${row.id}"]`);
          if (tr) {
            const cells = tr.querySelectorAll('td');
            // FY is second-to-last cell (action button is last).
            const fyCell = cells[cells.length - 2];
            if (fyCell) {
              fyCell.className = row.fy < 0 ? 'vis-cf-num vis-cf-num-out' : 'vis-cf-num';
              fyCell.textContent = row.fy ? formatCfSigned(row.fy) : '—';
            }
          }
        }
        refreshManualStatus(kind);
      }
    } catch (err) {
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(`Save failed: ${(err && err.message) || err}`));
    }
  }, 400);
}

// ─── Event listeners (delegated) ──────────────────────────────

// Add row buttons.
document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  const addKind = t.getAttribute('data-cf-manual-add');
  if (addKind) { ev.preventDefault(); void addManualRow(addKind); return; }
  if (t.hasAttribute('data-cf-manual-del')) {
    ev.preventDefault();
    const rowId = t.getAttribute('data-cf-manual-row');
    const tbl   = t.closest('[data-cf-manual-kind]');
    const kind  = tbl && tbl.getAttribute('data-cf-manual-kind');
    if (kind && rowId) void deleteManualRow(kind, rowId);
  }
});

// Finalize button.
document.getElementById('cfStructureFinalizeBtn')?.addEventListener('click', async () => {
  if (!selectedCfBudgetId) return;
  const btn = document.getElementById('cfStructureFinalizeBtn');
  if (!btn || btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Finalizing…';
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'finalized' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showBanner(document.getElementById('cfStructureErrorBanner'),
        htmlEsc(body?.error?.message || `Finalize failed (${res.status}).`));
      btn.disabled = false;
      btn.textContent = original;
      return;
    }
    const data = await res.json();
    if (data?.cf) currentCf = { ...currentCf, cf: data.cf };
    renderCfStructure();
  } catch (err) {
    showBanner(document.getElementById('cfStructureErrorBanner'),
      htmlEsc(`Finalize failed: ${(err && err.message) || err}`));
    btn.disabled = false;
    btn.textContent = original;
  }
});

// Description input.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-manual-desc')) return;
  const tbl  = t.closest('[data-cf-manual-kind]');
  const kind = tbl && tbl.getAttribute('data-cf-manual-kind');
  const rowId = t.getAttribute('data-cf-manual-row');
  if (!kind || !rowId) return;
  patchManualRowSoon(kind, rowId, { description: t.value });
});

// Amount input.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-manual-amount')) return;
  const tbl  = t.closest('[data-cf-manual-kind]');
  const kind = tbl && tbl.getAttribute('data-cf-manual-kind');
  const rowId = t.getAttribute('data-cf-manual-row');
  const period = t.getAttribute('data-cf-manual-period');
  if (!kind || !rowId || !period) return;
  const v = parseCfSigned(t.value);
  patchManualRowSoon(kind, rowId, { amounts: { [period]: v } });
});

// Amount blur — pretty-print (parens for negatives).
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (!t.hasAttribute('data-cf-manual-amount')) return;
  const v = parseCfSigned(t.value);
  t.value = v ? formatCfSigned(v) : '';
}, true);


// ─────────────────────────────────────────────────────────────
//  PHASE 8 — CF Forecast view (spec §11 + §12)
// ─────────────────────────────────────────────────────────────

let currentForecast = null;
let lastForecastBudgetId = null;
let cfForecastView = { period: 'monthly', scale: 'standard', burnDetail: 'expanded' };

async function loadForecast(force = false) {
  const body  = document.getElementById('cfForecastBody');
  const empty = document.getElementById('cfForecastEmpty');
  if (!body || !empty) return;
  if (!selectedCfBudgetId) {
    currentForecast = null;
    body.hidden = true;
    empty.hidden = false;
    empty.textContent = cfBudgetCache.length === 0
      ? 'No finalized budgets yet — finalize one in tab 3.'
      : 'Select a finalized budget to view the Cash Flow forecast.';
    return;
  }
  if (!force && lastForecastBudgetId === selectedCfBudgetId && currentForecast) {
    renderForecast();
    return;
  }
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(selectedCfBudgetId)}/cf/forecast`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showBanner(
        document.getElementById('cfForecastErrorBanner'),
        htmlEsc(data?.error?.message || `Could not load forecast (${res.status}).`),
      );
      currentForecast = null;
      body.hidden = true;
      empty.hidden = false;
      empty.textContent = 'Forecast unavailable.';
      return;
    }
    const data = await res.json();
    currentForecast = data.forecast;
    lastForecastBudgetId = selectedCfBudgetId;
    showBanner(document.getElementById('cfForecastErrorBanner'), '');
  } catch (err) {
    currentForecast = null;
    showBanner(
      document.getElementById('cfForecastErrorBanner'),
      htmlEsc(`Could not load forecast: ${(err && err.message) || err}`),
    );
    body.hidden = true;
    empty.hidden = false;
    return;
  }
  renderForecast();
}

/** Aggregate native periods (typically monthly) into the chosen
 *  display period. Returns { displayKeys, ob, cb, movements } where
 *  movements has the same per-key shape as `rows` minus ob/cb. */
function aggregateForecast(grid, period) {
  const native = grid.periodKeys;          // budget native keys
  const isMonthly = native.length === 12 && native.every(k => /^M\d{2}$/.test(k));
  const isQuarterly = native.length === 4 && native.every(k => /^Q\d$/.test(k));

  // Determine display group → list of native keys.
  let groups;
  if (period === 'monthly') {
    groups = native.map(k => ({ key: k, members: [k] }));
  } else if (period === 'quarterly') {
    if (isMonthly) {
      groups = [
        { key: 'Q1', members: ['M01','M02','M03'] },
        { key: 'Q2', members: ['M04','M05','M06'] },
        { key: 'Q3', members: ['M07','M08','M09'] },
        { key: 'Q4', members: ['M10','M11','M12'] },
      ];
    } else if (isQuarterly) {
      groups = native.map(k => ({ key: k, members: [k] }));
    } else {
      groups = [{ key: 'FY', members: native }];
    }
  } else {  // fy
    groups = [{ key: 'FY', members: native }];
  }

  const movementRows = ['ebitda', 'wc', 'salaries', 'otherAdj', 'financing', 'capex'];
  const sumGroup = (rec, members) => members.reduce((s, m) => s + (Number(rec[m]) || 0), 0);

  const displayKeys = groups.map(g => g.key);
  const ob = {}, cb = {}, movements = {};
  for (const name of movementRows) movements[name] = {};

  for (const g of groups) {
    // OB of the group = OB of the first month in the group.
    ob[g.key] = Number(grid.rows.ob[g.members[0]]) || 0;
    // CB of the group = CB of the last month in the group.
    cb[g.key] = Number(grid.rows.cb[g.members[g.members.length - 1]]) || 0;
    for (const name of movementRows) {
      movements[name][g.key] = sumGroup(grid.rows[name], g.members);
    }
  }

  // WC breakdown — same aggregation.
  const wcKeys = ['payables', 'receivables', 'inventory', 'total'];
  const wc = {};
  for (const k of wcKeys) wc[k] = {};
  for (const g of groups) {
    for (const k of wcKeys) {
      wc[k][g.key] = sumGroup(grid.wcBreakdown[k], g.members);
    }
  }

  return { displayKeys, ob, cb, movements, wc };
}

function formatForecastCell(v, scale) {
  if (!Number.isFinite(v) || v === 0) return '—';
  const divisor = scale === 'thousands' ? 1000 : 1;
  const scaled = v / divisor;
  const mag = Math.round(Math.abs(scaled)).toLocaleString('en-US');
  return scaled < 0 ? `(${mag})` : mag;
}

function cellCls(v) {
  if (!Number.isFinite(v) || v === 0) return 'vis-cf-num vis-cf-num-muted';
  return v < 0 ? 'vis-cf-num vis-cf-num-neg' : 'vis-cf-num';
}

function periodLabelForDisplay(key, year) {
  if (/^M\d{2}$/.test(key)) return cfPeriodLabel(key, year);
  if (/^Q\d$/.test(key))    return `${key}-${String(year).slice(-2)}`;
  if (key === 'FY')         return `FY ${year}`;
  return key;
}

function renderForecast() {
  const body  = document.getElementById('cfForecastBody');
  const empty = document.getElementById('cfForecastEmpty');
  const mainTable = document.getElementById('cfForecastTable');
  const wcTable   = document.getElementById('cfForecastWcTable');
  const pill      = document.getElementById('cfForecastStatusPill');
  if (!body || !empty || !mainTable || !wcTable) return;

  if (!currentForecast) {
    body.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  body.hidden  = false;

  if (pill) {
    const finalized = currentCf?.cf?.status === 'finalized';
    pill.dataset.status = finalized ? 'finalized' : 'draft';
    pill.textContent    = finalized ? 'Finalized' : 'Draft';
  }

  const yr     = currentCf?.budget?.year || new Date().getFullYear();
  const period = cfForecastView.period;
  const scale  = cfForecastView.scale;
  const expanded = cfForecastView.burnDetail === 'expanded';

  // Aggregate.
  const agg = aggregateForecast(currentForecast, period);
  const keys = agg.displayKeys;

  // FY column comes from the FY aggregation regardless of display.
  const fyAgg = aggregateForecast(currentForecast, 'fy');
  const fyKey = fyAgg.displayKeys[0];

  // ── Header ─────────────────────────────────────────────────
  const headPeriods = keys.map(k => `<th class="vis-cf-num">${htmlEsc(periodLabelForDisplay(k, yr))}</th>`).join('');
  const showFy = period !== 'fy';
  const head = `<tr>
    <th>Row</th>
    ${headPeriods}
    ${showFy ? '<th class="vis-cf-num">FY</th>' : ''}
  </tr>`;

  // ── Main body ──────────────────────────────────────────────
  const renderRow = (label, valueMap, fyValue, cls) => {
    const cells = keys.map(k => {
      const v = Number(valueMap[k]) || 0;
      return `<td class="${cellCls(v)}">${formatForecastCell(v, scale)}</td>`;
    }).join('');
    const fyCell = showFy
      ? `<td class="${cellCls(fyValue)}">${formatForecastCell(fyValue, scale)}</td>`
      : '';
    return `<tr class="${cls || ''}"><th>${htmlEsc(label)}</th>${cells}${fyCell}</tr>`;
  };

  const fyMov = (name) => fyAgg.movements[name][fyKey];

  const burnSum = (k) => agg.movements.ebitda[k] + agg.movements.wc[k]
                       + agg.movements.salaries[k] + agg.movements.otherAdj[k];
  const burnMap = {};
  for (const k of keys) burnMap[k] = burnSum(k);
  const fyBurn = fyMov('ebitda') + fyMov('wc') + fyMov('salaries') + fyMov('otherAdj');

  let bodyHtml = '';
  bodyHtml += renderRow('O.B', agg.ob, agg.ob[keys[0]], 'is-cf-anchor');
  if (expanded) {
    bodyHtml += renderRow('Adjusted EBITDA',   agg.movements.ebitda,   fyMov('ebitda'),   'is-cf-derived');
    bodyHtml += renderRow('WC',                agg.movements.wc,       fyMov('wc'),       'is-cf-derived');
    bodyHtml += renderRow('Salaries & Benefits', agg.movements.salaries, fyMov('salaries'), 'is-cf-derived');
    bodyHtml += renderRow('Other Adjustments', agg.movements.otherAdj, fyMov('otherAdj'), 'is-cf-derived');
  } else {
    bodyHtml += renderRow('Burn', burnMap, fyBurn, 'is-cf-derived');
  }
  bodyHtml += renderRow('Financing', agg.movements.financing, fyMov('financing'), 'is-cf-derived');
  bodyHtml += renderRow('Capex',     agg.movements.capex,     fyMov('capex'),     'is-cf-derived');
  bodyHtml += renderRow('C.B', agg.cb, agg.cb[keys[keys.length - 1]], 'is-cf-total');

  mainTable.querySelector('thead').innerHTML = head;
  mainTable.querySelector('tbody').innerHTML = bodyHtml;

  // ── WC breakdown ───────────────────────────────────────────
  let wcHtml = '';
  wcHtml += renderRow('Payables',    agg.wc.payables,    fyAgg.wc.payables[fyKey],    'is-cf-derived');
  wcHtml += renderRow('Receivables', agg.wc.receivables, fyAgg.wc.receivables[fyKey], 'is-cf-derived');
  wcHtml += renderRow('Inventory',   agg.wc.inventory,   fyAgg.wc.inventory[fyKey],   'is-cf-derived');
  wcHtml += renderRow('Total',       agg.wc.total,       fyAgg.wc.total[fyKey],       'is-cf-total');

  wcTable.querySelector('thead').innerHTML = head;
  wcTable.querySelector('tbody').innerHTML = wcHtml;
}

// ── Forecast view controls ────────────────────────────────────
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLSelectElement)) return;
  if (t.id === 'cfForecastPeriod')      cfForecastView.period      = t.value;
  else if (t.id === 'cfForecastScale')  cfForecastView.scale       = t.value;
  else if (t.id === 'cfForecastBurnDetail') cfForecastView.burnDetail = t.value;
  else return;
  renderForecast();
});


// ─────────────────────────────────────────────────────────────
//  PHASE 9 — CF Dashboard (spec §13)
//  Six KPI tiles + one warning beacon, all computed from the
//  Forecast grid (§11). Tiles re-render whenever the user
//  switches to the Dashboard tab or picks a new budget.
// ─────────────────────────────────────────────────────────────

async function loadDashboard(force = false) {
  const body  = document.getElementById('cfDashboardBody');
  const empty = document.getElementById('cfDashboardEmpty');
  if (!body || !empty) return;
  if (!selectedCfBudgetId) {
    body.hidden = true;
    empty.hidden = false;
    empty.textContent = cfBudgetCache.length === 0
      ? 'No finalized budgets yet — finalize one in tab 3.'
      : 'Select a finalized budget to view its Cash Flow dashboard.';
    return;
  }
  // Dashboard reads from the same forecast endpoint — reuse the cache
  // unless force or the budget changed.
  await loadForecast(force);
  renderDashboard();
}

function renderDashboard() {
  const body  = document.getElementById('cfDashboardBody');
  const empty = document.getElementById('cfDashboardEmpty');
  const pill  = document.getElementById('cfDashboardStatusPill');
  if (!body || !empty || !currentForecast) {
    if (body)  body.hidden  = true;
    if (empty) empty.hidden = false;
    return;
  }
  empty.hidden = true;
  body.hidden  = false;

  if (pill) {
    const finalized = currentCf?.cf?.status === 'finalized';
    pill.dataset.status = finalized ? 'finalized' : 'draft';
    pill.textContent    = finalized ? 'Finalized' : 'Draft';
  }

  // ── Compute KPI values from the forecast grid ──────────────
  const periodKeys = currentForecast.periodKeys;
  const rows       = currentForecast.rows;
  const wcBd       = currentForecast.wcBreakdown;

  const sumAll = (rec) => periodKeys.reduce((s, p) => s + (Number(rec[p]) || 0), 0);

  // End-of-year cash = C.B of the last period.
  const endCash = Number(rows.cb[periodKeys[periodKeys.length - 1]]) || 0;

  // FY WC movement = sum of WC row.
  const fyWc = sumAll(rows.wc);

  // FY Burn = EBITDA + WC + Salaries + Other Adj summed.
  const fyBurn = sumAll(rows.ebitda) + sumAll(rows.wc) + sumAll(rows.salaries) + sumAll(rows.otherAdj);

  // Avg burns.
  const monthsInPeriod = periodKeys.length || 12;
  const avgMonthlyBurn   = fyBurn / monthsInPeriod;
  const avgQuarterlyBurn = fyBurn / Math.max(1, monthsInPeriod / 3);

  // Lowest WC quarter — aggregate WC into 4 quarters from monthly data
  // when possible; otherwise fall back to the per-period rows.
  const isMonthly = periodKeys.length === 12 && periodKeys.every(k => /^M\d{2}$/.test(k));
  const quarters  = isMonthly
    ? [
        { key: 'Q1', members: ['M01','M02','M03'] },
        { key: 'Q2', members: ['M04','M05','M06'] },
        { key: 'Q3', members: ['M07','M08','M09'] },
        { key: 'Q4', members: ['M10','M11','M12'] },
      ]
    : periodKeys.map(p => ({ key: p, members: [p] }));

  let worstQuarter = null;
  for (const q of quarters) {
    const sumPay      = q.members.reduce((s, m) => s + (Number(wcBd.payables[m])    || 0), 0);
    const sumReceiv   = q.members.reduce((s, m) => s + (Number(wcBd.receivables[m]) || 0), 0);
    const sumInv      = q.members.reduce((s, m) => s + (Number(wcBd.inventory[m])   || 0), 0);
    // Compute the full quarter WC sum directly from the three
    // components — guarantees the tile value matches their sum,
    // even if the upstream wcBd.total ever drifts.
    const sumWc = sumPay + sumReceiv + sumInv;
    const components = [
      { name: 'Payables',    value: sumPay },
      { name: 'Receivables', value: sumReceiv },
      { name: 'Inventory',   value: sumInv },
    ];
    // "Largest drag" = the most-negative component (or, if none are
    // negative, the smallest contributor — but we only flag a worst
    // quarter when the WC sum itself is negative below).
    const worstComponent = components.reduce(
      (acc, c) => (c.value < acc.value ? c : acc),
      components[0],
    );
    if (!worstQuarter || sumWc < worstQuarter.wc) {
      worstQuarter = { key: q.key, wc: sumWc, comp: worstComponent, components };
    }
  }

  // ── Render tiles ───────────────────────────────────────────
  const yr = currentCf?.budget?.year || new Date().getFullYear();
  setTile('end-cash',           formatTileMoney(endCash),        endCash);
  setTile('fy-wc',              formatTileMoney(fyWc),           fyWc);
  setTile('fy-burn',            formatTileMoney(fyBurn),         fyBurn);
  setTile('avg-monthly-burn',   formatTileMoney(avgMonthlyBurn), avgMonthlyBurn);
  setTile('avg-quarterly-burn', formatTileMoney(avgQuarterlyBurn), avgQuarterlyBurn);

  // Lowest WC quarter tile + beacon.
  const beacon = document.querySelector('[data-cf-tile-beacon="lowest-wc"]');
  const subEl  = document.querySelector('[data-cf-tile-sub="lowest-wc"]');
  if (worstQuarter && worstQuarter.wc < 0) {
    const qLabel = /^Q\d$/.test(worstQuarter.key) ? `${worstQuarter.key}-${String(yr).slice(-2)}` : worstQuarter.key;
    // Main value = full WC sum for the quarter (Payables + Receivables
    // + Inventory).
    setTile('lowest-wc', `${qLabel}  ·  ${formatTileMoney(worstQuarter.wc)}`, worstQuarter.wc);
    if (subEl) {
      // Per-component breakdown so the user can see that the main
      // number is the sum of the three components, and which one
      // drove the drag.
      const parts = worstQuarter.components.map(c => {
        const piece = `${c.name} ${formatTileMoney(c.value)}`;
        return (c.name === worstQuarter.comp.name) ? `<strong>${piece}</strong>` : piece;
      }).join(' · ');
      subEl.innerHTML = `Full quarter WC. Largest drag: <strong>${htmlEsc(worstQuarter.comp.name)}</strong>.<br>${parts}`;
      subEl.title = `Review ${worstQuarter.comp.name} in ${qLabel} — largest WC drag of the year.`;
    }
    if (beacon) beacon.hidden = false;
  } else {
    setTile('lowest-wc', '—', 0);
    if (subEl) {
      subEl.innerHTML = 'No negative WC quarters this year.';
      subEl.title = '';
    }
    if (beacon) beacon.hidden = true;
  }
}

function setTile(name, text, signed) {
  const el = document.querySelector(`[data-cf-tile-value="${name}"]`);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-neg', Number.isFinite(signed) && signed < 0);
}

/** Format a tile value in thousands with the $ prefix, parens for
 *  negatives. Returns '—' for zero/missing values. */
function formatTileMoney(v) {
  if (!Number.isFinite(v) || v === 0) return '$0';
  const inK = Math.round(v / 1000);
  if (inK === 0) {
    // Sub-thousand value — show with one-decimal precision so it
    // doesn't disappear visually.
    const fine = (v / 1000).toFixed(1);
    return v < 0 ? `($${fine.replace('-', '')}K)` : `$${fine}K`;
  }
  const mag = Math.abs(inK).toLocaleString('en-US');
  return inK < 0 ? `($${mag}K)` : `$${mag}K`;
}


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

// ============================================================
//  MARCUS VALE — CFO ADVISOR
//  Slide-in chat panel connected to all 6 Visibility steps.
// ============================================================
(function setupCfoAdvisor() {

  // ── DOM refs ──────────────────────────────────────────────
  const engageBtn  = document.getElementById('cfoEngageBtn');
  const panel      = document.getElementById('cfoPanel');
  const closeBtn   = document.getElementById('cfoPanelClose');
  const backdrop   = document.getElementById('cfoBackdrop');
  const messagesEl = document.getElementById('cfoMessages');
  const inputEl    = document.getElementById('cfoInput');
  const sendBtn    = document.getElementById('cfoSendBtn');

  if (!engageBtn || !panel || !messagesEl || !inputEl || !sendBtn) return;

  // ── Conversation history (for multi-turn context) ─────────
  let cfoHistory = [];
  let greeted    = false;
  let busy       = false;

  // ── Open / close ──────────────────────────────────────────
  function openPanel() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (!greeted) { greet(); greeted = true; }
    setTimeout(() => inputEl.focus(), 350);
  }

  function closePanel() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  engageBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
  });

  // ── Greeting (static, no API call) ───────────────────────
  function greet() {
    const steps = [];
    if (fsStatus === 'completed')  steps.push('Financial Structure');
    if (osStatus === 'completed')  steps.push('Organizational Structure');
    if (currentBudget)             steps.push('Budget');
    if (lastPivotData)             steps.push('P&L');
    if (currentCf)                 steps.push('CF Structure');
    if (currentForecast)           steps.push('CF Forecast');

    let greeting;
    if (steps.length === 0) {
      greeting = "Your workspace is empty. Start with Step 1 — Financial Structure. Upload your GL list and map every account to a P&L section. That's the foundation everything else sits on.";
    } else {
      greeting = `Your data is on my desk. I can see: ${steps.join(', ')}. Ask me about your structure, margins, cost drivers, anomalies, or cash position. Make it count.`;
    }
    appendCfoMessage(greeting, 'cfo', true);
  }

  // ── Context snapshot (sent with every message) ───────────
  function gatherContext() {
    const ctx = {};

    // Step 1: Financial Structure
    ctx.financialStructure = {
      status: fsStatus,
      totalAccounts: glRows.length,
      mapped: glRows.filter(r => r.plSection && r.budgetCategory).length,
      unmapped: glRows.filter(r => !r.plSection || !r.budgetCategory).length,
      bySection: {}
    };
    glRows.forEach(r => {
      if (!r.plSection) return;
      if (!ctx.financialStructure.bySection[r.plSection]) ctx.financialStructure.bySection[r.plSection] = [];
      ctx.financialStructure.bySection[r.plSection].push({
        glNumber: r.glNumber,
        glName: r.glName,
        category: r.budgetCategory === (dropdowns.yourBudgetCategoryToken || 'Your Budget Category')
          ? r.budgetCategoryCustom : r.budgetCategory,
        inventoryRelated: r.inventoryRelated
      });
    });

    // Step 2: Org Structure
    ctx.orgStructure = {
      status: osStatus,
      companies:   (osEntities.company   || []).map(e => e.name || e),
      divisions:   (osEntities.division  || []).map(e => e.name || e),
      departments: (osEntities.department|| []).map(e => e.name || e),
      products:    (osEntities.product   || []).map(e => e.name || e),
      activities:  (osEntities.activity  || []).map(e => e.name || e),
    };

    // Step 3: Budget — cells is a {M01:..,M02:..} object, NOT an array
    if (currentBudget) {
      const b = currentBudget.budget;
      ctx.budget = {
        name: b.name, currency: b.currency, granularity: b.granularity,
        scale: b.scale, year: b.year, status: b.status,
        totalLines: (currentBudget.lines || []).length,
        linesBySection: {}
      };
      (currentBudget.lines || []).forEach(line => {
        const gl = findGL(line.glAccountId);
        const sec = gl?.plSection || 'Unmapped';
        const category = gl
          ? (gl.budgetCategory === (dropdowns.yourBudgetCategoryToken || 'Your Budget Category')
             ? gl.budgetCategoryCustom : gl.budgetCategory)
          : null;
        if (!ctx.budget.linesBySection[sec]) ctx.budget.linesBySection[sec] = { lines: [], total: 0 };
        // line.cells is { M01: val, M02: val, … } — use Object.values to sum
        const total = Object.values(line.cells || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        ctx.budget.linesBySection[sec].lines.push({
          category,
          provider: line.serviceProviderName,
          description: line.serviceDescription,
          total
        });
        ctx.budget.linesBySection[sec].total += total;
      });
    }

    // Step 4: P&L Pivot — use server-computed groups (lastPivotData.groups, NOT .sections/.totals)
    if (lastPivotData) {
      const groups = lastPivotData.groups || [];
      ctx.plSummary = {
        available: true,
        periodKeys: lastPivotData.periodKeys || [],
        sections: groups.map(g => ({
          section: g.plSection,
          fyTotal: g.fyTotal,
          categories: (g.categories || []).map(c => ({ name: c.name, fyTotal: c.fyTotal }))
        }))
      };
    }

    // Step 5: CF Structure
    if (currentCf) {
      ctx.cfStructure = {
        budgetName: currentCf.budget ? currentCf.budget.name : null,
        openingBalance: currentCf.cf ? currentCf.cf.openingBalance : null,
      };
    }

    // Step 6: CF Forecast
    if (currentForecast) {
      // Send first 3 periods as a sample
      const periods = Object.keys(currentForecast).slice(0, 3);
      ctx.cfForecast = { available: true, samplePeriods: periods.length };
    }

    return ctx;
  }

  // ── Message rendering ─────────────────────────────────────
  function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'cfo-msg cfo-msg-user';
    div.innerHTML = `<div class="cfo-msg-bubble">${htmlEsc(text)}</div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function parseCfoXml(raw) {
    // Extract the four sections from the CFO XML response
    function extract(tag) {
      const m = raw.match(new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`));
      return m ? m[1].trim() : '';
    }
    return {
      analysis:     extract('analysis'),
      actionItems:  extract('action_items'),
      flags:        extract('flags'),
      nextQuestion: extract('next_question'),
    };
  }

  function appendCfoMessage(raw, _role = 'cfo', isGreeting = false) {
    const div = document.createElement('div');
    div.className = 'cfo-msg cfo-msg-cfo';

    if (isGreeting || !raw.includes('<cfo_response>')) {
      // Plain text (greeting or fallback)
      div.innerHTML = `<div class="cfo-msg-bubble">${htmlEsc(raw)}</div>`;
    } else {
      const p = parseCfoXml(raw);
      const sections = [];

      if (p.analysis) {
        sections.push(`<div class="cfo-response-section">
          <div class="cfo-response-label">Analysis</div>
          <div class="cfo-response-body">${htmlEsc(p.analysis)}</div>
        </div>`);
      }
      if (p.actionItems) {
        sections.push(`<div class="cfo-response-section">
          <div class="cfo-response-label">Action Items</div>
          <div class="cfo-response-body">${htmlEsc(p.actionItems)}</div>
        </div>`);
      }
      if (p.flags && p.flags.toLowerCase() !== 'none identified.') {
        sections.push(`<div class="cfo-response-section cfo-response-flags">
          <div class="cfo-response-label">⚑ Flags</div>
          <div class="cfo-response-body">${htmlEsc(p.flags)}</div>
        </div>`);
      }
      if (p.nextQuestion) {
        sections.push(`<div class="cfo-response-section cfo-response-next">
          <div class="cfo-response-label">Next Step</div>
          <div class="cfo-response-body">${htmlEsc(p.nextQuestion)}</div>
        </div>`);
      }

      div.innerHTML = `<div class="cfo-msg-bubble">
        <div class="cfo-response">${sections.join('') || htmlEsc(raw)}</div>
      </div>`;
    }

    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function appendTyping() {
    const div = document.createElement('div');
    div.className = 'cfo-msg cfo-msg-cfo';
    div.id = 'cfoTyping';
    div.innerHTML = `<div class="cfo-typing">
      <div class="cfo-typing-dot"></div>
      <div class="cfo-typing-dot"></div>
      <div class="cfo-typing-dot"></div>
    </div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function removeTyping() {
    const t = document.getElementById('cfoTyping');
    if (t) t.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Send message ──────────────────────────────────────────
  async function sendMessage() {
    if (busy) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = '';
    appendUserMessage(text);

    busy = true;
    sendBtn.disabled = true;
    appendTyping();

    let thinkingTimer = null;
    let abortTimer    = null;
    const controller  = new AbortController();

    try {
      // Build context + history inside try so any error is caught & shown
      const context       = gatherContext();
      const recentHistory = cfoHistory.slice(-10);

      // "Still thinking…" hint after 15 s — Opus can take a moment
      thinkingTimer = setTimeout(() => {
        const t = document.getElementById('cfoTyping');
        if (t) {
          const inner = t.querySelector('.cfo-typing');
          if (inner && !inner.nextElementSibling) {
            inner.insertAdjacentHTML('afterend',
              '<div class="cfo-still-thinking">Still thinking — Opus can take a moment…</div>');
          }
        }
      }, 15000);

      // Hard abort after 60 s so the UI never hangs forever
      abortTimer = setTimeout(() => controller.abort(), 60000);

      const res = await api('/api/visibility/cfo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: recentHistory, context }),
        signal: controller.signal,
      });

      clearTimeout(abortTimer);
      clearTimeout(thinkingTimer);
      const data = await res.json();
      removeTyping();

      if (!res.ok) {
        appendCfoMessage(`Error: ${data?.error?.message || 'Could not reach CFO. Try again.'}`, 'cfo', true);
      } else {
        const reply = data?.data?.reply || '';
        appendCfoMessage(reply);
        // Store in history for multi-turn
        cfoHistory.push({ role: 'user', content: text });
        cfoHistory.push({ role: 'assistant', content: reply });
      }
    } catch (err) {
      if (abortTimer)    clearTimeout(abortTimer);
      if (thinkingTimer) clearTimeout(thinkingTimer);
      removeTyping();
      const msg = err && err.name === 'AbortError'
        ? 'Request timed out after 60 s. Please try again.'
        : `Error: ${err && err.message ? err.message : 'Could not process request.'}`;
      appendCfoMessage(msg, 'cfo', true);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // ── Event listeners ───────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = '';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

})();
