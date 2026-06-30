# How to send the DPA to a customer (2-minute task)

> The DPA at `DPA-TEMPLATE.md` is already pre-filled on Vision & Virtue's
> side (Raphael's name, title, email). Only customer-side fields are blank.

## What you do per customer

### Option A — Google Docs (easiest, free)

1. Open https://docs.google.com → "New" → "From a Markdown file"
   (alternatively: paste the contents of `DPA-TEMPLATE.md` into a blank doc)
2. Find/Replace `[Customer Legal Name]` → the customer's exact legal name
3. Fill `[V&V registered office]` in Annex C with your registered business
   address in Israel
4. File → Download → **PDF** (.pdf)
5. Email PDF to the customer's data protection contact + CC their general
   counsel if you know one

### Option B — Word / Office (if customer prefers)

1. Open `DPA-TEMPLATE.md` in any text editor
2. Copy all → paste into a new Word document
3. Same find/replace as above
4. Save as PDF
5. Email

### Option C — Send the .md file directly

Some technically-oriented customers prefer raw Markdown — fine to send
`DPA-TEMPLATE.md` as-is with two edits before sending:
- Replace `[Customer Legal Name]` with their legal name
- Replace `[V&V registered office]` in Annex C with your address

## Email cover text (paste verbatim)

```
Subject: Visibility Portal — Data Processing Agreement for Signature

Dear [Customer Name],

Attached is the Data Processing Agreement (DPA) for our Visibility Portal
service, in line with the Israeli Protection of Privacy Law 5741-1981
and, where applicable, EU GDPR Article 28.

Key points:
- Vision & Virtue acts as Processor; you remain Controller of your data
- We have signed DPAs with our two sub-processors: Anthropic, PBC
  (AI model API) and Render Services, Inc. (cloud hosting)
- All sensitive columns (salaries, vendor names, budget descriptions)
  are encrypted at rest with AES-256-GCM
- Customer access keys are stored as scrypt hashes (never recoverable)
- Daily encrypted backups, 30-day retention
- 72-hour breach notification per PPL and our DPA Section 7

Please review and, if acceptable, sign + return the executed PDF. Happy to
discuss any provisions or arrange a call.

Best regards,
Raphael Haim, CPA
Managing Partner — Vision & Virtue Partnership
```

## What you save afterwards

For each signed customer DPA:
- Filename: `DPA-<customer-name>-signed-YYYY-MM-DD.pdf`
- Storage: Google Drive (or equivalent) — folder "V&V Legal / Customer DPAs"
- **Do not commit to git**

If you want a single index, add a line to `KB-OPERATIONAL.md` like:
```
- Customer "Acme Corp" DPA signed 2026-07-15 — gd://path/...
```

That's it.
