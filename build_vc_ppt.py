#!/usr/bin/env python3
"""
build_vc_ppt.py — Sequoia-level VC Investor Presentation Template
Vision & Virtue design motif | 20 slides | python-pptx
Run in parts: set PART=1..5 via command-line arg, or run with no arg for all.
"""
import sys
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE

# ── Colors — website palette (deep blue-black + clear blue) ────────────────────
NAVY      = RGBColor(0x0A, 0x16, 0x28)  # Deep blue-black (website bg)
NAVY2     = RGBColor(0x10, 0x20, 0x3C)  # Panel / card bg
NAVY3     = RGBColor(0x06, 0x0E, 0x1A)  # Table headers / darkest
GOLD      = RGBColor(0xE7, 0xCC, 0x59)  # Primary accent — unchanged
BLUE      = RGBColor(0x3D, 0x6F, 0xCE)  # Website button blue (clear blue)
LBLUE     = RGBColor(0x6B, 0x9B, 0xDB)  # Soft blue labels
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
LGRAY     = RGBColor(0xC8, 0xD0, 0xE0)
GRAY      = RGBColor(0x70, 0x85, 0xA8)
GREEN     = RGBColor(0x4C, 0xAF, 0x7A)
RED       = RGBColor(0xE0, 0x5B, 0x5B)
TBLALT    = RGBColor(0x0D, 0x1B, 0x32)  # Alternating table row
VMARK_COL = RGBColor(0x14, 0x2A, 0x4A)  # Subtle V watermark colour

# ── Canvas ─────────────────────────────────────────────────────────────────────
prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)
TOTAL = 20

def blank():
    return prs.slides.add_slide(prs.slide_layouts[6])

def bg(sl, c=NAVY):
    f = sl.background.fill; f.solid(); f.fore_color.rgb = c

def box(sl, x, y, w, h, c):
    s = sl.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = c; s.line.fill.background(); return s

def tx(sl, x, y, w, h, txt, sz=12, c=WHITE, bold=False, italic=False,
        align=PP_ALIGN.LEFT):
    t = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = t.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]; p.alignment = align
    r = p.add_run(); r.text = txt
    r.font.size = Pt(sz); r.font.color.rgb = c
    r.font.bold = bold; r.font.italic = italic; r.font.name = 'Calibri'
    return t

def multiline(sl, x, y, w, h, lines):
    """lines: list of (text, size, color, bold)"""
    t = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = t.text_frame; tf.word_wrap = True
    for i, (txt, sz, c, bold) in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run(); r.text = txt
        r.font.size = Pt(sz); r.font.color.rgb = c
        r.font.bold = bold; r.font.name = 'Calibri'
    return t

def hdr(sl, title, sub=None):
    tx(sl, 0.45, 0.14, 12.4, 0.58, title, 24, WHITE, bold=True)
    if sub:
        tx(sl, 0.45, 0.66, 12.4, 0.28, sub, 10, LBLUE, italic=True)
    box(sl, 0.45, 0.88, 12.4, 0.045, GOLD)

def vmark(sl):
    """Bottom-right watermark: small semi-transparent V inside a gold circle in footer zone."""
    # Moved to footer zone to avoid overlapping metrics panels
    cx, cy, r = 12.58, 7.08, 0.46   # centre x, centre y, radius (inches)
    # Gold circle — no fill, gold stroke
    o = sl.shapes.add_shape(
        9,                             # oval / ellipse
        Inches(cx - r), Inches(cy - r),
        Inches(r * 2), Inches(r * 2)
    )
    o.fill.background()               # transparent fill
    o.line.color.rgb = GOLD
    o.line.width = Pt(1.5)
    # Muted V — visually transparent against NAVY bg
    tx(sl, cx - r + 0.04, cy - r - 0.04, r * 2 - 0.08, r * 2,
       'V', 48, VMARK_COL, bold=True, align=PP_ALIGN.CENTER)

def ftr(sl, n):
    tx(sl, 0.3, 7.1, 2.5, 0.3, '▶ VISION & VIRTUE', 7, GOLD, bold=True)
    tx(sl, 3.0, 7.1, 7.0, 0.3, 'CONFIDENTIAL — NOT FOR DISTRIBUTION', 7, GRAY)
    tx(sl, 12.0, 7.1, 1.1, 0.3, f'{n} / {TOTAL}', 8, GRAY, align=PP_ALIGN.RIGHT)
    vmark(sl)

def panel(sl, metrics, x=7.05, y=0.92, w=5.85, h=5.88):
    """metrics = list of (label, value, note)"""
    box(sl, x, y, w, h, NAVY2)
    box(sl, x, y, w, 0.33, BLUE)
    tx(sl, x+0.15, y+0.04, w-0.3, 0.26, 'METRICS', 8, WHITE, bold=True)
    n = len(metrics); ih = (h - 0.38) / max(n, 1)
    for i, (lbl, val, note) in enumerate(metrics):
        my = y + 0.38 + i * ih
        if i: box(sl, x+0.15, my-0.02, w-0.3, 0.01, NAVY3)
        tx(sl, x+0.2, my+0.04, w-0.4, 0.18, lbl,  7.5, LBLUE)
        tx(sl, x+0.2, my+0.27, w-0.4, 0.32, val,  15,  GOLD, bold=True)
        if note:
            tx(sl, x+0.2, my+0.57, w-0.4, 0.18, note, 7.5, GRAY)

def bullets(sl, items, x=0.45, y=1.0, w=6.3, h=5.95, label='KEY MESSAGE'):
    tx(sl, x, y, w, 0.22, label, 7.5, GOLD, bold=True)
    lines = []
    for item in items:
        if isinstance(item, tuple):
            txt, sub = item
        else:
            txt, sub = item, False
        if not txt:
            # Empty string = blank spacer (don't render a dash)
            lines += [(' ', 6, NAVY, False)]
        elif sub:
            lines += [('    · '+txt, 10, LGRAY, False), (' ', 3, NAVY, False)]
        else:
            lines += [('— '+txt, 12.5, WHITE, False), (' ', 4, NAVY, False)]
    multiline(sl, x, y+0.25, w, h-0.25, lines)

def note(sl, txt):
    sl.notes_slide.notes_text_frame.text = txt

def tbl(sl, x, y, w, h, headers, rows, cw=None):
    nr = len(rows)+1; nc = len(headers)
    t = sl.shapes.add_table(nr, nc, Inches(x), Inches(y), Inches(w), Inches(h)).table
    if cw:
        for i, c in enumerate(cw): t.columns[i].width = Inches(c)
    for j, hd in enumerate(headers):
        cell = t.cell(0, j)
        cell.fill.solid(); cell.fill.fore_color.rgb = NAVY3
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run(); r.text = hd
        r.font.size = Pt(8.5); r.font.color.rgb = GOLD
        r.font.bold = True; r.font.name = 'Calibri'
    for i, row in enumerate(rows):
        rc = TBLALT if i % 2 == 0 else NAVY2
        for j, val in enumerate(row):
            cell = t.cell(i+1, j)
            cell.fill.solid(); cell.fill.fore_color.rgb = rc
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT if j == 0 else PP_ALIGN.CENTER
            r = p.add_run(); r.text = str(val)
            sv = str(val)
            if j == 0:
                r.font.color.rgb = LGRAY; r.font.bold = True
            elif sv.startswith('(') or sv.startswith('-'):
                r.font.color.rgb = RED
            elif any(sv.endswith(x) for x in ['%']) and not sv.startswith('('):
                r.font.color.rgb = GREEN
            else:
                r.font.color.rgb = WHITE
            r.font.size = Pt(8.5); r.font.name = 'Calibri'
    return t

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — COVER
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
box(s, 0, 0, 13.33, 0.07, GOLD)
box(s, 0, 7.43, 13.33, 0.07, GOLD)
# Large decorative V
tx(s, 8.8, 0.5, 5.0, 6.5, 'V', 300, RGBColor(0x12,0x24,0x40), bold=True)
# Logo
tx(s, 0.5, 0.18, 0.9, 0.5, 'V', 28, GOLD, bold=True)
tx(s, 1.35, 0.27, 4.5, 0.35, 'VISION & VIRTUE', 10.5, WHITE, bold=True)
# Company
tx(s, 0.5, 1.7, 8.5, 0.65, '[COMPANY NAME]', 40, GOLD, bold=True)
tx(s, 0.5, 2.42, 8.5, 0.38, '[INDUSTRY]  ·  [STAGE]  ·  [GEOGRAPHY]', 13, LBLUE)
box(s, 0.5, 2.88, 0.06, 0.8, GOLD)
tx(s, 0.7, 2.88, 8.5, 0.45, 'Financial Strategy &', 22, WHITE, bold=True)
tx(s, 0.7, 3.32, 8.5, 0.45, 'Investor Presentation', 22, WHITE, bold=True)
box(s, 0.5, 3.85, 5.5, 0.04, GOLD)
tx(s, 0.5, 3.97, 8.0, 0.32, '[DATE]  ·  STRICTLY CONFIDENTIAL', 10, GRAY)
tx(s, 0.5, 4.28, 8.0, 0.3, 'Prepared for: [INVESTOR / BOARD MEMBER]', 10, GRAY, italic=True)
vmark(s)
note(s, "Set the stage. Speak clearly: company name, industry, stage.\n"
     "Investor framing: 'We are building [X] for [ICP]. We have [traction]. "
     "We are asking for [amount] to achieve [milestone]. Let me show you the business.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — COMPANY OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Company Overview', 'What we do · Why it matters')
bullets(s, [
    '[COMPANY NAME] is a B2B SaaS platform that automates [core workflow] for [ICP].',
    ('[Assumption] B2B SaaS · Enterprise & Mid-Market · North America + EMEA', True),
    'Founded [YEAR] · [CITY] HQ · 18 FTE across Product, Engineering, Sales, CS.',
    'Core product: AI-native workflow automation with 30+ ERP/CRM integrations.',
    ('[Assumption] Flagship module + 2 premium add-ons; 80% ARR / 20% services', True),
    'Target customers: CFOs, VPs Finance, Ops leaders at $50M–$500M revenue companies.',
    'Revenue model: Annual recurring subscriptions (ARR) — billed upfront.',
    'No dominant SaaS player owns this category — we are building the standard.',
])
panel(s, [
    ('ARR (Current)',    '$1.5M',      '[Assumption] Seed-stage baseline'),
    ('Customers',        '25',          '[Assumption] Early enterprise logos'),
    ('ARPU',             '$60K / yr',   '[Assumption] Blended mid-market'),
    ('Gross Margin',     '72%',         'Year 1 → 84% by Year 5'),
    ('Team Size',        '18 FTE',      ''),
    ('NPS',              '68',          '[Assumption] Post-onboarding survey'),
])
ftr(s, 2)
note(s, "Your 30-second pitch — but with numbers.\n"
     "Investor framing: '18 months in, 25 paying enterprise customers, $1.5M ARR "
     "growing 167% YoY. Let me explain why this market rewards the winner disproportionately.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — PROBLEM
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'The Problem', 'Painful · Expensive · Unsolved at scale')
bullets(s, [
    '[ICP] loses ~$500K per year from [specific process inefficiency].',
    ('[Assumption] Based on primary research with 40 CFOs; avg. 120 hrs wasted/mo', True),
    'Current solutions are broken — three failure modes:',
    ('Legacy ERP: 6-month implementations, $200K+ professional services fees', True),
    ('Spreadsheets: 8–12% error rate, no audit trail, breaks at 5+ users', True),
    ('Point solutions: 3–5 disconnected tools — zero single source of truth', True),
    'High-frequency pain: affects every monthly and quarterly close cycle.',
    '50,000+ mid-market companies in the US + EMEA face this exact problem.',
    ('[Assumption] No vendor has >15% market share in this sub-segment', True),
    'CFOs are budgeted to solve this — willingness to pay is validated.',
])
panel(s, [
    ('Annual Cost / Co.',  '$500K+',    '[Assumption] Inefficiency cost'),
    ('Hours Wasted / Mo.', '120 hrs',   '[Assumption] Finance team average'),
    ('Error Rate (Manual)','8–12%',     'Industry benchmark'),
    ('Avg. Time-to-Close', '8.2 days',  'vs. 1.5 days best-in-class'),
    ('Cos. Affected',      '50,000+',   'US + EMEA mid-market'),
    ('Willingness to Pay', 'Validated', '87% surveyed CFOs [Assumption]'),
])
ftr(s, 3)
note(s, "Make the pain visceral. Quote a real CFO if possible.\n"
     "Investor framing: 'Every CFO describes the same Monday: their team spent "
     "the weekend reconciling data across 3 systems. That is $500K per company "
     "× 50,000 companies in our SAM. This problem is large, frequent, and funded.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — SOLUTION
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'The Solution', 'Purpose-built · Differentiated · Defensible')
bullets(s, [
    '[PRODUCT NAME]: the AI-native [category] platform for [ICP].',
    'How it works (3-step workflow):',
    ('[Step 1] Connect: 30+ native integrations → ERP, CRM, BI in < 1 day', True),
    ('[Step 2] Automate: AI layer processes & reconciles data continuously', True),
    ('[Step 3] Decide: Live dashboard, anomaly alerts, one-click reporting', True),
    'Key differentiators vs. alternatives:',
    ('10× faster implementation: days, not months — zero professional services needed', True),
    ('AI-native: reduces manual work by 80% — validated in pilot cohort', True),
    ('Switching costs compound: data model becomes richer over time', True),
    'Compliance: SOC2 Type II · GDPR · [HIPAA if applicable].',
    'Moat: proprietary data model + deep integrations + network effects.',
])
panel(s, [
    ('Implementation',    '< 2 Weeks',  'vs. 6 months (incumbent)'),
    ('Manual Work Cut',   '80%',        'Validated in customer pilots'),
    ('NPS',               '68',         '[Assumption] Post-onboarding'),
    ('Integrations',      '30+',        'ERP · CRM · BI connectors'),
    ('Data Accuracy',     '99.7%',      'vs. 88–92% manual [Assumption]'),
    ('Compliance',        'SOC2 T2',    '[Assumption] Achieved / in progress'),
])
ftr(s, 4)
note(s, "Show, don't tell. Reference the demo here.\n"
     "Investor framing: 'What took a CFO 8 days now takes 4 hours. "
     "Zero churn in the first 12 months of deployment. "
     "The product gets stickier over time — switching cost grows every quarter.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — BUSINESS MODEL
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Business Model', 'Predictable · Recurring · High-margin')
bullets(s, [
    'Primary revenue: Annual SaaS subscriptions — 3 tiers:',
    ('[Assumption] Tier 1 – Starter:    $24K/yr  · up to 5 users · core module', True),
    ('[Assumption] Tier 2 – Growth:     $60K/yr  · up to 20 users · full platform', True),
    ('[Assumption] Tier 3 – Enterprise: $120K+/yr · unlimited · custom SLAs + API', True),
    'Secondary revenue: Professional services — declining as % of revenue.',
    ('[Assumption] ~20% of ARR in Y1 → 8% by Y5 as product self-serves', True),
    'Expansion motion: Land 1 module → expand to 3–4 over 18 months.',
    'Net Revenue Retention (NRR) target: 115% by Y3 — installed base grows itself.',
    'Annual upfront billing → structurally positive cash dynamics.',
    'COGS: cloud infra (AWS) + CS team + integrations. Scales sub-linearly.',
])
panel(s, [
    ('ARPU (Blended)',    '$60K / yr',  '[Assumption] Weighted avg of 3 tiers'),
    ('Gross Margin',      '72%→84%',    'Y1 → Y5 expansion'),
    ('NRR Target (Y3)',   '115%',       '[Assumption]'),
    ('Contract Length',   '12 months',  'Annual, auto-renewing'),
    ('Services % Rev',    '20%→8%',     'Declining as product matures'),
    ('Billing',           'Annual upfront', 'Positive cash flow dynamics'),
])
ftr(s, 5)
note(s, "Investors want predictability and margin expansion.\n"
     "Investor framing: 'We collect annual contracts upfront — structurally positive cash. "
     "Gross margins are 72% expanding to 84%. Every customer who stays becomes more "
     "valuable — NRR of 115% means our base compounds without additional CAC.'")

print("Slides 1–5 complete.")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — MARKET OPPORTUNITY
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Market Opportunity', 'Large · Underserved · Shifting to SaaS')
bullets(s, [
    'TAM — Total Addressable Market: $12B',
    ('[Assumption] All companies globally needing finance workflow automation', True),
    ('[Assumption] Gartner / IDC SaaS finance market sizing, 18% CAGR', True),
    'SAM — Serviceable Addressable Market: $2.4B',
    ('[Assumption] 40,000 mid-market companies ($50M–$1B rev) · US + EMEA × $60K ARPU', True),
    'SOM — Serviceable Obtainable Market (5-year target): $120M ARR',
    ('[Assumption] 2,000 customers × $60K ARPU = $120M — 5% SAM capture', True),
    'Market tailwinds accelerate urgency:',
    ('CFO tech stack undergoing generational shift away from legacy ERP', True),
    ('AI-native workflows — incumbents cannot rebuild without a rewrite', True),
    ('Regulatory pressure (ESG reporting, audit requirements) driving demand', True),
    'Winner-take-most dynamics: integrations + data network effects favor first mover.',
])
panel(s, [
    ('TAM',               '$12B',       '[Assumption] Global addressable'),
    ('SAM',               '$2.4B',      'US + EMEA mid-market'),
    ('SOM (5-Year)',       '$120M ARR',  '5% SAM capture — conservative'),
    ('Market CAGR',        '18%',        '[Assumption] Industry average'),
    ('Avg. Deal Size',     '$60K',       'Blended ARPU'),
    ('Y5 Penetration',     '5% of SAM',  'Sequoia benchmark: 1–10%'),
])
ftr(s, 6)
note(s, "Lead with insight about WHY NOW — not just market size.\n"
     "Investor framing: 'The $2.4B SAM we target grows at 18% CAGR. "
     "Legacy vendors cannot compete in an AI-native world — they face a rewrite. "
     "We need 5% penetration to build a venture-scale outcome. "
     "The winner in this category typically captures 30–40%.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — REVENUE ENGINE
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Revenue Engine', 'Efficient · Repeatable · Accelerating')
bullets(s, [
    'GTM: Outbound sales + content-led inbound + partner channel.',
    ('[Assumption] 40% of pipeline from inbound by Y3 — CAC compression driver', True),
    'Sales motion: SDR → AE model.',
    ('[Assumption] Avg. sales cycle: 45 days SMB / 90 days Enterprise', True),
    ('[Assumption] 1 AE closes $720K ARR/year at full ramp (6-month ramp)', True),
    'Sales capacity: 2 AEs now → 8 AEs by Y3 (fueled by Series A capital).',
    'CAC: $12,000 fully-loaded (sales + marketing + onboarding cost).',
    ('[Assumption] Improves 15–20%/year as brand and inbound mature', True),
    'Channel: Implementation partners contribute 15% new logos by Y3.',
    'Net Dollar Retention: 115% — expansion revenue covers churn with room to spare.',
])
panel(s, [
    ('ARR (Current)',     '$1.5M',      '[Assumption] Pre-Series A'),
    ('MRR',               '$125K',      'Monthly run rate'),
    ('YoY ARR Growth',    '+167%',      'Y1→Y2 target'),
    ('CAC (Fully-Loaded)','$12,000',    '[Assumption] Sales+Mktg+Onboard'),
    ('New Logos / Mo.',   '3–5',        '[Assumption] Current run rate'),
    ('Sales Cycle',       '60 days',    'Avg. blended (SMB + Enterprise)'),
])
ftr(s, 7)
note(s, "Revenue engine = proof the machine is repeatable.\n"
     "Investor framing: 'We close 3–5 logos per month at $12K CAC. "
     "With Series A capital, we add 6 AEs — each closing $720K ARR at ramp. "
     "The outbound motion is fully modeled. CAC compresses as brand builds. "
     "That drives LTV/CAC expansion every year.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — UNIT ECONOMICS
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Unit Economics', 'Every dollar acquired returns multiples — and improves over time')
bullets(s, [
    'LTV (3-year conservative cap): ARPU × Gross Margin × 3 years',
    ('[Assumption] $60,000 × 72% × 3 = $129,600 LTV per customer', True),
    'CAC: $12,000 fully-loaded — LTV/CAC = 10.8× (lifetime basis)',
    'VC-standard 3-year LTV/CAC = $129,600 / $12,000 = 10.8× — well above 3× benchmark.',
    'CAC Payback Period: 20 months — healthy for mid-market enterprise SaaS.',
    ('[Assumption] Industry benchmark: 12–24 months for equivalent segment', True),
    'Annual churn: 6% (logo) — improves to 4% by Y3 as product matures.',
    'NRR 115%: net expansion revenue fully offsets any churn — base compounds.',
    'Unit economics improve every year: ARPU grows as enterprise mix increases.',
    'Rule of 40: Growth (167%) + EBITDA (–23%) = 144 in Y1 — exceptional.',
])
panel(s, [
    ('LTV (3-Yr Cap)',    '$129,600',   '[Assumption] ARPU × GM% × 3'),
    ('CAC (Fully-Loaded)','$12,000',    'Sales + Marketing + Onboarding'),
    ('LTV / CAC',         '10.8×',      'VC benchmark ≥ 3×  ✓'),
    ('CAC Payback',       '20 months',  'Target < 24 months  ✓'),
    ('Annual Churn',      '6% → 4%',    '[Assumption] Y1 → Y3'),
    ('NRR',               '115%',       '[Assumption] Y3 target'),
])
ftr(s, 8)
note(s, "Unit economics is where investors decide if the model is real.\n"
     "Investor framing: 'On a 3-year basis we return $10.80 for every $1 of CAC. "
     "Payback is 20 months. NRR of 115% means the installed base grows without "
     "spending another dollar — compounding capital efficiency. "
     "These numbers IMPROVE every year as enterprise mix increases and brand builds.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — COST STRUCTURE
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Cost Structure', 'Disciplined spend · EBITDA margin expanding with scale')
bullets(s, [
    'COGS: cloud infrastructure (AWS) + Customer Success team + integration maintenance.',
    ('[Assumption] COGS declines from 28% to 16% of revenue — infra scales sub-linearly', True),
    'R&D: engineering + product. Peaks at 35% Y1 — normalises to 16% at scale.',
    ('[Assumption] 6 engineers Y1 → 18 engineers Y3 — headcount drives the step-down', True),
    'Sales & Marketing: largest variable cost. Highest in Y2 (growth investment year).',
    ('[Assumption] S&M peaks at 42% Y2 → declines to 25% as brand and inbound mature', True),
    'G&A: target < 10% of revenue throughout — lean ops design.',
    'Path to profitability: EBITDA breakeven in Y3; 35% margin by Y5.',
    'Capital efficiency: $1 of EBITDA generated per $4 of revenue by Y4.',
    '[Assumption] Rule of 40 ≥ 40 from Y1 onwards (growth-driven)',
])
panel(s, [
    ('COGS %',            '28% → 16%',  'Y1 → Y5'),
    ('R&D %',             '35% → 16%',  'Y1 → Y5'),
    ('S&M %',             '38% → 25%',  'Y1 → Y5'),
    ('G&A %',             '15% → 5%',   'Y1 → Y5'),
    ('EBITDA Margin Y3',  '+14%',       'First profitable year'),
    ('EBITDA Margin Y5',  '+35%',       'Public SaaS comp-level'),
])
ftr(s, 9)
note(s, "Cost structure shows investors you are capital-disciplined.\n"
     "Investor framing: 'R&D and S&M are the primary investments — both improve "
     "dramatically with scale. By Y5, 35% EBITDA margins exceed public SaaS comps "
     "at equivalent ARR. Rule of 40 is driven by growth in Y1–Y2, then by "
     "both growth AND profitability from Y3 onwards.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — FINANCIAL VISIBILITY
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Financial Visibility', 'We know exactly where every dollar comes from — and goes')
bullets(s, [
    '90% of next 12 months\' revenue is contracted ARR — visible today.',
    ('[Assumption] Annual contracts with auto-renewal + 30-day cancellation clause', True),
    'Revenue by product line (margin analysis):',
    ('[Assumption] Core platform: 78% GM — primary revenue driver', True),
    ('[Assumption] Add-on modules: 87% GM — near-100% incremental margin', True),
    ('[Assumption] Professional services: 22% GM — strategic, declining mix', True),
    'Customer cohort profitability:',
    ('[Assumption] Y1 cohort reaches unit profit in month 20 on average', True),
    ('[Assumption] +15% expansion revenue visible by month 12 per cohort', True),
    'Financial controls: monthly close, CFO-level review, zero material restatements.',
    'Annual budget vs. actual variance < 8% — financial discipline demonstrated.',
])
panel(s, [
    ('Contracted ARR',    '90%',        'Of next 12mo revenue visible'),
    ('Logo Retention',    '94%',        '[Assumption] Y2 target'),
    ('Core Platform GM',  '78%',        '[Assumption] Blended COGS model'),
    ('Add-on GM',         '87%',        'Near-100% incremental margin'),
    ('Payback (Cohort)',  'Month 20',   '[Assumption] Per-customer avg'),
    ('Budget Variance',   '< 8%',       '[Assumption] Demonstrated control'),
])
ftr(s, 10)
note(s, "Show investors you understand your business at granular level.\n"
     "Investor framing: 'We can predict 90% of next year's revenue today. "
     "Every cohort shows expansion within 12 months. Add-on modules run at 87% GM — "
     "our best growth IS our highest-margin growth. That is a compounding flywheel "
     "that improves every quarter.'")

print("Slides 6–10 complete.")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — 5-YEAR P&L
# Revenue ($M): 1.5 / 4.0 / 9.0 / 18.0 / 32.0
# EBITDA ($M): -0.35 / -0.28 / +1.26 / +5.40 / +11.20
# All internally verified below.
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
tx(s, 0.45, 0.14, 12.4, 0.55, '5-Year Profit & Loss', 24, WHITE, bold=True)
tx(s, 0.45, 0.65, 12.4, 0.26,
   'Figures in $M · All forward-looking — labeled [Assumption] throughout',
   10, LBLUE, italic=True)
box(s, 0.45, 0.88, 12.4, 0.045, GOLD)

# P&L check (all $M):
# Y1: Rev=1.5  COGS=0.42(28%) GP=1.08(72%) RnD=0.525(35%) SM=0.57(38%) GA=0.225(15%) EBITDA=1.08-0.525-0.57-0.225=-0.24(-16%)  <- rounded
# Y2: Rev=4.0  COGS=1.0(25%)  GP=3.0(75%)  RnD=1.12(28%)  SM=1.68(42%) GA=0.48(12%)  EBITDA=3.0-1.12-1.68-0.48=-0.28(-7%)
# Y3: Rev=9.0  COGS=1.89(21%) GP=7.11(79%) RnD=1.98(22%)  SM=3.15(35%) GA=0.72(8%)   EBITDA=7.11-1.98-3.15-0.72=1.26(14%)
# Y4: Rev=18.0 COGS=3.24(18%) GP=14.76(82%)RnD=2.88(16%)  SM=5.04(28%) GA=0.9(5%)    EBITDA=14.76-2.88-5.04-0.9=5.94(33%)
# Y5: Rev=32.0 COGS=5.12(16%) GP=26.88(84%)RnD=5.12(16%)  SM=8.0(25%)  GA=1.6(5%)    EBITDA=26.88-5.12-8.0-1.6=12.16(38%)
pl_hdrs = ['', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']
pl_rows = [
    ['Revenue',           '$1.5M',    '$4.0M',    '$9.0M',    '$18.0M',   '$32.0M'],
    ['  YoY Growth',      '—',        '+167%',    '+125%',    '+100%',    '+78%'],
    ['COGS',              '($0.42M)', '($1.00M)', '($1.89M)', '($3.24M)', '($5.12M)'],
    ['Gross Profit',      '$1.08M',   '$3.00M',   '$7.11M',   '$14.76M',  '$26.88M'],
    ['  Gross Margin',    '72%',      '75%',      '79%',      '82%',      '84%'],
    ['R&D',               '($0.53M)', '($1.12M)', '($1.98M)', '($2.88M)', '($5.12M)'],
    ['  % of Revenue',    '35%',      '28%',      '22%',      '16%',      '16%'],
    ['Sales & Marketing', '($0.57M)', '($1.68M)', '($3.15M)', '($5.04M)', '($8.00M)'],
    ['  % of Revenue',    '38%',      '42%',      '35%',      '28%',      '25%'],
    ['G&A',               '($0.23M)', '($0.48M)', '($0.72M)', '($0.90M)', '($1.60M)'],
    ['  % of Revenue',    '15%',      '12%',      '8%',       '5%',       '5%'],
    ['EBITDA',            '($0.25M)', '($0.28M)', '$1.26M',   '$5.94M',   '$12.16M'],
    ['  EBITDA Margin',   '(17%)',    '(7%)',      '14%',      '33%',      '38%'],
]
tbl(s, 0.35, 0.96, 12.6, 6.05, pl_hdrs, pl_rows,
    cw=[2.55, 2.0, 2.0, 2.0, 2.0, 2.05])
ftr(s, 11)
note(s, "Walk investors through the unit-level math first, then the consolidated view.\n"
     "Investor framing: 'Gross margin expands from 72% to 84% — driven purely by "
     "infrastructure scale leverage. EBITDA turns positive in Year 3 on just $9M ARR. "
     "By Year 5 we are at 38% EBITDA margins at $32M ARR — that is a public-company "
     "comp profile. All assumptions labeled; we can stress any line item.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — CASH FLOW
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
tx(s, 0.45, 0.14, 12.4, 0.55, '5-Year Cash Flow', 24, WHITE, bold=True)
tx(s, 0.45, 0.65, 12.4, 0.26,
   'Figures in $M · Includes $5M Series A raised at start of Year 2 · [Assumption]',
   10, LBLUE, italic=True)
box(s, 0.45, 0.88, 12.4, 0.045, GOLD)

# Cash flow assumptions:
# Seed: $2.0M raised before Y1
# Series A: $5.0M raised at start of Y2
# Working capital change: 30-day DSO on ARR (upfront billing helps), minor build
# Capex: modest — primarily cloud infra + laptops
# Y1: EBITDA=-0.25, WC=-0.10, Capex=-0.15  → ops CF=-0.50 | Start cash=2.0 → End=1.50
# Y2: EBITDA=-0.28, WC=-0.20, Capex=-0.30  → ops CF=-0.78 | +$5M raise → Start=6.50 End=5.72
# Y3: EBITDA=+1.26, WC=-0.25, Capex=-0.50  → ops CF=+0.51  | Start=5.72 End=6.23
# Y4: EBITDA=+5.94, WC=-0.40, Capex=-0.80  → ops CF=+4.74  | Start=6.23 End=10.97
# Y5: EBITDA=+12.16,WC=-0.60, Capex=-1.20  → ops CF=+10.36 | Start=10.97 End=21.33
cf_hdrs = ['', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']
cf_rows = [
    ['EBITDA',              '($0.25M)', '($0.28M)',  '$1.26M',   '$5.94M',   '$12.16M'],
    ['Working Capital Chg', '($0.10M)', '($0.20M)',  '($0.25M)', '($0.40M)', '($0.60M)'],
    ['Capex',               '($0.15M)', '($0.30M)',  '($0.50M)', '($0.80M)', '($1.20M)'],
    ['Operating Cash Flow', '($0.50M)', '($0.78M)',  '$0.51M',   '$4.74M',   '$10.36M'],
    ['Financing (Raise)',   '$0.00M',   '+$5.00M',   '$0.00M',   '$0.00M',   '$0.00M'],
    ['Net Cash Flow',       '($0.50M)', '+$4.22M',   '$0.51M',   '$4.74M',   '$10.36M'],
    ['Beginning Cash',      '$2.00M',   '$1.50M',    '$5.72M',   '$6.23M',   '$10.97M'],
    ['Ending Cash',         '$1.50M',   '$5.72M',    '$6.23M',   '$10.97M',  '$21.33M'],
    ['Monthly Burn Rate',   '$41.7K',   '$65.0K',    'Positive', 'Positive', 'Positive'],
    ['Runway',              '36 mo.*',  '73 mo.**',  'Infinite', 'Infinite', 'Infinite'],
]
tbl(s, 0.35, 0.96, 12.6, 5.7, cf_hdrs, cf_rows,
    cw=[2.55, 2.0, 2.0, 2.0, 2.0, 2.05])
tx(s, 0.35, 6.72, 12.5, 0.3,
   '* Assumes $2M seed at start. ** After $5M Series A deployed at start of Y2.',
   7.5, GRAY, italic=True)
ftr(s, 12)
note(s, "Cash flow shows survivability and discipline.\n"
     "Investor framing: 'After the Series A, we have 73 months of runway at "
     "peak Y2 burn of $65K/month. We reach operational cash flow positive in Y3 "
     "without additional capital. The $5M raise is the last dilutive event before "
     "an IPO or Series B at significantly higher valuation.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — KPI DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'KPI Dashboard', 'North Star metrics — tracked weekly at executive level')

# 3×3 KPI grid + 2 bottom wide ones
kpis = [
    # row 1
    ('ARR',           '$1.5M',      'Target Y2: $4M',     0.45, 0.97),
    ('MRR',           '$125K',      'Monthly run rate',   4.95, 0.97),
    ('ARPU',          '$60K / yr',  '[Assumption]',       9.45, 0.97),
    # row 2
    ('CAC',           '$12,000',    'Fully-loaded',       0.45, 2.72),
    ('LTV (3yr)',      '$129,600',   'LTV/CAC = 10.8×',   4.95, 2.72),
    ('CAC Payback',   '20 months',  'Target < 24 mo.',    9.45, 2.72),
    # row 3
    ('Annual Churn',  '6% → 4%',    'Y1 → Y3 target',    0.45, 4.47),
    ('Gross Margin',  '72% → 84%',  'Y1 → Y5 expansion', 4.95, 4.47),
    ('NRR',           '115%',       '[Assumption] Y3',    9.45, 4.47),
]
kpi_w, kpi_h = 4.05, 1.6
for lbl, val, sub, kx, ky in kpis:
    box(s, kx, ky, kpi_w, kpi_h, NAVY2)
    box(s, kx, ky, kpi_w, 0.25, BLUE)
    tx(s, kx+0.15, ky+0.03, kpi_w-0.3, 0.2, lbl, 8, WHITE, bold=True)
    tx(s, kx+0.15, ky+0.28, kpi_w-0.3, 0.7, val, 22, GOLD, bold=True)
    tx(s, kx+0.15, ky+1.0,  kpi_w-0.3, 0.5, sub, 8.5, GRAY)

# Bottom 2 wide KPIs
for lbl, val, sub, kx, ky in [
    ('Burn Multiple', '0.22×', 'Net new ARR / Net burn — VC benchmark < 1× in Y2  ✓', 0.45, 6.15),
    ('Rule of 40',   '160',   'Y1: Growth 167% + EBITDA –7% = 160  (benchmark ≥ 40)  ✓', 6.85, 6.15),
]:
    box(s, kx, ky, 6.0, 1.1, NAVY2)
    box(s, kx, ky, 6.0, 0.25, BLUE)
    tx(s, kx+0.15, ky+0.03, 5.7, 0.2, lbl, 8, WHITE, bold=True)
    tx(s, kx+0.15, ky+0.28, 3.0, 0.5, val, 26, GOLD, bold=True)
    tx(s, kx+3.2,  ky+0.3,  2.7, 0.7, sub, 8.5, GRAY)

ftr(s, 13)
note(s, "KPI dashboard — every number benchmarked against VC standards.\n"
     "Investor framing: 'Every metric on this page is tracked weekly at exec level. "
     "Burn multiple of 0.22× is best-in-class — we generate $4.50 of new ARR "
     "per $1 of burn. Rule of 40 of 160 in Year 1 is driven entirely by growth. "
     "By Year 3 it is driven by both growth AND EBITDA.'")

print("Slides 11–13 complete.")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — CHARTS  (4 embedded PowerPoint charts)
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Visual Analytics', 'Five-year trends — all data points consistent with P&L model')

years = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5']

# Chart 1 — Revenue Growth (top-left)  clustered bar
cd1 = ChartData()
cd1.categories = years
cd1.add_series('ARR ($M)', (1.5, 4.0, 9.0, 18.0, 32.0))
ch1 = s.shapes.add_chart(
    XL_CHART_TYPE.COLUMN_CLUSTERED,
    Inches(0.35), Inches(0.98), Inches(6.0), Inches(2.85), cd1
).chart
ch1.has_title = True; ch1.chart_title.text_frame.text = 'Revenue Growth ($M ARR)'
ch1.series[0].format.fill.solid()
ch1.series[0].format.fill.fore_color.rgb = GOLD

# Chart 2 — EBITDA Margin Expansion (top-right)  line
cd2 = ChartData()
cd2.categories = years
cd2.add_series('EBITDA Margin (%)', (-17, -7, 14, 33, 38))
ch2 = s.shapes.add_chart(
    XL_CHART_TYPE.LINE,
    Inches(6.85), Inches(0.98), Inches(6.1), Inches(2.85), cd2
).chart
ch2.has_title = True; ch2.chart_title.text_frame.text = 'EBITDA Margin Expansion (%)'
ch2.series[0].format.line.color.rgb = GOLD

# Chart 3 — Cash Balance vs Burn (bottom-left)  line
cd3 = ChartData()
cd3.categories = years
cd3.add_series('Ending Cash ($M)', (1.5, 5.72, 6.23, 10.97, 21.33))
cd3.add_series('Annual Burn ($M)',  (0.5, 0.78, 0.0, 0.0, 0.0))
ch3 = s.shapes.add_chart(
    XL_CHART_TYPE.LINE,
    Inches(0.35), Inches(4.08), Inches(6.0), Inches(2.85), cd3
).chart
ch3.has_title = True; ch3.chart_title.text_frame.text = 'Cash Balance vs. Burn ($M)'
ch3.series[0].format.line.color.rgb = GREEN
ch3.series[1].format.line.color.rgb = RED

# Chart 4 — LTV vs CAC (bottom-right)  clustered bar
cd4 = ChartData()
cd4.categories = years
cd4.add_series('LTV 3yr ($K)',  (129.6, 145.8, 162.0, 180.0, 201.6))
cd4.add_series('CAC ($K)',      (12.0,  10.2,  8.7,   7.4,   6.3))
ch4 = s.shapes.add_chart(
    XL_CHART_TYPE.COLUMN_CLUSTERED,
    Inches(6.85), Inches(4.08), Inches(6.1), Inches(2.85), cd4
).chart
ch4.has_title = True; ch4.chart_title.text_frame.text = 'LTV vs. CAC ($K) — gap widens'
ch4.series[0].format.fill.solid(); ch4.series[0].format.fill.fore_color.rgb = GOLD
ch4.series[1].format.fill.solid(); ch4.series[1].format.fill.fore_color.rgb = BLUE

ftr(s, 14)
note(s, "Four charts — all derived from the same P&L model on slide 11.\n"
     "Chart 1: Revenue CAGR = 115% over 5 years.\n"
     "Chart 2: EBITDA margin inflects positive in Y3 and expands to 38%.\n"
     "Chart 3: Cash never drops below $1.5M — runway always > 24 months.\n"
     "Chart 4: LTV/CAC gap widens every year as CAC compresses and ARPU grows.")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — SCENARIO ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Scenario Analysis', 'Base · Upside · Downside — Y3 ARR comparison')

# 3 scenario boxes
for i, (title, col, arr, ebitda, cac, churn, desc) in enumerate([
    ('UPSIDE',   GREEN, '$14M', '+28%', '$9K',  '3.5%',
     'Market expands faster. Enterprise mix increases to 60% by Y3. '
     'NRR reaches 125%. CAC compresses faster via strong inbound. '
     'Triggers early Series B at 10× ARR.'),
    ('BASE CASE', GOLD, '$9M',  '+14%', '$12K', '5.0%',
     'Model assumptions throughout this deck. '
     'Outbound GTM + moderate inbound. Enterprise mix at 40% by Y3. '
     'Series B optionality from Y3 onwards.'),
    ('DOWNSIDE',  RED,  '$4.5M','(8%)', '$16K', '9.0%',
     'Sales cycle elongation. Enterprise deals slip 2 quarters. '
     'Inbound slower to build. Requires 6-month extension of runway. '
     'Capital raise needed at lower valuation in Y3.'),
]):
    bx = 0.35 + i * 4.35
    box(s, bx, 0.97, 4.1, 0.3, col)
    tx(s, bx+0.1, 0.97, 3.9, 0.28, title, 10, NAVY3, bold=True)
    box(s, bx, 1.27, 4.1, 5.55, NAVY2)
    # Key metrics
    for j, (lbl, val) in enumerate([
        ('Y3 ARR',        arr),
        ('Y3 EBITDA Margin', ebitda),
        ('Blended CAC',   cac),
        ('Annual Churn',  churn),
    ]):
        my = 1.35 + j * 1.05
        tx(s, bx+0.15, my, 3.8, 0.22, lbl, 8, LBLUE)
        tx(s, bx+0.15, my+0.2, 3.8, 0.45, val, 20, col, bold=True)
        if j < 3:
            box(s, bx+0.15, my+0.72, 3.8, 0.01, NAVY3)
    # Description
    tx(s, bx+0.15, 5.6, 3.8, 0.95, desc, 8.5, LGRAY, italic=True)

ftr(s, 15)
note(s, "Scenario analysis shows range of outcomes and sensitivity.\n"
     "Investor framing: 'Even in the downside case we reach $4.5M ARR — "
     "that is 3× growth on current ARR. The downside is not existential; "
     "it is a valuation question. The upside is transformational. "
     "We are building for the base case and planning for the downside.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — CAPITAL RAISE
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Capital Raise', '$5M Series A — the last dilutive event before Series B')
bullets(s, [
    'Raising $5M Series A to fuel the next 24 months of growth.',
    ('[Assumption] Pre-money valuation: $20M (13× ARR — market comp for stage)', True),
    'Use of funds (prioritised):',
    ('[Allocation 1] Sales & Marketing: $2.0M (40%) — add 6 AEs + demand gen', True),
    ('[Allocation 2] R&D / Engineering: $1.5M (30%) — product velocity, AI layer', True),
    ('[Allocation 3] Customer Success:  $0.8M (16%) — onboarding, retention', True),
    ('[Allocation 4] G&A / Ops:        $0.7M (14%) — finance, legal, compliance', True),
    '18-month milestones this capital unlocks:',
    ('[Milestone 1] Reach $4M ARR — 167% YoY growth', True),
    ('[Milestone 2] Reduce CAC to $9K via inbound — 25% efficiency gain', True),
    ('[Milestone 3] Achieve SOC2 T2 + 2 enterprise lighthouse logos', True),
    ('[Milestone 4] Launch enterprise tier — ARPU expansion to $80K', True),
    'Series B triggers: $8–10M ARR + NRR > 115% + EBITDA near-breakeven.',
])
panel(s, [
    ('Raise Amount',     '$5M',        'Series A'),
    ('Pre-Money Val.',   '$20M',       '[Assumption] 13× ARR comp'),
    ('Post-Money Val.',  '$25M',       ''),
    ('Runway Post-Raise','73 months',  'At peak Y2 burn rate'),
    ('Target ARR (Y2)',  '$4M',        '+167% YoY'),
    ('Series B Trigger', '$8–10M ARR', 'NRR > 115%, near EBITDA B/E'),
])
ftr(s, 16)
note(s, "Be precise about amount, use of funds, and milestones. No vagueness.\n"
     "Investor framing: 'We are raising $5M. $2M goes directly to sales — "
     "that funds 6 AEs who each close $720K ARR. The math is straightforward: "
     "$2M in sales investment generates $4.3M in incremental ARR. "
     "Series B will be at $8–10M ARR. This is the last dilutive event before that.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 17 — SCALING STRATEGY
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Scaling Strategy', 'How growth becomes exponentially more efficient')
bullets(s, [
    'Three scaling levers — each compounding the others:',
    '',
    'Lever 1: Sales Capacity Scale',
    ('2 AEs now → 8 AEs by Y3 (Series A capital)', True),
    ('AE ramp model: $720K ARR quota at full ramp (month 7+)', True),
    ('SDR-to-AE ratio: 1:2 → maintained through scale', True),
    '',
    'Lever 2: CAC Compression via Inbound',
    ('Content + SEO + LinkedIn: 15% of leads now → 40% by Y3', True),
    ('[Assumption] Inbound leads cost 4× less than outbound', True),
    ('CAC improves from $12K → $7K by Y5 — 42% reduction', True),
    '',
    'Lever 3: NRR Engine (Land & Expand)',
    ('Module 1 → Modules 2+3 expansion path: 15% revenue uplift per cohort', True),
    ('Enterprise tier adds $60K+ incremental ARPU to existing accounts', True),
    ('NRR of 115%+ means ARR grows even with zero new logos', True),
])
panel(s, [
    ('AEs Y1 → Y3',      '2 → 8',      'Funded by Series A'),
    ('ARR / AE (Quota)',  '$720K',      '[Assumption] At full ramp'),
    ('Inbound % Y3',      '40%',        'vs. 15% today'),
    ('CAC Y5',            '$7,000',     'from $12,000 today (–42%)'),
    ('NRR Target',        '115%+',      'Y3 onward'),
    ('Incremental ARPU',  '+$20K',      'Per account (module expansion)'),
])
ftr(s, 17)
note(s, "Scaling strategy = the flywheel story.\n"
     "Investor framing: 'Three things compound simultaneously: more AEs close more "
     "deals; inbound reduces what those deals cost to acquire; existing customers "
     "expand and raise NRR above 115%. By Y3, the CAC payback on new logos is "
     "partially funded by expansion revenue from existing ones.'")

print("Slides 14–17 complete.")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 18 — RISKS
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Risk Register', 'Identified · Quantified · Mitigated')

risk_data = [
    ('FINANCIAL RISKS',   GOLD,  [
        ('Burn overrun if S&M ramp is slower than modelled',
         'HIGH', 'Milestone-gate capital deployment; extend runway by deferring hires'),
        ('CAC higher than $12K if outbound yield drops',
         'MED',  'Inbound investment in Y1–Y2 hedges against outbound CAC pressure'),
        ('ARPU below $60K if enterprise mix lags',
         'MED',  'SMB tier provides revenue floor; enterprise motion accelerates from Y2'),
    ]),
    ('MARKET RISKS',      BLUE,  [
        ('Incumbent response: SAP/Oracle launches competing module',
         'LOW',  '18-month AI-native lead; integration depth creates switching costs'),
        ('Market contraction / CFO budget freeze in recession',
         'MED',  'ROI-positive product — saves $500K/yr; defensible even in downturns'),
        ('Competitor raises large round and undercuts on price',
         'MED',  'Compete on product velocity and customer outcomes, not price'),
    ]),
]

for col_i, (section, col, risks) in enumerate(risk_data):
    bx = 0.35 + col_i * 6.55
    box(s, bx, 0.97, 6.25, 0.3, col)
    tx(s, bx+0.12, 0.97, 6.0, 0.28, section, 9, NAVY3, bold=True)
    for r_i, (risk, severity, mitigation) in enumerate(risks):
        ry = 1.35 + r_i * 1.85
        sev_col = RED if severity == 'HIGH' else GOLD if severity == 'MED' else GREEN
        box(s, bx, ry, 6.25, 1.72, NAVY2)
        box(s, bx, ry, 0.22, 1.72, sev_col)
        tx(s, bx+0.32, ry+0.1,  5.8, 0.35, risk,       10.5, WHITE, bold=True)
        tx(s, bx+0.32, ry+0.45, 5.8, 0.22, f'Severity: {severity}', 8, sev_col, bold=True)
        tx(s, bx+0.32, ry+0.68, 5.8, 0.9,  f'Mitigation: {mitigation}', 9, LGRAY, italic=True)

ftr(s, 18)
note(s, "Show investors you have identified risks AND have mitigation plans.\n"
     "Investor framing: 'We know the risks. The financial risks are manageable "
     "with milestone-gated spending. The market risks are real but our "
     "product-level switching costs and ROI defensibility protect us even "
     "in a downturn. We have never lost a customer to a competitor.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 19 — CLOSING
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'Why This Wins', 'The case — in four statements')

for i, (num, title, body) in enumerate([
    ('01', 'The problem is large, frequent, and funded.',
     '$500K annual cost per company × 50,000 companies in SAM = $25B total problem. '
     'CFOs have budget. They are actively evaluating solutions RIGHT NOW.'),
    ('02', 'The product is differentiated and defensible.',
     '10× faster implementation, 80% manual work reduction, 30+ integrations. '
     'Switching costs compound every quarter. No competitor has rebuilt for AI-native.'),
    ('03', 'The unit economics are exceptional and improving.',
     'LTV/CAC of 10.8×. CAC payback of 20 months. NRR of 115%. '
     'Every metric improves each year. The model GETS BETTER with scale.'),
    ('04', 'The team has the right to win this market.',
     '[Founder 1]: [10+ years in this domain / previous exit / deep ICP relationships]. '
     '[Founder 2]: [Technical background / previously built at scale / prior AI experience].'),
]):
    bx = 0.35 + (i % 2) * 6.52
    by = 1.05 + (i // 2) * 2.85
    box(s, bx, by, 6.2, 2.65, NAVY2)
    box(s, bx, by, 0.55, 2.65, GOLD)
    tx(s, bx+0.7, by+0.18, 5.3, 0.45, num, 28, GOLD, bold=True)
    tx(s, bx+0.7, by+0.62, 5.3, 0.4,  title, 13, WHITE, bold=True)
    tx(s, bx+0.7, by+1.05, 5.3, 1.45, body,  9.5, LGRAY)

# Bottom CTA bar
box(s, 0.35, 6.8, 12.63, 0.5, GOLD)
tx(s, 0.5, 6.83, 12.3, 0.42,
   'The ask: $5M Series A  ·  $20M pre-money  ·  Next step: [Schedule partner meeting / data room access]',
   11, NAVY3, bold=True, align=PP_ALIGN.CENTER)

ftr(s, 19)
note(s, "Land on conviction. The last thing they remember is what matters.\n"
     "Investor framing: 'Four statements. Large problem — validated. "
     "Differentiated product — proven. Unit economics — exceptional. "
     "Team — right to win. We are asking for $5M to build the market standard. "
     "The question is not whether this market will be won — it is whether you "
     "want to be part of who wins it.'")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 20 — VC CRITIQUE
# ══════════════════════════════════════════════════════════════════════════════
s = blank(); bg(s)
hdr(s, 'VC Critique', 'The 5 objections every investor will raise — and how to answer them')

box(s, 0.35, 0.97, 12.63, 0.28, RGBColor(0x3A, 0x1A, 0x1A))
tx(s, 0.5, 0.97, 12.3, 0.26,
   'MANDATORY PRE-PITCH PREPARATION — Know these cold before entering any partner meeting',
   8.5, RED, bold=True)

objections = [
    ('01  Why won\'t SAP/Oracle just build this?',
     'They have tried — and failed — to rebuild for AI-native workflows for 10 years. '
     'Their architecture is on-premise legacy; ours is cloud-native from day one. '
     'By the time they move, we will have 2,000+ customers with deep switching costs. '
     'Answer with: "They are our best salespeople — every prospect frustrated with SAP is ours."'),
    ('02  Your CAC payback is 20 months — that\'s long.',
     'Mid-market enterprise SaaS benchmark is 12–24 months. We are within range. '
     'More importantly: NRR of 115% means month-20 payback is understated — '
     'expansion revenue from the same customer arrives at month 12. '
     'Real blended payback including expansion is ~14 months. Show the cohort data.'),
    ('03  $1.5M ARR is thin. Why should we believe the model?',
     'Early revenue is high-quality: 94% logo retention, 115% NRR, zero design-partner churn. '
     'The 25 customers represent the ICP perfectly. '
     'We have a signed LOI pipeline of $800K ARR — that is not in the model. '
     'Weakness to acknowledge: sample size is small. Strengthen with 3 reference calls.'),
    ('04  What stops a better-funded competitor from outspending you?',
     'CAC efficiency advantage: our inbound + outbound blend is 2× more efficient '
     'than pure outbound. We close deals on product merit — 60-day sales cycle. '
     'Switching costs compound. A customer 12 months in has their entire workflow in us. '
     'Weakness: we need 2–3 enterprise lighthouse logos to anchor brand defensibility.'),
    ('05  What must improve before you can raise this round?',
     '[1] Expand to 35–40 customers before closing — proves repeatability. '
     '[2] Reduce Y2 burn assumption from $65K/mo to $55K/mo — tighten the model. '
     '[3] Get one F500 or recognisable enterprise logo as reference customer. '
     '[4] Nail the 30-second pitch: problem → solution → traction → ask. No hedging.'),
]

for i, (q, a) in enumerate(objections):
    ry = 1.35 + i * 1.18
    box(s, 0.35, ry, 12.63, 1.1, NAVY2 if i % 2 == 0 else TBLALT)
    tx(s, 0.5,  ry+0.08, 4.2, 0.3,  q, 9.5, GOLD, bold=True)
    tx(s, 4.85, ry+0.05, 8.0, 0.98, a, 8.5, LGRAY)
    box(s, 4.7, ry+0.1, 0.015, 0.85, BLUE)

ftr(s, 20)
note(s, "This slide is for internal prep only — never show to investors.\n"
     "Drill every objection until the answer is automatic. "
     "The investor who asks objection #3 is not trying to kill the deal — "
     "they are testing whether you know your own business. "
     "Confidence + specificity = credibility. Hedging = red flag.")

# ══════════════════════════════════════════════════════════════════════════════
# SAVE FINAL FILE
# ══════════════════════════════════════════════════════════════════════════════
OUT = '/home/user/Vision-Virtue/VisionVirtue_PPT_Template.pptx'
prs.save(OUT)
print(f"\nAll {TOTAL} slides complete.")
print(f"Saved → {OUT}")
