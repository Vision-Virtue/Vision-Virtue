# Incident Response Playbook — Vision & Virtue / Visibility Portal

**Last updated:** June 2026
**Owner:** Raphael Haim, CPA — Managing Partner
**Scope:** Personal data breaches, security incidents, or suspected compromise of the Visibility Portal, Marketing AI, CapitaFlow, or Investor Marketplace.

## 1. The 72-hour clock

Under the **Israeli Protection of Privacy Law 5741-1981** (and its 2018 Privacy Protection Regulations), Vision & Virtue must notify the **Privacy Protection Authority (PPA, Rashut Hahaganah)** of a "Severe Personal Data Security Event" within **72 hours** of becoming aware of it.

> The clock starts when ANYONE at V&V first reasonably suspects an incident has occurred. Not when it's confirmed. Note the suspicion timestamp immediately.

For affected customers under our DPA: we have 72 hours to notify them too. They have their own clock to notify their data subjects.

## 2. Severity classification (5 minutes)

When an event is suspected, classify it in the first 5 minutes:

| Level | Examples | Action |
|-------|----------|--------|
| **CRITICAL** | Customer data confirmed exfiltrated · admin PIN leaked · production database dumped · ransomware on Render disk · Anthropic API key leaked · attacker has live access | **Pull the kill switch** (Section 3) — start the 72h clock immediately |
| **HIGH** | Suspected data exfil (no confirmation) · suspicious admin login from new geography · pattern of failed auths suggesting active brute-force · DDoS in progress | Start investigation (Section 4) — clock starts on confirmation |
| **MEDIUM** | One customer's key leaked (e.g. customer left it in a screenshot) · privacy policy non-compliance discovered | Rotate the affected key + document — no PPA notification needed |
| **LOW** | Single failed auth spike from one IP · obviously automated scanner | Monitor for escalation |

## 3. Kill switch (CRITICAL incidents, within 15 minutes)

These actions stop the bleeding. Do them in order:

### 3.1 Lock down the platform
```powershell
# Render → vv-marketing-api → Suspend
# OR via API: POST https://api.render.com/v1/services/<id>/suspend  (Bearer token)
```

### 3.2 Rotate every secret
On Render dashboard → vv-marketing-api → Environment, regenerate:
- `DATA_ENCRYPTION_KEY` — **WARNING**: rotating this requires re-encrypting all sensitive columns. Use the rotation procedure in `src/db/encryption.ts` comments. Otherwise existing data becomes unreadable.
- `BACKUP_ENCRYPTION_KEY` — safe to regenerate (only affects backups going forward)
- `SESSION_SECRET` — invalidates all sessions, forces re-login
- `ANTHROPIC_API_KEY` — rotate at `console.anthropic.com/settings/keys`
- `ACCESS_CODE` — admin PIN
- `RAPHAEL_PASSCODE`
- `TOKEN_ENCRYPTION_KEY`

### 3.3 Revoke all customer keys (if mass compromise)
```sql
UPDATE customer_keys SET revoked = 1;
UPDATE investor_keys SET revoked = 1;
```
Then re-issue keys to customers via the admin API and a verified channel (NOT email if email may also be compromised).

### 3.4 Pull an encrypted backup
The most recent backup is at `/data/backups/marketing-YYYY-MM-DD-HHMM.db.enc` on the Render disk. Download it via Render's disk shell BEFORE doing any destructive recovery.

## 4. Investigation (within 24 hours)

### 4.1 Collect evidence
- `dev-server.log` and `dev-server.err.log` from Render's persistent disk
- `security_events` table dump (admin endpoint: `GET /api/admin/security-events?limit=1000`)
- `ai_audit_log` table (every AI prompt + response hashed)
- Render audit log (who deployed / who accessed dashboard, last 30 days)
- Browser console of the user/admin who first noticed

### 4.2 Identify
1. **What data** was potentially accessed (which customers, which fields)
2. **By whom** (IP, account, key prefix, timestamp range)
3. **How** (which endpoint, what authentication, what bypass if any)
4. **For how long** (first suspicious event → discovery)

### 4.3 Contain
- Block the source IP(s) at Render's firewall
- Revoke any specific compromised customer/admin keys
- Force re-deploy after the patch lands to clear in-process state

## 5. Notification (within 72 hours of awareness)

### 5.1 Notify the PPA (Israeli Privacy Protection Authority)

If the breach involves Personal Data of >10 individuals OR involves financial data, salary data, or other sensitive categories:

- **Form:** Online portal at `gov.il/privacy-protection-authority` → Report Incident
- **Required fields:**
  - Name + Israeli ID number of registered DB operator (Raphael Haim)
  - Database registration number (if registered)
  - Nature, time, scope of the incident
  - Affected categories of data subjects
  - Number of data subjects affected
  - Probable consequences
  - Mitigation measures already taken
  - Future measures to prevent recurrence
- **Within 72h** of becoming aware. Late notification carries fines and criminal liability.

### 5.2 Notify affected customers (per DPA)

Under our customer DPA Section 7: notify each affected customer "without undue delay and in any event within 72 hours" of awareness.

**Notification email template:**

```
Subject: [Security Incident — Action Required] Vision & Virtue Visibility Portal

Dear [Customer Name],

On [DATE/TIME], we identified a security incident affecting Visibility Portal data including data belonging to your organisation.

What happened: [factual, no speculation]

What data was affected: [specific tables/fields]

When: [time range, if known]

What we did: [containment + mitigation]

What you should do:
1. [Rotate any affected credentials on your side]
2. [Notify your affected data subjects per your obligations under PPL/GDPR]
3. [Other specific actions]

Contact: raphihaim10@gmail.com

We will provide further updates as the investigation progresses.

— Raphael Haim, Vision & Virtue Partnership
```

### 5.3 Notify Data Subjects (if Severe under PPL §17B)

If the PPA orders us to (after our notification to them), or if the incident is "Severe" (broad definition — affects sensitive data or large numbers):
- Notify each affected Data Subject individually via the same channel they were registered through
- Provide: nature, advice on protective measures, contact info

## 6. Sub-processor coordination

If Anthropic or Render was the source/vector, contact:
- **Anthropic:** trustandsafety@anthropic.com — they have a 72h DPA obligation to us
- **Render:** abuse@render.com — they have a 24h DPA obligation to us

## 7. Recovery + lessons learned (within 7 days)

1. Patch the vulnerability (code change → deploy with hash-pin)
2. Restore from clean encrypted backup if data was modified
3. Run `node dist/scripts/encryptSalaries.js` + any other re-encryption needed if keys rotated
4. Verify with the smoke test in `KB-OPERATIONAL.md`
5. **Post-incident review meeting** within 7 days:
   - Timeline reconstruction
   - Root cause
   - What worked, what didn't
   - Concrete preventive measures added to next sprint
6. **Update this playbook** with any new lessons

## 8. Contact directory

| Role | Name | Email | Phone |
|------|------|-------|-------|
| **Incident Commander (V&V)** | Raphael Haim, CPA | raphihaim10@gmail.com | +972-XX-XXX-XXXX |
| Render Support | — | support@render.com | (via dashboard) |
| Anthropic Trust & Safety | — | trustandsafety@anthropic.com | — |
| Israeli PPA (online portal) | — | gov.il/privacy-protection-authority | +972-2-666-7777 |
| External Legal (data protection) | [TBD — engage Israeli privacy law firm before customer go-live] | — | — |
| Cyber Insurance Carrier | [TBD — get a policy before customer go-live] | — | — |

## 9. Drill schedule

Run a tabletop exercise quarterly:
- Scenario rotation: leaked API key · ransomware · phishing of admin · disgruntled insider · supply-chain compromise via npm dep
- 2-hour session: walk through Sections 3-5 against the scenario
- Update playbook gaps after each drill

## 10. Pre-incident checklist (do NOW, before any customer is live)

- [ ] Confirm DATA_ENCRYPTION_KEY + BACKUP_ENCRYPTION_KEY + SESSION_SECRET are set on Render
- [ ] Confirm daily backup cron is scheduled and producing files in /data/backups/
- [ ] Verify the latest backup is restorable (run `restoreBackup.js` against the most recent file)
- [ ] Sign Anthropic DPA (request via console.anthropic.com → Settings → Compliance)
- [ ] Engage Israeli privacy law firm and put them on retainer
- [ ] Purchase a cyber insurance policy with breach response coverage
- [ ] Test the PPA online notification portal (familiarise yourself — clock pressure is not the time to learn the UI)
- [ ] Run the first quarterly drill
- [ ] Add personal mobile number for IC role (in case email is the breach vector)
