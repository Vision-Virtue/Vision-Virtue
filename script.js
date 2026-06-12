/* ============================================================
   VISION & VIRTUE — Main Script
   ============================================================ */

// ---------- Navbar scroll effect ----------
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
}, { passive: true });

// ---------- Mobile menu toggle ----------
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen);
});

// Close mobile menu on link click
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded', false);
  });
});

// ---------- Scroll-triggered animations ----------
const observerOptions = {
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0;
      setTimeout(() => {
        el.classList.add('visible');
      }, delay);
      observer.unobserve(el);
    }
  });
}, observerOptions);

// Observe animated elements
document.querySelectorAll('.who-card, .step, .apart-card, .team-card, .pf-step, .vi-card, .wwd-card, .aop-card').forEach(el => {
  observer.observe(el);
});

// ---------- Active nav link on scroll ----------
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${id}`) {
          link.classList.add('active');
        }
      });
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => navObserver.observe(s));

// ---------- Contact form ----------
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    // Simulate async submission
    setTimeout(() => {
      form.innerHTML = `
        <div class="form-success">
          <div class="success-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4a7c3f" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3>Message Received</h3>
          <p>Thank you for reaching out. A member of the Vision &amp; Virtue team will be in touch shortly.</p>
        </div>
      `;
    }, 1200);
  });
}

// ---------- Smooth scroll for all anchor links ----------
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 72; // navbar height
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ---------- Customer Key gate (CapitaFlow offering CTA) ----------
(function setupCustomerKeyGate() {
  const CK_BACKEND   = 'https://vv-marketing-api.onrender.com';
  const CK_TEST_KEY  = 'VV-TEST123';

  const ckOverlay  = document.getElementById('ckOverlay');
  const ckClose    = document.getElementById('ckClose');
  const ckKey      = document.getElementById('ckKey');
  const ckEnterBtn = document.getElementById('ckEnterBtn');
  const ckError      = document.getElementById('ckError');
  const capitaflowCta = document.getElementById('capitaflowCustomerCta');
  const visibilityCta = document.getElementById('visibilityCustomerCta');

  if (!ckOverlay || (!capitaflowCta && !visibilityCta)) return;

  let pendingTarget = null;

  function openCk(target) {
    pendingTarget = target;
    ckOverlay.classList.add('open');
    ckOverlay.setAttribute('aria-hidden', 'false');
    ckKey.value = '';
    ckError.textContent = '';
    setTimeout(() => ckKey.focus(), 50);
  }

  function closeCk() {
    ckOverlay.classList.remove('open');
    ckOverlay.setAttribute('aria-hidden', 'true');
    pendingTarget = null;
  }

  function targetUrl(t) {
    if (t === 'capitaflow') return 'capitaflow.html';
    if (t === 'visibility') return 'visibility.html';
    return null;
  }

  async function submitKey() {
    const key = ckKey.value.trim();
    if (!key) {
      ckError.textContent = 'Please enter your Customer Key.';
      ckKey.focus();
      return;
    }
    ckEnterBtn.disabled = true;
    ckError.textContent = '';

    try {
      // (1) Try as a customer key
      const cRes = await fetch(`${CK_BACKEND}/api/customer/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (cRes.ok) {
        const cData = await cRes.json();
        if (cData && cData.valid) {
          sessionStorage.setItem('vv_customer_name', cData.customerName || '');
          grantAccess(key);
          return;
        }
      }

      // (2) Master PIN fallback — Authorized Personnel can also enter the
      // customer area (mapped to the seeded test customer for preview).
      const pRes = await fetch(`${CK_BACKEND}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: key }),
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData && pData.valid) {
          sessionStorage.setItem('vv_auth', '1');
          sessionStorage.setItem('vv_customer_name', 'Test Customer (admin preview)');
          grantAccess(CK_TEST_KEY);
          return;
        }
      }

      ckError.textContent = 'Invalid Customer Key. Please try again.';
      ckKey.value = '';
      ckKey.focus();
    } catch {
      ckError.textContent = 'Could not reach server. Please try again.';
    } finally {
      ckEnterBtn.disabled = false;
    }
  }

  function grantAccess(key) {
    sessionStorage.setItem('vv_customer_auth', '1');
    sessionStorage.setItem('vv_customer_key', key);
    const url = targetUrl(pendingTarget);
    closeCk();
    if (url) window.location.href = url;
  }

  capitaflowCta?.addEventListener('click', () => openCk('capitaflow'));
  visibilityCta?.addEventListener('click', () => openCk('visibility'));
  ckClose.addEventListener('click', closeCk);
  ckOverlay.addEventListener('click', e => { if (e.target === ckOverlay) closeCk(); });
  ckEnterBtn.addEventListener('click', submitKey);
  ckKey.addEventListener('keydown', e => { if (e.key === 'Enter') submitKey(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ckOverlay.classList.contains('open')) closeCk();
  });
})();

// ---------- Investor Key gate (Investors Marketplace CTA) ----------
(function setupInvestorKeyGate() {
  const IV_BACKEND = 'https://vv-marketing-api.onrender.com';

  const ivOverlay     = document.getElementById('ivOverlay');
  const ivClose       = document.getElementById('ivClose');
  const ivKey         = document.getElementById('ivKey');
  const ivEnterBtn    = document.getElementById('ivEnterBtn');
  const ivError       = document.getElementById('ivError');
  const investorCta   = document.getElementById('investorMarketplaceCta');
  const mobileInvBtn  = document.getElementById('mobileInvestorBtn');

  if (!ivOverlay || (!investorCta && !mobileInvBtn)) return;

  function openIv() {
    ivOverlay.classList.add('open');
    ivOverlay.setAttribute('aria-hidden', 'false');
    ivKey.value = '';
    ivError.textContent = '';
    setTimeout(() => ivKey.focus(), 50);
  }

  function closeIv() {
    ivOverlay.classList.remove('open');
    ivOverlay.setAttribute('aria-hidden', 'true');
  }

  async function submitInvestorKey() {
    const key = ivKey.value.trim();
    if (!key) {
      ivError.textContent = 'Please enter your Investor Key.';
      ivKey.focus();
      return;
    }
    ivEnterBtn.disabled = true;
    ivError.textContent = '';

    try {
      const res = await fetch(`${IV_BACKEND}/api/investor/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.valid) {
          sessionStorage.setItem('vv_investor_auth', '1');
          sessionStorage.setItem('vv_investor_key', key);
          sessionStorage.setItem('vv_investor_name', data.investorName || '');
          closeIv();
          window.location.href = 'investors-marketplace.html';
          return;
        }
      }
      ivError.textContent = 'Invalid Investor Key. Please try again.';
      ivKey.value = '';
      ivKey.focus();
    } catch {
      ivError.textContent = 'Could not reach server. Please try again.';
    } finally {
      ivEnterBtn.disabled = false;
    }
  }

  investorCta?.addEventListener('click', openIv);
  mobileInvBtn?.addEventListener('click', openIv);
  ivClose.addEventListener('click', closeIv);
  ivOverlay.addEventListener('click', e => { if (e.target === ivOverlay) closeIv(); });
  ivEnterBtn.addEventListener('click', submitInvestorKey);
  ivKey.addEventListener('keydown', e => { if (e.key === 'Enter') submitInvestorKey(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ivOverlay.classList.contains('open')) closeIv();
  });
})();

// ---------- Authorized Personnel notification badge ----------
// Fetches the count of pending CapitaFlow submissions from the public
// /api/notifications/pending-count endpoint and shows a small red bubble
// on the Authorized Personnel button (and the mobile menu copy).
(function setupAuthNotifBadge() {
  const NOTIF_API   = 'https://vv-marketing-api.onrender.com';
  const POLL_MS     = 60_000; // re-poll while the tab is open
  const badge       = document.getElementById('authNotifBadge');
  const badgeMobile = document.getElementById('authNotifBadgeMobile');
  if (!badge && !badgeMobile) return;

  function setCount(n) {
    const display = n > 99 ? '99+' : String(n);
    [badge, badgeMobile].forEach(el => {
      if (!el) return;
      if (n > 0) {
        el.textContent = display;
        el.hidden = false;
      } else {
        el.textContent = '';
        el.hidden = true;
      }
    });
  }

  let timer = null;
  async function refresh() {
    try {
      const res = await fetch(`${NOTIF_API}/api/notifications/pending-count`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      const n = Number.isFinite(data.pending) ? data.pending : 0;
      setCount(n);
    } catch {
      // Silent — backend may be cold-starting; we'll try again on the next tick.
    }
  }

  function start() {
    refresh();
    if (timer === null) timer = window.setInterval(refresh, POLL_MS);
  }
  function stop() {
    if (timer !== null) { window.clearInterval(timer); timer = null; }
  }

  start();
  // Pause polling while the tab is hidden, refresh immediately when it becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
})();

/* ============================================================
   VISIBILITY DEMO — Video modal
   ============================================================ */
(function () {
  var playBtn  = document.getElementById('visibilityPlayBtn');
  var modal    = document.getElementById('vdemoModal');
  var closeBtn = document.getElementById('vdemoClose');
  var video    = document.getElementById('vdemoVideo');

  if (!playBtn || !modal || !video) return;

  function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    video.play();
    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    video.pause();
    video.currentTime = 0;
    playBtn.focus();
  }

  playBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  // Close when clicking the dark backdrop (not the video box itself)
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });
})();
