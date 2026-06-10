/* ============================================================
   VISION & VIRTUE — Partner Customer Area
   Phase 2: submissions live on the backend
   (vv-marketing-api.onrender.com), keyed by customer key.
   ============================================================ */

const PARTNER_API = 'https://vv-marketing-api.onrender.com';

// Admin shortcut: ?adminKey=VV-XXX[&adminName=...] lets Authorized Personnel
// open a customer's portal directly from the Finance AI submissions list
// without re-entering the key on the homepage modal. We populate the
// sessionStorage handshake here so the auth check below passes; if the key
// is bogus, the first API call will 401 and the user is bounced home.
(function handleAdminKey() {
  const params = new URLSearchParams(window.location.search);
  const adminKey = params.get('adminKey');
  if (!adminKey) return;
  sessionStorage.setItem('vv_customer_auth', '1');
  sessionStorage.setItem('vv_customer_key', adminKey);
  sessionStorage.setItem('vv_customer_name', params.get('adminName') || 'Customer');
  // Strip the auth bits from the URL so the key doesn't sit in the address
  // bar (and a reload doesn't replay them after the user signs out).
  history.replaceState({}, '', window.location.pathname + window.location.hash);
})();

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

async function apiUpdateMySubmission(submissionId, customerName, formData) {
  const key = customerKey();
  if (!key) throw new Error('Missing customer key');
  const res = await fetch(`${PARTNER_API}/api/customer/me/submissions/${encodeURIComponent(submissionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Customer-Key': key },
    body: JSON.stringify({ customerName, formData }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Update failed (${res.status}): ${body.slice(0, 200)}`);
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

// â”€â”€ Render submission state on the Financial Model + Business Deck tiles
async function renderTileState() {
  const xlsxStatusEl = document.getElementById('statusFinancialModel');
  const xlsxTile     = document.getElementById('tileFinancialModel');
  const pptxStatusEl = document.getElementById('statusBusinessDeck');
  const pptxTile     = document.getElementById('tileBusinessDeck');
  if (!xlsxStatusEl || !xlsxTile) return;

  // Loading placeholders while we fetch
  xlsxStatusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Loading...</span>';
  if (pptxStatusEl) pptxStatusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Loading...</span>';

  let subs;
  try { subs = await apiFetchMySubmissions(); }
  catch (err) {
    xlsxStatusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Connection error — retry</span>';
    if (pptxStatusEl) pptxStatusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Connection error — retry</span>';
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
  renderCustomerBadge(knownName);

  renderXlsxTile(xlsxTile, xlsxStatusEl, sub);
  if (pptxTile && pptxStatusEl) renderPptxTile(pptxTile, pptxStatusEl, sub);
  renderConsultTile(sub);
  renderMarketplaceTile(sub);
  renderEditBanner(sub);
}

// ─── Investors Marketplace — publish / withdraw API + tile renderer ─────────
let _myListings = []; // most recent fetch of /api/customer/me/marketplace-listings

async function apiListMyListings() {
  const key = customerKey();
  if (!key) return [];
  try {
    const res = await fetch(`${PARTNER_API}/api/customer/me/marketplace-listings`, {
      headers: { 'X-Customer-Key': key },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.listings) ? data.listings : [];
  } catch { return []; }
}

/** Publish a submission — all tile fields are auto-extracted server-side. */
async function apiPublishListing(submissionId) {
  const key = customerKey();
  if (!key) throw new Error('Missing customer key');
  const res = await fetch(`${PARTNER_API}/api/customer/me/marketplace-listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Customer-Key': key },
    body: JSON.stringify({ submissionId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Publish failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.listing;
}

async function apiWithdrawListing(listingId) {
  const key = customerKey();
  if (!key) throw new Error('Missing customer key');
  const res = await fetch(
    `${PARTNER_API}/api/customer/me/marketplace-listings/${encodeURIComponent(listingId)}/withdraw`,
    { method: 'POST', headers: { 'X-Customer-Key': key } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Withdraw failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.listing;
}

async function apiUploadDeckPdf(listingId, file) {
  const key = customerKey();
  if (!key) throw new Error('Missing customer key');
  if (!file || file.size === 0) throw new Error('No file selected');
  if (file.size > 30 * 1024 * 1024) throw new Error('PDF exceeds 30 MB');
  const buf = await file.arrayBuffer();
  const res = await fetch(
    `${PARTNER_API}/api/customer/me/marketplace-listings/${encodeURIComponent(listingId)}/deck-pdf`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Customer-Key': key },
      body: buf,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Deck PDF upload failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.listing;
}

/** Find the marketplace listing matching the current submission, if any. */
function listingForSubmission(subId) {
  if (!subId) return null;
  return _myListings.find(l => l.submissionId === subId) || null;
}

async function renderMarketplaceTile(sub) {
  const statusEl = document.getElementById('statusInvestorsMarketplace');
  const tile     = document.getElementById('tileInvestorsMarketplace');
  if (!statusEl || !tile) return;

  const finalized = !!(sub && sub.status === 'finalized');
  if (!finalized) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Available after finalization</span>';
    tile.classList.add('is-review');
    tile.classList.remove('is-finalized');
    tile.disabled = false;
    return;
  }

  _myListings = await apiListMyListings();
  const listing = listingForSubmission(sub.id);

  if (listing && listing.status === 'active') {
    const deckLabel = listing.deckPdfPath ? 'Update Deck PDF' : 'Attach Deck PDF';
    statusEl.innerHTML =
      '<span class="partner-status-pill partner-status-finalized">Published</span>' +
      '<button type="button" class="partner-tile-download" data-mkt-action="unpublish">Unpublish</button>' +
      '<button type="button" class="partner-tile-download partner-tile-secondary" data-mkt-action="deck-pdf">' + deckLabel + '</button>';
    tile.classList.add('is-finalized');
    tile.classList.remove('is-review');
  } else {
    statusEl.innerHTML =
      '<span class="partner-status-pill partner-status-new">Ready to Publish</span>' +
      '<button type="button" class="partner-tile-download" data-mkt-action="publish">Publish to Marketplace</button>';
    tile.classList.remove('is-finalized', 'is-review');
  }
  tile.disabled = false;
}

document.getElementById('tileInvestorsMarketplace')?.addEventListener('click', (ev) => {
  // Action buttons inside the tile handle their own logic.
  const actionBtn = ev.target.closest && ev.target.closest('[data-mkt-action]');
  if (actionBtn) {
    ev.preventDefault(); ev.stopPropagation();
    handleMarketplaceAction(actionBtn);
    return;
  }
  const sub = _latestSubmission;
  if (!sub) {
    alert('Submit your Customer’s Questionnaire first — the marketplace tile is built from your model.');
    return;
  }
  if (sub.status !== 'finalized') {
    alert('Investors Marketplace opens once Vision & Virtue finalizes your model and presentation. We’ll notify you when ready.');
    return;
  }
  // Default tile click on a finalized submission: behave like Publish if not yet
  // published; if already published, no-op (the buttons are visible inline).
  const listing = listingForSubmission(sub.id);
  if (!listing || listing.status !== 'active') {
    publishMarketplace(sub.id);
  }
});

async function handleMarketplaceAction(btn) {
  const action = btn.getAttribute('data-mkt-action');
  const sub = _latestSubmission;
  if (!sub) return;
  if (action === 'publish')    return publishMarketplace(sub.id);
  if (action === 'unpublish')  return unpublishMarketplace(sub.id);
  if (action === 'deck-pdf')   return triggerDeckPdfUpload();
}

async function publishMarketplace(subId) {
  const tile = document.getElementById('tileInvestorsMarketplace');
  if (!tile) return;
  const original = tile.querySelector('#statusInvestorsMarketplace').innerHTML;
  tile.querySelector('#statusInvestorsMarketplace').innerHTML =
    '<span class="partner-status-pill partner-status-new">Extracting tile data…</span>';
  try {
    await apiPublishListing(subId);
    await renderTileState();
  } catch (err) {
    tile.querySelector('#statusInvestorsMarketplace').innerHTML = original;
    alert('Publish failed.\n\n' + (err && err.message ? err.message : ''));
  }
}

async function unpublishMarketplace(subId) {
  if (!confirm('Pull this submission from the Investors Marketplace? Investors will no longer see it. You can re-publish later.')) return;
  const listing = listingForSubmission(subId);
  if (!listing) return;
  try {
    await apiWithdrawListing(listing.id);
    await renderTileState();
  } catch (err) {
    alert('Unpublish failed.\n\n' + (err && err.message ? err.message : ''));
  }
}

function triggerDeckPdfUpload() {
  const fileEl = document.getElementById('mktDeckPdfInput');
  if (!fileEl) return;
  fileEl.value = '';
  fileEl.click();
}
document.getElementById('mktDeckPdfInput')?.addEventListener('change', async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const sub = _latestSubmission;
  if (!sub) return;
  const listing = listingForSubmission(sub.id);
  if (!listing) {
    alert('Publish to the marketplace first, then attach your deck PDF.');
    return;
  }
  try {
    await apiUploadDeckPdf(listing.id, file);
    await renderTileState();
    alert('Deck PDF attached. Investors who have signed the NDA can view it now.');
  } catch (err) {
    alert('Deck PDF upload failed.\n\n' + (err && err.message ? err.message : ''));
  }
});

// Customer name chip in the upper-left of the Products section — gives
// signed-in customers a persistent reminder of which account they're on.
function renderCustomerBadge(name) {
  const el = document.getElementById('partnerCustomerBadge');
  if (!el) return;
  if (!name) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML =
    '<span class="partner-customer-badge-label">Customer</span>' +
    '<span class="partner-customer-badge-name">' + escHtml(name) + '</span>';
}

// One Edit Submission button shown above all three tiles — edits cascade to
// the Financial Model, the Business Model Presentation, and the Ethan
// consultation context, so they share a single entry point.
function renderEditBanner(sub) {
  const banner = document.getElementById('editBanner');
  const btn    = document.getElementById('editBannerBtn');
  if (!banner || !btn) return;
  if (!sub) { banner.hidden = true; return; }
  banner.hidden = false;
  btn.onclick = async () => {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Loading...';
    try {
      await openEditFlow(sub.id);
    } catch (err) {
      alert('Could not open editor.\n\n' + (err && err.message ? err.message : ''));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  };
}

function renderConsultTile(sub) {
  const statusEl = document.getElementById('statusEthanConsult');
  const tile     = document.getElementById('tileEthanConsult');
  if (!statusEl || !tile) return;

  const finalized = !!(sub && sub.status === 'finalized');
  if (finalized) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-finalized">Live</span>';
    tile.classList.add('is-finalized');
    tile.classList.remove('is-review');
    tile.disabled = false;
  } else {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-review">Available after finalization</span>';
    tile.classList.add('is-review');
    tile.classList.remove('is-finalized');
    // Allow clicks even when not finalized — the click handler explains why
    // consultation is gated and links the customer back to the relevant tile.
    tile.disabled = false;
  }
}

function renderXlsxTile(tile, statusEl, sub) {
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
      btn.disabled = true; btn.textContent = 'Downloading...';
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

function renderPptxTile(tile, statusEl, sub) {
  if (!sub) {
    statusEl.innerHTML = '<span class="partner-status-pill partner-status-new">Awaiting submission</span>';
    tile.classList.remove('is-review', 'is-finalized');
    return;
  }
  if (sub.status === 'finalized' && sub.hasFinalizedPptx) {
    statusEl.innerHTML = `
      <span class="partner-status-pill partner-status-finalized">Finalized</span>
      <button type="button" class="partner-tile-download" data-download-pptx="${sub.id}">Download Presentation</button>
    `;
    tile.classList.add('is-finalized');
    tile.classList.remove('is-review');
    statusEl.querySelector('[data-download-pptx]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const btn = ev.currentTarget;
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Downloading...';
      try {
        await downloadFinalizedPptx(sub.id, sub.customerName);
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

async function downloadFinalizedPptx(submissionId, customerName) {
  const key = customerKey();
  const res = await fetch(`${PARTNER_API}/api/customer/me/submissions/${encodeURIComponent(submissionId)}/pptx`, {
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
  a.download = `${customerName || 'Customer'} - Investor Deck.pptx`;
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
  // If a submission already exists, keep them on the products view —
  // the tile pill already shows status.
  if (_latestSubmission) return;
  showQuestionnaire();
});

// The business-deck tile shares the same Customer's Questionnaire as the
// Financial Model. Both deliverables are generated from one submission.
document.getElementById('tileBusinessDeck')?.addEventListener('click', () => {
  if (_latestSubmission) return;
  showQuestionnaire();
});

// ─── Ethan Caldwell consultation modal ──────────────────────────────────────
const consultOverlay = document.getElementById('consultOverlay');
const consultBody    = document.getElementById('consultBody');
const consultForm    = document.getElementById('consultForm');
const consultInput   = document.getElementById('consultInput');
const consultSend    = document.getElementById('consultSend');
let _consultHistory = [];

document.getElementById('tileEthanConsult')?.addEventListener('click', () => {
  const sub = _latestSubmission;
  if (!sub) {
    alert('Submit your Customer’s Questionnaire first — Ethan needs your model to reason about your business.');
    return;
  }
  if (sub.status !== 'finalized') {
    alert('Ethan is available once Vision & Virtue finalizes your model and presentation. We’ll notify you as soon as it’s ready.');
    return;
  }
  openConsult();
});

document.getElementById('consultClose')?.addEventListener('click', closeConsult);
consultOverlay?.addEventListener('click', (ev) => {
  if (ev.target === consultOverlay) closeConsult();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && consultOverlay && !consultOverlay.hidden) closeConsult();
});

function openConsult() {
  if (!consultOverlay) return;
  consultOverlay.hidden = false;
  document.body.classList.add('is-consult-open');
  if (!_consultHistory.length) {
    appendConsultMsg('bot',
      `I’m Ethan Caldwell, your VC / PE consultant. I’m wired live to your finalized model and presentation. ` +
      `Ask me about sector dynamics, growth pacing, unit economics, margins, ARR build, use of proceeds, or anything ` +
      `else an investor is going to push on. What’s on your mind?`);
  }
  setTimeout(() => consultInput?.focus(), 50);
}

function closeConsult() {
  if (!consultOverlay) return;
  consultOverlay.hidden = true;
  document.body.classList.remove('is-consult-open');
}

function appendConsultMsg(role, text) {
  if (!consultBody) return;
  const div = document.createElement('div');
  div.className = 'consult-msg consult-msg-' + role;
  div.textContent = text;
  consultBody.appendChild(div);
  consultBody.scrollTop = consultBody.scrollHeight;
  return div;
}

consultForm?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = (consultInput?.value || '').trim();
  if (!text) return;
  appendConsultMsg('user', text);
  _consultHistory.push({ role: 'user', content: text });
  consultInput.value = '';
  consultSend.disabled = true;
  const pending = appendConsultMsg('system', 'Ethan is thinking…');
  try {
    const reply = await sendConsultMessage(text, _consultHistory.slice(0, -1));
    pending?.remove();
    appendConsultMsg('bot', reply);
    _consultHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    pending?.remove();
    appendConsultMsg('error', (err && err.message) ? err.message : 'Consultation failed. Please try again.');
  } finally {
    consultSend.disabled = false;
    consultInput.focus();
  }
});

async function sendConsultMessage(message, history) {
  const key = customerKey();
  if (!key) throw new Error('Session expired — please sign in again.');
  const res = await fetch(`${PARTNER_API}/api/customer/me/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Customer-Key': key },
    body: JSON.stringify({ message, history, agent: 'vc_expert' }),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error?.message || ''; } catch {}
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.replace('index.html');
      throw new Error('Session expired.');
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const j = await res.json();
  return j?.data?.reply || '(empty response)';
}

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
const CUSTOMER_TYPES = ['Direct', 'CP', 'B2C', 'B2B', 'Distributor'];
const TERRITORIES    = ['EU', 'US', 'ROW', 'APAC', 'LATAM', 'MEA'];
// Revenue types — mirrors the Definitions sheet in Financial Model v9.
const REVENUE_TYPES  = [
  'Software / SaaS',
  'Hardware',
  'Usage-Based Revenue',
  'Maintenance & Support',
  'Professional Services / NRE',
  'POC / Pilot Revenue',
  'Installation & Training',
  'Licensing / Royalties',
  'Revenue Share / Success Fees',
  'Consumables / Parts / Accessories',
  'Other',
];

// Marker value the Type / Territory selects emit when the user wants to
// type their own value. The matching "<input data-*-custom>" is revealed
// and its value is used when collecting form data.
const CUSTOM_OPT = '__other__';

function makeCustomerRow() {
  const tr = document.createElement('tr');
  tr.dataset.custId = nextId('cust');
  tr.innerHTML = `
    <td><input type="text" class="partner-q-input partner-q-cell" data-cust-name placeholder="Customer name" /></td>
    <td>
      <select class="partner-q-select partner-q-cell" data-cust-type>
        <option value="">— Select —</option>
        ${CUSTOMER_TYPES.map(o => `<option value="${o}">${o}</option>`).join('')}
        <option value="${CUSTOM_OPT}">Other (specify)</option>
      </select>
      <input type="text" class="partner-q-input partner-q-cell partner-q-custom" data-cust-type-custom placeholder="Type…" hidden />
    </td>
    <td>
      <select class="partner-q-select partner-q-cell" data-cust-territory>
        <option value="">— Select —</option>
        ${TERRITORIES.map(o => `<option value="${o}">${o}</option>`).join('')}
        <option value="${CUSTOM_OPT}">Other (specify)</option>
      </select>
      <input type="text" class="partner-q-input partner-q-cell partner-q-custom" data-cust-territory-custom placeholder="Territory…" hidden />
    </td>
    <td><button type="button" class="partner-q-rmrow" aria-label="Remove row">&#x2715;</button></td>
  `;
  // When the user picks "Other (specify)" we swap the select OUT of the cell
  // and put the free-text input in its place (same row, same cell — not a
  // new line below). Clearing the input on blur reverts to the dropdown.
  const wireCustomToggle = (selectAttr, inputAttr) => {
    const sel = tr.querySelector(`[${selectAttr}]`);
    const inp = tr.querySelector(`[${inputAttr}]`);
    if (!sel || !inp) return;
    const showInput = () => {
      sel.hidden = true;
      inp.hidden = false;
      setTimeout(() => inp.focus(), 0);
    };
    const showSelect = () => {
      inp.hidden = true;
      inp.value = '';
      sel.hidden = false;
      sel.value = '';
    };
    sel.addEventListener('change', () => {
      if (sel.value === CUSTOM_OPT) showInput();
    });
    inp.addEventListener('blur', () => {
      if (!inp.value.trim()) showSelect();
    });
  };
  wireCustomToggle('data-cust-type',      'data-cust-type-custom');
  wireCustomToggle('data-cust-territory', 'data-cust-territory-custom');

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
        <option value="">— Select —</option>
        ${REVENUE_TYPES.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </td>
    <td><input type="text" class="partner-q-input partner-q-cell partner-q-money" data-prod-price inputmode="decimal" autocomplete="off" placeholder="$ 0" /></td>
    <td><input type="text" class="partner-q-input partner-q-cell partner-q-money" data-prod-cost inputmode="decimal" autocomplete="off" placeholder="$ 0" /></td>
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
    <td><span class="partner-q-readonly" data-ls-cost>—</span></td>
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
  bindMoneyInputs(tr);
  return tr;
}

function addLetsScaleRow() {
  const body = document.querySelector('tbody[data-letsscale-body]');
  body.appendChild(makeLetsScaleRow());
  syncDerivedSections(); // populates the dropdowns
}

// â”€â”€ Read state from the Customer/Product tables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// For Type / Territory, the customer can pick a preset OR choose
// "Other (specify)" which reveals a free-text input. We return the typed
// value in the custom case.
function readWithCustom(tr, selectAttr, customAttr) {
  const sel = tr.querySelector(`[${selectAttr}]`);
  if (!sel) return '';
  if (sel.value === CUSTOM_OPT) {
    return (tr.querySelector(`[${customAttr}]`)?.value || '').trim();
  }
  return sel.value || '';
}

function getCustomers() {
  return Array.from(document.querySelectorAll('tbody[data-customers-body] tr'))
    .map(tr => ({
      id:        tr.dataset.custId,
      name:      tr.querySelector('[data-cust-name]')?.value.trim() || '',
      type:      readWithCustom(tr, 'data-cust-type',      'data-cust-type-custom'),
      territory: readWithCustom(tr, 'data-cust-territory', 'data-cust-territory-custom'),
    }));
}
function getProducts() {
  return Array.from(document.querySelectorAll('tbody[data-products-body] tr'))
    .map(tr => ({
      id:          tr.dataset.prodId,
      name:        tr.querySelector('[data-prod-name]')?.value.trim() || '',
      revenueType: tr.querySelector('[data-prod-revtype]')?.value || '',
      price:       tr.querySelector('[data-prod-price]')?.value || '',
      cost:        tr.querySelector('[data-prod-cost]')?.value  || '',
    }));
}

// â”€â”€ Refill a <select> with id-keyed options for named items â”€â”€
function fillIdSelect(select, items) {
  const prev = select.value;
  const opts = ['<option value="">— Select —</option>']
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
  tr.querySelector('[data-ls-type]').textContent      = cust?.type      || '—';
  tr.querySelector('[data-ls-territory]').textContent = cust?.territory || '—';
  tr.querySelector('[data-ls-revtype]').textContent   = prod?.revenueType || '—';
  tr.querySelector('[data-ls-price]').textContent     = prod?.price ? formatPriceDisplay(prod.price) : '—';
  tr.querySelector('[data-ls-cost]').textContent      = prod?.cost  ? formatPriceDisplay(prod.cost)  : '—';
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
}

// â”€â”€ Format a stored money string for read-only display â”€â”€â”€â”€â”€â”€â”€
function formatPriceDisplay(raw) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return '—';
  const [intPart, decPart] = cleaned.split('.');
  const intFmt = parseInt(intPart || '0', 10).toLocaleString('en-US');
  return '$ ' + (decPart !== undefined ? `${intFmt}.${decPart}` : intFmt);
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
      cost:         prod?.cost  || '',
      q1:           tr.querySelector('[data-ls-q1]')?.value || '',
      q2:           tr.querySelector('[data-ls-q2]')?.value || '',
      q3:           tr.querySelector('[data-ls-q3]')?.value || '',
      q4:           tr.querySelector('[data-ls-q4]')?.value || '',
      y2:           tr.querySelector('[data-ls-y2]')?.value || '',
    };
  });
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
    fte,
  };

  const submitBtn = qForm.querySelector('.partner-q-submit');
  const originalText = submitBtn?.textContent;
  const isEdit = !!_editingSubmissionId;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isEdit ? 'Saving…' : 'Submitting…'; }

  try {
    if (isEdit) {
      await apiUpdateMySubmission(_editingSubmissionId, name, formData);
    } else {
      await apiSubmitQuestionnaire(name, formData);
    }
    sessionStorage.setItem('vv_customer_name', name);
    _editingSubmissionId = null;
    setSubmitButtonMode('submit');
    qForm.hidden = true;
    qThanks.hidden = false;
    await renderTileState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Submit'; }
    alert((isEdit ? 'Save failed.' : 'Submission failed.') + ' Please check your connection and try again.\n\n' + (err && err.message ? err.message : ''));
  }
});

// ─── Edit flow: prefill questionnaire from existing submission ──────────────
let _editingSubmissionId = null;

function setSubmitButtonMode(mode) {
  const submitBtn = qForm?.querySelector('.partner-q-submit');
  if (!submitBtn) return;
  submitBtn.textContent = mode === 'edit' ? 'Save Changes' : 'Submit';
}

async function openEditFlow(submissionId) {
  const key = customerKey();
  if (!key) throw new Error('Session expired — please sign in again.');
  const res = await fetch(`${PARTNER_API}/api/customer/me/submissions/${encodeURIComponent(submissionId)}`, {
    headers: { 'X-Customer-Key': key },
  });
  if (!res.ok) {
    if (res.status === 401) { sessionStorage.clear(); window.location.replace('index.html'); }
    throw new Error(`Failed to load submission (${res.status})`);
  }
  const { submission } = await res.json();
  _editingSubmissionId = submission.id;
  showQuestionnaire();
  populateFormFromSubmission(submission);
  setSubmitButtonMode('edit');
}

// Reset edit mode if the user backs out
document.getElementById('questionnaireBack')?.addEventListener('click', () => {
  _editingSubmissionId = null;
  setSubmitButtonMode('submit');
});

function populateFormFromSubmission(sub) {
  const fd = sub.formData || {};

  // Name + general fields
  const nameEl = document.getElementById('qName');
  if (nameEl) nameEl.value = sub.customerName || '';
  const g = fd.general || {};
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  setVal('qSector',          g.sector);
  setVal('qRound',           g.round);
  setVal('qCapitalGoal',     g.capitalGoal);
  setVal('qYearsSinceFound', g.yearsSinceFound);
  setVal('qFirstYear',       g.firstYear);

  // Rebuild Customer rows with their original ids so letsScale references
  // continue to resolve.
  const cBody = document.querySelector('tbody[data-customers-body]');
  if (cBody) {
    cBody.innerHTML = '';
    const customers = Array.isArray(fd.customers) ? fd.customers : [];
    customers.forEach(c => {
      const tr = makeCustomerRow();
      if (c.id) tr.dataset.custId = c.id;
      const inp = tr.querySelector('[data-cust-name]');     if (inp && c.name)      inp.value = c.name;
      const sel = tr.querySelector('[data-cust-type]');     if (sel && c.type)      sel.value = c.type;
      const ter = tr.querySelector('[data-cust-territory]');if (ter && c.territory) ter.value = c.territory;
      cBody.appendChild(tr);
    });
    if (!customers.length) cBody.appendChild(makeCustomerRow());
  }

  // Rebuild Product rows with their original ids.
  const pBody = document.querySelector('tbody[data-products-body]');
  if (pBody) {
    pBody.innerHTML = '';
    const products = Array.isArray(fd.products) ? fd.products : [];
    products.forEach(p => {
      const tr = makeProductRow();
      if (p.id) tr.dataset.prodId = p.id;
      const inp = tr.querySelector('[data-prod-name]');    if (inp && p.name)        inp.value = p.name;
      const sel = tr.querySelector('[data-prod-revtype]'); if (sel && p.revenueType) sel.value = p.revenueType;
      const pri = tr.querySelector('[data-prod-price]');   if (pri && p.price)       pri.value = p.price;
      const cst = tr.querySelector('[data-prod-cost]');    if (cst && p.cost)        cst.value = p.cost;
      pBody.appendChild(tr);
    });
    if (!products.length) pBody.appendChild(makeProductRow());
  }

  // Year labels + cascading dropdowns
  syncYearLabels();
  syncDerivedSections();

  // Restore custom (free-text) Type / Territory values on customer rows.
  // If the stored value isn't a known preset, surface the "Other (specify)"
  // input and fill it.
  document.querySelectorAll('tbody[data-customers-body] tr').forEach((tr, i) => {
    const c = (Array.isArray(fd.customers) ? fd.customers[i] : null) || {};
    const restoreCustom = (selectAttr, customAttr, preset, stored) => {
      const sel = tr.querySelector(`[${selectAttr}]`);
      const inp = tr.querySelector(`[${customAttr}]`);
      if (!sel || !inp || !stored) return;
      if (preset.includes(stored)) { sel.value = stored; inp.hidden = true; inp.value = ''; }
      else { sel.value = CUSTOM_OPT; inp.hidden = false; inp.value = stored; }
    };
    restoreCustom('data-cust-type',      'data-cust-type-custom',      CUSTOMER_TYPES, c.type);
    restoreCustom('data-cust-territory', 'data-cust-territory-custom', TERRITORIES,    c.territory);
  });

  // Rebuild Let's Scale rows now that the dropdowns are populated with the
  // original customer/product ids.
  const lBody = document.querySelector('tbody[data-letsscale-body]');
  if (lBody) {
    lBody.innerHTML = '';
    const scale = Array.isArray(fd.letsScale) ? fd.letsScale : [];
    scale.forEach(s => {
      const tr = makeLetsScaleRow();
      lBody.appendChild(tr);
      const custSel = tr.querySelector('[data-ls-cust]');
      const prodSel = tr.querySelector('[data-ls-prod]');
      // Populate the selects from the now-current customer/product lists
      fillIdSelect(custSel, getCustomers());
      fillIdSelect(prodSel, getProducts());
      if (s.customerId) custSel.value = s.customerId;
      if (s.productId)  prodSel.value = s.productId;
      updateLetsScaleRow(tr);
      const setCell = (sel, v) => { const el = tr.querySelector(sel); if (el && v != null) el.value = v; };
      setCell('[data-ls-q1]',   s.q1);
      setCell('[data-ls-q2]',   s.q2);
      setCell('[data-ls-q3]',   s.q3);
      setCell('[data-ls-q4]',   s.q4);
      setCell('[data-ls-y2]',   s.y2);
    });
    if (!scale.length) lBody.appendChild(makeLetsScaleRow());
  }

  // FTE
  const fte = fd.fte || {};
  ['cogs_y1','cogs_y2','rd_y1','rd_y2','sm_y1','sm_y2','ga_y1','ga_y2'].forEach(k => {
    if (qForm.elements['fte_' + k] && fte[k] != null) qForm.elements['fte_' + k].value = fte[k];
  });
}

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

  zone.addEventListener('click', (e) => {
    // Skip if the click was on the native file input or on the "Browse files"
    // label — the browser already fires input.click() for those via the
    // label's for=deckFileInput binding. Without this guard the file picker
    // opens twice: once natively, once from this zone-wide handler.
    if (e.target === input) return;
    if (e.target.closest && e.target.closest('label[for="deckFileInput"]')) return;
    input.click();
  });
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