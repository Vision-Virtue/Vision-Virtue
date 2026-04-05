/* ============================================================
   VISION & VIRTUE — Authorized Personnel Nav + Access Gate
   ============================================================ */

const ACCESS_CODE = 'VV2025';

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

// ── Authenticate ──────────────────────────────────────────────
function tryAuth() {
  const pin = apPin.value.trim();
  const key = apKey.value.trim();

  if (pin !== ACCESS_CODE) {
    apError.textContent = 'Incorrect access code.';
    apPin.select();
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    apError.textContent = 'Enter a valid Claude API key (sk-ant-...).';
    apKey.select();
    return;
  }

  sessionStorage.setItem('vv_auth', '1');
  sessionStorage.setItem('vv_key', key);
  closeGate();
  const target = apEnterBtn.dataset.target;
  window.location.href = target === 'marketing' ? 'marketing.html' : 'agents.html';
}

apEnterBtn.addEventListener('click', tryAuth);
[apPin, apKey].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') tryAuth(); })
);
