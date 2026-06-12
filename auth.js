/* ============================================================
   VISION & VIRTUE — Authorized Personnel Nav + Access Gate
   ============================================================ */

const BACKEND = 'https://vv-marketing-api.onrender.com';

// ── Elements ──────────────────────────────────────────────────
const authMenuBtn   = document.getElementById('authMenuBtn');
const authDropdown  = document.getElementById('authDropdown');
const financeAiCard = document.getElementById('financeAiCard');
const mobileAuthBtn = document.getElementById('mobileAuthBtn');

const apOverlay  = document.getElementById('apOverlay');
const apClose    = document.getElementById('apClose');
const apPin      = document.getElementById('apPin');
const apEnterBtn = document.getElementById('apEnterBtn');
const apError    = document.getElementById('apError');

// ── Dropdown toggle ───────────────────────────────────────────
authMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = authDropdown.classList.contains('open');
  authDropdown.classList.toggle('open', !isOpen);
  authMenuBtn.setAttribute('aria-expanded', String(!isOpen));
  authDropdown.setAttribute('aria-hidden', String(isOpen));
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!authMenuBtn.contains(e.target) && !authDropdown.contains(e.target)) {
    authDropdown.classList.remove('open');
    authMenuBtn.setAttribute('aria-expanded', 'false');
    authDropdown.setAttribute('aria-hidden', 'true');
  }
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    authDropdown.classList.remove('open');
    authMenuBtn.setAttribute('aria-expanded', 'false');
    closeGate();
  }
});

// ── Finance AI card → open gate ───────────────────────────────
financeAiCard.addEventListener('click', () => {
  authDropdown.classList.remove('open');
  authMenuBtn.setAttribute('aria-expanded', 'false');
  delete apEnterBtn.dataset.target;
  openGate();
});

// ── Marketing AI card → open gate then redirect to marketing.html ─
const marketingAiCard = document.getElementById('marketingAiCard');
if (marketingAiCard) {
  marketingAiCard.addEventListener('click', () => {
    authDropdown.classList.remove('open');
    authMenuBtn.setAttribute('aria-expanded', 'false');
    apEnterBtn.dataset.target = 'marketing';
    openGate();
  });
}

// ── Podcast card → open gate then redirect to the hosted video editor ──
const podcastCard = document.getElementById('podcastCard');
if (podcastCard) {
  podcastCard.addEventListener('click', () => {
    authDropdown.classList.remove('open');
    authMenuBtn.setAttribute('aria-expanded', 'false');
    apEnterBtn.dataset.target = 'podcast';
    openGate();
  });
}

// ── Agreements card → open gate then redirect to signed-NDA listing ──
const agreementsCard = document.getElementById('agreementsCard');
if (agreementsCard) {
  agreementsCard.addEventListener('click', () => {
    authDropdown.classList.remove('open');
    authMenuBtn.setAttribute('aria-expanded', 'false');
    apEnterBtn.dataset.target = 'agreements';
    openGate();
  });
}

// Mobile: tap Authorized Personnel → open gate directly
if (mobileAuthBtn) {
  mobileAuthBtn.addEventListener('click', openGate);
}

// ── Gate open / close ─────────────────────────────────────────
function openGate() {
  apOverlay.classList.add('open');
  apOverlay.setAttribute('aria-hidden', 'false');
  apPin.value = '';
  apError.textContent = '';
  setTimeout(() => apPin.focus(), 50);
}

function closeGate() {
  apOverlay.classList.remove('open');
  apOverlay.setAttribute('aria-hidden', 'true');
  delete apEnterBtn.dataset.target;
}

apClose.addEventListener('click', closeGate);
apOverlay.addEventListener('click', (e) => {
  if (e.target === apOverlay) closeGate();
});

// ── Authenticate (server-side PIN check) ─────────────────────
async function tryAuth() {
  const pin = apPin.value.trim();

  if (!pin) {
    apError.textContent = 'Please enter an access code.';
    apPin.focus();
    return;
  }

  apEnterBtn.disabled = true;
  apError.textContent = '';

  try {
    const res = await fetch(`${BACKEND}/api/auth/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();

    if (!data.valid) {
      apError.textContent = 'Incorrect access code. Try again.';
      apPin.value = '';
      apPin.focus();
      return;
    }

    const target = apEnterBtn.dataset.target;
    sessionStorage.setItem('vv_auth', '1');
    // Stash the verified PIN so admin-only API calls (e.g. CapitaFlow submissions
    // panel) can include it in the X-Admin-Pin header without re-prompting.
    sessionStorage.setItem('vv_admin_pin', pin);
    closeGate();
    // Pass the verified PIN as a one-shot query param so the Podcast app can
    // exchange it for its own session cookie on first load.
    const PODCAST_URL = 'https://podcast.visionvirtuepartnership.com';
    const podcastHref = `${PODCAST_URL}/?pin=${encodeURIComponent(pin)}`;
    window.location.href =
      target === 'marketing'  ? 'marketing.html'
      : target === 'podcast'  ? podcastHref
      : target === 'agreements' ? 'agreements.html'
      : 'agents.html';
  } catch {
    apError.textContent = 'Could not reach server. Please try again.';
  } finally {
    apEnterBtn.disabled = false;
  }
}

apEnterBtn.addEventListener('click', tryAuth);
apPin.addEventListener('keydown', e => { if (e.key === 'Enter') tryAuth(); });
