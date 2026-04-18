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
const apKey      = document.getElementById('apKey');
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

// Mobile: tap Authorized Personnel → open gate directly
if (mobileAuthBtn) {
  mobileAuthBtn.addEventListener('click', openGate);
}

// ── Gate open / close ─────────────────────────────────────────
function openGate() {
  apOverlay.classList.add('open');
  apOverlay.setAttribute('aria-hidden', 'false');
  apPin.value = '';
  apKey.value = '';
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
  const key = apKey.value.trim();

  if (!pin) {
    apError.textContent = 'Please enter an access code.';
    apPin.focus();
    return;
  }

  if (key && !key.startsWith('sk-ant-')) {
    apError.textContent = 'API key must start with sk-ant- (or leave it blank).';
    apKey.select();
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
    if (key) sessionStorage.setItem('vv_key', key);
    closeGate();
    window.location.href = target === 'marketing' ? 'marketing.html' : 'agents.html';
  } catch {
    apError.textContent = 'Could not reach server. Please try again.';
  } finally {
    apEnterBtn.disabled = false;
  }
}

apEnterBtn.addEventListener('click', tryAuth);
[apPin, apKey].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') tryAuth(); })
);
