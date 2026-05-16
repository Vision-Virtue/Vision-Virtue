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
  const panelB = document.getElementById('panelBudget');
  if (panelB) panelB.hidden = tabName !== 'budget';
  if (tabName === 'budget') void loadBudgetList();
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
  renderSetupPills();
  renderStatusPill();
  renderBudgetTable();
  renderFooterSummary();
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
function buildGLOptions(selectedId) {
  let html = '<option value="">—</option>';
  for (const g of glRows.filter(r => !r.orphan)) {
    const label = `${g.glNumber} ${g.glName}`;
    html += `<option value="${htmlEsc(g.id)}"${selectedId === g.id ? ' selected' : ''}>${htmlEsc(label)}</option>`;
  }
  return html;
}
function findGL(id) { return glRows.find(r => r.id === id) || null; }

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
      <td class="is-total">${htmlEsc(fmtCellDisplay(totalFY, scale) || '—')}</td>
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
  const scaledGrand = grand / scaleFactor(scale);
  const display = scaledGrand === 0 ? '—' : scaledGrand.toLocaleString('en-US', { maximumFractionDigits: 2 });
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
  if (totalCell) totalCell.textContent = fmtCellDisplay(total, currentBudget.budget.scale) || '—';
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
  try {
    const res = await api(`/api/visibility/budgets/${encodeURIComponent(currentBudget.budget.id)}/lines`, { method: 'POST' });
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      showBanner(bgEditorError, htmlEsc(er?.error?.message || `Add row failed (${res.status}).`));
      return;
    }
    const data = await res.json();
    currentBudget.lines.push(data.line);
    renderBudgetTable();
    renderFooterSummary();
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
