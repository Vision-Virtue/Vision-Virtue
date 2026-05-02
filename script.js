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

// ---------- Customer Key gate (Partner offering CTA) ----------
(function setupCustomerKeyGate() {
  const CK_BACKEND   = 'https://vv-marketing-api.onrender.com';
  const CK_TEST_KEY  = 'VV-TEST123';

  const ckOverlay  = document.getElementById('ckOverlay');
  const ckClose    = document.getElementById('ckClose');
  const ckKey      = document.getElementById('ckKey');
  const ckEnterBtn = document.getElementById('ckEnterBtn');
  const ckError    = document.getElementById('ckError');
  const partnerCta = document.getElementById('partnerCustomerCta');

  if (!ckOverlay || !partnerCta) return;

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
    if (t === 'partner') return 'partner.html';
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

    // (1) Phase 1 hardcoded test key
    if (key === CK_TEST_KEY) {
      grantAccess(key);
      return;
    }

    // (2) Authorized Personnel master PIN also unlocks customer area
    try {
      const res = await fetch(`${CK_BACKEND}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: key }),
      });
      const data = await res.json();
      if (data && data.valid) {
        sessionStorage.setItem('vv_auth', '1');
        grantAccess(key);
        return;
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

  partnerCta.addEventListener('click', () => openCk('partner'));
  ckClose.addEventListener('click', closeCk);
  ckOverlay.addEventListener('click', e => { if (e.target === ckOverlay) closeCk(); });
  ckEnterBtn.addEventListener('click', submitKey);
  ckKey.addEventListener('keydown', e => { if (e.key === 'Enter') submitKey(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ckOverlay.classList.contains('open')) closeCk();
  });
})();
