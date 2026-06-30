# Anthropic DPA + Zero Data Retention Request

> **Action required from Raphael (60-second task):** open the link below,
> paste the email body, click Send.

## Why we need this

The Visibility Portal sends customer financial data (salaries, vendor
names, budget descriptions, AI-CFO chat content) through Anthropic's
Claude API. Under our customer DPA (`DPA-TEMPLATE.md` §4 + §10) and the
Israeli Privacy Protection Law, we must:

1. Have a **Data Processing Agreement (DPA) with Anthropic** as a
   sub-processor.
2. Where possible, enable **Zero Data Retention (ZDR)** so Anthropic
   doesn't log prompt/response content.

Without these, customer financial data flowing to Anthropic falls outside
our compliance posture.

---

## The 60-second flow

### Step 1 — Open the request portal

https://support.anthropic.com/hc/en-us/requests/new?ticket_form_id=18891428482196

(Alternative: `console.anthropic.com` → bottom-right chat bubble → "DPA
request")

### Step 2 — Form fields to fill

| Field | Value |
|-------|-------|
| Subject | DPA + Zero Data Retention request — Vision & Virtue |
| Topic | Privacy & Compliance |
| Description | (paste the body below) |

### Step 3 — Email body (paste verbatim)

```
Hello Anthropic Trust & Safety team,

I am the Managing Partner of Vision & Virtue Partnership, an Israeli
financial-strategy consultancy registered in Israel. We use the Claude API
in production to power our Visibility Portal — a SaaS product for our
business customers — and our internal CapitaFlow and Marketing AI tools.

Our organisation ID / contact email on file with Anthropic:
- Email: raphihaim10@gmail.com
- Anthropic console organisation: (whichever org owns the API key)

I would like to request two things:

1. EXECUTION OF YOUR STANDARD DATA PROCESSING AGREEMENT (DPA)

   We need a fully-executed DPA in place because our Visibility Portal
   customers (regulated under the Israeli Protection of Privacy Law
   5741-1981 and, where applicable, the EU GDPR) require us to name and
   contract with every sub-processor that handles their data. Anthropic is
   our designated AI sub-processor.

   Our standard customer DPA references Anthropic as a sub-processor in
   Annex B with a written agreement requirement (Article 28(2) GDPR
   equivalence). We need your countersigned DPA to satisfy this.

2. ENABLE ZERO DATA RETENTION (ZDR) ON OUR API KEY/ORGANISATION

   To minimise data-residency exposure, we request that Zero Data
   Retention be enabled on the API key / organisation used by Vision &
   Virtue Partnership. We understand this means Anthropic will not retain
   prompt or completion content beyond the 30-day standard, ideally
   reducing it to no retention at all.

   We are willing to accept any tier/plan changes required to enable
   this. Please advise on the path.

ABOUT US (so you can do KYC):

- Legal name:    Vision & Virtue Partnership
- Country:       Israel
- Registered DB operator (Israeli PPA): Raphael Haim, CPA — Managing Partner
- Primary contact for data protection matters: raphihaim10@gmail.com
- Website:       https://visionvirtuepartnership.com

USE CASE FOR THE API:

- Customer financial analysis (Visibility Portal AI CFO agent — Marcus
  Vale persona)
- Investor-deck generation (CapitaFlow)
- Marketing content drafts for our LinkedIn page (Marketing AI)

All Claude API calls go through our backend at
vv-marketing-api.onrender.com. Customer prompts include a sanitization +
scoping layer before transmission. We do not transmit special-category
personal data (health, biometric, etc.).

I look forward to your response and to the executed DPA + ZDR
confirmation. Happy to provide further documentation or jump on a brief
call if useful.

Best regards,

Raphael Haim, CPA
Managing Partner — Vision & Virtue Partnership
raphihaim10@gmail.com
https://visionvirtuepartnership.com
```

### Step 4 — Submit + wait

Typical response time: **2-5 business days** for the DPA, 1-2 weeks for
the executed PDF back. ZDR enablement can be either bundled in the DPA
or set as a separate ticket — they'll tell you.

---

## When you receive the executed DPA from Anthropic

1. Save the PDF to a safe place (Google Drive / OneDrive of your
   choice — NOT to the public repo)
2. Reply to me in a new session: "Anthropic DPA signed" — I'll update
   `INCIDENT-RESPONSE-PLAYBOOK.md` Section 6 (sub-processor coordination)
   with the response window from the executed agreement
3. Update `DPA-TEMPLATE.md` Annex B note from "DPAs signed" claim to
   reflect the actual executed date

## When ZDR is confirmed enabled

Reply: "Anthropic ZDR enabled on org_xxx" — I'll update `privacy.html`
Section 4 line item to say "Zero Data Retention enabled on our tier"
(currently it says "where enabled on tier").

---

**That's it. Total time for you: ~60 seconds of copy-paste + waiting on
Anthropic's response queue.**
