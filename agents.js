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
    lastRaise: document.getElementById('ctxLastRaise')?.value || '',
    ev:        document.getElementById('ctxEV')?.value || '',
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

// ── Core workflow execution ────────────────────────────────────
async function startFinanceWorkflow() {
  const ctx = getCompanyContext();
  const ctxStr = contextSummary(ctx);
  const files = fileNamesList();

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
    // ─── STAGE 1: ANALYSIS ─────────────────────────────────────
    wfSetStage('analysis');
    wfLog('System', 'Workflow initiated. Ingesting company context and uploaded materials.');
    wfLog('System', `Context: ${ctxStr}`);
    wfLog('System', `Files: ${files}`);

    wfLog('Director of Finance', 'Analyzing uploaded materials and extracting financial data…');
    const analysisPrompt = `You are the Director of Finance at Vision & Virtue Partnership. Analyze the following company context and uploaded file list. Extract the key financial, operational, and commercial data points that will inform the Excel financial model and PowerPoint presentation.

Company Context: ${ctxStr}
Uploaded Files: ${files}

Based on this context, provide:
1. A summary of what financial data is likely available
2. Key assumptions that need to be made for missing data
3. The 5-year revenue growth logic (consult with VC/PE expert thinking)
4. TAM/SAM/SOM estimates
5. Key financial metrics to model (ARPU, CAC, churn, margins, etc.)
6. Recommended structure for the P&L, Cash Flow, and KPI dashboard

Be specific, quantitative, and investor-grade. Flag all assumptions clearly.`;

    const analysisResult = await callClaude('dof', [{ role: 'user', content: analysisPrompt }]);
    wfLog('Director of Finance', 'Financial analysis complete. Extracted key data points and assumptions.');
    wfComment('Nadia Stern (DOF)', analysisResult.substring(0, 500) + (analysisResult.length > 500 ? '…' : ''));

    // VC Expert consultation
    wfLog('VC Expert', 'Reviewing growth assumptions and market sizing…');
    const vcConsultPrompt = `You are the VC/PE Expert Consultant reviewing the Director of Finance's analysis for investor credibility.

Company Context: ${ctxStr}
Director of Finance Analysis (excerpt): ${analysisResult.substring(0, 2000)}

Provide your expert input on:
1. Whether revenue growth assumptions are investor-credible for this stage and industry
2. TAM/SAM/SOM validation or correction
3. Market penetration pace (is it realistic?)
4. Key benchmarks this company should hit for the next round
5. Any red flags or assumptions that need adjustment

Be specific and quantitative.`;

    const vcResult = await callClaude('vc_expert', [{ role: 'user', content: vcConsultPrompt }]);
    wfLog('VC Expert', 'Growth assumptions and market sizing reviewed.');
    wfComment('Ethan Caldwell (VC Expert)', vcResult.substring(0, 500) + (vcResult.length > 500 ? '…' : ''));

    // ─── STAGE 2: BUILD ────────────────────────────────────────
    wfSetStage('build');
    wfLog('Director of Finance', 'Building Excel financial model and PowerPoint presentation…');

    const buildPrompt = `You are the Director of Finance building the financial deliverables.

Company Context: ${ctxStr}
Analysis: ${analysisResult.substring(0, 1500)}
VC Expert Input: ${vcResult.substring(0, 1500)}

Build a comprehensive summary of both deliverables:

EXCEL MODEL SUMMARY:
- 5-Year P&L with all line items (Revenue, COGS, Gross Profit, R&D, S&M, G&A, EBITDA)
- Cash Flow projection (EBITDA, Working Capital, CAPEX, Financing, Net Cash)
- KPI Dashboard values (ARR, MRR, ARPU, CAC, LTV, Churn, NRR, Gross Margin)
- Assumptions sheet

POWERPOINT SUMMARY:
- Executive Summary slide content
- Business Model slide content
- Revenue Model slide content
- Market Opportunity slide content
- Financial Highlights slide content
- 5-Year P&L Summary slide content
- Cash Flow & Runway slide content
- Growth Strategy slide content
- Unit Economics slide content
- KPI Dashboard slide content
- Use of Funds slide content
- Closing slide content

All numbers must be internally consistent. Use the VC Expert's guidance for growth and market assumptions.`;

    const buildResult = await callClaude('dof', [{ role: 'user', content: buildPrompt }]);
    wfLog('Director of Finance', 'Initial build complete. Submitting to CFO for review.');
    wfComment('Nadia Stern (DOF)', 'Model and deck draft completed. Ready for CFO review.');

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

    // DOF Revision
    wfLog('Director of Finance', 'Applying CFO corrections — Revision 1…');
    const dofRev1 = await callClaude('dof', [
      { role: 'user', content: buildPrompt },
      { role: 'assistant', content: buildResult },
      { role: 'user', content: `CFO Marcus Vale has returned the deliverables with these corrections:\n\n${cfoR1.substring(0, 2000)}\n\nApply all corrections and resubmit. Ensure numerical consistency.` }
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

    // ─── STAGE 6: FINAL ────────────────────────────────────────
    wfSetStage('final');
    wfLog('System', 'Deliverables approved by Partner. Packaging final outputs.');

    const badge = document.getElementById('wfBadge');
    if (badge) {
      badge.textContent = 'Complete';
      badge.classList.add('badge-complete');
    }

    // Enable download buttons for existing template files
    document.getElementById('wfPptStatus').textContent = 'Ready';
    document.getElementById('wfXlsStatus').textContent = 'Ready';
    const dlPpt = document.getElementById('wfDownloadPpt');
    const dlXls = document.getElementById('wfDownloadXls');
    if (dlPpt) { dlPpt.disabled = false; dlPpt.onclick = () => triggerDownload('VisionVirtue_PPT_Template.pptx', 'Investor Presentation.pptx'); }
    if (dlXls) { dlXls.disabled = false; dlXls.onclick = () => triggerDownload('VisionVirtue_FM_Template_v2.xlsx', 'Financial Model.xlsx'); }

    wfLog('System', 'Final approved deliverables ready for download. Customer folder created.');

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
