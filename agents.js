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
    // ─── STAGE 1: ANALYSIS ─────────────────────────────────────
    wfSetStage('analysis');
    wfLog('System', 'Workflow initiated. Reading uploaded files…');
    wfLog('System', `Context: ${ctxStr}`);

    // Extract actual content from uploaded files
    const fileContent = await extractFileContents(uploadedFiles);
    wfLog('System', `Files parsed: ${fileNames || 'none'}.`);

    wfLog('Director of Finance', 'Analyzing uploaded materials and extracting financial data…');
    const analysisPrompt = `You are the Director of Finance at Vision & Virtue Partnership. Analyze the company context and uploaded document contents below. Extract all financial, operational, and commercial data to inform the Excel financial model and investor presentation.

Company Context: ${ctxStr}
Uploaded Files: ${fileNames || 'none'}

--- UPLOADED FILE CONTENTS ---
${fileContent || 'No files uploaded — derive all figures from the structured context and reasonable industry assumptions.'}
--- END FILE CONTENTS ---

Based on the above, provide:
1. A summary of the actual financial data found in the files (revenue, costs, margins, customers, etc.)
2. Key assumptions for any data not present in the files
3. The 5-year revenue growth logic (grounded in the actual data where available)
4. TAM/SAM/SOM estimates
5. Key metrics to model (ARPU, CAC, churn, margins, NRR, etc.)
6. Recommended P&L, Cash Flow, and KPI dashboard structure

Be specific and quantitative. Flag every assumption clearly vs. data taken from the files.`;

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
Source Data (from uploaded files, use this to populate real numbers): ${fileContent ? fileContent.substring(0, 2000) : 'None — use assumptions from analysis.'}

IMPORTANT: Return ONLY valid JSON (no markdown fences, no text outside the JSON). Use this exact schema:

{
  "companyName": "string",
  "industry": "string",
  "stage": "string",
  "round": "string",
  "startYear": 2025,
  "pnl": {
    "saasRevenue":  [num,num,num,num,num],
    "otherRevenue": [num,num,num,num,num],
    "cogsTotal":    [num,num,num,num,num],
    "rdTotal":      [num,num,num,num,num],
    "smTotal":      [num,num,num,num,num],
    "gaTotal":      [num,num,num,num,num],
    "ebitda":       [num,num,num,num,num]
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
    const xlsBlob = await generateExcelModel(modelData);
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

  return { companyName: company, industry: data.industry || ctx?.industry || '',
    stage: data.stage || ctx?.stage || '', round: data.round || ctx?.round || '',
    startYear, years, pnl, cashFlow, kpis, assumptions, slides };
}

// ── Excel Model Generator (ExcelJS) — institutional quality ──────────────
async function generateExcelModel(d) {
  // Normalise global — ExcelJS CDN may expose as ExcelJS or exceljs
  const _EJS = (typeof ExcelJS !== 'undefined') ? ExcelJS
              : (typeof window !== 'undefined' && window.ExcelJS) ? window.ExcelJS
              : (typeof window !== 'undefined' && window.exceljs) ? window.exceljs
              : null;
  if (!_EJS) throw new Error('ExcelJS library failed to load from CDN. Check network and reload.');
  const wb = new _EJS.Workbook();
  wb.creator = 'Vision & Virtue Agentic Finance Team';
  wb.created = new Date();

  const yr = d.years; // ['2025','2026','2027','2028','2029']

  // V&V palette (ARGB)
  const NAVY  = 'FF0A1628';
  const NAVY2 = 'FF101F3A';
  const GOLD  = 'FFE7CC59';
  const BLUE  = 'FF3D6FCE';
  const WHITE = 'FFFFFFFF';
  const LGRAY = 'FFF0F4FA';
  const MGRAY = 'FFD0D8E8';
  const BLACK = 'FF1A2540';

  // ── Sub-item distribution mixes ────────────────────────────────
  const cogsMix = { 'Cloud & Hosting':0.30, 'Personnel (CoGS)':0.35, 'Support & Success':0.20, 'Third-Party Licences':0.15 };
  const rdMix   = { 'Engineering Salaries':0.55, 'Contractors & Freelancers':0.15, 'R&D Tools & Infrastructure':0.12, 'QA & Testing':0.10, 'IP & Patents':0.08 };
  const smMix   = { 'Marketing & Demand Gen':0.30, 'Sales Salaries':0.35, 'Commissions & Bonuses':0.15, 'Events & Sponsorships':0.10, 'Marketing Technology':0.10 };
  const gaMix   = { 'Executive & Admin Salaries':0.35, 'Legal & Compliance':0.15, 'Finance & Accounting':0.15, 'Office & Facilities':0.12, 'Insurance':0.08, 'HR & Recruiting':0.10, 'Miscellaneous G&A':0.05 };

  function distribute(totals, mix) {
    return Object.fromEntries(
      Object.entries(mix).map(([k, pct]) => [k, totals.map(v => Math.round(v * pct))])
    );
  }

  const cogsItems = distribute(d.pnl.cogsTotal, cogsMix);
  const rdItems   = distribute(d.pnl.rdTotal,   rdMix);
  const smItems   = distribute(d.pnl.smTotal,   smMix);
  const gaItems   = distribute(d.pnl.gaTotal,   gaMix);

  // ── Shared style helpers ────────────────────────────────────────
  function hdrFill(argb) { return { type:'pattern', pattern:'solid', fgColor:{argb} }; }
  function thinBorder() {
    const s = { style:'thin', color:{argb:MGRAY} };
    return { top:s, left:s, bottom:s, right:s };
  }
  function boldFont(sz=11, argb=BLACK)   { return { bold:true,  size:sz, color:{argb}, name:'Calibri' }; }
  function normFont(sz=11, argb=BLACK)   { return { bold:false, size:sz, color:{argb}, name:'Calibri' }; }
  function italFont(sz=10, argb='FF708598') { return { italic:true, size:sz, color:{argb}, name:'Calibri' }; }

  // Apply title row (merged A1:F1)
  function applyTitle(ws, text, lastCol='F') {
    ws.mergeCells(`A1:${lastCol}1`);
    const c = ws.getCell('A1');
    c.value = text;
    c.fill  = hdrFill(NAVY);
    c.font  = { bold:true, size:14, color:{argb:GOLD}, name:'Calibri' };
    c.alignment = { vertical:'middle', horizontal:'left', indent:1 };
    ws.getRow(1).height = 28;
  }

  // Apply sub-title row (merged)
  function applySubTitle(ws, row, text, lastCol='F') {
    ws.mergeCells(`A${row}:${lastCol}${row}`);
    const c = ws.getCell(`A${row}`);
    c.value = text;
    c.fill  = hdrFill(NAVY2);
    c.font  = { bold:true, size:10, color:{argb:GOLD}, name:'Calibri' };
    c.alignment = { vertical:'middle', horizontal:'left', indent:1 };
    ws.getRow(row).height = 18;
  }

  // Write a year-header row (B..F = years)
  function writeYearHeader(ws, row) {
    ws.getCell(`A${row}`).value = '';
    yr.forEach((y,i) => {
      const c = ws.getCell(row, 2+i);
      c.value = y;
      c.fill  = hdrFill(BLUE);
      c.font  = boldFont(11, WHITE);
      c.alignment = { horizontal:'center' };
      c.border = thinBorder();
    });
    ws.getRow(row).height = 20;
  }

  // Write a data row — label in col A, numbers in B..F
  function writeRow(ws, row, label, values, opts={}) {
    const { indent=0, bold=false, italic=false, fillArgb=null,
            labelArgb=BLACK, valArgb=BLACK, fmt='#,##0', negative=false,
            pctFmt=false, topBorder=false, bottomBorder=false } = opts;

    const lc = ws.getCell(`A${row}`);
    lc.value = label;
    lc.font  = bold ? boldFont(11, labelArgb) : italic ? italFont(10) : normFont(11, labelArgb);
    lc.alignment = { indent };
    if (fillArgb) lc.fill = hdrFill(fillArgb);

    values.forEach((v, i) => {
      const c = ws.getCell(row, 2+i);
      c.value = negative ? -Math.abs(v) : v;
      c.font  = bold ? boldFont(11, valArgb) : normFont(11, valArgb);
      if (fillArgb) c.fill = hdrFill(fillArgb);
      c.numFmt = pctFmt ? '0.0%' : fmt;
      c.alignment = { horizontal:'right' };
      c.border = thinBorder();
      if (topBorder)    c.border.top    = { style:'medium', color:{argb:GOLD} };
      if (bottomBorder) c.border.bottom = { style:'medium', color:{argb:GOLD} };
    });
    // blank / label cell border
    lc.border = thinBorder();
    if (topBorder)    lc.border.top    = { style:'medium', color:{argb:GOLD} };
    if (bottomBorder) lc.border.bottom = { style:'medium', color:{argb:GOLD} };
  }

  function blankRow(ws, row) { ws.getRow(row).height = 6; }

  function setColWidths(ws, widths) {
    widths.forEach((w, i) => { ws.getColumn(i+1).width = w; });
  }

  // ════════════════════════════════════════════════════════════════
  // SHEET 1 — 5-Year P&L
  // ════════════════════════════════════════════════════════════════
  const pnl = wb.addWorksheet('P&L', { views:[{state:'frozen',ySplit:4}] });
  setColWidths(pnl, [32, 14, 14, 14, 14, 14]);

  applyTitle(pnl, `${d.companyName}  |  5-Year Income Statement  ($K)`);

  pnl.mergeCells('A2:F2');
  pnl.getCell('A2').value = `${d.industry}  ·  ${d.stage}  ·  ${d.round}`;
  pnl.getCell('A2').font  = italFont(10, 'FF708598');
  pnl.getCell('A2').fill  = hdrFill(NAVY2);
  pnl.getRow(2).height = 16;

  blankRow(pnl, 3);
  writeYearHeader(pnl, 4);

  // Revenue
  applySubTitle(pnl, 5, 'REVENUE');
  let r = 6;
  writeRow(pnl, r++, '  SaaS / Subscription Revenue', d.pnl.saasRevenue, {indent:1});
  writeRow(pnl, r++, '  Other / Professional Services', d.pnl.otherRevenue, {indent:1});
  writeRow(pnl, r++, 'Total Revenue', d.pnl.revenue,
    {bold:true, fillArgb:LGRAY, topBorder:true, bottomBorder:true});

  blankRow(pnl, r++);

  // COGS
  applySubTitle(pnl, r++, 'COST OF GOODS SOLD');
  for (const [lbl, vals] of Object.entries(cogsItems)) {
    writeRow(pnl, r++, `  ${lbl}`, vals, {indent:1, negative:true, valArgb:'FF8B0000'});
  }
  writeRow(pnl, r++, 'Total COGS', d.pnl.cogsTotal,
    {bold:true, negative:true, valArgb:'FF8B0000', fillArgb:LGRAY, topBorder:true});

  blankRow(pnl, r++);

  // Gross Profit
  writeRow(pnl, r++, 'Gross Profit', d.pnl.grossProfit,
    {bold:true, fillArgb:'FFDCE8FF', topBorder:true, bottomBorder:true});
  writeRow(pnl, r++, 'Gross Margin %', d.pnl.grossMarginPct.map(v=>v/100),
    {italic:true, pctFmt:true, fillArgb:LGRAY});

  blankRow(pnl, r++);

  // R&D
  applySubTitle(pnl, r++, 'RESEARCH & DEVELOPMENT');
  for (const [lbl, vals] of Object.entries(rdItems)) {
    writeRow(pnl, r++, `  ${lbl}`, vals, {indent:1, negative:true, valArgb:'FF8B0000'});
  }
  writeRow(pnl, r++, 'Total R&D', d.pnl.rdTotal,
    {bold:true, negative:true, valArgb:'FF8B0000', fillArgb:LGRAY, topBorder:true});

  blankRow(pnl, r++);

  // S&M
  applySubTitle(pnl, r++, 'SALES & MARKETING');
  for (const [lbl, vals] of Object.entries(smItems)) {
    writeRow(pnl, r++, `  ${lbl}`, vals, {indent:1, negative:true, valArgb:'FF8B0000'});
  }
  writeRow(pnl, r++, 'Total S&M', d.pnl.smTotal,
    {bold:true, negative:true, valArgb:'FF8B0000', fillArgb:LGRAY, topBorder:true});

  blankRow(pnl, r++);

  // G&A
  applySubTitle(pnl, r++, 'GENERAL & ADMINISTRATIVE');
  for (const [lbl, vals] of Object.entries(gaItems)) {
    writeRow(pnl, r++, `  ${lbl}`, vals, {indent:1, negative:true, valArgb:'FF8B0000'});
  }
  writeRow(pnl, r++, 'Total G&A', d.pnl.gaTotal,
    {bold:true, negative:true, valArgb:'FF8B0000', fillArgb:LGRAY, topBorder:true});

  blankRow(pnl, r++);

  // Total OpEx & EBITDA
  const totalOpEx = d.pnl.rdTotal.map((v,i) => v + d.pnl.smTotal[i] + d.pnl.gaTotal[i]);
  writeRow(pnl, r++, 'Total Operating Expenses', totalOpEx,
    {bold:true, negative:true, valArgb:'FF8B0000', fillArgb:LGRAY, topBorder:true, bottomBorder:true});
  blankRow(pnl, r++);
  writeRow(pnl, r++, 'EBITDA', d.pnl.ebitda,
    {bold:true, fillArgb:'FFD6F5E2', topBorder:true, bottomBorder:true,
     valArgb: d.pnl.ebitda.some(v=>v<0) ? 'FF8B0000' : 'FF006400'});
  writeRow(pnl, r++, 'EBITDA Margin %', d.pnl.ebitdaMarginPct.map(v=>v/100),
    {italic:true, pctFmt:true, fillArgb:LGRAY});

  pnl.getCell(`A${r}`).value = 'All figures in $K  ·  Generated by Vision & Virtue Agentic Finance Team';
  pnl.getCell(`A${r}`).font  = italFont(9, 'FF708598');

  // ════════════════════════════════════════════════════════════════
  // SHEET 2 — Cash Flow Statement
  // ════════════════════════════════════════════════════════════════
  const cf = wb.addWorksheet('Cash Flow', { views:[{state:'frozen',ySplit:4}] });
  setColWidths(cf, [32, 14, 14, 14, 14, 14]);

  applyTitle(cf, `${d.companyName}  |  5-Year Cash Flow Statement  ($K)`);
  cf.mergeCells('A2:F2');
  cf.getCell('A2').value = `AR Days: ${d.cashFlow.arDays}  ·  AP Days: ${d.cashFlow.apDays}  ·  Opening Cash: $${d.cashFlow.openingCash}K`;
  cf.getCell('A2').font  = italFont(10, 'FF708598');
  cf.getCell('A2').fill  = hdrFill(NAVY2);
  cf.getRow(2).height = 16;

  blankRow(cf, 3);
  writeYearHeader(cf, 4);

  let cr = 5;
  applySubTitle(cf, cr++, 'OPERATING CASH FLOW');
  writeRow(cf, cr++, 'Opening Cash Balance', d.cashFlow.openingBalances, {bold:true});
  writeRow(cf, cr++, 'EBITDA', d.cashFlow.ebitda, {indent:1});
  writeRow(cf, cr++, '  ΔAR (Accounts Receivable)', d.cashFlow.wcChanges.map(v => {
    // AR portion only (negative = cash out, positive = cash in)
    return Math.round(v * (d.cashFlow.arDays / (d.cashFlow.arDays + d.cashFlow.apDays || 1)));
  }), {indent:2, italic:true});
  writeRow(cf, cr++, '  ΔAP (Accounts Payable)', d.cashFlow.wcChanges.map(v => {
    return Math.round(v * (d.cashFlow.apDays / (d.cashFlow.arDays + d.cashFlow.apDays || 1)));
  }), {indent:2, italic:true});
  writeRow(cf, cr++, 'Net Working Capital Change', d.cashFlow.wcChanges, {indent:1, italic:true});
  blankRow(cf, cr++);

  applySubTitle(cf, cr++, 'INVESTING ACTIVITIES');
  writeRow(cf, cr++, 'Capital Expenditure (CAPEX)', d.cashFlow.capex,
    {indent:1, negative:true, valArgb:'FF8B0000'});
  blankRow(cf, cr++);

  applySubTitle(cf, cr++, 'FINANCING ACTIVITIES');
  writeRow(cf, cr++, 'Equity / Debt Raised', d.cashFlow.financing, {indent:1});
  writeRow(cf, cr++, 'Taxes Paid', d.cashFlow.taxes,
    {indent:1, negative:true, valArgb:'FF8B0000'});
  blankRow(cf, cr++);

  writeRow(cf, cr++, 'Net Cash Movement', d.cashFlow.netCash,
    {bold:true, fillArgb:LGRAY, topBorder:true, bottomBorder:true});
  writeRow(cf, cr++, 'Closing Cash Balance', d.cashFlow.closingBalances,
    {bold:true, fillArgb:'FFD6F5E2', topBorder:true, bottomBorder:true});

  cf.getCell(`A${cr}`).value = 'All figures in $K  ·  Generated by Vision & Virtue Agentic Finance Team';
  cf.getCell(`A${cr}`).font  = italFont(9, 'FF708598');

  // ════════════════════════════════════════════════════════════════
  // SHEET 3 — KPI Dashboard
  // ════════════════════════════════════════════════════════════════
  const kpi = wb.addWorksheet('KPI Dashboard', { views:[{state:'frozen',ySplit:4}] });
  setColWidths(kpi, [32, 14, 14, 14, 14, 14]);

  applyTitle(kpi, `${d.companyName}  |  KPI Dashboard  ($K unless noted)`);
  kpi.mergeCells('A2:F2');
  kpi.getCell('A2').value = `TAM: ${d.kpis.tam}`;
  kpi.getCell('A2').font  = italFont(10, 'FF708598');
  kpi.getCell('A2').fill  = hdrFill(NAVY2);
  kpi.getRow(2).height = 16;

  blankRow(kpi, 3);
  writeYearHeader(kpi, 4);

  let kr = 5;
  applySubTitle(kpi, kr++, 'UNIT ECONOMICS');
  writeRow(kpi, kr++, 'Customers',         d.kpis.customers, {fmt:'#,##0'});
  writeRow(kpi, kr++, 'ARPU ($K / yr)',     d.kpis.arpu);
  writeRow(kpi, kr++, 'CAC ($K)',           d.kpis.cac);
  writeRow(kpi, kr++, 'LTV ($K)',           d.kpis.ltv);
  writeRow(kpi, kr++, 'LTV / CAC Ratio',
    d.kpis.ltv.map((v,i) => d.kpis.cac[i] ? +(v/d.kpis.cac[i]).toFixed(1) : 0),
    {bold:true, fillArgb:'FFDCE8FF', fmt:'0.0x'});
  writeRow(kpi, kr++, 'Churn Rate (%)',     d.kpis.churnPct.map(v=>v/100), {pctFmt:true});
  blankRow(kpi, kr++);

  applySubTitle(kpi, kr++, 'SAAS METRICS');
  writeRow(kpi, kr++, 'ARR ($K)',  d.kpis.arr);
  writeRow(kpi, kr++, 'MRR ($K)',  d.kpis.mrr);
  writeRow(kpi, kr++, 'NRR (%)',   d.kpis.nrrPct.map(v=>v/100), {pctFmt:true, bold:true, fillArgb:'FFD6F5E2'});
  blankRow(kpi, kr++);

  applySubTitle(kpi, kr++, 'GROWTH METRICS');
  const rrGrowth = d.pnl.revenue.map((v,i)=> i===0 ? null : (d.pnl.revenue[i-1] ? +((v/d.pnl.revenue[i-1]-1)*100).toFixed(1) : null));
  const arrGrowth = d.kpis.arr.map((v,i)=> i===0 ? null : (d.kpis.arr[i-1] ? +((v/d.kpis.arr[i-1]-1)*100).toFixed(1) : null));
  writeRow(kpi, kr++, 'Revenue YoY Growth (%)',
    rrGrowth.map(v=>v==null?'n/a':v/100), {pctFmt:true});
  writeRow(kpi, kr++, 'ARR YoY Growth (%)',
    arrGrowth.map(v=>v==null?'n/a':v/100), {pctFmt:true});
  writeRow(kpi, kr++, 'Gross Margin (%)',
    d.pnl.grossMarginPct.map(v=>v/100), {pctFmt:true});
  writeRow(kpi, kr++, 'EBITDA Margin (%)',
    d.pnl.ebitdaMarginPct.map(v=>v/100), {pctFmt:true, bold:true, fillArgb:LGRAY});
  blankRow(kpi, kr++);

  applySubTitle(kpi, kr++, 'MARKET METRICS');
  writeRow(kpi, kr++, 'TAM Penetration (%)',
    d.kpis.penetrationPct.map(v=>v/100), {pctFmt:true});
  writeRow(kpi, kr++, 'Revenue / Employee ($K)',
    d.pnl.revenue.map((v,i)=> d.kpis.customers[i] ? Math.round(v/(d.kpis.customers[i]*0.5)) : 0));

  kpi.getCell(`A${kr}`).value = 'Generated by Vision & Virtue Agentic Finance Team';
  kpi.getCell(`A${kr}`).font  = italFont(9, 'FF708598');

  // ════════════════════════════════════════════════════════════════
  // SHEET 4 — Assumptions & Working Papers
  // ════════════════════════════════════════════════════════════════
  const asm = wb.addWorksheet('Assumptions');
  setColWidths(asm, [30, 28, 40]);

  applyTitle(asm, `${d.companyName}  |  Model Assumptions & Working Papers`, 'C');

  asm.mergeCells('A2:C2');
  asm.getCell('A2').value = 'All material assumptions driving the financial model';
  asm.getCell('A2').font  = italFont(10, 'FF708598');
  asm.getCell('A2').fill  = hdrFill(NAVY2);
  asm.getRow(2).height = 16;

  blankRow(asm, 3);

  // Header row
  ['Assumption', 'Value / Range', 'Rationale'].forEach((h, i) => {
    const c = asm.getCell(4, i+1);
    c.value = h;
    c.fill  = hdrFill(BLUE);
    c.font  = boldFont(11, WHITE);
    c.alignment = { horizontal: i===0 ? 'left' : 'center' };
    c.border = thinBorder();
  });
  asm.getRow(4).height = 20;

  let ar = 5;
  d.assumptions.forEach((a, idx) => {
    const row = asm.getRow(ar);
    row.height = 18;
    const cells = [a.item, a.value, a.rationale];
    cells.forEach((val, i) => {
      const c = asm.getCell(ar, i+1);
      c.value = val;
      c.font  = i === 0 ? boldFont(10) : normFont(10);
      c.fill  = hdrFill(idx % 2 === 0 ? WHITE : LGRAY);
      c.border = thinBorder();
      c.alignment = { wrapText:true, vertical:'middle' };
    });
    ar++;
  });

  blankRow(asm, ar++);

  // Working paper: cost allocation ratios
  applySubTitle(asm, ar++, 'COST ALLOCATION RATIOS (Working Paper)', 'C');
  const ratioHdr = asm.getRow(ar++);
  ['Category', 'Sub-Line Item', '% of Total Category'].forEach((h, i) => {
    const c = asm.getCell(ar-1, i+1);
    c.value = h;
    c.fill  = hdrFill(NAVY2);
    c.font  = boldFont(10, GOLD);
    c.border = thinBorder();
  });
  const allMixes = [['COGS', cogsMix], ['R&D', rdMix], ['S&M', smMix], ['G&A', gaMix]];
  allMixes.forEach(([cat, mix]) => {
    Object.entries(mix).forEach(([item, pct], idx) => {
      const c1 = asm.getCell(ar, 1); c1.value = idx === 0 ? cat : '';
      const c2 = asm.getCell(ar, 2); c2.value = item;
      const c3 = asm.getCell(ar, 3); c3.value = pct;
      c3.numFmt = '0%';
      [c1,c2,c3].forEach(c => {
        c.fill   = hdrFill(ar % 2 === 0 ? WHITE : LGRAY);
        c.font   = normFont(10);
        c.border = thinBorder();
      });
      ar++;
    });
  });

  asm.getCell(`A${ar}`).value = 'Generated by Vision & Virtue Agentic Finance Team';
  asm.getCell(`A${ar}`).font  = italFont(9, 'FF708598');

  // ── Write to Blob ──────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
