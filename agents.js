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
