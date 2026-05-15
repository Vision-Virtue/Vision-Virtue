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
