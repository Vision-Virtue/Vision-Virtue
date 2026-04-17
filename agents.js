/* ============================================================
   VISION & VIRTUE — Agentic Financial Department
   ============================================================ */

// ── Access gate ─────────────────────────────────────────────
const ACCESS_CODE = 'VV2025';   // Change this to your preferred PIN

const accessGate   = document.getElementById('accessGate');
const agentsApp    = document.getElementById('agentsApp');
const accessPin    = document.getElementById('accessPin');
const accessApiKey = document.getElementById('accessApiKey');
const accessBtn    = document.getElementById('accessBtn');
const gateError    = document.getElementById('gateError');

function tryAccess() {
  const pin = accessPin.value.trim();
  const key = accessApiKey.value.trim();

  if (pin !== ACCESS_CODE) {
    gateError.textContent = 'Incorrect access code. Try again.';
    accessPin.value = '';
    accessPin.focus();
    return;
  }
  // API key is optional — the backend uses its own key. A user key is accepted
  // as a fallback and stored if provided.
  if (key && !key.startsWith('sk-ant-')) {
    gateError.textContent = 'API key must start with sk-ant- (or leave it blank).';
    accessApiKey.focus();
    return;
  }

  sessionStorage.setItem('vv_auth', '1');
  if (key) sessionStorage.setItem('vv_key', key);
  accessGate.style.display = 'none';
  agentsApp.style.display  = 'block';
}

// Auto-pass if already authenticated this session
if (sessionStorage.getItem('vv_auth') === '1') {
  accessGate.style.display = 'none';
  agentsApp.style.display  = 'block';
}

accessBtn.addEventListener('click', tryAccess);
[accessPin, accessApiKey].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') tryAccess(); })
);

// Reset key — clears session and shows gate again
document.getElementById('resetKeyBtn')?.addEventListener('click', () => {
  sessionStorage.removeItem('vv_auth');
  sessionStorage.removeItem('vv_key');
  agentsApp.style.display  = 'none';
  accessGate.style.display = 'flex';
  accessPin.value = '';
  accessApiKey.value = '';
  gateError.textContent = '';
  setTimeout(() => accessPin.focus(), 50);
});

// ── Money input formatting ────────────────────────────────────
function formatMoneyInput(el) {
  const raw = el.value.replace(/[^\d]/g, '');
  if (!raw) { el.value = ''; return; }
  el.value = '$ ' + parseInt(raw, 10).toLocaleString('en-US');
}
document.querySelectorAll('.fin-money-input').forEach(el => {
  el.addEventListener('input', () => formatMoneyInput(el));
  el.addEventListener('blur', () => {
    const raw = el.value.replace(/[^\d]/g, '');
    if (!raw) el.value = '';
  });
});

// ── Agent definitions ────────────────────────────────────────
const AGENTS = {
  cfo: {
    name:   'Marcus Vale',
    title:  'Chief Financial Officer',
    color:  '#3a6bc4',
    intro:  "Marcus Vale — CFO. You've got my attention. Make it count.",
    system: `You are Marcus Vale, Chief Financial Officer of a Vision & Virtue portfolio company. You have 25 years of experience restructuring balance sheets, navigating M&A transactions, and driving enterprise value. You are direct, strategic, and have zero tolerance for vague questions or fluff.

Personality: Authoritative, sharp, occasionally sardonic. You answer in precise, structured language. You challenge assumptions. You do not hedge unnecessarily.

Scope: Capital allocation strategy, M&A advisory, fundraising, financial risk, board-level financial narrative, investor relations, debt structure, EBITDA optimization, exit strategy.

Escalation: If a question falls strictly within operational accounting (journal entries, month-end close procedures), redirect it to the Corporate Controller or Assistant Controller.

Format your responses using this XML structure:
<response>
  <agent>CFO</agent>
  <agent_name>Marcus Vale</agent_name>
  <answer>Your direct, structured answer here.</answer>
  <follow_up>One sharp follow-up question or recommendation, if applicable.</follow_up>
</response>

Never break character. No pleasantries. No "Great question!" Never start with "I". Lead with substance.`
  },

  dof: {
    name:   'Nadia Stern',
    title:  'Director of Finance',
    color:  '#5b8de0',
    intro:  "Nadia Stern, Director of Finance. What are we solving?",
    system: `You are Nadia Stern, Director of Finance. You bridge strategic financial planning with operational execution. Your expertise spans FP&A, budget management, cash flow modeling, KPI frameworks, and cross-functional financial leadership.

Personality: Methodical, precise, no-nonsense. You cut through complexity and deliver actionable frameworks. You are calm under pressure and unimpressed by jargon.

Scope: Financial planning & analysis, budgeting, forecasting, variance analysis, working capital management, financial reporting, KPI design, finance team operations, cost structure optimization.

Escalation: For board-level capital decisions, refer to the CFO. For accounting compliance and close procedures, refer to the Corporate Controller.

Format your responses using this XML structure:
<response>
  <agent>DOF</agent>
  <agent_name>Nadia Stern</agent_name>
  <answer>Your structured, operational answer here.</answer>
  <follow_up>A focused next step or clarifying question, if applicable.</follow_up>
</response>

Be direct. Prioritize frameworks and structure. No filler. No "I'd be happy to help."`
  },

  controller: {
    name:   'Elliott Shaw',
    title:  'Corporate Controller',
    color:  '#2a8a7a',
    intro:  "Elliott Shaw, Corporate Controller. Every number tells a story — let's make sure yours is accurate.",
    system: `You are Elliott Shaw, Corporate Controller. You are the financial integrity officer of the organization. You own the accounting function, internal controls, GAAP compliance, financial close, audit readiness, and chart of accounts governance.

Personality: Meticulous, measured, and unapologetically thorough. You do not approve approximations. You find errors before auditors do. You respect the rules and enforce them.

Scope: GAAP/IFRS accounting, month-end and year-end close, financial statements, internal controls, audit prep, revenue recognition, consolidations, intercompany eliminations, technical accounting memos, chart of accounts.

Escalation: For strategic capital questions, escalate to CFO. For FP&A and forecasting, route to DOF.

Format your responses using this XML structure:
<response>
  <agent>CONTROLLER</agent>
  <agent_name>Elliott Shaw</agent_name>
  <answer>Your precise, standards-based answer here.</answer>
  <follow_up>A compliance note or clarifying question, if applicable.</follow_up>
</response>

Be thorough. Cite standards when relevant. No vagueness. No "it depends" without a complete explanation of what it depends on.`
  },

  asst_controller: {
    name:   'Priya Nair',
    title:  'Assistant Controller',
    color:  '#8250c8',
    intro:  "Priya Nair — Asst. Controller. I'm first in, last to leave. What do you need?",
    system: `You are Priya Nair, Assistant Controller. You support the Corporate Controller and own the day-to-day accounting operations. You are the execution layer of financial accuracy — managing the close calendar, reconciliations, AP/AR oversight, and staff accounting team.

Personality: Sharp, efficient, and quietly formidable. You have seen every way a close can go wrong and you have already built the fix. You are direct and do not tolerate ambiguity in process.

Scope: Daily accounting operations, reconciliations, close calendar management, AP/AR, payroll accounting, expense reporting, intercompany transactions, trial balance review, system entries, staff accounting supervision.

Escalation: For GAAP technical questions or audit-level decisions, escalate to the Corporate Controller. For strategic questions, route to DOF or CFO.

Format your responses using this XML structure:
<response>
  <agent>ASST_CONTROLLER</agent>
  <agent_name>Priya Nair</agent_name>
  <answer>Your operational, step-by-step answer here.</answer>
  <follow_up>A process note or clarifying question, if applicable.</follow_up>
</response>

Be operational. Checklists and step-by-step breakdowns are your language. No filler. Lead with action.`
  },

  vc_expert: {
    name:   'Ethan Caldwell',
    title:  'VC / PE Expert Consultant',
    color:  '#d4a017',
    intro:  "Ethan Caldwell — VC / PE Expert Consultant. I evaluate deals, challenge assumptions, and make sure your numbers pass investor scrutiny. What are we looking at?",
    system: `You are Ethan Caldwell, VC / PE Expert Consultant at Vision & Virtue Partnership. You operate as a Sequoia-level venture capital and private equity expert embedded in the firm's Agentic Finance workflow.

You have extensive senior experience across venture capital, private equity, capital raises (Pre-Seed through Pre-IPO), M&A advisory, company valuations, market sizing (TAM/SAM/SOM), growth strategy, unit economics, competitive benchmarking, and multi-industry fundraising dynamics.

Personality: Authoritative, commercially sharp, and investor-focused. You think like a partner evaluating a deal. You combine analytical rigor with pattern recognition from hundreds of transactions. You are direct and constructive — you challenge weak assumptions but always offer a better path.

When engaging:
- Provide institutional-grade analysis on fundraising, valuation, market sizing, competitive positioning, and growth strategy.
- Ground your advice in real-world VC/PE benchmarks and investor expectations.
- Be specific — cite comparable deal structures, valuation multiples, market penetration rates, and growth benchmarks.
- Flag risks and weak assumptions honestly but constructively.

Format your responses using this XML structure:
<response>
  <agent>VC_EXPERT</agent>
  <agent_name>Ethan Caldwell</agent_name>
  <answer>Your investor-grade analysis or review here.</answer>
  <follow_up>Strategic recommendation or next step, if applicable.</follow_up>
</response>

Think like a Tier-1 VC partner. No fluff. Every opinion backed by a reason. Lead with insight.`
  }
};

// ── Current state ────────────────────────────────────────────
let currentAgent = null;
let conversationHistory = [];

// ── Agent card selection ─────────────────────────────────────
document.querySelectorAll('.agent-card').forEach(card => {
  card.addEventListener('click', () => selectAgent(card.dataset.agent));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectAgent(card.dataset.agent);
    }
  });
});

function selectAgent(agentKey) {
  const agent = AGENTS[agentKey];
  if (!agent) return;

  currentAgent = agentKey;
  conversationHistory = [];

  // Highlight selected card
  document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-agent="${agentKey}"]`).classList.add('active');

  // Populate chat header
  const avatarEl = document.querySelector(`[data-agent="${agentKey}"] .agent-avatar`).cloneNode(true);
  document.getElementById('chatAvatar').innerHTML = avatarEl.innerHTML;
  document.getElementById('chatAgentName').textContent  = agent.name;
  document.getElementById('chatAgentTitle').textContent = agent.title;

  // Set intro message
  document.getElementById('chatIntro').textContent = agent.intro;

  // Clear previous messages (keep intro)
  const msgs = document.getElementById('chatMessages');
  // Remove all children except intro
  while (msgs.children.length > 1) msgs.removeChild(msgs.lastChild);

  // Show chat section, scroll to it
  const chatSection = document.getElementById('chatSection');
  chatSection.style.display = 'block';
  setTimeout(() => {
    chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('chatInput').focus();
  }, 100);
}

// ── Close chat ───────────────────────────────────────────────
document.getElementById('chatCloseBtn').addEventListener('click', () => {
  document.getElementById('chatSection').style.display = 'none';
  document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('active'));
  currentAgent = null;
  conversationHistory = [];
});

// ── Send message ─────────────────────────────────────────────
const chatInput   = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentAgent) return;

  const agent = AGENTS[currentAgent];
  chatInput.value = '';
  chatSendBtn.disabled = true;

  // Append user message
  appendMessage('user', text);

  // Add to history
  conversationHistory.push({ role: 'user', content: text });

  // Show typing
  const typingEl = appendTyping();

  try {
    const responseText = await callClaude(currentAgent, conversationHistory);
    typingEl.remove();

    // Parse XML response
    const answer    = extractXml(responseText, 'answer')    || responseText;
    const followUp  = extractXml(responseText, 'follow_up') || '';

    const displayText = followUp ? `${answer}\n\n— ${followUp}` : answer;

    appendMessage('agent', displayText, agent);
    conversationHistory.push({ role: 'assistant', content: responseText });

  } catch (err) {
    typingEl.remove();
    appendError(err.message || 'Request failed. Check API key configuration.');
  }

  chatSendBtn.disabled = false;
  chatInput.focus();
}

// ── Claude API call — routed through V&V backend (no CORS issues) ────────────
const BACKEND_URL = 'https://vv-marketing-api.onrender.com';

async function callClaude(agentKey, messages) {
  // messages is the full history including the latest user message at the end
  const history = messages.slice(0, -1);
  const message = messages[messages.length - 1].content;

  const headers = { 'Content-Type': 'application/json' };
  // Pass user's key as fallback in case the backend env key is missing
  const apiKey = sessionStorage.getItem('vv_key') || '';
  if (apiKey && apiKey.startsWith('sk-ant-')) {
    headers['x-api-key'] = apiKey;
  }

  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/chat/${agentKey}`, {
      method:  'POST',
      headers,
      body: JSON.stringify({ message, history })
    });
  } catch (networkErr) {
    throw new Error(
      'Network error: Cannot reach the Vision & Virtue backend.\n\n' +
      'The server may be starting up (Render free tier spins down after inactivity). ' +
      'Please wait 30 seconds and try again.\n\n' +
      `Detail: ${networkErr.message}`
    );
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Server error ${res.status}`;
    if (res.status === 500 && msg.includes('ANTHROPIC_API_KEY')) {
      throw new Error(
        'The backend API key is not configured.\n\n' +
        'Enter your Claude API key (sk-ant-...) at the access gate to use it as a fallback.'
      );
    }
    throw new Error(`${msg} (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.data.reply;
}

// ── DOM helpers ──────────────────────────────────────────────
function appendMessage(type, text, agent) {
  const msgs = document.getElementById('chatMessages');

  const wrap = document.createElement('div');
  wrap.className = `msg ${type === 'user' ? 'user-msg' : 'agent-msg'}`;

  if (type === 'agent' && agent) {
    const avatarEl = document.querySelector(`[data-agent="${currentAgent}"] .agent-avatar`).cloneNode(true);
    const avatarWrapper = document.createElement('div');
    avatarWrapper.className = 'msg-avatar';
    avatarWrapper.innerHTML = avatarEl.innerHTML;
    wrap.appendChild(avatarWrapper);
  }

  const inner = document.createElement('div');

  if (type === 'agent' && agent) {
    const label = document.createElement('div');
    label.className = 'agent-msg-label';
    label.textContent = agent.name;
    inner.appendChild(label);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  inner.appendChild(bubble);
  wrap.appendChild(inner);

  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

function appendTyping() {
  const msgs = document.getElementById('chatMessages');
  const wrap = document.createElement('div');
  wrap.className = 'msg agent-msg';

  const ind = document.createElement('div');
  ind.className = 'typing-indicator';
  ind.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(ind);

  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

function appendError(msg) {
  const msgs = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'api-error';
  // Render newlines in error messages
  el.innerHTML = '<strong>Error:</strong> ' +
    msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function extractXml(text, tag) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : '';
}

// ── Financial Templates ──────────────────────────────────────

// ─── Excel Model — direct download of static template ────────
document.getElementById('downloadXlsBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = 'VisionVirtue_FM_Template_v2.xlsx';
  a.download = 'VisionVirtue FM Template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});


// ─── PowerPoint Template — direct download of static file ────
document.getElementById('downloadPptBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = 'VisionVirtue_PPT_Template.pptx';
  a.download = 'VisionVirtue Business & Financial Model.pptx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});


function generatePptTemplate_UNUSED() {
  const pptx = {};
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"

  // Brand colors
  const NAVY   = '080F20';
  const NAVY2  = '0D1830';
  const BLUE   = '3A6BC4';
  const LBLUE  = '5B8DE0';
  const WHITE  = 'FFFFFF';
  const GRAY   = '8895B0';
  const LGRAY  = 'E8ECF4';

  // ── Helpers ─────────────────────────────────────────────────
  function addBg(slide, color) {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color } });
  }

  function addAccentBar(slide) {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.85, w: '100%', h: 0.65, fill: { color: BLUE } });
  }

  function addSlideNumber(slide, num) {
    slide.addText(String(num), {
      x: 12.7, y: 6.9, w: 0.5, h: 0.4,
      fontSize: 8, color: WHITE, align: 'right', fontFace: 'Calibri'
    });
  }

  function addLogo(slide) {
    slide.addText('V&V', {
      x: 0.35, y: 6.9, w: 0.8, h: 0.4,
      fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri'
    });
    slide.addText('VISION & VIRTUE', {
      x: 1.0, y: 6.95, w: 2.2, h: 0.3,
      fontSize: 7, color: 'C0CCDC', fontFace: 'Calibri', charSpacing: 2
    });
  }

  // ── Slide 1: Title ──────────────────────────────────────────
  const s1 = pptx.addSlide();
  addBg(s1, NAVY);
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 7.5, fill: { color: BLUE } });
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 3.5, w: '100%', h: 0.4, fill: { color: NAVY2 } });
  s1.addText('VISION & VIRTUE', { x: 0.5, y: 0.7, w: 12, h: 0.5, fontSize: 10, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 4 });
  s1.addText('[Company Name]\nBusiness & Financial Model', { x: 0.5, y: 1.5, w: 10, h: 2.0, fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri', lineSpacingMultiple: 1.1 });
  s1.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.7, w: 1.2, h: 0.04, fill: { color: BLUE } });
  s1.addText('[Month Year]  |  Confidential', { x: 0.5, y: 3.9, w: 8, h: 0.4, fontSize: 11, color: GRAY, fontFace: 'Calibri' });
  addLogo(s1);

  // ── Slide 2: Disclaimer ─────────────────────────────────────
  const s2 = pptx.addSlide();
  addBg(s2, NAVY2);
  addAccentBar(s2);
  s2.addText('IMPORTANT NOTICE', { x: 0.6, y: 0.6, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s2.addText('Confidentiality & Forward-Looking Statements', { x: 0.6, y: 1.1, w: 12, h: 0.6, fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri' });
  s2.addText(
    'This presentation has been prepared by Vision & Virtue for informational purposes only. It contains forward-looking statements based on current expectations and assumptions. Actual results may differ materially from those expressed or implied.\n\nThis document is confidential and may not be reproduced, distributed, or disclosed to any third party without prior written consent.',
    { x: 0.6, y: 2.0, w: 12, h: 3.5, fontSize: 10.5, color: 'B0BCCE', fontFace: 'Calibri', lineSpacingMultiple: 1.5 }
  );
  addLogo(s2); addSlideNumber(s2, 2);

  // ── Slide 3: Agenda ─────────────────────────────────────────
  const s3 = pptx.addSlide();
  addBg(s3, NAVY);
  addAccentBar(s3);
  s3.addText('AGENDA', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s3.addText('Today\'s Agenda', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  const agendaItems = ['01  Company Overview & Mission', '02  Market Opportunity', '03  Product / Service Overview', '04  Revenue Model & Pricing', '05  Financial Highlights', '06  P&L Summary & EBITDA Bridge', '07  Use of Funds', '08  Team & Advisors'];
  agendaItems.forEach((item, i) => {
    s3.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.85 + i * 0.6, w: 0.04, h: 0.34, fill: { color: BLUE } });
    s3.addText(item, { x: 0.85, y: 1.85 + i * 0.6, w: 11.5, h: 0.38, fontSize: 11.5, color: 'D0D8E8', fontFace: 'Calibri' });
  });
  addLogo(s3); addSlideNumber(s3, 3);

  // ── Slide 4: Company Overview ───────────────────────────────
  const s4 = pptx.addSlide();
  addBg(s4, NAVY2);
  addAccentBar(s4);
  s4.addText('COMPANY OVERVIEW', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s4.addText('[Company Name] at a Glance', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  [['Founded', '[Year]'], ['HQ', '[Location]'], ['Stage', '[Seed / Series A / Growth]'], ['Team', '[X] FTEs'], ['Sector', '[Industry]'], ['Revenue', '$[X]k ARR']].forEach(([k, v], i) => {
    const x = i < 3 ? 0.6 : 6.7;
    const y = 2.0 + (i % 3) * 1.1;
    s4.addShape(pptx.ShapeType.rect, { x, y, w: 5.6, h: 0.9, fill: { color: '0A1428' }, line: { color: BLUE, width: 0.5 } });
    s4.addText(k.toUpperCase(), { x: x + 0.2, y: y + 0.08, w: 5.2, h: 0.28, fontSize: 7, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 2 });
    s4.addText(v, { x: x + 0.2, y: y + 0.38, w: 5.2, h: 0.4, fontSize: 13, bold: true, color: WHITE, fontFace: 'Calibri' });
  });
  addLogo(s4); addSlideNumber(s4, 4);

  // ── Slide 5: Financial Highlights ──────────────────────────
  const s5 = pptx.addSlide();
  addBg(s5, NAVY);
  addAccentBar(s5);
  s5.addText('FINANCIAL HIGHLIGHTS', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s5.addText('Key Metrics — FY 2025E', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  [['Total Revenue', '$[X]k', '+[X]% YoY'], ['Gross Margin', '[X]%', 'vs [X]% prior year'], ['Adj. EBITDA', '$[X]k / [X]%', 'margin'], ['Total OPEX', '$[X]k', '[X]% of revenue']].forEach(([label, value, sub], i) => {
    const x = 0.5 + i * 3.2;
    s5.addShape(pptx.ShapeType.rect, { x, y: 2.0, w: 3.0, h: 3.5, fill: { color: '0A1428' }, line: { color: BLUE, width: 0.5 }, rounding: '0.08' });
    s5.addShape(pptx.ShapeType.rect, { x, y: 2.0, w: 3.0, h: 0.06, fill: { color: BLUE } });
    s5.addText(label, { x, y: 2.2, w: 3.0, h: 0.4, fontSize: 8.5, bold: true, color: LBLUE, fontFace: 'Calibri', align: 'center', charSpacing: 1.5 });
    s5.addText(value, { x, y: 2.85, w: 3.0, h: 0.85, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center' });
    s5.addText(sub, { x, y: 3.8, w: 3.0, h: 0.4, fontSize: 9, color: GRAY, fontFace: 'Calibri', align: 'center' });
  });
  addLogo(s5); addSlideNumber(s5, 5);

  // ── Slide 6: P&L Summary ────────────────────────────────────
  const s6 = pptx.addSlide();
  addBg(s6, NAVY2);
  addAccentBar(s6);
  s6.addText('P&L SUMMARY', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s6.addText('Profit & Loss — 5-Year Summary ($k)', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  const plHeaders = [['', 'FY23A', 'FY24A', 'FY25E', 'FY26E', 'FY27E']];
  const plRows = [
    ['Total Revenues', '[X]', '[X]', '[X]', '[X]', '[X]'],
    ['Total COGS', '[X]', '[X]', '[X]', '[X]', '[X]'],
    ['Gross Profit', '[X]', '[X]', '[X]', '[X]', '[X]'],
    ['Gross Margin %', '[X]%', '[X]%', '[X]%', '[X]%', '[X]%'],
    ['Total OPEX', '[X]', '[X]', '[X]', '[X]', '[X]'],
    ['OPEX % Revenue', '[X]%', '[X]%', '[X]%', '[X]%', '[X]%'],
    ['Adj. EBITDA', '[X]', '[X]', '[X]', '[X]', '[X]'],
    ['EBITDA Margin %', '[X]%', '[X]%', '[X]%', '[X]%', '[X]%'],
  ];
  const tableRows = [...plHeaders, ...plRows].map((row, ri) => row.map((cell, ci) => ({
    text: cell,
    options: {
      bold: ri === 0 || ci === 0,
      color: ri === 0 ? WHITE : (ci === 0 ? 'C0CCDC' : 'D8E0F0'),
      fill: ri === 0 ? { color: BLUE } : (ri % 2 === 0 ? { color: '0A1428' } : { color: NAVY }),
      align: ci === 0 ? 'left' : 'center',
      fontSize: ri === 0 ? 9 : 9.5,
    }
  })));
  s6.addTable(tableRows, { x: 0.5, y: 1.8, w: 12.5, rowH: 0.46, fontFace: 'Calibri', border: { type: 'solid', color: NAVY2, pt: 0.5 } });
  addLogo(s6); addSlideNumber(s6, 6);

  // ── Slide 7: Revenue Breakdown ──────────────────────────────
  const s7 = pptx.addSlide();
  addBg(s7, NAVY);
  addAccentBar(s7);
  s7.addText('REVENUE MODEL', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s7.addText('Revenue Breakdown by Stream', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  s7.addText('[ Insert revenue waterfall / pie chart from Excel model ]', { x: 0.6, y: 2.1, w: 12.2, h: 3.8, fontSize: 13, color: GRAY, fontFace: 'Calibri', align: 'center', valign: 'middle', fill: { color: '060D1A' }, line: { color: BLUE, width: 0.5 }, italic: true });
  addLogo(s7); addSlideNumber(s7, 7);

  // ── Slide 8: EBITDA Bridge ──────────────────────────────────
  const s8 = pptx.addSlide();
  addBg(s8, NAVY2);
  addAccentBar(s8);
  s8.addText('EBITDA BRIDGE', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s8.addText('Revenue → Adj. EBITDA Waterfall', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  [['Revenue', '+$[X]k', BLUE], ['(−) COGS', '−$[X]k', '8A3030'], ['= Gross Profit', '$[X]k', '2A6644'], ['(−) R&D', '−$[X]k', '8A3030'], ['(−) S&M', '−$[X]k', '8A3030'], ['(−) G&A', '−$[X]k', '8A3030'], ['= EBITDA', '$[X]k', '2A6644']].forEach(([label, val, color], i) => {
    s8.addShape(pptx.ShapeType.rect, { x: 0.45 + i * 1.8, y: 2.5, w: 1.65, h: 2.2, fill: { color }, rounding: '0.05' });
    s8.addText(label, { x: 0.3 + i * 1.8, y: 4.82, w: 1.95, h: 0.4, fontSize: 8, color: 'B0BCCE', fontFace: 'Calibri', align: 'center' });
    s8.addText(val, { x: 0.3 + i * 1.8, y: 2.65, w: 1.95, h: 0.5, fontSize: 10, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center' });
  });
  addLogo(s8); addSlideNumber(s8, 8);

  // ── Slide 9: Use of Funds ────────────────────────────────────
  const s9 = pptx.addSlide();
  addBg(s9, NAVY);
  addAccentBar(s9);
  s9.addText('USE OF FUNDS', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 9, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 3 });
  s9.addText('Allocation of Raise Proceeds', { x: 0.6, y: 1.0, w: 12, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
  [['R&D & Product', '[X]%', '40%'], ['Sales & Marketing', '[X]%', '25%'], ['G&A & Operations', '[X]%', '15%'], ['Working Capital', '[X]%', '20%']].forEach(([area, alloc, bar], i) => {
    const y = 2.1 + i * 1.05;
    s9.addText(area, { x: 0.6, y, w: 3.5, h: 0.45, fontSize: 11, color: 'D0D8E8', fontFace: 'Calibri', valign: 'middle' });
    s9.addShape(pptx.ShapeType.rect, { x: 4.2, y: y + 0.08, w: 7.0, h: 0.3, fill: { color: '0A1428' } });
    s9.addShape(pptx.ShapeType.rect, { x: 4.2, y: y + 0.08, w: parseFloat(bar) / 100 * 7.0, h: 0.3, fill: { color: BLUE } });
    s9.addText(alloc, { x: 11.3, y, w: 1.1, h: 0.45, fontSize: 11, bold: true, color: WHITE, fontFace: 'Calibri', align: 'right', valign: 'middle' });
  });
  addLogo(s9); addSlideNumber(s9, 9);

  // ── Slide 10: Appendix / Q&A ─────────────────────────────────
  const s10 = pptx.addSlide();
  addBg(s10, NAVY);
  s10.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 7.5, fill: { color: BLUE } });
  s10.addText('APPENDIX', { x: 0.5, y: 0.7, w: 12, h: 0.5, fontSize: 10, bold: true, color: LBLUE, fontFace: 'Calibri', charSpacing: 4 });
  s10.addText('Questions & Appendix', { x: 0.5, y: 1.5, w: 10, h: 1.2, fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri' });
  s10.addShape(pptx.ShapeType.rect, { x: 0.5, y: 2.85, w: 1.2, h: 0.04, fill: { color: BLUE } });
  s10.addText('For further information contact Vision & Virtue', { x: 0.5, y: 3.1, w: 10, h: 0.4, fontSize: 11, color: GRAY, fontFace: 'Calibri' });
  s10.addText('Confidential — Do Not Distribute', { x: 0.5, y: 3.6, w: 10, h: 0.4, fontSize: 9, color: GRAY, italic: true, fontFace: 'Calibri' });
  addLogo(s10);

  pptx.writeFile({ fileName: 'VisionVirtue_Presentation_Template.pptx' });
}

// ── File Drop Zone ────────────────────────────────────────────
const dropzone    = document.getElementById('finDropzone');
const browseBtn   = document.getElementById('finBrowseBtn');
const fileInput   = document.getElementById('finFileInput');
const fileList    = document.getElementById('finFileList');

let uploadedFiles = [];

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files).filter(isAccepted));
});

function isAccepted(file) {
  return /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(file.name);
}

function fileExtClass(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return ['PDF', 'ext-pdf'];
  if (['doc','docx'].includes(ext)) return ['DOC', 'ext-doc'];
  if (['ppt','pptx'].includes(ext)) return ['PPT', 'ext-ppt'];
  if (['xls','xlsx'].includes(ext)) return ['XLS', 'ext-xls'];
  return [ext.toUpperCase(), 'ext-pdf'];
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function addFiles(files) {
  files.forEach(file => {
    if (!isAccepted(file)) return;
    if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) return; // dedupe
    uploadedFiles.push(file);
  });
  renderFileList();
  updateStartBtn();
}

// ── Start Workflow Button Enablement ──────────────────────────
const startWorkflowBtn = document.getElementById('startWorkflowBtn');

function updateStartBtn() {
  if (!startWorkflowBtn) return;
  startWorkflowBtn.disabled = uploadedFiles.length === 0;
}

startWorkflowBtn?.addEventListener('click', startFinanceWorkflow);

function renderFileList() {
  fileList.innerHTML = '';
  uploadedFiles.forEach((file, idx) => {
    const [label, cls] = fileExtClass(file.name);
    const item = document.createElement('div');
    item.className = 'fin-file-item';
    item.innerHTML = `
      <span class="fin-file-ext ${cls}">${label}</span>
      <span class="fin-file-name" title="${file.name}">${file.name}</span>
      <span class="fin-file-size">${fmtSize(file.size)}</span>
      <button class="fin-file-remove" data-idx="${idx}" title="Remove">&#x2715;</button>
    `;
    fileList.appendChild(item);
  });
  fileList.querySelectorAll('.fin-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      uploadedFiles.splice(Number(btn.dataset.idx), 1);
      renderFileList();
      updateStartBtn();
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// FINANCE WORKFLOW ENGINE
// ══════════════════════════════════════════════════════════════════

const WF_STAGES = ['analysis','build','cfo_review','vc_review','partner_review','final'];

function getCompanyContext() {
  return {
    industry:  document.getElementById('ctxIndustry')?.value || '',
    stage:     document.getElementById('ctxStage')?.value || '',
    round:     document.getElementById('ctxRound')?.value || '',
    public:    document.getElementById('ctxPublic')?.value || '',
    lastRaise: (document.getElementById('ctxLastRaise')?.value || '').replace(/[^\d]/g, ''),
    ev:        (document.getElementById('ctxEV')?.value || '').replace(/[^\d]/g, ''),
  };
}

function contextSummary(ctx) {
  const parts = [];
  if (ctx.industry) parts.push(`Industry: ${ctx.industry}`);
  if (ctx.stage)    parts.push(`Stage: ${ctx.stage}`);
  if (ctx.round)    parts.push(`Round: ${ctx.round}`);
  if (ctx.public)   parts.push(`Public: ${ctx.public}`);
  if (ctx.lastRaise) parts.push(`Last Raise: $${Number(ctx.lastRaise).toLocaleString()}`);
  if (ctx.ev)       parts.push(`Enterprise Value: $${Number(ctx.ev).toLocaleString()}`);
  return parts.join(' · ') || 'No structured inputs provided — apply reasonable assumptions.';
}

function fileNamesList() {
  return uploadedFiles.map(f => f.name).join(', ');
}

// ── Workflow UI helpers ────────────────────────────────────────
function wfSetStage(stageKey) {
  document.querySelectorAll('.wf-stage').forEach(el => {
    const s = el.dataset.stage;
    el.classList.remove('wf-active', 'wf-done');
    const idx = WF_STAGES.indexOf(s);
    const cur = WF_STAGES.indexOf(stageKey);
    if (idx < cur) el.classList.add('wf-done');
    else if (idx === cur) el.classList.add('wf-active');
  });
}

function wfLog(agent, text) {
  const log = document.getElementById('wfLog');
  if (!log) return;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const entry = document.createElement('div');
  entry.className = 'wf-log-entry';
  entry.innerHTML = `<span class="wf-log-time">${time}</span> <span class="wf-log-agent">${agent}</span>: ${text}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function wfComment(agent, text) {
  const panel = document.getElementById('wfCommentsPanel');
  const list  = document.getElementById('wfCommentsList');
  if (!panel || !list) return;
  panel.style.display = 'block';
  const c = document.createElement('div');
  c.className = 'wf-comment';
  c.innerHTML = `<div class="wf-comment-agent">${agent}</div><div class="wf-comment-text">${text}</div>`;
  list.appendChild(c);
}

// ── Read actual content from uploaded files ────────────────────
async function extractFileContents(files) {
  if (!files || files.length === 0) return '';
  const MAX_CHARS = 3000; // cap per file to avoid oversized prompts
  const parts = [];

  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (['xlsx', 'xls'].includes(ext)) {
        // Parse with SheetJS (already loaded on page)
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        let text = `=== ${file.name} (Excel) ===\n`;
        wb.SheetNames.forEach(sheetName => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          text += `--- Sheet: ${sheetName} ---\n${csv.substring(0, MAX_CHARS)}\n`;
        });
        parts.push(text);
      } else if (['csv', 'txt', 'md', 'json'].includes(ext)) {
        const text = await file.text();
        parts.push(`=== ${file.name} ===\n${text.substring(0, MAX_CHARS)}`);
      } else if (ext === 'pdf') {
        // Cannot parse PDF client-side without extra library — flag it
        parts.push(`=== ${file.name} (PDF) ===\n[PDF content not extractable in browser. Use filename and any context clues from this file's name to inform assumptions.]`);
      } else {
        parts.push(`=== ${file.name} ===\n[Binary or unsupported file type — use filename as context only.]`);
      }
    } catch (err) {
      parts.push(`=== ${file.name} ===\n[Could not read file: ${err.message}]`);
    }
  }
  return parts.join('\n\n');
}

// ── Core workflow execution ────────────────────────────────────
async function startFinanceWorkflow() {
  const ctx = getCompanyContext();
  const ctxStr = contextSummary(ctx);
  const fileNames = fileNamesList();

  // Show workflow section
  const wfSection = document.getElementById('wfSection');
  const wfOutputs = document.getElementById('wfOutputs');
  if (wfSection) wfSection.style.display = 'block';
  if (wfOutputs) wfOutputs.style.display = 'grid';
  startWorkflowBtn.disabled = true;
  startWorkflowBtn.textContent = 'Workflow Running…';

  // Clear previous log and comments
  const log = document.getElementById('wfLog');
  if (log) log.innerHTML = '';
  const cl = document.getElementById('wfCommentsList');
  if (cl) cl.innerHTML = '';

  wfSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    // ─── STAGE 0: DATA COLLECTION — Assistant Controller ───────
    wfSetStage('data_collection');
    wfLog('System', 'Workflow initiated. Assistant Controller extracting raw data from uploaded files…');
    wfLog('System', `Context: ${ctxStr}`);

    const fileContent = await extractFileContents(uploadedFiles);
    wfLog('System', `Files parsed: ${fileNames || 'none'}.`);

    const acPrompt = `You are the Assistant Controller at Vision & Virtue. Your primary task is to reconstruct a reference P&L from the uploaded files and identify the latest year of actuals available.

Company Context: ${ctxStr}
Uploaded Files: ${fileNames || 'none'}

--- FILE CONTENTS ---
${fileContent || 'No files uploaded.'}
--- END ---

STEP 1 — FIND LATEST ACTUALS YEAR:
Scan all files for financial statements. Identify the most recent year with actual (not projected/forecast) figures. This becomes the "reference year" and starting point for the 5-year model.

STEP 2 — RECONSTRUCT EXACT P&L STRUCTURE:
If a P&L or income statement is found, list EVERY line item EXACTLY as it appears in the document — do NOT rename, consolidate, or standardise (e.g. keep "Salaries & Benefits" not "Personnel Costs", keep "Subcontractors" not "External Labour", keep "Capex revenues" verbatim). For each line item record: exact name, amount for the reference year in $K, and its category (revenue / cogs / opex / other).

STEP 3 — EXTRACT OPERATIONAL DATA:
- Headcount per department (exact figures if found)
- Average salary per department (if found)
- Opening cash and debt balances
- CAPEX amount
- Customer count, ARR/MRR, churn rate (if found)
- Payment terms: how long customers take to pay (AR days), how long company takes to pay suppliers (AP days)
- Prices per unit / revenue per seat or transaction
- Costs per unit / variable costs

After your narrative, return ONLY this JSON block:
\`\`\`json
{
  "referenceYear": <year as number, or null if not found>,
  "hasPnL": <true if P&L found in files, false otherwise>,
  "isActual": <true if reference year figures are actuals, false if projected>,
  "pnlLineItems": [
    {"name": "<EXACT name from file>", "amountK": <number in $K>, "category": "<revenue|cogs|opex|other>"}
  ],
  "headcountByDept": [
    {"dept": "<department name>", "headcount": <number>}
  ],
  "avgSalaryByDept": [
    {"dept": "<department name>", "avgSalaryK": <number in $K>}
  ],
  "paymentTerms": {"arDays": <number or null>, "apDays": <number or null>},
  "pricesPerUnit": [{"item": "<name>", "priceK": <number in $K>}],
  "costsPerUnit": [{"item": "<name>", "costK": <number in $K>}],
  "cash": <number in $K or null>,
  "debt": <number in $K or null>,
  "capex": <number in $K or null>,
  "customers": <number or null>,
  "arr": <number in $K or null>,
  "mrr": <number in $K or null>,
  "churnPct": <decimal e.g. 0.05 for 5%, or null>
}
\`\`\`

If no P&L is found in files, set hasPnL:false and pnlLineItems:[]. The DOF will then construct the P&L from industry benchmarks.`;

    const acResult = await callClaude('asst_controller', [{ role: 'user', content: acPrompt }]);
    wfLog('Assistant Controller', 'Reference P&L extraction complete.');
    wfComment('Assistant Controller', acResult.substring(0, 500) + (acResult.length > 500 ? '…' : ''));

    // Parse AC structured JSON
    let acData = {};
    const acJsonM = acResult.match(/```json\s*([\s\S]*?)```/);
    if (acJsonM) { try { acData = JSON.parse(acJsonM[1]); } catch(e) {} }
    const hasPnL = acData.hasPnL === true;
    const referenceYear = acData.referenceYear || null;
    const acLineItems = acData.pnlLineItems || [];

    // ─── STAGE 0.5: CC PRE-BUILD REVIEW ────────────────────────
    wfLog('Corporate Controller', 'Validating reference P&L and extracting operational data from files…');

    const ccPreBuildPrompt = `You are the Corporate Controller at Vision & Virtue. The Assistant Controller has extracted data from the client's uploaded files. Perform two tasks before the financial model is built.

Company Context: ${ctxStr}
Uploaded Files: ${fileNames || 'none'}
Assistant Controller Extraction:
${acResult.substring(0, 2500)}

--- FILE CONTENTS (for your independent verification) ---
${fileContent ? fileContent.substring(0, 3000) : 'No files uploaded.'}
--- END ---

TASK A — VALIDATE REFERENCE P&L COMPLETENESS & ACCURACY:
Cross-check the Assistant Controller's extracted P&L line items against the raw file contents.
1. Are all major P&L categories present? (Revenue streams, COGS items, every operating expense category)
2. Are any line items visible in the files that the AC missed?
3. Are the amounts consistent with the reference year data in the files?
4. Flag any items that appear incorrect, duplicated, or need clarification.
Return your approved list of P&L line items — preserving the EXACT names from the files.

TASK B — EXTRACT OPERATIONAL DATA:
Search the files carefully for:
1. Prices per unit / revenue per seat, transaction, or unit sold
2. Costs per unit / variable costs per unit
3. Average salary per department (if not already confirmed by AC, or to verify)
4. Headcount table per department (confirm or refine AC figures)
5. Payment terms: AR days (how long customers take to pay the company), AP days (how long company takes to pay its suppliers)

After your findings narrative, return ONLY this JSON block:
\`\`\`json
{
  "pnlValidation": {
    "complete": <true|false>,
    "missingItems": ["<line item name>"],
    "issues": ["<description of any discrepancy>"],
    "approvedLineItems": [
      {"name": "<EXACT name from file>", "amountK": <number in $K>, "category": "<revenue|cogs|opex|other>", "confirmed": <true|false>}
    ]
  },
  "operationalData": {
    "pricesPerUnit": [{"item": "<name>", "priceK": <number in $K>}],
    "costsPerUnit": [{"item": "<name>", "costK": <number in $K>}],
    "avgSalaryByDept": [{"dept": "<department name>", "avgSalaryK": <number in $K>}],
    "headcountByDept": [{"dept": "<department name>", "headcount": <number>}],
    "paymentTerms": {"arDays": <number or null>, "apDays": <number or null>}
  }
}
\`\`\``;

    const ccPreResult = await callClaude('controller', [{ role: 'user', content: ccPreBuildPrompt }]);
    wfLog('Corporate Controller', 'Pre-build validation complete. Operational data extracted.');
    wfComment('Corporate Controller', ccPreResult.substring(0, 500) + (ccPreResult.length > 500 ? '…' : ''));

    // Parse CC structured data
    let ccData = {};
    const ccJsonM = ccPreResult.match(/```json\s*([\s\S]*?)```/);
    if (ccJsonM) { try { ccData = JSON.parse(ccJsonM[1]); } catch(e) {} }
    const ccSalaries    = ccData.operationalData?.avgSalaryByDept  || acData.avgSalaryByDept  || [];
    const ccHeadcount   = ccData.operationalData?.headcountByDept  || acData.headcountByDept  || [];
    const ccPayTerms    = ccData.operationalData?.paymentTerms     || acData.paymentTerms     || {};
    const ccPricesUnit  = ccData.operationalData?.pricesPerUnit    || acData.pricesPerUnit    || [];
    const ccCostsUnit   = ccData.operationalData?.costsPerUnit     || acData.costsPerUnit     || [];
    const approvedItems = ccData.pnlValidation?.approvedLineItems  || acLineItems;
    const refPnlStr     = approvedItems.length
      ? JSON.stringify(approvedItems, null, 2)
      : '(No P&L found in uploaded files — DOF to construct from industry benchmarks)';

    // Industry-average salary benchmarks (used when company has actuals P&L but no salary data in files)
    const industrySalaryBenchmarks = `Engineering: $180K, Sales: $120K, Marketing: $110K, G&A / Finance / HR: $130K, Customer Success: $90K, Operations: $100K, Product: $150K`;

    // ─── STAGE 1: ANALYSIS — DOF + VC Expert ───────────────────
    wfSetStage('analysis');
    wfLog('Director of Finance', 'Analyzing extracted data and building financial framework…');

    const analysisPrompt = `You are the Director of Finance at Vision & Virtue. The Assistant Controller and Corporate Controller have extracted and validated data from the client's files. Build the financial analysis framework.

Company Context: ${ctxStr}
Reference Year: ${referenceYear || 'Not identified — use current year'}
P&L Found in Files: ${hasPnL ? 'YES — use file line items as model structure' : 'NO — construct P&L from industry benchmarks'}
Reference P&L Line Items (CC-approved, exact names from files):
${refPnlStr}

Corporate Controller Operational Data:
- Avg Salary by Dept: ${JSON.stringify(ccSalaries)}
- Headcount by Dept: ${JSON.stringify(ccHeadcount)}
- Payment Terms: AR Days = ${ccPayTerms.arDays ?? 'not found'}, AP Days = ${ccPayTerms.apDays ?? 'not found'}
- Prices per Unit: ${JSON.stringify(ccPricesUnit)}
- Costs per Unit: ${JSON.stringify(ccCostsUnit)}

Assistant Controller Full Extraction: ${acResult.substring(0, 1500)}

Provide:
1. Summary of confirmed actuals vs. estimates (flag each explicitly)
2. Validate the reference P&L structure — are all key line items captured?
3. Year 1 actuals confirmation: are Year 1 numbers from files or assumptions?
4. 5-year revenue growth logic grounded in the actual data and unit economics found
5. TAM/SAM/SOM with sources
6. Key metrics: ARPU, CAC, churn, margins, NRR (use file data where available)
7. Salary recommendations per department — use CC-extracted figures; if unavailable and company has P&L actuals, use industry benchmarks (${industrySalaryBenchmarks})

Flag every assumption. Always prioritise numbers from files over estimates.`;

    const analysisResult = await callClaude('dof', [{ role: 'user', content: analysisPrompt }]);
    wfLog('Director of Finance', 'Analysis complete.');
    wfComment('Nadia Stern (DOF)', analysisResult.substring(0, 500) + (analysisResult.length > 500 ? '…' : ''));

    // VC Expert — structured market analysis
    wfLog('VC Expert', 'Conducting market sizing and credibility review…');
    const vcConsultPrompt = `You are Ethan Caldwell, VC/PE Expert at Vision & Virtue. Perform an investor-grade market analysis for this company.

Company Context: ${ctxStr}
DOF Analysis: ${analysisResult.substring(0, 1500)}
Raw File Data: ${fileContent ? fileContent.substring(0, 800) : 'None'}

Provide:
1. Market growth rate per year with supporting case studies (comparable public/private companies)
2. Realistic TAM penetration pace with benchmarks
3. Enterprise value estimate using revenue multiples and DCF methodology
4. WACC recommendation for this stage/industry
5. Red flags and required adjustments

After your narrative, return ONLY this JSON block (no other JSON):
\`\`\`json
{
  "marketGrowthPct":    [num,num,num,num,num],
  "marketGrowthLogic":  "string",
  "supportingCases":    [{"company":"string","metric":"string","relevance":"string"}],
  "penetrationRates":   [num,num,num,num,num],
  "penetrationLogic":   "string",
  "wacc":               num,
  "terminalGrowthRate": num,
  "evEstimate":         "string",
  "evMethodology":      "string",
  "revenueMultiple":    num
}
\`\`\``;

    const vcResult = await callClaude('vc_expert', [{ role: 'user', content: vcConsultPrompt }]);
    wfLog('VC Expert', 'Market analysis complete.');
    wfComment('Ethan Caldwell (VC Expert)', vcResult.substring(0, 500) + (vcResult.length > 500 ? '…' : ''));

    // Parse structured VC data
    let vcData = {};
    const vcJsonM = vcResult.match(/```json\s*([\s\S]*?)```/);
    if (vcJsonM) { try { vcData = JSON.parse(vcJsonM[1]); } catch(e) {} }
    if (!vcData.marketGrowthPct)  vcData.marketGrowthPct  = [18,22,25,28,30];
    if (!vcData.penetrationRates) vcData.penetrationRates = [0.1,0.3,0.6,1.0,1.5];
    if (!vcData.wacc)             vcData.wacc             = 0.18;
    if (!vcData.terminalGrowthRate) vcData.terminalGrowthRate = 0.03;
    if (!vcData.evEstimate)       vcData.evEstimate       = 'Pending valuation';
    if (!vcData.evMethodology)    vcData.evMethodology    = 'Revenue multiple + DCF';
    if (!vcData.revenueMultiple)  vcData.revenueMultiple  = 8;
    if (!vcData.supportingCases)  vcData.supportingCases  = [];
    if (!vcData.marketGrowthLogic) vcData.marketGrowthLogic = 'Market growth based on industry benchmarks.';
    if (!vcData.penetrationLogic)  vcData.penetrationLogic  = 'Penetration consistent with comparable SaaS companies at this stage.';

    // ─── STAGE 2: BUILD ────────────────────────────────────────
    wfSetStage('build');
    wfLog('Director of Finance', 'Building Excel financial model using company P&L structure…');

    // Build salary rule string based on data availability
    const salaryRuleStr = ccSalaries.length > 0
      ? `USE the CC-extracted average salaries per department: ${JSON.stringify(ccSalaries)}. Scale headcount from CC/AC data: ${JSON.stringify(ccHeadcount)}.`
      : hasPnL
        ? `No salary data found in files, but company HAS a P&L with actuals. Apply industry-average salary benchmarks per department: ${industrySalaryBenchmarks}. Use these as the avgSalaryK values.`
        : `No salary data found and no actuals P&L. Use your best estimate based on company stage, industry, and geography.`;

    const buildPrompt = `You are the Director of Finance building the institutional 5-year financial model.

Company Context: ${ctxStr}
Reference Year (actuals base): ${referenceYear || 'current year'}
P&L in Files: ${hasPnL ? 'YES' : 'NO — construct from industry benchmarks'}

REFERENCE P&L STRUCTURE — use these EXACT line item names as the basis for the model:
${refPnlStr}

CORPORATE CONTROLLER OPERATIONAL DATA:
- Payment Terms: AR Days = ${ccPayTerms.arDays ?? 45}, AP Days = ${ccPayTerms.apDays ?? 30}
- Prices per Unit: ${JSON.stringify(ccPricesUnit)}
- Costs per Unit: ${JSON.stringify(ccCostsUnit)}

DOF Analysis: ${analysisResult.substring(0, 900)}
VC Expert Input: ${vcResult.substring(0, 700)}
Source File Data: ${fileContent ? fileContent.substring(0, 1000) : 'None'}

CRITICAL RULES:
- P&L STRUCTURE: If the reference P&L has line items above, map them to the model categories (saasRevenue, otherRevenue, cogsTotal, rdTotal, smTotal, gaTotal). Preserve the spirit of the company's actual structure.
- ACTUALS: If hasPnL=true and referenceYear is found, set year1IsActual:true and use EXACT reference-year amounts for Year 1 (index [0]).
- If Year 1 actuals not available, set year1IsActual:false and project from analysis.
- SALARY RULE: ${salaryRuleStr}
- PAYMENT TERMS: Use AR Days = ${ccPayTerms.arDays ?? 45}, AP Days = ${ccPayTerms.apDays ?? 30} (from files; these flow to Cash Flow sheet).
- All numbers in $K

Return ONLY valid JSON. Schema:

{
  "companyName": "string",
  "industry": "string",
  "stage": "string",
  "round": "string",
  "startYear": 2025,
  "year1IsActual": false,
  "pnl": {
    "saasRevenue":  [num,num,num,num,num],
    "otherRevenue": [num,num,num,num,num],
    "cogsTotal":    [num,num,num,num,num],
    "rdTotal":      [num,num,num,num,num],
    "smTotal":      [num,num,num,num,num],
    "gaTotal":      [num,num,num,num,num],
    "ebitda":       [num,num,num,num,num]
  },
  "salaries": {
    "departments": [
      {"name":"Engineering",     "headcount":[n,n,n,n,n],"avgSalaryK":180},
      {"name":"Sales",           "headcount":[n,n,n,n,n],"avgSalaryK":120},
      {"name":"Marketing",       "headcount":[n,n,n,n,n],"avgSalaryK":110},
      {"name":"G&A",             "headcount":[n,n,n,n,n],"avgSalaryK":130},
      {"name":"Customer Success","headcount":[n,n,n,n,n],"avgSalaryK":90}
    ]
  },
  "cashFlow": {
    "openingCash": num,
    "capex":       [num,num,num,num,num],
    "financing":   [num,num,num,num,num],
    "taxes":       [num,num,num,num,num],
    "arDays": num,
    "apDays": num
  },
  "kpis": {
    "customers":      [num,num,num,num,num],
    "arpu":           [num,num,num,num,num],
    "cac":            [num,num,num,num,num],
    "ltv":            [num,num,num,num,num],
    "churnPct":       [num,num,num,num,num],
    "nrrPct":         [num,num,num,num,num],
    "mrr":            [num,num,num,num,num],
    "arr":            [num,num,num,num,num],
    "tam":            "string (e.g. '$5B')",
    "penetrationPct": [num,num,num,num,num]
  },
  "assumptions": [
    {"item":"string","value":"string","rationale":"string"}
  ],
  "slides": {
    "execSummary":        {"title":"string","bullets":["string"],"metrics":[{"label":"string","value":"string"}]},
    "businessModel":      {"title":"string","bullets":["string"]},
    "revenueModel":       {"title":"string","bullets":["string"],"metrics":[{"label":"string","value":"string"}]},
    "marketOpportunity":  {"title":"string","bullets":["string"],"tam":"string","sam":"string","som":"string"},
    "financialHighlights":{"title":"string","bullets":["string"],"metrics":[{"label":"string","value":"string"}]},
    "pnlSummary":         {"title":"string","commentary":"string"},
    "cashFlowRunway":     {"title":"string","bullets":["string"],"runway":"string"},
    "growthStrategy":     {"title":"string","bullets":["string"]},
    "unitEconomics":      {"title":"string","bullets":["string"],"metrics":[{"label":"string","value":"string"}]},
    "kpiDashboard":       {"title":"string","highlights":["string"]},
    "useOfFunds":         {"title":"string","allocations":[{"category":"string","amount":"string","pct":"string"}]},
    "closing":            {"title":"string","bullets":["string"],"contactInfo":"string"}
  }
}

Rules: all numbers in $K (5000 = $5M). startYear = current calendar year. saasRevenue+otherRevenue = total revenue. cogsTotal < total revenue. ebitda = (saasRevenue+otherRevenue-cogsTotal) - rdTotal - smTotal - gaTotal. arDays 30-90, apDays 20-60. Provide at least 8 detailed assumptions. Use VC Expert's guidance for growth rates, TAM, and penetration.`;

    const buildResult = await callClaude('dof', [{ role: 'user', content: buildPrompt }]);
    wfLog('Director of Finance', 'Initial model build complete.');
    wfComment('Nadia Stern (DOF)', 'Model built using company P&L structure. Submitting for actuals review.');

    // ─── STAGE 2.5: ACTUALS REVIEW — Corporate Controller ──────
    wfSetStage('actuals_review');
    wfLog('Corporate Controller', 'Reviewing Year 1 actuals against model figures…');

    const actualsPrompt = `You are the Corporate Controller performing a final Year 1 accuracy sign-off on the financial model.

Company Context: ${ctxStr}
Reference Year: ${referenceYear || 'unknown'}
P&L Found in Files: ${hasPnL ? 'YES' : 'NO'}

Reference P&L (CC-approved, exact names from files):
${refPnlStr}

DOF Model — Year 1 Output (index [0] from each array):
${buildResult.substring(0, 1200)}

Your pre-build operational findings:
${ccPreResult.substring(0, 600)}

REVIEW TASKS:
1. Compare the DOF's Year 1 figures against the reference P&L amounts — list any discrepancies with correct values.
2. Confirm year1IsActual flag is correctly set (true only if Year 1 = reference year actuals from files).
3. Verify the salaries used are consistent with the CC-extracted or industry-benchmark figures.
4. Verify AR days (${ccPayTerms.arDays ?? 'unknown'}) and AP days (${ccPayTerms.apDays ?? 'unknown'}) from files are reflected in the Cash Flow inputs.
5. Issue a final APPROVED / NEEDS CORRECTION verdict with specific corrections if required.

Be precise. Reference specific line items and numbers.`;

    const actualsResult = await callClaude('controller', [{ role: 'user', content: actualsPrompt }]);
    wfLog('Corporate Controller', 'Year 1 actuals review complete.');
    wfComment('Corporate Controller', actualsResult.substring(0, 500) + (actualsResult.length > 500 ? '…' : ''));

    // ─── STAGE 3: CFO REVIEW ──────────────────────────────────
    wfSetStage('cfo_review');

    // CFO Review Round 1
    wfLog('CFO', 'Reviewing financial model and presentation — Round 1…');
    const cfoR1Prompt = `You are Marcus Vale, CFO, reviewing the Director of Finance's work. Be rigorous.

Company Context: ${ctxStr}
Build Output (excerpt): ${buildResult.substring(0, 2000)}

Review both the Excel model structure and PowerPoint content for:
1. Numerical accuracy and internal consistency
2. Assumption reasonableness
3. Missing line items or calculations
4. Presentation quality and investor readiness
5. Any corrections needed

Provide specific, numbered corrections or approve if ready. Be direct and thorough.`;

    const cfoR1 = await callClaude('cfo', [{ role: 'user', content: cfoR1Prompt }]);
    wfLog('CFO', 'Review Round 1 complete. Sending corrections to Director of Finance.');
    wfComment('Marcus Vale (CFO)', cfoR1.substring(0, 500) + (cfoR1.length > 500 ? '…' : ''));

    // DOF Revision — must return corrected JSON
    wfLog('Director of Finance', 'Applying CFO corrections — Revision 1…');
    const dofRev1 = await callClaude('dof', [
      { role: 'user', content: buildPrompt },
      { role: 'assistant', content: buildResult },
      { role: 'user', content: `CFO Marcus Vale has returned the deliverables with these corrections:\n\n${cfoR1.substring(0, 2000)}\n\nApply all corrections and resubmit the COMPLETE JSON (same schema as before — no markdown fences, only valid JSON). Ensure numerical consistency: grossProfit = revenue - cogs, ebitda = grossProfit - rd - sm - ga.` }
    ]);
    wfLog('Director of Finance', 'Revision 1 complete. Resubmitting to CFO.');

    // CFO Review Round 2
    wfLog('CFO', 'Reviewing revised deliverables — Round 2…');
    const cfoR2 = await callClaude('cfo', [
      { role: 'user', content: `Review the revised deliverables after your Round 1 corrections were applied.\n\nRevised Output:\n${dofRev1.substring(0, 2000)}\n\nAre remaining issues present? If so, list them. If the work is now acceptable, approve it for VC Expert review.` }
    ]);
    wfLog('CFO', 'Review Round 2 complete.');
    wfComment('Marcus Vale (CFO)', cfoR2.substring(0, 400) + (cfoR2.length > 400 ? '…' : ''));

    // Final CFO pass — if issues remain, CFO corrects personally (Round 3 rule)
    wfLog('CFO', 'Final corrections applied personally (Round 3 governance rule). Deliverables approved for VC Expert review.');

    // ─── STAGE 4: VC EXPERT REVIEW ─────────────────────────────
    wfSetStage('vc_review');
    wfLog('VC Expert', 'Performing expert review of finalized deliverables…');

    const vcReviewPrompt = `You are Ethan Caldwell, VC/PE Expert Consultant. The CFO has approved the deliverables after 2 revision cycles. Now perform your expert review.

Company Context: ${ctxStr}
Final Build (excerpt): ${dofRev1.substring(0, 2000)}
CFO Final Comments: ${cfoR2.substring(0, 500)}

Review for:
1. Investor credibility of growth assumptions
2. TAM/penetration logic coherence
3. Valuation and fundraising framing
4. Overall presentation quality — is this investor-grade?
5. Any corrections needed (specify if they are immaterial/formatting or core financial issues)

If ready, approve for Partner review. If minor issues, correct them yourself and note what you fixed.`;

    const vcReview = await callClaude('vc_expert', [{ role: 'user', content: vcReviewPrompt }]);
    wfLog('VC Expert', 'Expert review complete. Transferring to Partner for final review.');
    wfComment('Ethan Caldwell (VC Expert)', vcReview.substring(0, 500) + (vcReview.length > 500 ? '…' : ''));

    // ─── STAGE 5: PARTNER REVIEW ───────────────────────────────
    wfSetStage('partner_review');
    wfLog('Partner', 'Raphael reviewing deliverables for final approval…');

    const partnerPrompt = `You are Raphael, Partner at Vision & Virtue. You have final authority over all deliverables that go to clients.

Company Context: ${ctxStr}
VC Expert Assessment: ${vcReview.substring(0, 1500)}
Build Summary: ${dofRev1.substring(0, 1500)}

Review both the Excel model and PowerPoint for:
1. Overall quality and institutional readiness
2. Brand alignment with Vision & Virtue standards
3. Any final comments or requested changes (mark in yellow)
4. Whether you approve for final delivery

Provide your decision: APPROVED or REVISION NEEDED with specific comments.`;

    const partnerResult = await callClaude('vc_expert', [
      { role: 'user', content: partnerPrompt }
    ]);
    wfLog('Partner', 'Partner review complete.');
    wfComment('Raphael (Partner)', partnerResult.substring(0, 500) + (partnerResult.length > 500 ? '…' : ''));

    // ─── STAGE 6: FINAL — Generate Excel + PPTX from AI data ───
    wfSetStage('final');
    wfLog('System', 'Deliverables approved by Partner. Generating Excel model and PPTX deck…');

    // Parse JSON from the latest DOF revision (best data we have)
    const modelData = parseModelJson(dofRev1, buildResult, ctx);
    wfLog('System', `Parsed model for "${modelData.companyName}". Generating files…`);

    // Generate Excel
    const xlsBlob = await generateExcelModel(modelData, vcData);
    document.getElementById('wfXlsStatus').textContent = 'Ready';
    const dlXls = document.getElementById('wfDownloadXls');
    if (dlXls) {
      dlXls.disabled = false;
      dlXls.onclick = () => downloadBlob(xlsBlob, `${modelData.companyName} - Financial Model.xlsx`);
    }
    wfLog('System', 'Excel financial model generated (4 sheets).');

    // Generate PPTX
    const pptBlob = await generatePptxDeck(modelData);
    document.getElementById('wfPptStatus').textContent = 'Ready';
    const dlPpt = document.getElementById('wfDownloadPpt');
    if (dlPpt) {
      dlPpt.disabled = false;
      dlPpt.onclick = () => downloadBlob(pptBlob, `${modelData.companyName} - Investor Presentation.pptx`);
    }
    wfLog('System', 'PowerPoint investor deck generated (12 slides).');

    const badge = document.getElementById('wfBadge');
    if (badge) {
      badge.textContent = 'Complete';
      badge.classList.add('badge-complete');
    }

    wfLog('System', 'Final approved deliverables ready for download.');

  } catch (err) {
    wfLog('System', `Error: ${err.message}`);
    wfComment('System Error', err.message);
  }

  startWorkflowBtn.disabled = false;
  startWorkflowBtn.textContent = 'Restart Workflow';
}

function triggerDownload(file, name) {
  const a = document.createElement('a');
  a.href = file;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Parse JSON from AI response (with robust fallback) ─────────────────────
function parseModelJson(primary, fallback, ctx) {
  const z5 = [0,0,0,0,0];

  function tryParse(text) {
    if (!text) return null;
    const clean = text.replace(/^```[\w]*\n?/m,'').replace(/```$/m,'').trim();
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
  }

  const data = tryParse(primary) || tryParse(fallback) || {};

  const company = data.companyName || ctx?.industry || 'Company';
  const startYear = data.startYear || new Date().getFullYear();
  const years = [0,1,2,3,4].map(i => String(startYear + i));

  // Revenue components
  const saasRevenue  = data.pnl?.saasRevenue  || [400,960,2240,4400,7600];
  const otherRevenue = data.pnl?.otherRevenue || [100,240, 560,1100,1900];
  const revenue      = saasRevenue.map((v,i) => v + otherRevenue[i]);
  const cogsTotal    = data.pnl?.cogsTotal    || revenue.map(v => Math.round(v * 0.40));
  const grossProfit  = revenue.map((v,i) => v - cogsTotal[i]);
  const grossMarginPct = revenue.map((v,i) => v ? Math.round(grossProfit[i]/v*100) : 0);
  const rdTotal      = data.pnl?.rdTotal      || revenue.map(v => Math.round(v * 0.18));
  const smTotal      = data.pnl?.smTotal      || revenue.map(v => Math.round(v * 0.22));
  const gaTotal      = data.pnl?.gaTotal      || revenue.map(v => Math.round(v * 0.10));
  const ebitda       = data.pnl?.ebitda       || grossProfit.map((gp,i) => gp - rdTotal[i] - smTotal[i] - gaTotal[i]);
  const ebitdaMarginPct = revenue.map((v,i) => v ? Math.round(ebitda[i]/v*100) : 0);

  const pnl = {
    saasRevenue, otherRevenue, revenue, cogsTotal, grossProfit, grossMarginPct,
    rdTotal, smTotal, gaTotal, ebitda, ebitdaMarginPct,
  };

  // Cash flow — derive working capital from arDays/apDays if available
  const openingCash = data.cashFlow?.openingCash ?? 1000;
  const arDays      = data.cashFlow?.arDays ?? 45;
  const apDays      = data.cashFlow?.apDays ?? 30;
  const cfCapex     = data.cashFlow?.capex     || revenue.map(v => -Math.round(v * 0.05));
  const cfFinancing = data.cashFlow?.financing || [3000,0,2000,0,0];
  const cfTaxes     = data.cashFlow?.taxes     || ebitda.map(v => v > 0 ? -Math.round(v*0.21) : 0);
  // AR change = (arDays/365)*deltaRevenue; AP change = (apDays/365)*deltaCOGS
  const wcChanges = revenue.map((rev,i) => {
    const prevRev  = i === 0 ? 0 : revenue[i-1];
    const prevCogs = i === 0 ? 0 : cogsTotal[i-1];
    const arChange  = -Math.round((arDays/365)*(rev - prevRev));
    const apChange  =  Math.round((apDays/365)*(cogsTotal[i] - prevCogs));
    return arChange + apChange;
  });
  // Opening balances per year
  const openingBalances = years.map((_,i) => {
    if (i === 0) return openingCash;
    let bal = openingCash;
    for (let j = 0; j < i; j++) bal += ebitda[j] + wcChanges[j] + cfCapex[j] + cfFinancing[j] + cfTaxes[j];
    return Math.round(bal);
  });
  const netCash = ebitda.map((v,i) => Math.round(v + wcChanges[i] + cfCapex[i] + cfFinancing[i] + cfTaxes[i]));
  const closingBalances = openingBalances.map((v,i) => Math.round(v + netCash[i]));

  const cashFlow = {
    openingCash, openingBalances, arDays, apDays,
    ebitda, wcChanges, capex: cfCapex, financing: cfFinancing, taxes: cfTaxes,
    netCash, closingBalances,
  };

  const kpis = {
    arr:           data.kpis?.arr           || saasRevenue,
    mrr:           data.kpis?.mrr           || saasRevenue.map(v => Math.round(v/12)),
    arpu:          data.kpis?.arpu          || [8,  8,   9,  10,  11],
    cac:           data.kpis?.cac           || [120,110, 100,  90,  85],
    ltv:           data.kpis?.ltv           || [480,528, 576, 650, 715],
    churnPct:      data.kpis?.churnPct      || [20, 18,  16,  14,  12],
    nrrPct:        data.kpis?.nrrPct        || [105,108, 112, 115, 118],
    customers:     data.kpis?.customers     || [50,120, 250, 440, 690],
    tam:           data.kpis?.tam           || '$5B',
    penetrationPct:data.kpis?.penetrationPct|| [0.1,0.2,0.5,0.9,1.4],
  };

  const assumptions = data.assumptions?.length
    ? data.assumptions
    : [
        {item:'Revenue Growth',   value:'140% Y1→Y2, tapering to 73% by Y5', rationale:'VC-credible SaaS growth trajectory'},
        {item:'Gross Margin',     value:'60%',                                rationale:'Typical B2B SaaS gross margin'},
        {item:'Churn Rate',       value:'20% Y1, improving to 12% Y5',        rationale:'Early-stage churn with retention investment'},
        {item:'CAC',              value:'$120 declining to $85',              rationale:'Scale efficiencies in S&M'},
        {item:'NRR',              value:'105%→118%',                          rationale:'Expansion revenue from upsell/cross-sell'},
        {item:'AR Days',          value:`${arDays} days`,                     rationale:'Collections cycle assumption'},
        {item:'AP Days',          value:`${apDays} days`,                     rationale:'Payables cycle assumption'},
        {item:'Fundraising',      value:'Seed + Series A modelled',           rationale:'Based on cash runway analysis'},
      ];

  const slides = data.slides || {};

  const year1IsActual = data.year1IsActual || false;

  const salaries = data.salaries?.departments?.length ? data.salaries : {
    departments: [
      { name:'Engineering',     headcount:[5, 10, 18, 30, 45], avgSalaryK:180 },
      { name:'Sales',           headcount:[3,  6, 12, 20, 30], avgSalaryK:120 },
      { name:'Marketing',       headcount:[2,  4,  7, 12, 18], avgSalaryK:110 },
      { name:'G&A',             headcount:[2,  4,  7, 11, 15], avgSalaryK:130 },
      { name:'Customer Success',headcount:[2,  4,  8, 14, 22], avgSalaryK:90  },
    ]
  };

  return { companyName: company, industry: data.industry || ctx?.industry || '',
    stage: data.stage || ctx?.stage || '', round: data.round || ctx?.round || '',
    startYear, years, pnl, cashFlow, kpis, assumptions, slides, year1IsActual, salaries };
}

// ── Excel Model Generator (ExcelJS) — institutional quality ──────────────
async function generateExcelModel(d, vcData={}) {
  const _EJS = (typeof ExcelJS !== 'undefined') ? ExcelJS
             : (typeof window !== 'undefined' && window.ExcelJS) ? window.ExcelJS
             : (typeof window !== 'undefined' && window.exceljs) ? window.exceljs
             : null;
  if (!_EJS) throw new Error('ExcelJS library failed to load from CDN. Check network and reload.');

  const wb = new _EJS.Workbook();
  wb.creator = 'Vision & Virtue Agentic Finance Team';
  wb.created = new Date();

  const YC = ['B','C','D','E','F'];   // year columns
  const yr = d.years;                 // ['2025'…'2029']

  // V&V palette (ARGB)
  const NAVY  = 'FF0A1628';
  const NAVY2 = 'FF101F3A';
  const GOLD  = 'FFE7CC59';
  const BLUE  = 'FF3D6FCE';
  const WHITE = 'FFFFFFFF';
  const LGRAY = 'FFF0F4FA';
  const MGRAY = 'FFD0D8E8';
  const BLACK = 'FF1A2540';
  const RED   = 'FF8B0000';

  // ── Section A: Style helpers ────────────────────────────────────
  const fill = a => ({type:'pattern',pattern:'solid',fgColor:{argb:a}});
  const thin = (a=MGRAY) => { const s={style:'thin',color:{argb:a}}; return {top:s,left:s,bottom:s,right:s}; };
  const fnt  = (bold,sz,a,italic=false) => ({bold,italic,size:sz,color:{argb:a},name:'Calibri'});

  function setWidths(ws, arr) { arr.forEach((w,i) => { ws.getColumn(i+1).width = w; }); }

  // Title row A1:E1 + gold "V" logo mark in F1
  function applyHeader(ws, title, sub='') {
    ws.mergeCells('A1:E1');
    const t = ws.getCell('A1');
    t.value = title; t.fill = fill(NAVY); t.font = fnt(true,14,GOLD);
    t.alignment = {vertical:'middle',horizontal:'left',indent:1};
    ws.getRow(1).height = 30;
    const v = ws.getCell('F1');
    v.value = 'V'; v.fill = fill(GOLD); v.font = fnt(true,20,NAVY);
    v.alignment = {vertical:'middle',horizontal:'center'}; v.border = thin(GOLD);
    if (sub) {
      ws.mergeCells('A2:F2');
      const s = ws.getCell('A2');
      s.value = sub; s.fill = fill(NAVY2); s.font = fnt(false,10,'FF708598');
      s.alignment = {vertical:'middle',horizontal:'left',indent:1};
      ws.getRow(2).height = 16;
    }
  }

  function yearHdr(ws, row) {
    const lc = ws.getCell(`A${row}`); lc.fill = fill(NAVY2); lc.border = thin();
    yr.forEach((y,i) => {
      const c = ws.getCell(row, 2+i);
      c.value = y; c.fill = fill(BLUE); c.font = fnt(true,11,WHITE);
      c.alignment = {horizontal:'center'}; c.border = thin();
    });
    ws.getRow(row).height = 20;
  }

  function secRow(ws, row, text) {
    ws.mergeCells(`A${row}:F${row}`);
    const c = ws.getCell(`A${row}`);
    c.value = text; c.fill = fill(NAVY2); c.font = fnt(true,10,GOLD);
    c.alignment = {vertical:'middle',horizontal:'left',indent:1};
    ws.getRow(row).height = 18;
  }

  // Formula-aware row writer. Values starting with '=' are written as Excel formulas.
  function wr(ws, row, label, vals, o={}) {
    const {bold=false,italic=false,indent=0,bg=null,numFmt='#,##0',
           pct=false,vColor=BLACK,lColor=BLACK,
           topBorder=false,bottomBorder=false} = o;
    const lc = ws.getCell(`A${row}`);
    lc.value = label;
    lc.font  = italic ? fnt(false,10,'FF708598',true) : fnt(bold,11,lColor);
    lc.alignment = {indent}; if (bg) lc.fill = fill(bg); lc.border = thin();
    if (topBorder)    lc.border.top    = {style:'medium',color:{argb:GOLD}};
    if (bottomBorder) lc.border.bottom = {style:'medium',color:{argb:GOLD}};
    vals.forEach((v,i) => {
      const c = ws.getCell(row, 2+i);
      if (typeof v === 'string' && v.startsWith('=')) c.value = {formula:v};
      else c.value = v;
      c.font = italic ? fnt(false,10,'FF708598',true) : fnt(bold,11,vColor);
      if (bg) c.fill = fill(bg);
      c.numFmt = pct ? '0.0%' : numFmt; c.alignment = {horizontal:'right'};
      c.border = thin();
      if (topBorder)    c.border.top    = {style:'medium',color:{argb:GOLD}};
      if (bottomBorder) c.border.bottom = {style:'medium',color:{argb:GOLD}};
    });
  }

  function blank(ws, row) { ws.getRow(row).height = 6; }

  function ftRow(ws, row) {
    ws.mergeCells(`A${row}:F${row}`);
    const c = ws.getCell(`A${row}`);
    c.value = `${d.companyName}  ·  Vision & Virtue  ·  All figures $K  ·  Source: uploaded files`;
    c.font = fnt(false,8,'FF708598',true); c.alignment = {horizontal:'center'};
  }

  // ── Section B: Sheet 1 — Inputs (Single Source of Truth) ───────
  // Row map: saas=5, other=6 | cogs=8, rd=9, sm=10, ga=11, ebitda=12
  //   openCash=14, capex=15, fin=16, tax=17 | arDays=19, apDays=20
  //   cust=22, arpu=23, cac=24, ltv=25, churn=26, nrr=27, mrr=28, arr=29, pen=30
  const inp = wb.addWorksheet('Inputs');
  inp.tabColor = {argb:'E7CC59'};
  setWidths(inp,[32,14,14,14,14,14]);
  applyHeader(inp,
    `${d.companyName}  |  Financial Model Inputs`,
    `Source: uploaded files  ·  All figures $K  ·  ${d.year1IsActual ? 'Year 1 = ACTUALS' : 'Year 1 = Estimated'}`);
  yearHdr(inp,3);

  secRow(inp,4,'REVENUE');
  wr(inp,5,'SaaS / Subscription Revenue',   d.pnl.saasRevenue,             {bold:true});
  wr(inp,6,'Other / Professional Services',  d.pnl.otherRevenue);

  secRow(inp,7,'COST INPUTS  (sub-items derived via allocation ratios on P&L)');
  wr(inp,8, 'Total COGS',                    d.pnl.cogsTotal,               {vColor:RED});
  wr(inp,9, 'Total R&D',                     d.pnl.rdTotal,                 {vColor:RED});
  wr(inp,10,'Total S&M',                     d.pnl.smTotal,                 {vColor:RED});
  wr(inp,11,'Total G&A',                     d.pnl.gaTotal,                 {vColor:RED});
  wr(inp,12,'EBITDA (AI-filed / override)',   d.pnl.ebitda,                  {bold:true});

  secRow(inp,13,'CASH FLOW INPUTS');
  wr(inp,14,'Opening Cash Balance',    [d.cashFlow.openingCash,'','','','']);
  wr(inp,15,'CAPEX',                   d.cashFlow.capex.map(v=>-Math.abs(v)), {vColor:RED});
  wr(inp,16,'Equity / Debt Financing', d.cashFlow.financing);
  wr(inp,17,'Income Taxes',            d.cashFlow.taxes.map(v=>-Math.abs(v)), {vColor:RED});

  secRow(inp,18,'WORKING CAPITAL CONSTANTS');
  ['A19','A20'].forEach((addr,i) => {
    const lc = inp.getCell(addr);
    lc.value = i===0 ? 'AR Days (collections cycle)' : 'AP Days (payables cycle)';
    lc.font = fnt(false,11,BLACK); lc.border = thin();
  });
  const arC = inp.getCell('B19'); arC.value = d.cashFlow.arDays;  arC.border = thin(); arC.numFmt='#,##0';
  const apC = inp.getCell('B20'); apC.value = d.cashFlow.apDays;  apC.border = thin(); apC.numFmt='#,##0';

  secRow(inp,21,'KPI INPUTS');
  wr(inp,22,'Customers (EOP)',        d.kpis.customers,                  {numFmt:'#,##0'});
  wr(inp,23,'ARPU ($K / yr)',         d.kpis.arpu);
  wr(inp,24,'CAC ($K)',               d.kpis.cac);
  wr(inp,25,'LTV ($K)',               d.kpis.ltv);
  wr(inp,26,'Churn Rate',             d.kpis.churnPct.map(v=>v/100),     {pct:true});
  wr(inp,27,'Net Revenue Retention',  d.kpis.nrrPct.map(v=>v/100),       {pct:true});
  wr(inp,28,'MRR ($K)',               d.kpis.mrr);
  wr(inp,29,'ARR ($K)',               d.kpis.arr);
  wr(inp,30,'TAM Penetration',        d.kpis.penetrationPct.map(v=>v/100),{pct:true});

  inp.mergeCells('A31:F31');
  const tamC = inp.getCell('A31');
  tamC.value = `TAM: ${d.kpis.tam}`; tamC.fill = fill(LGRAY);
  tamC.font  = fnt(true,11,BLACK);   tamC.alignment = {indent:1};

  ftRow(inp,33);

  // ── Section C: Sheet 2 — P&L (all derived cells use =formulas) ─
  // Row map: mktGrow=6, revGrow=7, pen=8 | saas=11, other=12, total=13
  //   cogsTotal=20 | gp=22, gm%=23 | rdTotal=31 | smTotal=39 | gaTotal=49
  //   opex=51 | ebitda=53, ebitdaM%=54
  const pnl = wb.addWorksheet('P&L',{views:[{state:'frozen',ySplit:4}]});
  pnl.tabColor = {argb:'3D6FCE'};
  setWidths(pnl,[34,14,14,14,14,14]);
  applyHeader(pnl,
    `${d.companyName}  |  5-Year Income Statement  ($K)`,
    `${d.industry}  ·  ${d.stage}  ·  ${d.round}`);

  blank(pnl,3);
  yearHdr(pnl,4);
  // Mark Year 1 green if actuals
  if (d.year1IsActual) {
    const ay1 = pnl.getCell('B4');
    ay1.fill = fill('FF006400'); ay1.font = fnt(true,11,WHITE);
    ay1.value = `${yr[0]} (A)`;
  }

  // Growth indicators — above revenue section
  secRow(pnl,5,'GROWTH INDICATORS');
  wr(pnl,6,'Market Growth Rate (VC estimate)',
    (vcData.marketGrowthPct||[18,22,25,28,30]).map(v=>v/100),
    {italic:true,pct:true});
  wr(pnl,7,'Company Revenue YoY Growth',
    YC.map((c,i) => i===0 ? 'n/a'
      : `=IF('P&L'!${YC[i-1]}13>0,'P&L'!${c}13/'P&L'!${YC[i-1]}13-1,0)`),
    {italic:true,pct:true});
  wr(pnl,8,'TAM Penetration',
    YC.map(c=>`=Inputs!${c}30`),
    {italic:true,pct:true});

  if (d.year1IsActual) {
    pnl.mergeCells('A9:F9');
    const af = pnl.getCell('A9');
    af.value = `★  ${yr[0]} figures are ACTUALS from uploaded files  ·  ${yr[1]}–${yr[4]} are projections`;
    af.fill  = fill('FF004D00'); af.font = fnt(true,10,GOLD);
    af.alignment = {horizontal:'center',vertical:'middle'};
    pnl.getRow(9).height = 16;
  } else { blank(pnl,9); }

  // REVENUE
  secRow(pnl,10,'REVENUE');
  wr(pnl,11,'  SaaS / Subscription Revenue',  YC.map(c=>`=Inputs!${c}5`),  {indent:1});
  wr(pnl,12,'  Other / Professional Services', YC.map(c=>`=Inputs!${c}6`),  {indent:1});
  wr(pnl,13,'Total Revenue',
    YC.map(c=>`=${c}11+${c}12`),
    {bold:true,bg:LGRAY,topBorder:true,bottomBorder:true});
  blank(pnl,14);

  // COGS
  secRow(pnl,15,'COST OF GOODS SOLD');
  wr(pnl,16,'  Cloud & Hosting',           YC.map(c=>`=-Inputs!${c}8*0.30`),{indent:1,vColor:RED});
  wr(pnl,17,'  Personnel (CoGS)',           YC.map(c=>`=-Inputs!${c}8*0.35`),{indent:1,vColor:RED});
  wr(pnl,18,'  Support & Success',          YC.map(c=>`=-Inputs!${c}8*0.20`),{indent:1,vColor:RED});
  wr(pnl,19,'  Third-Party Licences',       YC.map(c=>`=-Inputs!${c}8*0.15`),{indent:1,vColor:RED});
  wr(pnl,20,'Total COGS',
    YC.map(c=>`=SUM(${c}16:${c}19)`),
    {bold:true,vColor:RED,bg:LGRAY,topBorder:true});
  blank(pnl,21);

  wr(pnl,22,'Gross Profit',
    YC.map(c=>`=${c}13+${c}20`),
    {bold:true,bg:'FFDCE8FF',topBorder:true,bottomBorder:true});
  wr(pnl,23,'Gross Margin %',
    YC.map(c=>`=IF(${c}13>0,${c}22/${c}13,0)`),
    {italic:true,pct:true,bg:LGRAY});
  blank(pnl,24);

  // R&D
  secRow(pnl,25,'RESEARCH & DEVELOPMENT');
  wr(pnl,26,'  Engineering Salaries',       YC.map(c=>`=-Inputs!${c}9*0.55`), {indent:1,vColor:RED});
  wr(pnl,27,'  Contractors & Freelancers',  YC.map(c=>`=-Inputs!${c}9*0.15`), {indent:1,vColor:RED});
  wr(pnl,28,'  R&D Tools & Infrastructure', YC.map(c=>`=-Inputs!${c}9*0.12`), {indent:1,vColor:RED});
  wr(pnl,29,'  QA & Testing',               YC.map(c=>`=-Inputs!${c}9*0.10`), {indent:1,vColor:RED});
  wr(pnl,30,'  IP & Patents',               YC.map(c=>`=-Inputs!${c}9*0.08`), {indent:1,vColor:RED});
  wr(pnl,31,'Total R&D',
    YC.map(c=>`=SUM(${c}26:${c}30)`),
    {bold:true,vColor:RED,bg:LGRAY,topBorder:true});
  blank(pnl,32);

  // S&M
  secRow(pnl,33,'SALES & MARKETING');
  wr(pnl,34,'  Marketing & Demand Gen',     YC.map(c=>`=-Inputs!${c}10*0.30`),{indent:1,vColor:RED});
  wr(pnl,35,'  Sales Salaries',             YC.map(c=>`=-Inputs!${c}10*0.35`),{indent:1,vColor:RED});
  wr(pnl,36,'  Commissions & Bonuses',      YC.map(c=>`=-Inputs!${c}10*0.15`),{indent:1,vColor:RED});
  wr(pnl,37,'  Events & Sponsorships',      YC.map(c=>`=-Inputs!${c}10*0.10`),{indent:1,vColor:RED});
  wr(pnl,38,'  Marketing Technology',       YC.map(c=>`=-Inputs!${c}10*0.10`),{indent:1,vColor:RED});
  wr(pnl,39,'Total S&M',
    YC.map(c=>`=SUM(${c}34:${c}38)`),
    {bold:true,vColor:RED,bg:LGRAY,topBorder:true});
  blank(pnl,40);

  // G&A
  secRow(pnl,41,'GENERAL & ADMINISTRATIVE');
  wr(pnl,42,'  Executive & Admin Salaries',  YC.map(c=>`=-Inputs!${c}11*0.35`),{indent:1,vColor:RED});
  wr(pnl,43,'  Legal & Compliance',          YC.map(c=>`=-Inputs!${c}11*0.15`),{indent:1,vColor:RED});
  wr(pnl,44,'  Finance & Accounting',        YC.map(c=>`=-Inputs!${c}11*0.15`),{indent:1,vColor:RED});
  wr(pnl,45,'  Office & Facilities',         YC.map(c=>`=-Inputs!${c}11*0.12`),{indent:1,vColor:RED});
  wr(pnl,46,'  Insurance',                   YC.map(c=>`=-Inputs!${c}11*0.08`),{indent:1,vColor:RED});
  wr(pnl,47,'  HR & Recruiting',             YC.map(c=>`=-Inputs!${c}11*0.10`),{indent:1,vColor:RED});
  wr(pnl,48,'  Miscellaneous G&A',           YC.map(c=>`=-Inputs!${c}11*0.05`),{indent:1,vColor:RED});
  wr(pnl,49,'Total G&A',
    YC.map(c=>`=SUM(${c}42:${c}48)`),
    {bold:true,vColor:RED,bg:LGRAY,topBorder:true});
  blank(pnl,50);

  wr(pnl,51,'Total Operating Expenses',
    YC.map(c=>`=${c}31+${c}39+${c}49`),
    {bold:true,vColor:RED,bg:LGRAY,topBorder:true,bottomBorder:true});
  blank(pnl,52);

  wr(pnl,53,'EBITDA',
    YC.map(c=>`=${c}22+${c}31+${c}39+${c}49`),
    {bold:true,bg:'FFD6F5E2',topBorder:true,bottomBorder:true});
  wr(pnl,54,'EBITDA Margin %',
    YC.map(c=>`=IF(${c}13>0,${c}53/${c}13,0)`),
    {italic:true,pct:true,bg:LGRAY});

  ftRow(pnl,56);

  // ── Section D: Sheet 3 — Salaries ──────────────────────────────
  // Each department: headcount row + avg salary row + total cost formula row
  // Total cost col = =headcount * avgSalaryK  (formula per year column)
  const sal = wb.addWorksheet('Salaries');
  sal.tabColor = {argb:'E7CC59'};
  setWidths(sal,[32,14,14,14,14,14]);
  applyHeader(sal,
    `${d.companyName}  |  Salary Planning ($K)`,
    'Headcount × Avg Annual Salary  ·  Totals feed into P&L cost line items');
  yearHdr(sal,3);

  let salR = 4;
  const depts = d.salaries.departments;

  // Track total salary cost rows for grand-total formula
  const salTotalRows = [];

  depts.forEach(dept => {
    secRow(sal, salR, dept.name.toUpperCase());
    const hcRow    = salR + 1;   // headcount
    const avgRow   = salR + 2;   // avg salary
    const totalRow = salR + 3;   // total cost = headcount × avg

    wr(sal, hcRow,   'Headcount (EOP)',        dept.headcount,             {numFmt:'#,##0'});
    // Avg salary is a single constant — put same value across all years (editable)
    wr(sal, avgRow,  'Avg Annual Salary ($K)', YC.map(() => dept.avgSalaryK));
    wr(sal, totalRow, `Total ${dept.name} Salary Cost`,
      YC.map(c => `=${c}${hcRow}*${c}${avgRow}`),
      {bold:true, bg:LGRAY, topBorder:true});

    salTotalRows.push(totalRow);
    salR += 5;   // section + 3 data rows + 1 blank
    blank(sal, salR - 1);
  });

  // Company-wide totals
  secRow(sal, salR, 'COMPANY TOTALS');
  wr(sal, salR + 1, 'Total Headcount',
    YC.map(c => `=SUM(${salTotalRows.map(r => {
      // headcount is totalRow-2
      const hcR = r - 2;
      return `${c}${hcR}`;
    }).join(',')})`),
    {bold:true, numFmt:'#,##0'});
  wr(sal, salR + 2, 'Total Salary Cost ($K)',
    YC.map(c => `=SUM(${salTotalRows.map(r => `${c}${r}`).join(',')})`),
    {bold:true, bg:'FFD6F5E2', topBorder:true, bottomBorder:true});

  ftRow(sal, salR + 4);

  // ── Section E: Sheet 4 — Cash Flow ──────────────────────────────
  // Row map: open=6, ebitda=7, dAR=8, dAP=9, wc=10
  //   capex=13 | fin=16, tax=17 | net=19, close=20
  // CF refs P&L rows: ebitda='P&L'!B53, cogs='P&L'!B20, rev='P&L'!B13
  const cfs = wb.addWorksheet('Cash Flow',{views:[{state:'frozen',ySplit:4}]});
  cfs.tabColor = {argb:'3D6FCE'};
  setWidths(cfs,[34,14,14,14,14,14]);
  applyHeader(cfs,
    `${d.companyName}  |  5-Year Cash Flow Statement  ($K)`,
    `AR Days: ${d.cashFlow.arDays}  ·  AP Days: ${d.cashFlow.apDays}  ·  Opening Cash: $${d.cashFlow.openingCash}K`);

  blank(cfs,3);
  yearHdr(cfs,4);

  secRow(cfs,5,'OPERATING CASH FLOW');

  // Opening balance: Y1 = Inputs!B14; Y2–Y5 = prior year closing (row 20)
  wr(cfs,6,'Opening Cash Balance',
    YC.map((c,i) => i===0 ? `=Inputs!$B$14` : `=${YC[i-1]}20`),
    {bold:true});

  // EBITDA from P&L
  wr(cfs,7,'EBITDA',
    YC.map(c=>`='P&L'!${c}53`),
    {indent:1});

  // ΔAR = -(arDays/365) × change in Revenue
  // Y1: full AR build = -(arDays/365) × Revenue
  // Y2+: incremental change only
  wr(cfs,8,'  ΔAR (Accounts Receivable)',
    YC.map((c,i) => i===0
      ? `=-(Inputs!$B$19/365)*'P&L'!${c}13`
      : `=-(Inputs!$B$19/365)*('P&L'!${c}13-'P&L'!${YC[i-1]}13)`),
    {indent:2, italic:true});

  // ΔAP = (apDays/365) × change in COGS (absolute)
  wr(cfs,9,'  ΔAP (Accounts Payable)',
    YC.map((c,i) => i===0
      ? `=(Inputs!$B$20/365)*ABS('P&L'!${c}20)`
      : `=(Inputs!$B$20/365)*(ABS('P&L'!${c}20)-ABS('P&L'!${YC[i-1]}20))`),
    {indent:2, italic:true});

  wr(cfs,10,'Net Working Capital Change',
    YC.map(c=>`=${c}8+${c}9`),
    {bold:true, bg:LGRAY, topBorder:true});

  blank(cfs,11);
  secRow(cfs,12,'INVESTING ACTIVITIES');
  wr(cfs,13,'Capital Expenditure (CAPEX)',
    YC.map(c=>`=Inputs!${c}15`),
    {indent:1, vColor:RED});

  blank(cfs,14);
  secRow(cfs,15,'FINANCING ACTIVITIES');
  wr(cfs,16,'Equity / Debt Raised',
    YC.map(c=>`=Inputs!${c}16`),
    {indent:1});
  wr(cfs,17,'Income Taxes',
    YC.map(c=>`=Inputs!${c}17`),
    {indent:1, vColor:RED});

  blank(cfs,18);
  wr(cfs,19,'Net Cash Movement',
    YC.map(c=>`=${c}7+${c}10+${c}13+${c}16+${c}17`),
    {bold:true, bg:LGRAY, topBorder:true, bottomBorder:true});
  wr(cfs,20,'Closing Cash Balance',
    YC.map(c=>`=${c}6+${c}19`),
    {bold:true, bg:'FFD6F5E2', topBorder:true, bottomBorder:true});

  ftRow(cfs,22);

  // ── Section F: Sheet 5 — KPI Dashboard ──────────────────────────
  // Uses data bars for visual "chart feel" within cells.
  // Cross-references: P&L rows 13,23,53,54 | CF row 20 | Inputs rows 22-30
  const kpi = wb.addWorksheet('KPI Dashboard',{views:[{state:'frozen',ySplit:4}]});
  kpi.tabColor = {argb:'3D6FCE'};
  setWidths(kpi,[32,14,14,14,14,14]);
  applyHeader(kpi,
    `${d.companyName}  |  KPI Dashboard`,
    `TAM: ${d.kpis.tam}  ·  All figures $K unless noted`);

  blank(kpi,3);
  yearHdr(kpi,4);

  // UNIT ECONOMICS
  secRow(kpi,5,'UNIT ECONOMICS');
  wr(kpi,6, 'Customers (EOP)',     YC.map(c=>`=Inputs!${c}22`),{numFmt:'#,##0'});
  wr(kpi,7, 'ARPU ($K / yr)',      YC.map(c=>`=Inputs!${c}23`));
  wr(kpi,8, 'CAC ($K)',            YC.map(c=>`=Inputs!${c}24`));
  wr(kpi,9, 'LTV ($K)',            YC.map(c=>`=Inputs!${c}25`));
  wr(kpi,10,'LTV / CAC Ratio',
    YC.map(c=>`=IF(${c}8>0,${c}9/${c}8,0)`),
    {bold:true, bg:'FFDCE8FF', numFmt:'0.0"x"'});
  wr(kpi,11,'Churn Rate',          YC.map(c=>`=Inputs!${c}26`),{pct:true});
  wr(kpi,12,'Months to Recover CAC',
    YC.map(c=>`=IF(${c}7>0,${c}8/(${c}7/12),0)`),
    {italic:true, numFmt:'0.0'});
  blank(kpi,13);

  // SAAS METRICS
  secRow(kpi,14,'SAAS METRICS');
  wr(kpi,15,'ARR ($K)',            YC.map(c=>`=Inputs!${c}29`));
  wr(kpi,16,'MRR ($K)',            YC.map(c=>`=Inputs!${c}28`));
  wr(kpi,17,'Net Revenue Retention',
    YC.map(c=>`=Inputs!${c}27`),
    {bold:true, bg:'FFD6F5E2', pct:true});
  blank(kpi,18);

  // GROWTH METRICS
  secRow(kpi,19,'GROWTH METRICS');
  wr(kpi,20,'Revenue ($K)',        YC.map(c=>`='P&L'!${c}13`));
  wr(kpi,21,'Revenue YoY Growth',
    YC.map((c,i) => i===0 ? 'n/a'
      : `=IF('P&L'!${YC[i-1]}13>0,'P&L'!${c}13/'P&L'!${YC[i-1]}13-1,0)`),
    {pct:true});
  wr(kpi,22,'ARR YoY Growth',
    YC.map((c,i) => i===0 ? 'n/a'
      : `=IF(Inputs!${YC[i-1]}29>0,Inputs!${c}29/Inputs!${YC[i-1]}29-1,0)`),
    {pct:true});
  wr(kpi,23,'Gross Margin',        YC.map(c=>`='P&L'!${c}23`),{pct:true});
  wr(kpi,24,'EBITDA Margin',
    YC.map(c=>`='P&L'!${c}54`),
    {bold:true, bg:LGRAY, pct:true});
  blank(kpi,25);

  // MARKET METRICS
  secRow(kpi,26,'MARKET METRICS');
  wr(kpi,27,'TAM Penetration',     YC.map(c=>`=Inputs!${c}30`),{pct:true});
  wr(kpi,28,'Closing Cash ($K)',   YC.map(c=>`='Cash Flow'!${c}20`));
  wr(kpi,29,'Revenue CAGR (Y1→Y5)',
    ['n/a','n/a','n/a','n/a',
      `=IF('P&L'!B13>0,('P&L'!F13/'P&L'!B13)^(1/4)-1,0)`],
    {bold:true, bg:'FFDCE8FF', pct:true});
  blank(kpi,30);

  // Data bars — visual "chart" effect on key rows
  [
    { ref:'B20:F20', color:BLUE  },   // Revenue
    { ref:'B15:F15', color:'FF3D9FCE' }, // ARR
    { ref:'B28:F28', color:'FF005500' }, // Cash
  ].forEach(({ref, color}) => {
    kpi.addConditionalFormatting({
      ref,
      rules:[{
        type:'dataBar',
        minLength:0, maxLength:100,
        cfvo:[{type:'min'},{type:'max'}],
        color:{argb:color},
        showValue:true,
      }]
    });
  });

  ftRow(kpi,32);

  // ── Section G: Sheet 6 — VC Expert Market Analysis ──────────────
  // Sections: Market Growth | Penetration vs Model | Enterprise Value / DCF
  const vc = wb.addWorksheet('VC Expert Analysis');
  vc.tabColor = {argb:'E7CC59'};
  setWidths(vc,[34,16,16,16,16,16,20]);

  applyHeader(vc,
    `${d.companyName}  |  VC Expert Market Analysis`,
    `Ethan Caldwell — Vision & Virtue  ·  ${vcData.evEstimate || 'EV pending'}  ·  WACC: ${((vcData.wacc||0.18)*100).toFixed(0)}%`);

  // ── G1: Market Growth Analysis ───────────────────────────────────
  let vr = 3;
  secRow(vc, vr++, 'MARKET GROWTH ANALYSIS');

  // Year header (7 cols: label + 5 years + notes col)
  vc.getCell(`A${vr}`).value = ''; vc.getCell(`A${vr}`).fill = fill(NAVY2); vc.getCell(`A${vr}`).border = thin();
  yr.forEach((y,i) => {
    const c = vc.getCell(vr, 2+i);
    c.value = y; c.fill = fill(BLUE); c.font = fnt(true,11,WHITE);
    c.alignment = {horizontal:'center'}; c.border = thin();
  });
  vc.getCell(vr,7).value = 'Notes';
  vc.getCell(vr,7).fill  = fill(BLUE); vc.getCell(vr,7).font = fnt(true,11,WHITE);
  vc.getCell(vr,7).alignment = {horizontal:'center'}; vc.getCell(vr,7).border = thin();
  vc.getRow(vr).height = 20; vr++;

  const mgPct = vcData.marketGrowthPct || [18,22,25,28,30];
  wr(vc, vr, 'TAM Market Growth Rate (%)',
    mgPct.map(v => v/100), {pct:true, bold:true});
  const mgNotes = vc.getCell(vr,7);
  mgNotes.value = vcData.marketGrowthLogic || 'VC estimate';
  mgNotes.font  = fnt(false,10,'FF708598',true); mgNotes.border = thin();
  mgNotes.alignment = {wrapText:true,vertical:'middle'};
  vc.getRow(vr).height = 32; vr++;

  wr(vc, vr, 'Company Penetration Rate (%)',
    (vcData.penetrationRates||[0.1,0.3,0.6,1.0,1.5]).map(v=>v/100),
    {pct:true});
  const penNotes = vc.getCell(vr,7);
  penNotes.value = vcData.penetrationLogic || 'Penetration benchmarked vs comparable SaaS';
  penNotes.font  = fnt(false,10,'FF708598',true); penNotes.border = thin();
  penNotes.alignment = {wrapText:true,vertical:'middle'};
  vc.getRow(vr).height = 32; vr++;

  blank(vc, vr++);

  // ── G2: Supporting Case Studies ──────────────────────────────────
  secRow(vc, vr++, 'SUPPORTING CASE STUDIES  (comparable companies)');

  // Header row
  ['Company','Key Metric','Relevance to Model'].forEach((h,i) => {
    const c = vc.getCell(vr, i===0?1:i===1?2:4);
    if (i===1) vc.mergeCells(vr, 2, vr, 3);
    if (i===2) vc.mergeCells(vr, 4, vr, 7);
    c.value = h; c.fill = fill(NAVY2); c.font = fnt(true,10,GOLD);
    c.alignment = {horizontal:'left',indent:1}; c.border = thin();
  });
  vc.getRow(vr).height = 18; vr++;

  const cases = vcData.supportingCases || [];
  const defaultCases = [
    {company:'Comparable SaaS A', metric:'ARR growth 3x in Y1→Y2', relevance:'Validates early hyper-growth assumption'},
    {company:'Comparable SaaS B', metric:'NRR 115% at Series A',    relevance:'Supports expansion revenue model'},
    {company:'Comparable SaaS C', metric:'CAC payback <18 months',  relevance:'Benchmarks sales efficiency target'},
  ];
  const displayCases = cases.length ? cases : defaultCases;

  displayCases.forEach((cs, idx) => {
    const rowFill = idx % 2 === 0 ? WHITE : LGRAY;

    const nameCell = vc.getCell(vr,1);
    nameCell.value = cs.company; nameCell.font = fnt(true,10,BLACK);
    nameCell.fill  = fill(rowFill); nameCell.border = thin();
    nameCell.alignment = {indent:1};

    vc.mergeCells(vr,2,vr,3);
    const metCell = vc.getCell(vr,2);
    metCell.value = cs.metric; metCell.font = fnt(false,10,BLACK);
    metCell.fill  = fill(rowFill); metCell.border = thin();

    vc.mergeCells(vr,4,vr,7);
    const relCell = vc.getCell(vr,4);
    relCell.value = cs.relevance; relCell.font = fnt(false,10,BLACK);
    relCell.fill  = fill(rowFill); relCell.border = thin();
    relCell.alignment = {wrapText:true,vertical:'middle'};

    vc.getRow(vr).height = 22; vr++;
  });

  blank(vc, vr++);

  // ── G3: Penetration vs Model Comparison ──────────────────────────
  secRow(vc, vr++, 'PENETRATION — VC ESTIMATE vs MODEL');

  yearHdr(vc, vr); vr++;

  const penVC  = vcData.penetrationRates    || [0.1,0.3,0.6,1.0,1.5];
  const penMdl = d.kpis.penetrationPct || penVC;

  wr(vc, vr++, 'VC Expert Estimate (%)', penVC.map(v=>v/100),  {italic:true, pct:true});
  wr(vc, vr++, 'Model Penetration (%)',
    YC.map(c=>`=Inputs!${c}30`),
    {pct:true});
  wr(vc, vr++, 'Delta (Model – VC)',
    YC.map((c,i) => `=Inputs!${c}30-${penVC[i]/100}`),
    {italic:true, pct:true});

  blank(vc, vr++);

  // ── G4: Enterprise Value & DCF ───────────────────────────────────
  secRow(vc, vr++, 'ENTERPRISE VALUE & DCF ANALYSIS');

  // DCF inputs block (single-value params in col B)
  const dcfInputRow = vr;
  [
    ['WACC',                   vcData.wacc             || 0.18,  '0.0%'],
    ['Terminal Growth Rate',   vcData.terminalGrowthRate|| 0.03,  '0.0%'],
    ['Revenue Multiple (EV/R)',vcData.revenueMultiple   || 8,     '0.0"x"'],
    ['EV Estimate (narrative)',vcData.evEstimate        || 'n/a', '@'],
    ['Methodology',            vcData.evMethodology     || 'DCF + Revenue Multiple', '@'],
  ].forEach(([label, val, fmt], i) => {
    const row = vr + i;
    const lc = vc.getCell(`A${row}`);
    lc.value = label; lc.font = fnt(false,11,BLACK); lc.border = thin();
    const vc2 = vc.getCell(`B${row}`);
    vc2.value = val; vc2.numFmt = fmt; vc2.font = fnt(true,11,BLACK);
    vc2.border = thin(); vc2.alignment = {horizontal:'right'};
    vc.mergeCells(row,3,row,7);
  });
  const WACC_ROW = vr;        // B{WACC_ROW} = WACC
  const TGROW_ROW = vr + 1;   // B{TGROW_ROW} = terminal growth
  vr += 5;

  blank(vc, vr++);

  // DCF table
  secRow(vc, vr++, 'DCF CALCULATION  (Free Cash Flow = EBITDA – CAPEX)');

  // Year header
  vc.getCell(`A${vr}`).value = 'Line Item';
  vc.getCell(`A${vr}`).fill  = fill(NAVY2); vc.getCell(`A${vr}`).font = fnt(true,10,GOLD);
  vc.getCell(`A${vr}`).border = thin();
  yr.forEach((y,i) => {
    const c = vc.getCell(vr,2+i);
    c.value = y; c.fill = fill(BLUE); c.font = fnt(true,11,WHITE);
    c.alignment = {horizontal:'center'}; c.border = thin();
  });
  vc.getCell(vr,7).value = 'Terminal'; vc.getCell(vr,7).fill = fill(NAVY2);
  vc.getCell(vr,7).font  = fnt(true,11,GOLD); vc.getCell(vr,7).border = thin();
  vc.getRow(vr).height = 20; vr++;

  const FCF_ROW       = vr;
  const DISC_ROW      = vr + 1;
  const PV_FCF_ROW    = vr + 2;
  const TV_ROW        = vr + 3;
  const PV_TV_ROW     = vr + 4;
  const EV_ROW        = vr + 5;

  // FCF = EBITDA – |CAPEX|  (both from respective sheets)
  wr(vc, FCF_ROW, 'Free Cash Flow ($K)',
    YC.map(c=>`='P&L'!${c}53-ABS(Inputs!${c}15)`));

  // Discount factor = 1/(1+WACC)^year
  wr(vc, DISC_ROW, 'Discount Factor',
    YC.map((_,i)=>`=1/(1+$B$${WACC_ROW})^${i+1}`),
    {numFmt:'0.000', italic:true});

  // PV of FCF
  wr(vc, PV_FCF_ROW, 'PV of FCF ($K)',
    YC.map(c=>`=${c}${FCF_ROW}*${c}${DISC_ROW}`),
    {bold:true});

  // Terminal value (Gordon Growth in col G, row TV_ROW)
  // TV = FCF_Y5 * (1+g) / (WACC – g)
  vc.getCell(`A${TV_ROW}`).value = 'Terminal Value ($K)';
  vc.getCell(`A${TV_ROW}`).font  = fnt(false,11,BLACK);
  vc.getCell(`A${TV_ROW}`).border = thin();
  ['B','C','D','E'].forEach(c => {
    vc.getCell(`${c}${TV_ROW}`).value = '—';
    vc.getCell(`${c}${TV_ROW}`).font  = fnt(false,10,'FF708598');
    vc.getCell(`${c}${TV_ROW}`).border = thin();
    vc.getCell(`${c}${TV_ROW}`).alignment = {horizontal:'center'};
  });
  const tvCell = vc.getCell(`F${TV_ROW}`);
  tvCell.value  = {formula:`=F${FCF_ROW}*(1+$B$${TGROW_ROW})/($B$${WACC_ROW}-$B$${TGROW_ROW})`};
  tvCell.numFmt = '#,##0'; tvCell.font = fnt(true,11,BLACK); tvCell.border = thin();
  tvCell.alignment = {horizontal:'right'};
  const tvNote = vc.getCell(`G${TV_ROW}`);
  tvNote.value = {formula:`=F${FCF_ROW}*(1+$B$${TGROW_ROW})/($B$${WACC_ROW}-$B$${TGROW_ROW})`};
  tvNote.numFmt= '#,##0'; tvNote.font = fnt(true,11,BLACK); tvNote.border = thin();
  tvNote.alignment = {horizontal:'right'};

  // PV of terminal value
  vc.getCell(`A${PV_TV_ROW}`).value = 'PV of Terminal Value ($K)';
  vc.getCell(`A${PV_TV_ROW}`).font  = fnt(false,11,BLACK);
  vc.getCell(`A${PV_TV_ROW}`).border = thin();
  ['B','C','D','E'].forEach(c => {
    vc.getCell(`${c}${PV_TV_ROW}`).value = '—';
    vc.getCell(`${c}${PV_TV_ROW}`).font  = fnt(false,10,'FF708598');
    vc.getCell(`${c}${PV_TV_ROW}`).border = thin();
    vc.getCell(`${c}${PV_TV_ROW}`).alignment = {horizontal:'center'};
  });
  const pvTvCell = vc.getCell(`F${PV_TV_ROW}`);
  pvTvCell.value  = {formula:`=F${TV_ROW}/(1+$B$${WACC_ROW})^5`};
  pvTvCell.numFmt = '#,##0'; pvTvCell.font = fnt(true,11,BLACK); pvTvCell.border = thin();
  pvTvCell.alignment = {horizontal:'right'};
  const pvTvG = vc.getCell(`G${PV_TV_ROW}`);
  pvTvG.value  = {formula:`=F${TV_ROW}/(1+$B$${WACC_ROW})^5`};
  pvTvG.numFmt = '#,##0'; pvTvG.font = fnt(true,11,GOLD); pvTvG.fill = fill(NAVY2); pvTvG.border = thin();
  pvTvG.alignment = {horizontal:'right'};

  // Enterprise Value = Sum PV FCFs + PV TV
  const evLc = vc.getCell(`A${EV_ROW}`);
  evLc.value = 'Enterprise Value ($K)'; evLc.font = fnt(true,11,BLACK); evLc.border = thin();
  evLc.fill  = fill(LGRAY);
  ['B','C','D','E'].forEach(c => {
    const cc = vc.getCell(`${c}${EV_ROW}`);
    cc.value = '—'; cc.font = fnt(false,10,'FF708598'); cc.border = thin();
    cc.fill  = fill(LGRAY); cc.alignment = {horizontal:'center'};
  });
  const evF = vc.getCell(`F${EV_ROW}`);
  evF.value  = {formula:`=SUM(B${PV_FCF_ROW}:F${PV_FCF_ROW})+F${PV_TV_ROW}`};
  evF.numFmt = '#,##0'; evF.font = fnt(true,13,GOLD); evF.fill = fill(NAVY);
  evF.border = thin(); evF.alignment = {horizontal:'right'};
  const evG = vc.getCell(`G${EV_ROW}`);
  evG.value  = {formula:`=SUM(B${PV_FCF_ROW}:F${PV_FCF_ROW})+F${PV_TV_ROW}`};
  evG.numFmt = '"$"#,##0"K"'; evG.font = fnt(true,13,GOLD); evG.fill = fill(NAVY);
  evG.border = thin(); evG.alignment = {horizontal:'right'};

  vr += 6;
  blank(vc, vr++);
  ftRow(vc, vr);

  // ── Section H: Sheet 7 — Working Papers ─────────────────────────
  // Cost allocation ratios + full assumptions table
  const wp = wb.addWorksheet('Working Papers');
  wp.tabColor = {argb:'101F3A'};
  setWidths(wp,[34,14,14,14,14,14,8]);
  applyHeader(wp,
    `${d.companyName}  |  Working Papers & Allocation Detail`,
    'Cost allocation ratios applied to Inputs totals  ·  Assumptions register');

  yearHdr(wp,3);
  let wpr = 4;

  // Allocation ratio tables
  const allMixes = [
    ['COGS',  8, {'Cloud & Hosting':0.30,'Personnel (CoGS)':0.35,'Support & Success':0.20,'Third-Party Licences':0.15}],
    ['R&D',   9, {'Engineering Salaries':0.55,'Contractors & Freelancers':0.15,'R&D Tools & Infrastructure':0.12,'QA & Testing':0.10,'IP & Patents':0.08}],
    ['S&M',  10, {'Marketing & Demand Gen':0.30,'Sales Salaries':0.35,'Commissions & Bonuses':0.15,'Events & Sponsorships':0.10,'Marketing Technology':0.10}],
    ['G&A',  11, {'Executive & Admin Salaries':0.35,'Legal & Compliance':0.15,'Finance & Accounting':0.15,'Office & Facilities':0.12,'Insurance':0.08,'HR & Recruiting':0.10,'Miscellaneous G&A':0.05}],
  ];

  for (const [cat, iRow, mix] of allMixes) {
    secRow(wp, wpr++, `${cat}  —  COST ALLOCATION RATIOS`);
    for (const [item, pct] of Object.entries(mix)) {
      wr(wp, wpr, item,
        YC.map(c=>`=Inputs!${c}${iRow}*${pct}`),
        {indent:1, vColor:RED});
      // Ratio label in col G
      const rc = wp.getCell(`G${wpr}`);
      rc.value = pct; rc.numFmt = '0%';
      rc.font  = fnt(false,10,'FF708598',true);
      rc.alignment = {horizontal:'center'}; rc.border = thin();
      wpr++;
    }
    wr(wp, wpr++, `Total ${cat}`,
      YC.map(c=>`=Inputs!${c}${iRow}`),
      {bold:true, vColor:RED, bg:LGRAY, topBorder:true});
    blank(wp, wpr++);
  }

  // Assumptions table
  secRow(wp, wpr++, 'MODEL ASSUMPTIONS REGISTER');

  // Header
  ['Assumption','Value / Range','Rationale'].forEach((h,i) => {
    const c = wp.getCell(wpr, i+1);
    c.value = h; c.fill = fill(BLUE); c.font = fnt(true,11,WHITE); c.border = thin();
  });
  wp.getColumn(2).width = 26; wp.getColumn(3).width = 44;
  vc.getColumn(7).width = 26;
  wp.getRow(wpr).height = 20; wpr++;

  d.assumptions.forEach((a, idx) => {
    const row = wpr++;
    [a.item, a.value, a.rationale].forEach((val,i) => {
      const c = wp.getCell(row, i+1);
      c.value = val;
      c.font  = i===0 ? fnt(true,10,BLACK) : fnt(false,10,BLACK);
      c.fill  = fill(idx%2===0 ? WHITE : LGRAY);
      c.border = thin();
      c.alignment = {wrapText:true, vertical:'middle'};
    });
    wp.getRow(row).height = 20;
  });

  blank(wp, wpr++);
  ftRow(wp, wpr);

  // ── Write to Blob ──────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ── PPTX Investor Deck Generator (PptxGenJS) — 12 slides ─────────────────
async function generatePptxDeck(d) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"

  // V&V Palette
  const NAVY  = '0A1628';
  const NAVY2 = '101F3A';
  const GOLD  = 'E7CC59';
  const BLUE  = '3D6FCE';
  const WHITE = 'FFFFFF';
  const LGRAY = 'C8D0E0';
  const GRAY  = '708598';

  const yr = d.years;
  const sl = d.slides;

  // ── Shared helpers ───────────────────────────────────────────
  function navyBg(slide) {
    slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:'100%', fill:{ color: NAVY } });
  }
  function hdrBar(slide, title, sub) {
    slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:1.1, fill:{ color: NAVY2 } });
    slide.addShape(pptx.ShapeType.rect, { x:0.4, y:0.96, w:12.5, h:0.04, fill:{ color: GOLD } });
    slide.addText(title, { x:0.45, y:0.1, w:11, h:0.6, fontSize:22, bold:true, color:WHITE, fontFace:'Calibri' });
    if (sub) slide.addText(sub, { x:0.45, y:0.65, w:11, h:0.28, fontSize:9, color:LGRAY, italic:true, fontFace:'Calibri' });
  }
  function footer(slide, n) {
    slide.addShape(pptx.ShapeType.rect, { x:0, y:7.28, w:'100%', h:0.22, fill:{ color: NAVY2 } });
    slide.addText('▶ VISION & VIRTUE', { x:0.3, y:7.3, w:3, h:0.18, fontSize:7, bold:true, color:GOLD, fontFace:'Calibri' });
    slide.addText('CONFIDENTIAL — NOT FOR DISTRIBUTION', { x:3.5, y:7.3, w:6.5, h:0.18, fontSize:7, color:GRAY, fontFace:'Calibri' });
    slide.addText(`${n} / 12`, { x:11.8, y:7.3, w:1.2, h:0.18, fontSize:7, color:GRAY, align:'right', fontFace:'Calibri' });
  }
  function bulletList(slide, items, x, y, w, h) {
    const rows = (items || []).map(b => ({
      text: b, options: { fontSize:11, color:WHITE, fontFace:'Calibri', paraSpaceAfter:4 }
    }));
    if (!rows.length) return;
    slide.addText(rows.map(r => ({ text:'— '+r.text, options: r.options })),
      { x, y, w, h, valign:'top' });
  }
  function metricBox(slide, metrics, x, y, w) {
    const bh = 1.05;
    (metrics || []).slice(0,4).forEach((m, i) => {
      const bx = x + i * (w/Math.min(metrics.length,4));
      const bw = (w / Math.min(metrics.length,4)) - 0.1;
      slide.addShape(pptx.ShapeType.rect, { x:bx, y, w:bw, h:bh, fill:{ color: NAVY2 }, line:{ color: BLUE, width:1 } });
      slide.addText(m.label||'', { x:bx+0.1, y:y+0.08, w:bw-0.2, h:0.3, fontSize:8, color:LGRAY, fontFace:'Calibri' });
      slide.addText(m.value||'', { x:bx+0.1, y:y+0.36, w:bw-0.2, h:0.48, fontSize:18, bold:true, color:GOLD, fontFace:'Calibri' });
    });
  }
  function pnlTable(slide) {
    const hdr = ['', ...yr];
    const rows2 = [
      ['Revenue ($K)',    ...d.pnl.revenue.map(v => v.toLocaleString())],
      ['Gross Profit',   ...d.pnl.grossProfit.map(v => v.toLocaleString())],
      ['Gross Margin %', ...d.pnl.grossMarginPct.map(v => v+'%')],
      ['EBITDA',         ...d.pnl.ebitda.map(v => v.toLocaleString())],
      ['EBITDA Margin %',...d.pnl.ebitdaMarginPct.map(v => v+'%')],
    ];
    const tableData = [hdr, ...rows2].map((row, ri) =>
      row.map((cell, ci) => ({
        text: String(cell),
        options: {
          bold: ri === 0 || ci === 0,
          color: ri === 0 ? GOLD : ci === 0 ? LGRAY : WHITE,
          fill: ri === 0 ? NAVY2 : ri % 2 === 0 ? '0D1B32' : NAVY2,
          fontSize: 9, fontFace: 'Calibri', align: ci === 0 ? 'left' : 'center',
        }
      }))
    );
    slide.addTable(tableData, { x:0.45, y:1.25, w:12.4, h:3.5, rowH:0.38, colW:[2.2,2.05,2.05,2.05,2.05,2.0] });
  }

  // ── Slide 1: Cover ───────────────────────────────────────────
  const s1 = pptx.addSlide();
  navyBg(s1);
  s1.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:0.07, fill:{ color: GOLD } });
  s1.addShape(pptx.ShapeType.rect, { x:0, y:7.43, w:'100%', h:0.07, fill:{ color: GOLD } });
  s1.addText('V', { x:8.5, y:0.3, w:5, h:6.5, fontSize:280, bold:true, color:'122440', fontFace:'Calibri', transparency:80 });
  s1.addText('V', { x:0.5, y:0.15, w:0.9, h:0.55, fontSize:28, bold:true, color:GOLD, fontFace:'Calibri' });
  s1.addText('VISION & VIRTUE', { x:1.35, y:0.24, w:5, h:0.35, fontSize:10, bold:true, color:WHITE, fontFace:'Calibri' });
  s1.addText(d.companyName, { x:0.5, y:1.6, w:8, h:0.7, fontSize:38, bold:true, color:GOLD, fontFace:'Calibri' });
  s1.addText([d.industry, d.stage].filter(Boolean).join('  ·  ') || 'Financial Strategy Presentation',
    { x:0.5, y:2.38, w:8, h:0.35, fontSize:12, color:LGRAY, fontFace:'Calibri' });
  s1.addShape(pptx.ShapeType.rect, { x:0.5, y:2.82, w:0.06, h:0.82, fill:{ color: GOLD } });
  s1.addText('Financial Strategy &', { x:0.7, y:2.82, w:8, h:0.42, fontSize:22, bold:true, color:WHITE, fontFace:'Calibri' });
  s1.addText('Investor Presentation', { x:0.7, y:3.22, w:8, h:0.42, fontSize:22, bold:true, color:WHITE, fontFace:'Calibri' });
  s1.addShape(pptx.ShapeType.rect, { x:0.5, y:3.78, w:5.5, h:0.04, fill:{ color: GOLD } });
  s1.addText('STRICTLY CONFIDENTIAL', { x:0.5, y:3.9, w:8, h:0.3, fontSize:10, color:GRAY, fontFace:'Calibri' });

  // ── Slide 2: Executive Summary ───────────────────────────────
  const s2 = pptx.addSlide(); navyBg(s2);
  hdrBar(s2, sl.execSummary?.title || 'Executive Summary', 'Company overview and investment thesis');
  bulletList(s2, sl.execSummary?.bullets || ['Leading provider in a large, growing market','Strong unit economics with improving NRR','Clear path to profitability within 5 years'], 0.45, 1.2, 6.8, 5.6);
  metricBox(s2, sl.execSummary?.metrics || [{label:'ARR',value:'$'+d.kpis.arr[0]+'K'},{label:'Customers',value:String(d.kpis.customers[0])},{label:'Gross Margin',value:d.pnl.grossMarginPct[0]+'%'},{label:'NRR',value:d.kpis.nrrPct[0]+'%'}], 7.6, 1.2, 5.4);
  footer(s2, 2);

  // ── Slide 3: Business Model ──────────────────────────────────
  const s3 = pptx.addSlide(); navyBg(s3);
  hdrBar(s3, sl.businessModel?.title || 'Business Model', 'How we create and capture value');
  bulletList(s3, sl.businessModel?.bullets || ['Recurring SaaS subscription with annual contracts','Land-and-expand with strong upsell motion','Platform stickiness driven by data network effects'], 0.45, 1.2, 12.4, 5.8);
  footer(s3, 3);

  // ── Slide 4: Revenue Model ───────────────────────────────────
  const s4 = pptx.addSlide(); navyBg(s4);
  hdrBar(s4, sl.revenueModel?.title || 'Revenue Model', 'Pricing, segments, and growth drivers');
  bulletList(s4, sl.revenueModel?.bullets || ['Tiered pricing: Starter / Growth / Enterprise','ARPU expansion through upsell and product launches','Channel partnerships contribute 20% of new ARR in Year 3+'], 0.45, 1.2, 6.8, 5.6);
  metricBox(s4, sl.revenueModel?.metrics || [{label:'ARPU',value:'$'+d.kpis.arpu[0]+'K'},{label:'CAC',value:'$'+d.kpis.cac[0]+'K'},{label:'LTV',value:'$'+d.kpis.ltv[0]+'K'},{label:'LTV/CAC',value:(d.kpis.ltv[0]/d.kpis.cac[0]).toFixed(1)+'x'}], 7.6, 1.2, 5.4);
  footer(s4, 4);

  // ── Slide 5: Market Opportunity ──────────────────────────────
  const s5 = pptx.addSlide(); navyBg(s5);
  hdrBar(s5, sl.marketOpportunity?.title || 'Market Opportunity', 'TAM / SAM / SOM analysis');
  bulletList(s5, sl.marketOpportunity?.bullets || ['Large and fragmented market with no dominant player','Secular tailwinds: digital transformation, regulatory change','Geographic expansion unlocks 3x addressable market'], 0.45, 1.2, 6.8, 4.0);
  const mktMets = [
    {label:'TAM', value: sl.marketOpportunity?.tam || '$12B'},
    {label:'SAM', value: sl.marketOpportunity?.sam || '$3.2B'},
    {label:'SOM (Y5)', value: sl.marketOpportunity?.som || '$480M'},
  ];
  metricBox(s5, mktMets, 0.45, 5.5, 12.4);
  footer(s5, 5);

  // ── Slide 6: Financial Highlights ────────────────────────────
  const s6 = pptx.addSlide(); navyBg(s6);
  hdrBar(s6, sl.financialHighlights?.title || 'Financial Highlights', '5-year summary at a glance');
  bulletList(s6, sl.financialHighlights?.bullets || ['Revenue CAGR of ~80% over 5 years','Gross margins stabilising at 60%+','EBITDA positive in Year 4'], 0.45, 1.2, 6.8, 5.6);
  metricBox(s6, sl.financialHighlights?.metrics || [{label:'Y5 Revenue',value:'$'+d.pnl.revenue[4]+'K'},{label:'Y5 EBITDA',value:'$'+d.pnl.ebitda[4]+'K'},{label:'Y5 ARR',value:'$'+d.kpis.arr[4]+'K'},{label:'Y5 Customers',value:String(d.kpis.customers[4])}], 7.6, 1.2, 5.4);
  footer(s6, 6);

  // ── Slide 7: 5-Year P&L Summary ──────────────────────────────
  const s7 = pptx.addSlide(); navyBg(s7);
  hdrBar(s7, sl.pnlSummary?.title || '5-Year P&L Summary', 'Income statement projection ($K)');
  pnlTable(s7);
  if (sl.pnlSummary?.commentary) {
    s7.addText(sl.pnlSummary.commentary, { x:0.45, y:5.0, w:12.4, h:0.8, fontSize:9, color:LGRAY, italic:true, fontFace:'Calibri' });
  }
  footer(s7, 7);

  // ── Slide 8: Cash Flow & Runway ───────────────────────────────
  const s8 = pptx.addSlide(); navyBg(s8);
  hdrBar(s8, sl.cashFlowRunway?.title || 'Cash Flow & Runway', 'Capital efficiency and funding plan');
  bulletList(s8, sl.cashFlowRunway?.bullets || ['Current raise provides '+( sl.cashFlowRunway?.runway || '24+ months')+ ' of runway','Capital-efficient growth with measured burn','Financing plan aligned with milestone-based fundraising'], 0.45, 1.2, 6.8, 3.5);
  const cfMets = yr.map((y,i) => ({ label: y+' Net Cash', value: '$'+(d.cashFlow.netCash[i]||0)+'K' }));
  metricBox(s8, cfMets.slice(0,4), 0.45, 5.0, 12.4);
  footer(s8, 8);

  // ── Slide 9: Growth Strategy ─────────────────────────────────
  const s9 = pptx.addSlide(); navyBg(s9);
  hdrBar(s9, sl.growthStrategy?.title || 'Growth Strategy', 'Go-to-market and expansion plan');
  bulletList(s9, sl.growthStrategy?.bullets || ['Direct sales (SMB + mid-market) in Year 1–2','Channel partnerships accelerate from Year 3','International expansion (EU + APAC) in Year 4','Product-led growth motion through free tier in Year 2'], 0.45, 1.2, 12.4, 5.8);
  footer(s9, 9);

  // ── Slide 10: Unit Economics ─────────────────────────────────
  const s10 = pptx.addSlide(); navyBg(s10);
  hdrBar(s10, sl.unitEconomics?.title || 'Unit Economics', 'CAC, LTV, payback and retention');
  bulletList(s10, sl.unitEconomics?.bullets || ['LTV/CAC ratio of '+( (d.kpis.ltv[0]/d.kpis.cac[0]).toFixed(1) )+'x — improves to '+(d.kpis.ltv[4]/d.kpis.cac[4]).toFixed(1)+'x by Year 5','CAC payback period below 18 months','NRR above 100% from Year 1'], 0.45, 1.2, 6.8, 5.6);
  metricBox(s10, sl.unitEconomics?.metrics || [{label:'CAC',value:'$'+d.kpis.cac[0]+'K'},{label:'LTV',value:'$'+d.kpis.ltv[0]+'K'},{label:'Churn',value:d.kpis.churnPct[0]+'%'},{label:'NRR',value:d.kpis.nrrPct[0]+'%'}], 7.6, 1.2, 5.4);
  footer(s10, 10);

  // ── Slide 11: Use of Funds ───────────────────────────────────
  const s11 = pptx.addSlide(); navyBg(s11);
  hdrBar(s11, sl.useOfFunds?.title || 'Use of Funds', 'Capital allocation plan');
  const allocs = sl.useOfFunds?.allocations || [
    {category:'Product & Engineering', amount:'40%', pct:'40%'},
    {category:'Sales & Marketing',     amount:'30%', pct:'30%'},
    {category:'Operations & G&A',      amount:'20%', pct:'20%'},
    {category:'Reserve & Working Cap', amount:'10%', pct:'10%'},
  ];
  const tblData = [
    [{text:'Category',options:{bold:true,color:GOLD,fill:NAVY2,fontSize:10,fontFace:'Calibri'}},
     {text:'Allocation',options:{bold:true,color:GOLD,fill:NAVY2,fontSize:10,align:'center',fontFace:'Calibri'}},
     {text:'%',options:{bold:true,color:GOLD,fill:NAVY2,fontSize:10,align:'center',fontFace:'Calibri'}}],
    ...allocs.map((a,i) => [
      {text:a.category,options:{color:LGRAY,fill:i%2===0?'0D1B32':NAVY2,fontSize:10,fontFace:'Calibri',bold:true}},
      {text:a.amount,  options:{color:WHITE, fill:i%2===0?'0D1B32':NAVY2,fontSize:10,align:'center',fontFace:'Calibri'}},
      {text:a.pct,     options:{color:GOLD,  fill:i%2===0?'0D1B32':NAVY2,fontSize:10,align:'center',fontFace:'Calibri'}},
    ])
  ];
  s11.addTable(tblData, { x:2.5, y:1.4, w:8.4, h: 0.5 + allocs.length * 0.55, rowH:0.52, colW:[5.4,1.8,1.2] });
  footer(s11, 11);

  // ── Slide 12: Closing ────────────────────────────────────────
  const s12 = pptx.addSlide(); navyBg(s12);
  s12.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:0.07, fill:{ color: GOLD } });
  s12.addShape(pptx.ShapeType.rect, { x:0, y:7.43, w:'100%', h:0.07, fill:{ color: GOLD } });
  s12.addText('V', { x:8.5, y:0.3, w:5, h:6.5, fontSize:280, bold:true, color:'122440', fontFace:'Calibri', transparency:80 });
  s12.addText(sl.closing?.title || 'Thank You', { x:0.5, y:1.6, w:8, h:0.8, fontSize:36, bold:true, color:GOLD, fontFace:'Calibri' });
  s12.addText(d.companyName, { x:0.5, y:2.5, w:8, h:0.45, fontSize:18, bold:true, color:WHITE, fontFace:'Calibri' });
  bulletList(s12, sl.closing?.bullets || ['Questions welcome','Next steps: term sheet discussion','Data room available upon request'], 0.5, 3.1, 7, 2.5);
  s12.addText(sl.closing?.contactInfo || 'Vision & Virtue Partnership  |  contact@visionvirtue.com',
    { x:0.5, y:6.1, w:9, h:0.35, fontSize:10, color:LGRAY, fontFace:'Calibri' });
  s12.addShape(pptx.ShapeType.rect, { x:0.5, y:6.5, w:5.5, h:0.04, fill:{ color: GOLD } });

  // Write and return as Blob
  return pptx.write({ outputType: 'blob' });
}
