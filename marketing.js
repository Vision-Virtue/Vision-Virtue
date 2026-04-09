/* ============================================================
   Vision & Virtue — Marketing AI Dashboard
   Frontend application script
   ============================================================ */

// ── Configuration ─────────────────────────────────────────────
const API_BASE = (window.VV_MARKETING_API || localStorage.getItem('vv_marketing_api') || 'https://vv-marketing-api.onrender.com') + '/api';

// ── State ──────────────────────────────────────────────────────
let currentView = 'pipeline';
let contentItems = [];
let currentItem = null;
let raphaelAction = null; // 'approve' | 'reject'

// ── Workflow state config ──────────────────────────────────────
const STATES = {
  IDEA_IDENTIFIED:          { label: 'Idea',            color: 'gray' },
  ECONOMIST_BRIEF_READY:    { label: 'Brief Ready',     color: 'blue' },
  DRAFT_READY:              { label: 'Draft Ready',     color: 'indigo' },
  UNDER_VP_REVIEW:          { label: 'VP Review',       color: 'yellow' },
  AWAITING_RAPHAEL_APPROVAL:{ label: 'Awaiting Raphael',color: 'orange' },
  APPROVED_FOR_PUBLISHING:  { label: 'Approved',        color: 'green' },
  PUBLISHED:                { label: 'Published',       color: 'teal' },
  RETURNED_FOR_REVISION:    { label: 'Revision',        color: 'amber' },
  REJECTED:                 { label: 'Rejected',        color: 'red' },
};

const WORKFLOW_STEPS = [
  'IDEA_IDENTIFIED',
  'ECONOMIST_BRIEF_READY',
  'DRAFT_READY',
  'UNDER_VP_REVIEW',
  'AWAITING_RAPHAEL_APPROVAL',
  'APPROVED_FOR_PUBLISHING',
  'PUBLISHED',
];

// ── API helpers ────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data.data ?? data;
}

const GET  = (p)    => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PUT  = (p, b) => api('PUT', p, b);

// ── Toast ──────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const ct = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  ct.appendChild(el);
  setTimeout(() => el.classList.add('toast-visible'), 10);
  setTimeout(() => {
    el.classList.remove('toast-visible');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// ── State badge ────────────────────────────────────────────────
function badge(state) {
  const s = STATES[state] || { label: state, color: 'gray' };
  return `<span class="state-badge badge-${s.color}">${s.label}</span>`;
}

// ── Format date ───────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Loading button ─────────────────────────────────────────────
function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Working…' : label;
}

// ── LinkedIn status ────────────────────────────────────────────
async function checkLinkedInStatus() {
  const el = document.getElementById('linkedin-status');
  try {
    const data = await GET('/auth/status');
    if (data.connected) {
      el.innerHTML = `<span class="status-dot dot-connected"></span><span class="status-text">LinkedIn Connected</span>`;
    } else {
      el.innerHTML = `<span class="status-dot dot-disconnected"></span><span class="status-text">LinkedIn Disconnected</span>`;
    }
  } catch {
    el.innerHTML = `<span class="status-dot dot-disconnected"></span><span class="status-text">Backend Offline</span>`;
  }
}

// ── View router ────────────────────────────────────────────────
function navigate(view, item) {
  currentView = view;
  currentItem = item || null;
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  const titles = { pipeline: 'Content Pipeline', linkedin: 'LinkedIn Page', analytics: 'Analytics', settings: 'Settings' };
  document.getElementById('header-title').textContent =
    view === 'detail' ? (item?.topic?.substring(0, 60) || 'Content Detail') :
    titles[view] || view;
  renderView();
}

function renderView() {
  const area = document.getElementById('content-area');
  if (currentView === 'pipeline')  renderPipeline(area);
  else if (currentView === 'detail') renderDetail(area);
  else if (currentView === 'linkedin') renderLinkedIn(area);
  else if (currentView === 'analytics') renderAnalytics(area);
  else if (currentView === 'settings')  renderSettings(area);
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE VIEW
// ═══════════════════════════════════════════════════════════════
async function renderPipeline(area) {
  area.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Content Pipeline</h2>
        <p class="view-sub">Track economic insights from brief to LinkedIn publication.</p>
      </div>
      <button class="btn btn-primary" id="new-topic-btn">+ New Topic</button>
    </div>
    <div id="pipeline-list" class="pipeline-list">
      <div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>
    </div>`;

  document.getElementById('new-topic-btn').onclick = openNewTopicModal;

  try {
    contentItems = await GET('/content');
    renderPipelineList();
  } catch (e) {
    document.getElementById('pipeline-list').innerHTML =
      `<div class="empty-state"><p class="error-text">Could not reach backend: ${e.message}</p>
       <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem">Make sure the backend is running on port 3001.</p></div>`;
  }
}

function renderPipelineList() {
  const el = document.getElementById('pipeline-list');
  if (!el) return;
  if (!contentItems.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
      <p>No topics yet. Create your first one.</p>
    </div>`;
    return;
  }
  el.innerHTML = contentItems.map(item => `
    <div class="pipeline-card" data-id="${item.id}">
      <div class="pipeline-card-left">
        <div class="pipeline-topic">${item.topic}</div>
        <div class="pipeline-meta">${fmtDate(item.created_at)}</div>
      </div>
      <div class="pipeline-card-right">
        ${badge(item.state)}
        <button class="btn btn-sm btn-outline" data-id="${item.id}">Open →</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      try {
        const item = await GET(`/content/${id}`);
        navigate('detail', item);
      } catch(e) { toast(e.message, 'error'); }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════════════════════════════
async function renderDetail(area) {
  if (!currentItem) { navigate('pipeline'); return; }
  const item = currentItem;

  const stepIndex = WORKFLOW_STEPS.indexOf(item.state);
  const progress = Math.max(0, Math.min(100, ((stepIndex) / (WORKFLOW_STEPS.length - 1)) * 100));

  area.innerHTML = `
    <div class="detail-header">
      <button class="btn-back" id="back-btn">← Pipeline</button>
      <div class="detail-meta">
        ${badge(item.state)}
        <span class="detail-date">Created ${fmtDate(item.created_at)}</span>
      </div>
    </div>

    <h2 class="detail-topic">${item.topic}</h2>

    <!-- Progress bar -->
    <div class="workflow-progress">
      ${WORKFLOW_STEPS.map((s, i) => `
        <div class="wp-step ${i <= stepIndex ? 'wp-done' : ''} ${s === item.state ? 'wp-current' : ''}">
          <div class="wp-dot"></div>
          <div class="wp-label">${STATES[s]?.label || s}</div>
        </div>`).join('<div class="wp-line"></div>')}
    </div>

    <!-- Step panels -->
    <div class="step-panels" id="step-panels"></div>

    <!-- Audit history -->
    <div class="audit-section">
      <h3 class="section-heading">Audit Trail</h3>
      <div id="audit-list" class="audit-list">
        ${renderAuditList(item.revision_history || [])}
      </div>
    </div>`;

  document.getElementById('back-btn').onclick = () => navigate('pipeline');
  renderStepPanels(item);
}

function renderStepPanels(item) {
  const container = document.getElementById('step-panels');
  if (!container) return;

  const panels = [];

  // ── Step 1: Economist Brief ──────────────────────────────
  const hasBrief = !!item.economist_brief?.summary;
  const canBrief = item.state === 'IDEA_IDENTIFIED' || item.state === 'RETURNED_FOR_REVISION';
  panels.push(`
    <div class="step-panel ${hasBrief ? 'panel-done' : ''}">
      <div class="panel-header">
        <div class="panel-agent">
          <div class="agent-avatar avatar-blue sm-avatar">ER</div>
          <div>
            <div class="panel-title">Dr. Ethan Ross — Economist Brief</div>
            <div class="panel-sub">Macro-economic analysis and structured insight brief</div>
          </div>
        </div>
        ${hasBrief ? '<span class="panel-check">✓</span>' : ''}
      </div>
      ${hasBrief ? `
        <div class="panel-body">
          <div class="brief-grid">
            <div class="brief-field"><div class="brief-label">Summary</div><div class="brief-value">${item.economist_brief.summary}</div></div>
            <div class="brief-field"><div class="brief-label">What Happened</div><div class="brief-value">${item.economist_brief.what_happened}</div></div>
            <div class="brief-field"><div class="brief-label">Why It Matters</div><div class="brief-value">${item.economist_brief.why_it_matters}</div></div>
            <div class="brief-field"><div class="brief-label">Implications</div><div class="brief-value">${item.economist_brief.implications}</div></div>
            <div class="brief-field"><div class="brief-label">Risks</div><div class="brief-value">${item.economist_brief.risks}</div></div>
            <div class="brief-field"><div class="brief-label">Uncertainty</div><div class="brief-value">${item.economist_brief.uncertainty}</div></div>
          </div>
        </div>` : ''}
      ${canBrief || !hasBrief && item.state === 'IDEA_IDENTIFIED' ? `
        <div class="panel-footer">
          <button class="btn btn-primary" id="gen-brief-btn">Generate Economist Brief</button>
        </div>` : ''}
    </div>`);

  // ── Step 2: Marketing Draft ──────────────────────────────
  const hasDraft = !!item.marketing_draft?.english;
  const canDraft = item.state === 'ECONOMIST_BRIEF_READY' || item.state === 'RETURNED_FOR_REVISION';
  panels.push(`
    <div class="step-panel ${hasDraft ? 'panel-done' : ''} ${!hasBrief ? 'panel-locked' : ''}">
      <div class="panel-header">
        <div class="panel-agent">
          <div class="agent-avatar avatar-purple sm-avatar">SC</div>
          <div>
            <div class="panel-title">Sofia Chen — Marketing Draft</div>
            <div class="panel-sub">Hebrew + English LinkedIn posts</div>
          </div>
        </div>
        ${hasDraft ? '<span class="panel-check">✓</span>' : ''}
      </div>
      ${hasDraft ? `
        <div class="panel-body">
          <div class="draft-grid">
            <div class="draft-panel">
              <div class="draft-lang">🇮🇱 Hebrew</div>
              <div class="draft-text" dir="rtl">${item.marketing_draft.hebrew}</div>
            </div>
            <div class="draft-panel">
              <div class="draft-lang">🇺🇸 English</div>
              <div class="draft-text">${item.marketing_draft.english}</div>
            </div>
          </div>
        </div>` : ''}
      ${canDraft && hasBrief ? `
        <div class="panel-footer">
          <button class="btn btn-primary" id="gen-draft-btn">Generate Marketing Draft</button>
        </div>` : ''}
    </div>`);

  // ── Step 3: VP Review ────────────────────────────────────
  const hasReview = !!item.vp_review?.decision;
  const canReview = item.state === 'DRAFT_READY';
  const decisionClass = { APPROVED: 'decision-approved', REVISE: 'decision-revise', REJECT: 'decision-reject' }[item.vp_review?.decision] || '';
  panels.push(`
    <div class="step-panel ${hasReview ? 'panel-done' : ''} ${!hasDraft ? 'panel-locked' : ''}">
      <div class="panel-header">
        <div class="panel-agent">
          <div class="agent-avatar avatar-teal sm-avatar">DB</div>
          <div>
            <div class="panel-title">Daniel Berg — VP Review</div>
            <div class="panel-sub">Factual accuracy, tone, brand alignment, reputational risk</div>
          </div>
        </div>
        ${hasReview ? `<span class="panel-decision ${decisionClass}">${item.vp_review.decision}</span>` : ''}
      </div>
      ${hasReview ? `
        <div class="panel-body">
          <div class="brief-field"><div class="brief-label">Comments</div><div class="brief-value">${item.vp_review.comments}</div></div>
          ${item.vp_review.edits ? `<div class="brief-field"><div class="brief-label">Suggested Edits</div><div class="brief-value">${item.vp_review.edits}</div></div>` : ''}
        </div>` : ''}
      ${canReview && hasDraft ? `
        <div class="panel-footer">
          <button class="btn btn-primary" id="submit-review-btn">Submit for VP Review</button>
        </div>` : ''}
    </div>`);

  // ── Step 4: Raphael Approval ─────────────────────────────
  const hasApproval = !!item.approval?.status && item.approval.status !== 'PENDING';
  const canApprove = item.state === 'AWAITING_RAPHAEL_APPROVAL';
  const approvalClass = item.approval?.status === 'APPROVED' ? 'decision-approved' : item.approval?.status === 'REJECTED' ? 'decision-reject' : '';
  panels.push(`
    <div class="step-panel ${hasApproval ? 'panel-done' : ''} ${!hasReview ? 'panel-locked' : ''}">
      <div class="panel-header">
        <div class="panel-agent">
          <div class="agent-avatar avatar-gold sm-avatar">R</div>
          <div>
            <div class="panel-title">Raphael — Final Approval Gate</div>
            <div class="panel-sub">No publication without explicit human approval</div>
          </div>
        </div>
        ${hasApproval ? `<span class="panel-decision ${approvalClass}">${item.approval.status}</span>` : ''}
      </div>
      ${hasApproval ? `
        <div class="panel-body">
          <div class="brief-field"><div class="brief-label">Approved By</div><div class="brief-value">${item.approval.approved_by}</div></div>
          <div class="brief-field"><div class="brief-label">At</div><div class="brief-value">${fmtDate(item.approval.approved_at)}</div></div>
        </div>` : ''}
      ${canApprove ? `
        <div class="panel-footer" style="gap:0.75rem;display:flex">
          <button class="btn btn-primary" id="approve-btn">Approve & Authorize</button>
          <button class="btn btn-danger" id="reject-btn">Reject</button>
        </div>` : ''}
      ${item.state === 'UNDER_VP_REVIEW' && item.vp_review?.decision === 'APPROVED' ? `
        <div class="panel-footer">
          <button class="btn btn-primary" id="request-approval-btn">Send to Raphael</button>
        </div>` : ''}
    </div>`);

  // ── Step 5: LinkedIn Publish ─────────────────────────────
  const isPublished = item.state === 'PUBLISHED';
  const canPublish = item.state === 'APPROVED_FOR_PUBLISHING';
  panels.push(`
    <div class="step-panel ${isPublished ? 'panel-done' : ''} ${!canPublish && !isPublished ? 'panel-locked' : ''}">
      <div class="panel-header">
        <div class="panel-agent">
          <div class="panel-icon-li">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
          </div>
          <div>
            <div class="panel-title">Publish to LinkedIn</div>
            <div class="panel-sub">vision-virtue-success — Official Company Page</div>
          </div>
        </div>
        ${isPublished ? '<span class="panel-check">✓ Published</span>' : ''}
      </div>
      ${isPublished && item.publish_result ? `
        <div class="panel-body">
          <div class="brief-field"><div class="brief-label">Published At</div><div class="brief-value">${fmtDate(item.publish_result.published_at)}</div></div>
          ${item.publish_result.english_post_id ? `<div class="brief-field"><div class="brief-label">Post IDs</div><div class="brief-value">EN: ${item.publish_result.english_post_id}${item.publish_result.hebrew_post_id ? ' | HE: ' + item.publish_result.hebrew_post_id : ''}</div></div>` : ''}
        </div>` : ''}
      ${canPublish ? `
        <div class="panel-footer">
          <button class="btn btn-publish" id="publish-btn">Publish to LinkedIn Now</button>
        </div>` : ''}
    </div>`);

  container.innerHTML = panels.join('');
  bindDetailActions(item);
}

function bindDetailActions(item) {
  const $ = id => document.getElementById(id);

  // Generate brief
  const briefBtn = $('gen-brief-btn');
  if (briefBtn) briefBtn.onclick = async () => {
    setLoading(briefBtn, true);
    try {
      currentItem = await POST(`/content/${item.id}/economist-brief`);
      toast('Economist brief generated.', 'success');
      renderDetail(document.getElementById('content-area'));
    } catch(e) { toast(e.message, 'error'); setLoading(briefBtn, false, 'Generate Economist Brief'); }
  };

  // Generate draft
  const draftBtn = $('gen-draft-btn');
  if (draftBtn) draftBtn.onclick = async () => {
    setLoading(draftBtn, true);
    try {
      currentItem = await POST(`/content/${item.id}/marketing-draft`);
      toast('Marketing draft created.', 'success');
      renderDetail(document.getElementById('content-area'));
    } catch(e) { toast(e.message, 'error'); setLoading(draftBtn, false, 'Generate Marketing Draft'); }
  };

  // VP review
  const reviewBtn = $('submit-review-btn');
  if (reviewBtn) reviewBtn.onclick = async () => {
    setLoading(reviewBtn, true);
    try {
      currentItem = await POST(`/content/${item.id}/vp-review`);
      toast('VP review complete.', 'success');
      renderDetail(document.getElementById('content-area'));
    } catch(e) { toast(e.message, 'error'); setLoading(reviewBtn, false, 'Submit for VP Review'); }
  };

  // Send to Raphael
  const reqBtn = $('request-approval-btn');
  if (reqBtn) reqBtn.onclick = async () => {
    setLoading(reqBtn, true);
    try {
      currentItem = await POST(`/content/${item.id}/request-approval`);
      toast('Sent to Raphael for final approval.', 'success');
      renderDetail(document.getElementById('content-area'));
    } catch(e) { toast(e.message, 'error'); setLoading(reqBtn, false, 'Send to Raphael'); }
  };

  // Raphael approve
  const approveBtn = $('approve-btn');
  if (approveBtn) approveBtn.onclick = () => openRaphaelModal('approve', item);

  // Raphael reject
  const rejectBtn = $('reject-btn');
  if (rejectBtn) rejectBtn.onclick = () => openRaphaelModal('reject', item);

  // Publish
  const publishBtn = $('publish-btn');
  if (publishBtn) publishBtn.onclick = async () => {
    if (!confirm('Publish both Hebrew and English posts to Vision & Virtue LinkedIn page?')) return;
    setLoading(publishBtn, true);
    try {
      currentItem = await POST(`/content/${item.id}/publish`);
      toast('Successfully published to LinkedIn!', 'success');
      renderDetail(document.getElementById('content-area'));
    } catch(e) { toast(e.message, 'error'); setLoading(publishBtn, false, 'Publish to LinkedIn Now'); }
  };
}

function renderAuditList(history) {
  if (!history || !history.length) return '<p class="audit-empty">No history yet.</p>';
  return history.slice().reverse().map(entry => `
    <div class="audit-entry">
      <div class="audit-meta">
        <span class="audit-actor">${entry.actor || 'System'}</span>
        <span class="audit-action">${entry.action}</span>
        <span class="audit-date">${fmtDate(entry.created_at)}</span>
      </div>
      ${entry.previous_state ? `<div class="audit-transition">${entry.previous_state} → ${entry.new_state || ''}</div>` : ''}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// LINKEDIN VIEW
// ═══════════════════════════════════════════════════════════════
async function renderLinkedIn(area) {
  area.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">LinkedIn Page</h2>
        <p class="view-sub">Manage the official Vision &amp; Virtue LinkedIn company page.</p>
      </div>
      <div style="display:flex;gap:0.75rem">
        <button class="btn btn-outline" id="connect-li-btn">Connect LinkedIn</button>
        <button class="btn btn-secondary" id="review-profile-btn">AI Review Profile</button>
      </div>
    </div>
    <div id="li-content">
      <div class="loading-state"><div class="spinner"></div><span>Loading profile…</span></div>
    </div>`;

  document.getElementById('connect-li-btn').onclick = () => {
    window.open(API_BASE + '/auth/linkedin', '_blank');
  };

  document.getElementById('review-profile-btn').onclick = async () => {
    const btn = document.getElementById('review-profile-btn');
    setLoading(btn, true);
    try {
      const result = await POST('/linkedin/review-profile');
      document.getElementById('li-content').innerHTML = `
        <div class="panel-body" style="background:var(--surface);border-radius:10px;padding:1.5rem">
          <h3 style="margin-bottom:1rem;color:var(--text-primary)">AI Profile Review</h3>
          <div class="brief-value" style="white-space:pre-wrap">${result.review || JSON.stringify(result, null, 2)}</div>
        </div>`;
    } catch(e) { toast(e.message, 'error'); }
    setLoading(btn, false, 'AI Review Profile');
  };

  try {
    const profile = await GET('/linkedin/profile');
    renderLinkedInProfile(profile);
  } catch(e) {
    document.getElementById('li-content').innerHTML = `
      <div class="empty-state">
        <p>${e.message}</p>
        <p style="font-size:0.8rem;margin-top:0.5rem;color:var(--text-muted)">Connect LinkedIn to view and manage your company page.</p>
      </div>`;
  }
}

function renderLinkedInProfile(profile) {
  const el = document.getElementById('li-content');
  if (!el) return;
  el.innerHTML = `
    <div class="li-profile-card">
      <div class="li-profile-header">
        <div class="li-logo">${profile.logoUrl ? `<img src="${profile.logoUrl}" alt="Logo">` : '<div class="li-logo-placeholder">V&amp;V</div>'}</div>
        <div>
          <div class="li-name">${profile.name || 'Vision & Virtue'}</div>
          <div class="li-tagline">${profile.tagline || '—'}</div>
        </div>
      </div>
      <div class="brief-grid" style="margin-top:1.5rem">
        <div class="brief-field"><div class="brief-label">Tagline</div><div class="brief-value">${profile.tagline || '—'}</div></div>
        <div class="brief-field"><div class="brief-label">Description</div><div class="brief-value">${profile.description || '—'}</div></div>
        <div class="brief-field"><div class="brief-label">Industry</div><div class="brief-value">${profile.industries?.join(', ') || '—'}</div></div>
        <div class="brief-field"><div class="brief-label">Website</div><div class="brief-value">${profile.website || '—'}</div></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS VIEW
// ═══════════════════════════════════════════════════════════════
function renderAnalytics(area) {
  area.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Analytics</h2>
        <p class="view-sub">Post performance and engagement metrics from LinkedIn.</p>
      </div>
    </div>
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      <p>Analytics available after posts are published.</p>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem">Connect LinkedIn and publish content to see performance data.</p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════
function renderSettings(area) {
  area.innerHTML = `
    <div class="view-header">
      <div><h2 class="view-title">Settings</h2></div>
    </div>
    <div class="settings-grid">
      <div class="settings-card">
        <div class="settings-label">Backend API URL</div>
        <input class="form-input" id="api-url-input" value="${API_BASE.replace('/api','')}" style="margin-top:0.5rem"/>
        <button class="btn btn-secondary" style="margin-top:0.75rem" id="save-api-url">Save & Reload</button>
      </div>
      <div class="settings-card">
        <div class="settings-label">LinkedIn Organization</div>
        <p class="brief-value" style="margin-top:0.5rem">vision-virtue-success</p>
        <a href="https://www.linkedin.com/company/vision-virtue-success" target="_blank" class="btn btn-outline" style="margin-top:0.75rem;display:inline-block">View Page →</a>
      </div>
      <div class="settings-card">
        <div class="settings-label">System Info</div>
        <div id="health-info" class="brief-value" style="margin-top:0.5rem">Checking…</div>
      </div>
    </div>`;

  document.getElementById('save-api-url').onclick = () => {
    localStorage.setItem('vv_marketing_api', document.getElementById('api-url-input').value);
    window.location.reload();
  };

  GET('/health').then(h => {
    document.getElementById('health-info').textContent = `Backend v${h.version} — OK (${h.timestamp})`;
  }).catch(e => {
    document.getElementById('health-info').textContent = `Offline: ${e.message}`;
  });
}

// ═══════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════

// New Topic Modal
function openNewTopicModal() {
  const modal = document.getElementById('new-topic-modal');
  modal.style.display = 'flex';
  document.getElementById('topic-input').value = '';
  document.getElementById('topic-input').focus();
}

function closeNewTopicModal() {
  document.getElementById('new-topic-modal').style.display = 'none';
}

document.getElementById('close-topic-modal').onclick = closeNewTopicModal;
document.getElementById('cancel-topic-btn').onclick = closeNewTopicModal;

document.getElementById('create-topic-btn').onclick = async () => {
  const topic = document.getElementById('topic-input').value.trim();
  if (!topic) { toast('Please enter a topic.', 'error'); return; }
  const btn = document.getElementById('create-topic-btn');
  setLoading(btn, true);
  try {
    const item = await POST('/content', { topic });
    closeNewTopicModal();
    toast('Topic created.', 'success');
    currentItem = item;
    navigate('detail', item);
  } catch(e) {
    toast(e.message, 'error');
    setLoading(btn, false, 'Create Topic');
  }
};

// Raphael Modal
function openRaphaelModal(action, item) {
  raphaelAction = action;
  const modal = document.getElementById('raphael-modal');
  modal.style.display = 'flex';
  document.getElementById('raphael-modal-title').textContent =
    action === 'approve' ? 'Raphael — Approve & Authorize' : 'Raphael — Reject';
  document.getElementById('raphael-modal-desc').textContent =
    action === 'approve'
      ? 'Approve this content for LinkedIn publication. This action cannot be undone without starting a new revision cycle.'
      : 'Reject this content. It will be marked REJECTED and removed from the active pipeline.';
  document.getElementById('raphael-passcode').value = '';
  document.getElementById('raphael-notes').value = '';
  document.getElementById('confirm-raphael-btn').className = `btn ${action === 'approve' ? 'btn-primary' : 'btn-danger'}`;
  document.getElementById('confirm-raphael-btn').textContent = action === 'approve' ? 'Approve' : 'Reject';
  setTimeout(() => document.getElementById('raphael-passcode').focus(), 50);
}

function closeRaphaelModal() {
  document.getElementById('raphael-modal').style.display = 'none';
  raphaelAction = null;
}

document.getElementById('close-raphael-modal').onclick = closeRaphaelModal;
document.getElementById('cancel-raphael-btn').onclick = closeRaphaelModal;

document.getElementById('confirm-raphael-btn').onclick = async () => {
  const passcode = document.getElementById('raphael-passcode').value.trim();
  const notes = document.getElementById('raphael-notes').value.trim();
  if (!passcode) { toast('Passcode required.', 'error'); return; }
  if (!raphaelAction || !currentItem) return;
  const btn = document.getElementById('confirm-raphael-btn');
  setLoading(btn, true);
  try {
    const endpoint = raphaelAction === 'approve' ? 'approve' : 'reject';
    currentItem = await POST(`/content/${currentItem.id}/${endpoint}`, { passcode, notes });
    closeRaphaelModal();
    toast(raphaelAction === 'approve' ? 'Content approved for publishing.' : 'Content rejected.', 'success');
    renderDetail(document.getElementById('content-area'));
  } catch(e) {
    toast(e.message, 'error');
    setLoading(btn, false, raphaelAction === 'approve' ? 'Approve' : 'Reject');
  }
};

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      raphaelAction = null;
    }
  });
});

// ── Sidebar navigation ─────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// ── Keyboard: Esc closes modals ───────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    raphaelAction = null;
  }
});

// ── Init ──────────────────────────────────────────────────────
(function init() {
  checkLinkedInStatus();
  navigate('pipeline');
})();
