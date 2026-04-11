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
  if (!key.startsWith('sk-ant-')) {
    gateError.textContent = 'Please enter a valid Claude API key (starts with sk-ant-).';
    accessApiKey.focus();
    return;
  }

  sessionStorage.setItem('vv_auth', '1');
  sessionStorage.setItem('vv_key', key);
  accessGate.style.display = 'none';
  agentsApp.style.display  = 'block';
}

// Auto-pass if already authenticated this session
if (sessionStorage.getItem('vv_auth') === '1' && sessionStorage.getItem('vv_key')) {
  accessGate.style.display = 'none';
  agentsApp.style.display  = 'block';
}

accessBtn.addEventListener('click', tryAccess);
[accessPin, accessApiKey].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') tryAccess(); })
);

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
    const responseText = await callClaude(agent.system, conversationHistory);
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

// ── Claude API call ──────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
  const apiKey = sessionStorage.getItem('vv_key') || window.VV_API_KEY || '';

  if (!apiKey) {
    throw new Error('Claude API key not configured. Set window.VV_API_KEY before using agents.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':            'application/json',
      'x-api-key':               apiKey,
      'anthropic-version':       '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.content[0].text;
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
  el.textContent = `Error: ${msg}`;
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
  a.href = 'VisionVirtue_FM_Template.xlsx';
  a.download = 'VisionVirtue FM Template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});


// ─── PowerPoint Template Generator ───────────────────────────
document.getElementById('downloadPptBtn').addEventListener('click', generatePptTemplate);

function generatePptTemplate() {
  if (typeof PptxGenJS === 'undefined') {
    alert('PowerPoint library is still loading — please try again in a moment.');
    return;
  }

  const pptx = new PptxGenJS();
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
}

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
    });
  });
}
