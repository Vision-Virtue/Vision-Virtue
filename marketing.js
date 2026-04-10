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
let selectedAgent = null; // 'economist' | 'sofia' | 'daniel' | 'raphael'
let pipelineRunning = false;
let currentPipelineStep = null;

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
  const apiKey = sessionStorage.getItem('vv_key') || '';
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.error === 'object'
      ? (data.error?.message || JSON.stringify(data.error))
      : (data.error || data.message || `HTTP ${res.status}`);
    throw new Error(errMsg);
  }
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
  if (view === 'detail') selectedAgent = null;
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
// DETAIL VIEW — Agent Pipeline UX
// ═══════════════════════════════════════════════════════════════

function agentCubeStatus(key, item) {
  const { state, economist_brief, marketing_draft, vp_review } = item;
  if (pipelineRunning && currentPipelineStep === key) return 'active';
  const greenStates = ['AWAITING_RAPHAEL_APPROVAL', 'APPROVED_FOR_PUBLISHING', 'PUBLISHED'];
  switch (key) {
    case 'economist':
      return economist_brief ? 'done' : (state === 'IDEA_IDENTIFIED' ? 'idle' : 'locked');
    case 'sofia':
      if (!economist_brief) return 'locked';
      if (marketing_draft) return 'done';
      return (state === 'ECONOMIST_BRIEF_READY' || state === 'RETURNED_FOR_REVISION') ? 'active' : 'idle';
    case 'daniel':
      if (!marketing_draft) return 'locked';
      if (vp_review && state !== 'RETURNED_FOR_REVISION') return 'done';
      return state === 'DRAFT_READY' ? 'active' : 'idle';
    case 'raphael':
      if (!vp_review || state === 'RETURNED_FOR_REVISION' || state === 'REJECTED') return 'locked';
      if (greenStates.includes(state)) return 'green';
      return 'locked';
  }
  return 'locked';
}

function renderPipelineStatusBarHTML(item) {
  const { state, economist_brief, marketing_draft, vp_review } = item;
  const greenStates = ['AWAITING_RAPHAEL_APPROVAL', 'APPROVED_FOR_PUBLISHING', 'PUBLISHED'];
  const isGreen = greenStates.includes(state);

  const stageDone = key => {
    if (key === 'economist') return !!economist_brief;
    if (key === 'sofia')     return !!marketing_draft;
    if (key === 'daniel')    return !!vp_review && state !== 'RETURNED_FOR_REVISION';
    if (key === 'raphael')   return isGreen;
    return false;
  };

  const stages = [
    { key: 'economist', label: 'Economist' },
    { key: 'sofia',     label: 'Sofia' },
    { key: 'daniel',    label: 'Daniel' },
    { key: 'raphael',   label: 'Raphael' },
  ];

  let html = '<div class="pipeline-status-bar">';
  stages.forEach((s, i) => {
    const done   = stageDone(s.key);
    const active = !done && (pipelineRunning ? currentPipelineStep === s.key : agentCubeStatus(s.key, item) === 'active');
    const green  = s.key === 'raphael' && isGreen;
    const cls    = green ? 'psb-green' : active ? 'psb-active' : done ? 'psb-done' : '';
    html += `<div class="psb-agent ${cls}"><div class="psb-dot"></div><div class="psb-label">${s.label}</div></div>`;
    if (i < stages.length - 1) {
      html += `<div class="psb-connector ${done ? (isGreen ? 'psb-green' : 'psb-done') : ''}"></div>`;
    }
  });
  return html + '</div>';
}

function renderAgentCubesHTML(item) {
  const agents = [
    { key: 'economist', photo: 'agent_economist.jpg', name: 'Dr. Ethan Ross', role: 'Chief Economist',  color: 'blue'   },
    { key: 'sofia',     photo: 'agent_sofia.jpg',     name: 'Sofia Chen',     role: 'Mgr. Marketing',   color: 'purple' },
    { key: 'daniel',    photo: 'agent_daniel.jpg',    name: 'Daniel Berg',    role: 'VP Marketing',     color: 'teal'   },
    { key: 'raphael',   photo: 'team_raphael.png',    name: 'Raphael',        role: 'Final Approver',   color: 'gold'   },
  ];
  const statusCssMap  = { done: 'cube-done', active: 'cube-active', green: 'cube-green', locked: 'cube-locked' };
  const statusLblMap  = { done: 'Complete', active: 'Working…', green: 'Awaiting you', idle: 'Pending', locked: '' };
  const statusClsMap  = { done: 'cube-status-done', active: 'cube-status-active', green: 'cube-status-green', idle: 'cube-status-idle', locked: '' };

  let html = '';
  agents.forEach((a, i) => {
    const status = agentCubeStatus(a.key, item);
    const sel    = selectedAgent === a.key;
    html += `
      <div class="agent-cube ${statusCssMap[status] || ''} ${sel ? 'cube-selected' : ''}" id="cube-${a.key}" data-agent="${a.key}">
        <div class="cube-avatar-wrap">
          <img class="cube-avatar-img" src="${a.photo}" alt="${a.name}" style="object-fit:cover;object-position:center top" />
          ${(status === 'done' || status === 'green') ? '<div class="cube-check-badge">✓</div>' : ''}
        </div>
        <div class="cube-name">${a.name}</div>
        <div class="cube-role-tag">${a.role}</div>
        <div class="cube-status-label ${statusClsMap[status] || ''}">${statusLblMap[status] || ''}</div>
      </div>`;
    if (i < agents.length - 1) html += '<div class="agent-cube-arrow">→</div>';
  });
  return html;
}

function renderAgentContentHTML(key, item) {
  const meta = {
    economist: { initials: 'ER', color: 'blue',   title: 'Dr. Ethan Ross — Economist Brief' },
    sofia:     { initials: 'SC', color: 'purple', title: 'Sofia Chen — Marketing Draft' },
    daniel:    { initials: 'DB', color: 'teal',   title: 'Daniel Berg — VP Review' },
    raphael:   { initials: 'R',  color: 'gold',   title: 'Raphael — Final Approval Gate' },
  }[key];

  let body = '';

  if (key === 'economist') {
    if (!item.economist_brief) {
      body = `<div class="empty-state" style="padding:24px 0"><p>Brief will be generated when you start the pipeline.</p></div>`;
    } else {
      const b = item.economist_brief;
      body = `<div class="brief-grid">
        <div class="brief-field"><div class="brief-label">Summary</div><div class="brief-value">${b.summary || ''}</div></div>
        <div class="brief-field"><div class="brief-label">Israel Context</div><div class="brief-value">${b.israel_context || ''}</div></div>
        <div class="brief-field"><div class="brief-label">US Context</div><div class="brief-value">${b.us_context || ''}</div></div>
        <div class="brief-field"><div class="brief-label">Global Context</div><div class="brief-value">${b.global_context || ''}</div></div>
        <div class="brief-field"><div class="brief-label">Geopolitical Implications</div><div class="brief-value">${b.geopolitical_implications || ''}</div></div>
        <div class="brief-field"><div class="brief-label">Central Bank Stance</div><div class="brief-value">${b.central_bank_stance || ''}</div></div>
        <div class="brief-field"><div class="brief-label">Risks &amp; Uncertainties</div><div class="brief-value">${(b.risks_and_uncertainties || []).join('<br>')}</div></div>
        <div class="brief-field"><div class="brief-label">Actionable Insights</div><div class="brief-value">${(b.actionable_insights || []).join('<br>')}</div></div>
        ${b.confidence_level ? `<div class="brief-field"><div class="brief-label">Confidence</div><div class="brief-value">${b.confidence_level}${b.requires_verification ? ' — <em>verification required</em>' : ''}</div></div>` : ''}
      </div>`;
    }
  }

  else if (key === 'sofia') {
    if (!item.marketing_draft) {
      body = `<div class="empty-state" style="padding:24px 0"><p>Draft will appear here after the economist brief is ready.</p></div>`;
    } else {
      const d = item.marketing_draft;
      body = `<div class="draft-grid">
        <div class="draft-panel">
          <div class="draft-lang">🇮🇱 Hebrew</div>
          <div class="draft-text" dir="rtl">${d.hebrew?.text || ''}</div>
          <div class="draft-meta">${(d.hebrew?.hashtags || []).join(' ')}</div>
        </div>
        <div class="draft-panel">
          <div class="draft-lang">🇺🇸 English</div>
          <div class="draft-text">${d.english?.text || ''}</div>
          <div class="draft-meta">${(d.english?.hashtags || []).join(' ')}</div>
        </div>
      </div>
      ${d.key_message ? `<div class="brief-field" style="margin-top:1rem"><div class="brief-label">Key Message</div><div class="brief-value">${d.key_message}</div></div>` : ''}`;
    }
  }

  else if (key === 'daniel') {
    if (!item.vp_review) {
      body = `<div class="empty-state" style="padding:24px 0"><p>VP review will appear here after a draft is ready.</p></div>`;
    } else {
      const r = item.vp_review;
      const dc = { APPROVED: 'decision-approved', REVISE: 'decision-revise', REJECT: 'decision-reject' }[r.decision] || '';
      body = `
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;flex-wrap:wrap">
          <span class="panel-decision ${dc}" style="font-size:13px;padding:5px 14px">${r.decision}</span>
          <span style="color:var(--gray-400);font-size:12px">Factual: ${r.factual_accuracy_score}/10 · Brand: ${r.brand_alignment_score}/10 · Clarity: ${r.clarity_score}/10 · Risk: <strong>${r.reputational_risk}</strong></span>
        </div>
        <div class="brief-grid">
          <div class="brief-field"><div class="brief-label">Comments</div><div class="brief-value">${r.comments || ''}</div></div>
          ${r.edits?.hebrew  ? `<div class="brief-field"><div class="brief-label">🇮🇱 Suggested Edit</div><div class="brief-value">${r.edits.hebrew}</div></div>` : ''}
          ${r.edits?.english ? `<div class="brief-field"><div class="brief-label">🇺🇸 Suggested Edit</div><div class="brief-value">${r.edits.english}</div></div>` : ''}
          ${r.edits?.general ? `<div class="brief-field"><div class="brief-label">General Notes</div><div class="brief-value">${r.edits.general}</div></div>` : ''}
        </div>`;
    }
  }

  else if (key === 'raphael') {
    const { state, marketing_draft, approval, publish_result } = item;
    if (state === 'AWAITING_RAPHAEL_APPROVAL' && marketing_draft) {
      const d = marketing_draft;
      body = `
        <div class="draft-grid" style="margin-bottom:1.5rem">
          <div class="draft-panel">
            <div class="draft-lang">🇮🇱 Hebrew Post — Final Review</div>
            <div class="draft-text" dir="rtl" style="white-space:pre-wrap">${d.hebrew?.text || ''}</div>
            <div class="draft-meta">${(d.hebrew?.hashtags || []).join(' ')}</div>
          </div>
          <div class="draft-panel">
            <div class="draft-lang">🇺🇸 English Post — Final Review</div>
            <div class="draft-text" style="white-space:pre-wrap">${d.english?.text || ''}</div>
            <div class="draft-meta">${(d.english?.hashtags || []).join(' ')}</div>
          </div>
        </div>
        <div style="display:flex;gap:0.75rem;padding-top:1.25rem;border-top:1px solid var(--card-border)">
          <button class="btn btn-primary" id="approve-btn">✓ Approve &amp; Authorize Publication</button>
          <button class="btn btn-danger" id="reject-btn">✕ Reject</button>
        </div>`;
    } else if (state === 'APPROVED_FOR_PUBLISHING' || state === 'PUBLISHED') {
      body = `<div class="brief-grid">
        <div class="brief-field"><div class="brief-label">Decision</div><div class="brief-value"><span class="panel-decision decision-approved">APPROVED</span></div></div>
        <div class="brief-field"><div class="brief-label">Approved By</div><div class="brief-value">${approval?.approved_by || 'Raphael'}</div></div>
        <div class="brief-field"><div class="brief-label">At</div><div class="brief-value">${fmtDate(approval?.approved_at)}</div></div>
        ${approval?.notes ? `<div class="brief-field"><div class="brief-label">Notes</div><div class="brief-value">${approval.notes}</div></div>` : ''}
      </div>
      ${state === 'APPROVED_FOR_PUBLISHING' ? `<div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--card-border)"><button class="btn btn-publish" id="publish-btn">Publish to LinkedIn Now</button></div>` : ''}
      ${state === 'PUBLISHED' && publish_result ? `<div class="brief-field" style="margin-top:1rem"><div class="brief-label">Published At</div><div class="brief-value">${fmtDate(publish_result.published_at)}</div></div>` : ''}`;
    } else if (state === 'REJECTED' && approval) {
      body = `<div class="brief-grid">
        <div class="brief-field"><div class="brief-label">Decision</div><div class="brief-value"><span class="panel-decision decision-reject">REJECTED</span></div></div>
        ${approval.notes ? `<div class="brief-field"><div class="brief-label">Notes</div><div class="brief-value">${approval.notes}</div></div>` : ''}
      </div>`;
    } else {
      body = `<div class="empty-state" style="padding:24px 0"><p>Content not yet ready for approval.</p></div>`;
    }
  }

  return `<div class="agent-content-panel">
    <div class="panel-header-bar">
      <div class="panel-header-bar-title">
        <div class="agent-avatar avatar-${meta.color} sm-avatar">${meta.initials}</div>
        ${meta.title}
      </div>
      <button class="panel-close-btn" id="close-agent-panel">×</button>
    </div>
    <div class="panel-content-body">${body}</div>
  </div>`;
}

function bindCubeClicks(item) {
  document.querySelectorAll('.agent-cube[data-agent]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.agent;
      const panelArea = document.getElementById('agent-content-panel-area');
      if (!panelArea) return;
      if (selectedAgent === key) {
        selectedAgent = null;
        el.classList.remove('cube-selected');
        panelArea.innerHTML = '';
      } else {
        document.querySelectorAll('.agent-cube').forEach(c => c.classList.remove('cube-selected'));
        el.classList.add('cube-selected');
        selectedAgent = key;
        panelArea.innerHTML = renderAgentContentHTML(key, item);
        bindPanelActions(item);
      }
    });
  });
}

function bindPanelActions(item) {
  const closeBtn = document.getElementById('close-agent-panel');
  if (closeBtn) closeBtn.onclick = () => {
    selectedAgent = null;
    const area = document.getElementById('agent-content-panel-area');
    if (area) area.innerHTML = '';
    document.querySelectorAll('.agent-cube').forEach(c => c.classList.remove('cube-selected'));
  };
  bindDetailActions(item);
}

async function runFullPipeline(id) {
  const MAX_REVISIONS = 3;
  let it = currentItem;
  let revisions = 0;
  const area = document.getElementById('content-area');
  pipelineRunning = true;

  const activating = (agentKey, msg) => {
    toast(msg, 'info');
    currentPipelineStep = agentKey;
    currentItem = it;
    renderDetail(area);
  };

  try {
    if (it.state === 'IDEA_IDENTIFIED') {
      activating('economist', 'Dr. Ethan Ross is analyzing the topic…');
      it = await POST(`/content/${id}/economist-brief`);
      selectedAgent = 'economist';
    }
    while (revisions < MAX_REVISIONS) {
      if (it.state === 'ECONOMIST_BRIEF_READY' || it.state === 'RETURNED_FOR_REVISION') {
        activating('sofia', `Sofia Chen is drafting${revisions > 0 ? ' (revision ' + revisions + ')' : ''}…`);
        it = await POST(`/content/${id}/marketing-draft`);
        selectedAgent = 'sofia';
      }
      if (it.state === 'DRAFT_READY') {
        activating('daniel', 'Daniel Berg is reviewing the draft…');
        it = await POST(`/content/${id}/vp-review`);
        selectedAgent = it.state === 'AWAITING_RAPHAEL_APPROVAL' ? 'raphael' : 'daniel';
      }
      if (it.state === 'AWAITING_RAPHAEL_APPROVAL') {
        toast('Pipeline complete — ready for your approval.', 'success');
        break;
      }
      if (it.state === 'RETURNED_FOR_REVISION') {
        revisions++;
        if (revisions >= MAX_REVISIONS) {
          activating('daniel', 'Daniel Berg is rewriting the posts himself…');
          it = await POST(`/content/${id}/vp-self-edit`);
          selectedAgent = 'raphael';
          toast('Daniel Berg has rewritten the posts — ready for your approval.', 'success');
          break;
        }
        continue;
      }
      if (it.state === 'REJECTED') {
        toast('VP rejected this content. Please create a new topic.', 'error');
        selectedAgent = 'daniel';
        break;
      }
      break;
    }
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    pipelineRunning = false;
    currentPipelineStep = null;
    currentItem = it;
    renderDetail(area);
  }
}

async function renderDetail(area) {
  if (!currentItem) { navigate('pipeline'); return; }
  const item = currentItem;

  // Auto-select initial agent based on state when none is selected
  if (!selectedAgent) {
    const { state } = item;
    if (['AWAITING_RAPHAEL_APPROVAL', 'APPROVED_FOR_PUBLISHING', 'PUBLISHED'].includes(state)) selectedAgent = 'raphael';
    else if (state === 'RETURNED_FOR_REVISION' || state === 'REJECTED') selectedAgent = 'daniel';
    else if (state === 'DRAFT_READY' || state === 'UNDER_VP_REVIEW') selectedAgent = 'sofia';
    else if (state === 'ECONOMIST_BRIEF_READY') selectedAgent = 'economist';
  }

  const showStart  = item.state === 'IDEA_IDENTIFIED' && !pipelineRunning;
  const showResume = item.state === 'RETURNED_FOR_REVISION' && !pipelineRunning;

  area.innerHTML = `
    <div class="detail-header-row">
      <button class="btn-back" id="back-btn">← Pipeline</button>
      <div class="detail-meta">
        ${badge(item.state)}
        <span class="detail-date">Created ${fmtDate(item.created_at)}</span>
      </div>
    </div>

    <h2 class="detail-topic">${item.topic}</h2>

    <div class="agent-pipeline-section">
      ${renderPipelineStatusBarHTML(item)}
      <div class="agent-cubes-row">
        ${renderAgentCubesHTML(item)}
      </div>
      ${showStart ? `
        <div class="pipeline-start-action">
          <button class="btn btn-primary btn-lg" id="gen-brief-btn">▶ Start Pipeline</button>
          <span class="pipeline-start-hint">All agents will run automatically through to your approval gate</span>
        </div>` : ''}
      ${showResume ? `
        <div class="pipeline-start-action">
          <button class="btn btn-secondary btn-lg" id="gen-draft-btn">↺ Resume Pipeline</button>
        </div>` : ''}
    </div>

    <div id="agent-content-panel-area">
      ${selectedAgent ? renderAgentContentHTML(selectedAgent, item) : ''}
    </div>

    <div class="audit-section-card">
      <h3 class="section-heading">Audit Trail</h3>
      <div class="audit-list">${renderAuditList(item.revision_history || [])}</div>
    </div>`;

  document.getElementById('back-btn').onclick = () => navigate('pipeline');

  if (selectedAgent) {
    const cubeEl = document.getElementById(`cube-${selectedAgent}`);
    if (cubeEl) cubeEl.classList.add('cube-selected');
  }
  bindCubeClicks(item);
  bindPanelActions(item);
}

function bindDetailActions(item) {
  const $ = id => document.getElementById(id);

  const briefBtn = $('gen-brief-btn');
  if (briefBtn) briefBtn.onclick = async () => {
    setLoading(briefBtn, true);
    await runFullPipeline(item.id);
    setLoading(briefBtn, false, '▶ Start Pipeline');
  };

  const draftBtn = $('gen-draft-btn');
  if (draftBtn) draftBtn.onclick = async () => {
    setLoading(draftBtn, true);
    await runFullPipeline(item.id);
    setLoading(draftBtn, false, '↺ Resume Pipeline');
  };

  const approveBtn = $('approve-btn');
  if (approveBtn) approveBtn.onclick = () => openRaphaelModal('approve', item);

  const rejectBtn = $('reject-btn');
  if (rejectBtn) rejectBtn.onclick = () => openRaphaelModal('reject', item);

  const publishBtn = $('publish-btn');
  if (publishBtn) publishBtn.onclick = async () => {
    if (!confirm('Publish both Hebrew and English posts to Vision & Virtue LinkedIn page?')) return;
    setLoading(publishBtn, true);
    try {
      currentItem = await POST(`/content/${item.id}/publish`);
      toast('Successfully published to LinkedIn!', 'success');
      renderDetail(document.getElementById('content-area'));
    } catch (e) { toast(e.message, 'error'); setLoading(publishBtn, false, 'Publish to LinkedIn Now'); }
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
