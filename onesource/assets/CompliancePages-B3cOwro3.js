import{C as e,T as t,b as n,d as r,i,n as a,r as o,s,t as c,y as l}from"./x-zaCFy5gW.js";import{A as u,C as d,D as f,J as p,K as m,M as h,P as g,S as _,Y as v,at as y,c as b,h as x,it as S,m as C,nt as w,q as T,s as E,tt as D,v as ee,x as O}from"./index-DAQVGt3B.js";var k=i(`bookmark`,[[`path`,{d:`M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z`,key:`oz39mx`}]]),A=i(`shield-alert`,[[`path`,{d:`M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z`,key:`oel41y`}],[`path`,{d:`M12 8v4`,key:`1got3b`}],[`path`,{d:`M12 16h.01`,key:`1drbdi`}]]),j=t(e(),1);function te(){let e=D(),t=p(),n=v(),r=S(),i=w(),a=m();return(0,j.useMemo)(()=>{let o={},s=(e,t,n,r=`high`)=>{o[e]={derivedStatus:t,evidence:n,confidence:r}},c=e.state.runs,l=e.state.payslips,u=e.state.journals,d=e.state.bankBatches,f=e.state.payrollEmployees;if(c.length>0&&l.length>0&&(s(`pr-1`,`completed`,`${c.length} payroll runs, ${l.length} payslips generated`),s(`pr-2`,`completed`,`PayslipViewer renders sections A-L in RTL`)),u.length>0&&s(`pr-3`,`completed`,`${u.length} payroll JEs generated`),f.length>0&&f.every(e=>e.bankAccount)?s(`pr-4`,`completed`,`Bank details masked in payslips; ${f.length} profiles complete`):f.length>0&&s(`pr-4`,`in-progress`,`${f.filter(e=>!e.bankAccount).length}/${f.length} employees missing bank`,`medium`),d.length>0&&s(`pr-11`,`completed`,`${d.length} bank batches ready for submission`),i.state.permissions&&Object.keys(i.state.permissions).length>0&&s(`pr-9`,`in-progress`,`RBAC in place; approval routing not yet enforced in payroll UI`,`medium`),t.events.length>0){let e=new Set(t.events.map(e=>e.category)),n=t=>Array.from(e).some(e=>e.includes(t));n(`payslip-generation`)&&s(`at-7`,`completed`,`Payslip-generation events logged`),n(`file-generation`)&&s(`at-8`,`completed`,`File-generation events logged`),n(`approval`)&&s(`at-5`,`completed`,`Approval events logged`),n(`locking`)&&s(`at-12`,`in-progress`,`Locking events logged; hash chain not yet chained`,`medium`),n(`salary-changed`)&&s(`at-3`,`completed`,`Salary changes logged`),n(`bank-account-changed`)&&s(`at-3`,`completed`,`Bank changes logged`),s(`at-1`,`in-progress`,`${t.events.length} audit events captured; login events not yet wired`,`medium`)}if(s(`at-12`,`in-progress`,`Append-only reducer implemented; hash chain still to add`,`medium`),n.state.ruleSets.length>0){let e=n.state.ruleSets.filter(e=>e.status===`active`);e.length>0&&s(`vat-1`,`completed`,`Active rule set: ${e[0].name}; VAT config carried on legal entity`)}r.chartOfAccounts.length>0&&s(`bk-6`,`in-progress`,`${r.chartOfAccounts.length} GL accounts configured; per-doc JE linkage to verify`,`medium`),i.state.permissions&&Object.keys(i.state.permissions).length>0&&s(`sec-3`,`completed`,`${Object.keys(i.state.permissions).length} permission grants configured`),i.state.permissions&&Object.keys(i.state.permissions).length>0&&s(`sc-s-4`,`in-progress`,`Permissions matrix available; periodic review process TBD`,`medium`),t.events.length>0&&s(`sc-p-4`,`completed`,`Immutable audit log implemented`),c.some(e=>e.status===`locked`||e.status===`closed`)&&(s(`fi-1`,`in-progress`,`Payroll runs support lock/close; GL period lock TBD`,`medium`),s(`fi-3`,`completed`,`Locked payroll runs are immutable (snapshot preserved)`)),u.length>0&&s(`fi-8`,`completed`,`${u.length} payroll JE(s) generated with GL mapping`),d.length>0&&(s(`pay-4`,`completed`,`${d.length} bank batches — approve-before-export enforced`),s(`pay-5`,`completed`,`Bank batch files include hash + timestamp`)),s(`pv-2`,`in-progress`,`RBAC + field-level access hook available; DLP scan not run`,`medium`),a.agents.length>0&&s(`ai-1`,`completed`,`${a.agents.length} agents registered (${a.agents.filter(e=>e.enabled).length} enabled)`);let p=a.agents.filter(e=>e.enabled),m=p.some(e=>!a.dpas.find(t=>t.provider===e.provider)?.dpaSigned);return p.length>0&&!m?s(`ai-2`,`completed`,`DPA signed for every enabled agent`):m&&s(`ai-2`,`in-progress`,`${p.filter(e=>!a.dpas.find(t=>t.provider===e.provider)?.dpaSigned).length} enabled agents missing DPA`,`high`),a.redactionRules.filter(e=>e.enabled).length>=5&&s(`ai-3`,`completed`,`${a.redactionRules.filter(e=>e.enabled).length} redaction rules active`),a.interactions.length>0&&s(`ai-5`,`completed`,`${a.interactions.length} interactions logged (append-only)`),a.state.globalPolicy.requireHumanInLoopForADM&&s(`ai-8`,`completed`,`HITL enforced globally for ADM`),!a.state.globalPolicy.allowChildrenData&&!a.state.globalPolicy.allowHealthData&&s(`ai-11`,`completed`,`Children + health data blocked by global policy`),s(`ai-12`,`completed`,`Authentication data class explicitly blocked in mayProcess()`),a.dpas.every(e=>!e.trainsOnCustomerData)&&s(`ai-13`,`completed`,`All registered providers marked non-training`),o},[e.state,t.events,n.state.ruleSets,r.chartOfAccounts,i.state.permissions,a.agents,a.dpas,a.redactionRules,a.interactions,a.state.globalPolicy])}function M(e){return String(e??``).replace(/[<>&'"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,"'":`&apos;`,'"':`&quot;`})[e])}function N(e,t,n,r){let i=new Date().toISOString(),a=P(t.map(e=>e.code).join(`|`)+n.map(e=>e.id).join(`|`)),o=`<?xml version="1.0" encoding="UTF-8"?>
<UniformAuditFile xmlns="urn:il:ita:uniform-audit:v1">
  <Header>
    <FileVersion>1.0</FileVersion>
    <GeneratedAt>${M(i)}</GeneratedAt>
    <PeriodFrom>${M(r.from)}</PeriodFrom>
    <PeriodTo>${M(r.to)}</PeriodTo>
    <SourceSystem>OneSource ERP</SourceSystem>
    <FileHash>${M(a)}</FileHash>
  </Header>
  <Company>
    <Name>${M(e.name)}</Name>
    <EntityId>${M(e.id)}</EntityId>
    <Country>${M(e.country)}</Country>
    <Currency>${M(e.currency)}</Currency>
  </Company>
  <ChartOfAccounts>
${t.map(e=>`    <Account>
      <Code>${M(e.code)}</Code>
      <Name>${M(e.name)}</Name>
      <PLSection>${M(e.plSection)}</PLSection>
      <BudgetCategory>${M(e.budgetCategory??``)}</BudgetCategory>
    </Account>`).join(`
`)}
  </ChartOfAccounts>
  <MasterData>
    <Note>Vendor + customer master data emitted in production build; suppressed here per demo scope.</Note>
  </MasterData>
  <Transactions>
${n.filter(e=>e.postedAt).map(e=>`    <JournalEntry>
      <Id>${M(e.id)}</Id>
      <PostedAt>${M(e.postedAt)}</PostedAt>
      <Period>${M(e.period)}</Period>
      <TotalDebit>${e.totalDebit.toFixed(2)}</TotalDebit>
      <TotalCredit>${e.totalCredit.toFixed(2)}</TotalCredit>
${e.lines.map(e=>`      <Line>
        <Account>${M(e.glAccount)}</Account>
        <Debit>${e.debit.toFixed(2)}</Debit>
        <Credit>${e.credit.toFixed(2)}</Credit>
        <Narrative>${M(e.narrative)}</Narrative>
      </Line>`).join(`
`)}
    </JournalEntry>`).join(`
`)}
  </Transactions>
  <Documents>
    <Note>Invoice/receipt/credit-note documents emitted in production build; suppressed here per demo scope.</Note>
  </Documents>
</UniformAuditFile>`;return{filename:`uniform-audit-${e.id}-${r.from}_to_${r.to}.xml`,mime:`application/xml`,bytes:new Blob([o],{type:`application/xml; charset=utf-8`})}}function P(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return`sha256:`+(t>>>0).toString(16).padStart(8,`0`)}function F(e){let t=URL.createObjectURL(e.bytes),n=document.createElement(`a`);n.href=t,n.download=e.filename,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t)}var I=[{id:`terms-of-service`,title:`Terms of Service`,description:`Master ToS between OneSource and the customer.`,body:`# Terms of Service — OneSource ERP

## 1. Definitions
"Customer" — the legal entity subscribing to OneSource.
"Services" — the OneSource ERP hosted software as offered on the applicable Order Form.

## 2. Services
OneSource grants Customer a limited, non-exclusive, non-transferable right to
access and use the Services during the subscription term for Customer's own
internal business purposes.

## 3. Customer Responsibilities
Customer is responsible for (a) the accuracy of accounting, tax, payroll,
inventory and master data entered into the Services; (b) obtaining regulatory
approval, tax filing approval, and legal review; (c) authorising internal users
and enforcing internal separation-of-duties; (d) maintaining backups of data
Customer chooses to export.

## 4. Fees and Payment
Fees are set out in the Order Form. All fees are non-refundable except as
expressly stated.

## 5. Warranty Disclaimer
Except as expressly warranted, the Services are provided "as is". OneSource does
not warrant that the Services will be uninterrupted or error-free.

## 6. Limitation of Liability
Neither party shall be liable for indirect, incidental, consequential or
punitive damages. Each party's aggregate liability is capped at fees paid in the
12 months preceding the claim.

## 7. Governing Law and Jurisdiction
This agreement is governed by the laws of the State of Israel. Exclusive
jurisdiction lies with the competent courts of Tel Aviv-Yafo.

Signed: __________________________
Date:   __________________________
`},{id:`privacy-policy`,title:`Privacy Policy`,description:`Public-facing policy describing data collection + use.`,body:`# Privacy Policy — OneSource ERP

Effective date: [DATE]

## 1. Scope
This policy applies to personal data processed by OneSource when Customer's
authorised users interact with the Services.

## 2. Personal Data We Process
- User identification data (name, email, role, timestamps of activity)
- Employee data entered by Customer (name, national ID, tax profile, bank
  account, salary, pension fund)
- Vendor and customer contact details entered by Customer
- Audit-trail metadata (user, action, timestamp, IP address)

## 3. Legal Basis
OneSource processes data as (a) processor on Customer's behalf under the DPA,
and (b) controller for its own account management and support activities.

## 4. Data Retention
Personal data is retained for the duration of the subscription plus a legally
required period (7 years for Israeli bookkeeping data, 90 days for support
logs), then deleted or anonymised.

## 5. International Transfers
Personal data may be processed in the United States (Render.com hosting, AI
subprocessors). Transfers rely on standard contractual clauses.

## 6. Rights of Data Subjects
Data subjects may request access, correction, deletion, restriction, or export
of their personal data by contacting privacy@onesource.local. Requests are
addressed within 30 days.

## 7. Contact
Data Protection Officer: [NAME], [EMAIL].
`},{id:`dpa`,title:`Data Processing Agreement (DPA)`,description:`Standard DPA between Customer (controller) and OneSource (processor).`,body:`# Data Processing Agreement

Between [CUSTOMER LEGAL NAME] ("Controller") and OneSource ("Processor").

## 1. Subject Matter
Processor processes personal data on behalf of Controller solely to provide the
Services described in the Order Form.

## 2. Nature and Purpose
Storage, calculation, analysis, reporting on Controller-supplied ERP data
including employee, payroll, financial, vendor and customer records.

## 3. Types of Personal Data
Employee personal data (name, national ID, address, bank details, salary,
pension), vendor and customer contact details, authorised user identifiers.

## 4. Duration
For the duration of the Master Subscription Agreement, plus a legally required
retention period.

## 5. Processor Obligations
(a) Process only on documented instructions from Controller.
(b) Ensure personnel are bound by confidentiality.
(c) Implement appropriate technical and organisational measures (Annex A).
(d) Assist Controller in responding to data-subject requests.
(e) Notify Controller of any personal-data breach within 72 hours.
(f) Delete or return personal data at end of the Agreement.

## 6. Sub-processors
See Annex B for the current list. Processor will notify Controller of any
proposed addition with 30 days' notice.

## 7. Audit
Controller may audit Processor's compliance once per calendar year with 30
days' notice, at Controller's cost.

## Annex A — Technical and Organisational Measures
- AES-256 encryption at rest
- TLS 1.2+ in transit
- Role-based access control with least privilege
- Immutable audit trail
- Multi-factor authentication for administrators
- Annual penetration test
- Documented backup + disaster recovery procedures

## Annex B — Sub-processors
See separate list at onesource.local/subprocessors.

Signed: Controller __________________ Processor __________________
`},{id:`subprocessors`,title:`Subprocessor List`,description:`Current list of active subprocessors.`,body:`# OneSource Subprocessor List

Last updated: [DATE]

| Name          | Purpose                | Region | DPA signed |
| ------------- | ---------------------- | ------ | ---------- |
| Render.com    | Application hosting    | US     | Yes        |
| Anthropic     | AI text processing     | US     | Pending    |
| ElevenLabs    | Voice generation       | US     | Pending    |
| [Backup provider] | Encrypted backups   | [REG]  | [Y/N]      |
| [SMTP provider]   | Transactional email | [REG]  | [Y/N]      |

Notifications of subprocessor additions or replacements are posted at
onesource.local/subprocessors and communicated to Customers per §6 of the DPA.
`},{id:`sla`,title:`Service Level Agreement`,description:`Uptime targets, response times, credits.`,body:`# Service Level Agreement — OneSource ERP

## 1. Uptime Target
99.5% monthly uptime for the Services excluding scheduled maintenance windows.

## 2. Scheduled Maintenance
Announced 5 business days in advance; typically Saturday 02:00-04:00 Israel time.
Maximum 4 hours per calendar month.

## 3. Support Tiers
| Severity | Definition                                     | First response | Target resolution |
| -------- | ---------------------------------------------- | -------------- | ----------------- |
| P0       | Service down, no workaround                    | 30 min         | 4 hours           |
| P1       | Major function impaired, workaround possible   | 2 hours        | 1 business day    |
| P2       | Non-critical issue                             | 1 business day | 5 business days   |
| P3       | Enhancement request                            | 3 business days| Next release cycle|

## 4. Service Credits
| Monthly uptime | Credit |
| -------------- | ------ |
| 99.0-99.5%     | 5%     |
| 95.0-99.0%     | 10%    |
| < 95.0%        | 25%    |

## 5. Exclusions
Downtime caused by Customer misuse, third-party integrations, force majeure, or
scheduled maintenance is excluded.

## 6. Credit Request
Credits must be requested in writing within 30 days of the affected month.
`},{id:`aup`,title:`Acceptable Use Policy`,description:`What Customer may and may not do with the Services.`,body:`# Acceptable Use Policy

Customer and its authorised users must not:
1. Attempt to gain unauthorised access to any part of the Services.
2. Use the Services to process data unrelated to Customer's own business.
3. Attempt to reverse-engineer or extract source code from the Services.
4. Upload malware, unlawful content, or content infringing third-party rights.
5. Use the Services to process personal data of a third party without lawful
   basis and the required agreements.
6. Circumvent rate limits, audit trails, or approval workflows.
7. Overload the Services or interfere with other Customers' use.
8. Use the Services in violation of Israeli law or the laws of Customer's own
   jurisdiction.

OneSource may suspend accounts violating this policy and terminate the
subscription for material breach.
`},{id:`security-addendum`,title:`Security Addendum`,description:`Security commitments made to enterprise customers.`,body:`# Security Addendum — OneSource ERP

## Governance
- Named security owner: [NAME], reporting to CEO.
- Annual risk assessment reviewed by executive team.
- Documented information-security policy.

## Access Control
- Role-based access control with least privilege.
- Multi-factor authentication mandatory for administrators.
- SSO available on enterprise plans.
- Periodic access review at least quarterly.

## Encryption
- AES-256 encryption at rest for all databases.
- TLS 1.2 or higher in transit.
- Field-level encryption for sensitive payroll data (salary, bank, national ID).

## Monitoring and Incident Response
- Centralised logging with 90-day online retention, 7-year archive.
- 24×7 alerting on anomaly detection.
- Documented incident response plan with escalation matrix.
- Customer notification within 72 hours of a confirmed data-breach.

## Backup and Disaster Recovery
- Daily encrypted backups with 30-day retention.
- Restore test executed at least quarterly.
- Documented RTO (4 hours) and RPO (15 minutes).

## Vulnerability Management
- Automated dependency scanning on every code change.
- Quarterly external vulnerability scan.
- Annual third-party penetration test.
- Critical findings remediated within 7 days; high within 30 days.

## Personnel
- All personnel with production access sign confidentiality agreements.
- Background checks per role.
- Security awareness training annually.
`},{id:`backup-retention`,title:`Backup and Retention Policy (Customer-Facing)`,description:`What data is backed up, how long it is retained.`,body:`# Backup and Retention Policy

## Backup Scope
- Application database — daily full backup, hourly incremental.
- Object storage (documents, attachments) — versioning enabled, 30-day retention.
- Audit-trail logs — 7-year retention in immutable storage.
- Application source code — Git repository with off-site mirror.

## Backup Storage
- Backups encrypted with AES-256 at rest.
- Backups stored in a region distinct from primary application region.

## Retention Periods
| Data class              | Retention                                        |
| ----------------------- | ------------------------------------------------ |
| Financial documents     | 7 years (Israeli bookkeeping law minimum)        |
| Payroll data            | 7 years                                           |
| Audit trail             | 7 years                                           |
| Support tickets         | 3 years                                           |
| Application error logs  | 90 days                                          |
| Personal data on request| Deleted or anonymised within 30 days of request  |

## Restore Test
Executed quarterly. Latest restore-test evidence available in the Compliance
Evidence Repository (§22).

## Customer-Initiated Export
Customers may export their data at any time via the Services or by written
request. On subscription termination, OneSource provides Customer with a full
data export within 30 days.
`},{id:`support-policy`,title:`Support Policy`,description:`Support channels + hours + escalation.`,body:`# Support Policy

## Channels
- In-app help widget
- Email: support@onesource.local
- Emergency phone (P0 only): [+972 XX XXXXXXX]

## Hours
- P0/P1: 24×7
- P2/P3: Sunday-Thursday 09:00-18:00 Israel time
- Excluded: Israeli public holidays

## Escalation
| Level | Owner              | Trigger                    |
| ----- | ------------------ | -------------------------- |
| L1    | Support engineer   | Initial triage             |
| L2    | Product specialist | If L1 cannot resolve       |
| L3    | Engineering        | Bug requiring code change  |
| L4    | Head of Support    | SLA breach imminent        |

## Requests Out of Scope
- Customer's internal accounting decisions or interpretations
- Legal or tax advice
- Custom development (available under separate SoW)
`},{id:`incident-notification`,title:`Incident Notification Policy`,description:`How OneSource notifies Customer of incidents.`,body:`# Incident Notification Policy

## Definition
An "incident" is any unplanned interruption or degradation of Services, or any
confirmed compromise of Customer data.

## Notification Timeline
| Severity            | Notification                                     |
| ------------------- | ------------------------------------------------ |
| P0 (service down)   | Within 30 minutes, then hourly updates           |
| P1 (major impact)   | Within 2 hours, then every 4 hours               |
| Data breach (any)   | Within 72 hours of confirmation                  |
| P2/P3               | Included in monthly service report               |

## Channels
Status page: status.onesource.local
Email: nominated primary contact per Customer

## Post-Incident Review
Within 5 business days of resolution, OneSource publishes a root-cause analysis
covering: timeline, impact scope, root cause, remediation, prevention actions.

## Regulatory Notification
Where a data breach involves personal data of Israeli residents, OneSource
supports Customer with information required for the Israeli Privacy Protection
Authority notification. The obligation to notify the regulator remains
Customer's as data controller.
`},{id:`crm`,title:`Customer Responsibility Matrix`,description:`Clarifies who is responsible for what.`,body:`# Customer Responsibility Matrix

| Area                                     | OneSource | Customer  |
| ---------------------------------------- | --------- | --------- |
| Application uptime + availability        | ✓         |           |
| Software updates + patches               | ✓         |           |
| Security of hosting infrastructure       | ✓         |           |
| Encryption + audit trail                 | ✓         |           |
| Backup + restore capability              | ✓         |           |
| Correctness of accounting data           |           | ✓         |
| Tax filing approval                      |           | ✓         |
| Regulatory submission where not by OneSource |       | ✓         |
| Legal review                             |           | ✓         |
| User authorisation + role assignment     |           | ✓         |
| Onboarding of new employees              |           | ✓         |
| Segregation of duties inside Customer    |           | ✓         |
| Data-subject requests from employees     |           | ✓ (with support from OneSource) |
| Choice of retention beyond legal minimum |           | ✓         |
| Response to auditor requests             |           | ✓ (evidence from OneSource) |

OneSource provides software tools and infrastructure. OneSource does not
provide legal or tax advice unless separately contracted.
`},{id:`tax-legal-disclaimer`,title:`Tax and Legal Disclaimer`,description:`Standard disclaimer for accounting / payroll outputs.`,body:`# Tax and Legal Disclaimer

OneSource ERP is a software tool. Calculations produced by OneSource
(including but not limited to VAT reports, PCN874 files, uniform audit files,
payroll runs, Forms 100 / 102 / 106 / 126 / 161, ממשק מעסיקים files, and journal
entries) are illustrative outputs generated from data supplied by Customer and
regulatory rules configured by Customer.

OneSource does not warrant the legal or regulatory accuracy of any output.

Customer must:
1. Have its accounting records reviewed by a licensed Israeli CPA
   (רואה חשבון) before submission to the Israel Tax Authority, Bituach Leumi, or
   any other regulator.
2. Have its payroll outputs reviewed by a licensed חשב שכר before employees are
   paid.
3. Retain original supporting documentation as required by Israeli law.
4. Obtain independent legal counsel on all matters of compliance and liability.

OneSource does not act as Customer's accountant, tax advisor, payroll clerk,
legal counsel, or agent of record with any regulator, and OneSource assumes no
professional responsibility for those functions.
`}],L=r();function R({crumb:e,title:t,icon:n,sub:r,right:i}){let s=l();return(0,L.jsxs)(`div`,{className:`os-page-header`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`0.4rem`,fontSize:`11.5px`,color:`var(--os-text-4)`,fontWeight:600,textTransform:`uppercase`,letterSpacing:`0.05em`},children:[(0,L.jsx)(a,{size:11}),` `,(0,L.jsx)(`span`,{onClick:()=>s(`/compliance`),style:{cursor:`pointer`},children:`Compliance`}),typeof e==`string`?(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(o,{size:11}),(0,L.jsx)(`span`,{style:{color:`var(--os-text-2)`},children:e})]}):e]}),(0,L.jsxs)(`div`,{className:`os-page-title`,style:{display:`flex`,alignItems:`center`,gap:`0.5rem`},children:[n,t]}),r&&(0,L.jsx)(`div`,{className:`os-page-sub`,children:r})]}),i&&(0,L.jsx)(`div`,{className:`os-page-actions`,children:i})]})}function z({status:e}){let t={"not-started":{cls:`gray`,label:`Not started`},"in-progress":{cls:`amber`,label:`In progress`},"missing-critical":{cls:`red`,label:`Missing critical`},"ready-for-review":{cls:`blue`,label:`Ready for review`},"approved-pilot":{cls:`blue`,label:`Approved for pilot`},"approved-production":{cls:`green`,label:`Approved for production`},"production-blocked":{cls:`red`,label:`Production blocked`}}[e];return(0,L.jsx)(`span`,{className:`os-badge ${t.cls}`,children:t.label})}function B({status:e}){return(0,L.jsx)(`span`,{className:`os-badge ${{"not-started":`gray`,"in-progress":`amber`,completed:`green`,"not-applicable":`gray`,blocked:`red`}[e]}`,style:{fontSize:`10.5px`},children:e})}function V({risk:e}){return(0,L.jsx)(`span`,{className:`os-badge ${{critical:`red`,high:`amber`,medium:`blue`,low:`gray`}[e]??`gray`}`,style:{fontSize:`10.5px`},children:e})}function H(){let e=l(),{categories:t,state:n,progressFor:r,blockersFor:i,overallStatusFor:c,canActivateProduction:d}=T(),f=s(),[p,m]=(0,j.useState)(`acme-il`),g=n.entities[p],_=c(p),v=i(p).filter(e=>!e.overridden),y=d(p),b=t.reduce((e,t)=>e+t.requirements.length,0),x=t.reduce((e,t)=>e+t.requirements.filter(e=>e.status===`completed`).length,0),S=b?Math.round(x/b*100):0;return(0,L.jsxs)(`div`,{children:[(0,L.jsxs)(`div`,{className:`os-page-header`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`0.4rem`,fontSize:`11.5px`,color:`var(--os-text-4)`,fontWeight:600,textTransform:`uppercase`,letterSpacing:`0.05em`},children:[(0,L.jsx)(a,{size:11}),` `,(0,L.jsx)(`span`,{children:`Admin`}),` `,(0,L.jsx)(o,{size:11}),` `,(0,L.jsx)(`span`,{style:{color:`var(--os-text-2)`},children:`Compliance Readiness Center`})]}),(0,L.jsxs)(`div`,{className:`os-page-title`,style:{display:`flex`,alignItems:`center`,gap:`0.5rem`},children:[(0,L.jsx)(C,{size:18,style:{color:`var(--os-blue)`}}),` Compliance Readiness Center`]}),(0,L.jsx)(`div`,{className:`os-page-sub`,children:`Production-readiness across 15 domains — IL bookkeeping, ITA, VAT/PCN874, Payroll, Privacy, SOC 2, ISO 27001, Security, Payment, PCI, Accessibility, Legal.`})]}),(0,L.jsx)(`div`,{className:`os-page-actions`,children:(0,L.jsx)(`select`,{value:p,onChange:e=>m(e.target.value),style:{padding:`5px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,background:`#fff`},children:f.companies.map(e=>(0,L.jsx)(`option`,{value:e.id,children:e.name},e.id))})})]}),(0,L.jsxs)(`div`,{className:`os-card`,style:{marginBottom:12},children:[(0,L.jsxs)(`div`,{style:{padding:`16px 20px`,display:`grid`,gridTemplateColumns:`2fr 1fr 1fr 1fr`,gap:16,alignItems:`center`},children:[(0,L.jsxs)(`div`,{children:[(0,L.jsxs)(`div`,{style:{fontSize:`11px`,color:`var(--os-text-4)`,fontWeight:700,textTransform:`uppercase`},children:[`Overall status — `,g?.country??`—`]}),(0,L.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:10,marginTop:6},children:[(0,L.jsx)(z,{status:_}),g?.productionActivated&&(0,L.jsx)(`span`,{className:`os-badge green`,children:`PROD ACTIVE`})]}),(0,L.jsxs)(`div`,{style:{fontSize:`12px`,color:`var(--os-text-3)`,marginTop:4},children:[`Tax regime: `,g?.taxRegime,` · Currency: `,g?.currency,` · FY end: `,g?.fiscalYearEnd]})]}),(0,L.jsx)(U,{label:`Completion`,value:`${S}%`,colour:`blue`}),(0,L.jsx)(U,{label:`Open blockers`,value:String(v.length),colour:v.length?`red`:`green`}),(0,L.jsx)(U,{label:`Categories`,value:`${t.filter(e=>e.status===`approved-pilot`||e.status===`approved-production`).length}/${t.length}`,colour:`cyan`})]}),!y&&(0,L.jsxs)(`div`,{style:{padding:`10px 16px`,borderTop:`1px solid var(--os-border)`,background:`var(--os-red-bg)`,color:`var(--os-red)`,fontSize:`12.5px`,display:`flex`,alignItems:`center`,gap:8},children:[(0,L.jsx)(A,{size:14}),`Production activation blocked by `,v.length,` category-level blocker`,v.length===1?``:`s`,`.`,(0,L.jsx)(`a`,{onClick:()=>e(`/compliance/blockers`),style:{marginLeft:`auto`,color:`var(--os-red)`,textDecoration:`underline`,cursor:`pointer`,fontWeight:700},children:`View / override →`})]}),y&&!g?.productionActivated&&(0,L.jsxs)(`div`,{style:{padding:`10px 16px`,borderTop:`1px solid var(--os-border)`,background:`var(--os-green-bg)`,color:`#065f46`,fontSize:`12.5px`,display:`flex`,alignItems:`center`,gap:8},children:[(0,L.jsx)(h,{size:14}),`All blockers cleared. Ready for production activation.`,(0,L.jsx)(`button`,{className:`os-btn os-btn-success os-btn-sm`,style:{marginLeft:`auto`},onClick:()=>e(`/compliance/blockers`),children:`Review + activate`})]})]}),(0,L.jsx)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(auto-fill, minmax(320px, 1fr))`,gap:12},children:t.map(t=>{let n=r(t.id);return(0,L.jsx)(`div`,{className:`os-card`,style:{cursor:`pointer`,borderTop:t.productionBlocking&&n.blockersOpen>0?`3px solid var(--os-red)`:`3px solid var(--os-blue-bg)`},onClick:()=>e(`/compliance/${W(t.id)}`),children:(0,L.jsxs)(`div`,{style:{padding:14},children:[(0,L.jsxs)(`div`,{style:{display:`flex`,alignItems:`flex-start`,justifyContent:`space-between`,gap:8},children:[(0,L.jsxs)(`div`,{style:{flex:1},children:[(0,L.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--os-text-4)`,fontWeight:700,textTransform:`uppercase`,letterSpacing:`0.06em`},children:t.section}),(0,L.jsx)(`div`,{style:{fontSize:`13.5px`,fontWeight:800,marginTop:2},children:t.name}),t.hebrewName&&(0,L.jsx)(`div`,{style:{fontSize:`11.5px`,color:`var(--os-text-3)`,direction:`rtl`,textAlign:`right`},children:t.hebrewName})]}),(0,L.jsx)(z,{status:t.status})]}),(0,L.jsx)(`div`,{style:{fontSize:`11.5px`,color:`var(--os-text-3)`,marginTop:6,lineHeight:1.5,minHeight:32},children:t.description}),(0,L.jsxs)(`div`,{style:{marginTop:10},children:[(0,L.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`11px`,color:`var(--os-text-4)`,fontWeight:700,marginBottom:3},children:[(0,L.jsxs)(`span`,{children:[n.completed,`/`,n.total,` requirements`]}),(0,L.jsxs)(`span`,{children:[n.percent,`%`]})]}),(0,L.jsx)(`div`,{style:{height:6,background:`var(--os-border)`,borderRadius:3,overflow:`hidden`},children:(0,L.jsx)(`div`,{style:{height:`100%`,width:`${n.percent}%`,background:n.blockersOpen>0?`var(--os-amber)`:`var(--os-green)`}})})]}),(0,L.jsxs)(`div`,{style:{marginTop:8,display:`flex`,gap:6,flexWrap:`wrap`},children:[t.productionBlocking&&(0,L.jsx)(`span`,{className:`os-badge red`,style:{fontSize:`10px`},children:`PROD BLOCKING`}),n.blockersOpen>0&&(0,L.jsxs)(`span`,{className:`os-badge amber`,style:{fontSize:`10px`},children:[n.blockersOpen,` open blocker`,n.blockersOpen===1?``:`s`]}),t.gaps.length>0&&(0,L.jsxs)(`span`,{className:`os-badge red`,style:{fontSize:`10px`},children:[t.gaps.length,` gap`,t.gaps.length===1?``:`s`]}),t.applicableWhen&&(0,L.jsx)(`span`,{className:`os-badge blue`,style:{fontSize:`10px`},children:`conditional`})]})]})},t.id)})}),(0,L.jsxs)(`div`,{className:`os-card`,style:{marginTop:14},children:[(0,L.jsxs)(`div`,{className:`os-card-header`,children:[(0,L.jsx)(u,{size:13,style:{color:`var(--os-blue)`}}),(0,L.jsx)(`span`,{className:`os-card-title`,children:`Recent compliance activity`})]}),n.activityLog.length===0&&(0,L.jsx)(`div`,{style:{padding:`1.5rem`,textAlign:`center`,color:`var(--os-text-4)`},children:`No activity yet.`}),n.activityLog.slice(0,10).map(e=>(0,L.jsx)(`div`,{style:{padding:`8px 14px`,borderBottom:`1px solid var(--os-border)`,display:`flex`,justifyContent:`space-between`,fontSize:`12px`,gap:12},children:(0,L.jsxs)(`div`,{children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`strong`,{children:e.user}),`: `,e.description]}),(0,L.jsxs)(`div`,{style:{fontSize:`10.5px`,color:`var(--os-text-4)`,fontFamily:`monospace`},children:[e.action,` · `,e.timestamp]})]})},e.id))]})]})}function U({label:e,value:t,colour:n}){return(0,L.jsxs)(`div`,{style:{textAlign:`center`},children:[(0,L.jsx)(`div`,{style:{fontSize:`10.5px`,color:`var(--os-text-4)`,fontWeight:700,textTransform:`uppercase`,letterSpacing:`0.06em`},children:e}),(0,L.jsx)(`div`,{style:{fontSize:`26px`,fontWeight:900,color:`var(--os-${n})`},children:t})]})}function W(e){return e===`ita-registration`?`ita`:e===`uniform-file`?`uniform-file`:e===`vat-pcn874`?`vat`:e}function G(){let e=n(),t=l(),{categories:r,evidence:i,dispatch:a,progressFor:o}=T(),c=s(),{toast:u}=y(),f=te(),p=e.categoryId===`ita`?`ita-registration`:e.categoryId===`vat`?`vat-pcn874`:e.categoryId??``,m=r.find(e=>e.id===p),[g,_]=(0,j.useState)(``),[v,x]=(0,j.useState)(null),[S,w]=(0,j.useState)(null),D=m?o(m.id):{total:0,completed:0,blockersOpen:0,percent:0},O=(0,j.useMemo)(()=>m?m.requirements.filter(e=>{let t=f[e.id];return t?(t.derivedStatus===`completed`||t.derivedStatus===`in-progress`&&e.status===`not-started`)&&e.status!==t.derivedStatus:!1}):[],[m,f]);function A(){if(!m)return;let e=0;for(let t of O){let n=f[t.id];a({type:`SET_REQUIREMENT_STATUS`,requirementId:t.id,status:n.derivedStatus,user:c.state.user?.username??`system`}),e++}u(`Auto-synced ${e} requirement${e===1?``:`s`} from live system state`,`success`)}if(!m)return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`Not found`,title:`Category not found`,icon:(0,L.jsx)(b,{size:18,style:{color:`var(--os-red)`}})}),(0,L.jsxs)(`div`,{className:`os-card`,style:{padding:`2rem`,textAlign:`center`},children:[`Unknown category. `,(0,L.jsx)(`a`,{onClick:()=>t(`/compliance`),style:{color:`var(--os-blue)`,cursor:`pointer`},children:`Back to Compliance Center`}),`.`]})]});function M(e,t){a({type:`SET_REQUIREMENT_STATUS`,requirementId:e.id,status:t,user:c.state.user?.username??`system`}),u(`${e.title.slice(0,40)} → ${t}`,`success`)}function N(){if(D.blockersOpen>0)return u(`Cannot approve — ${D.blockersOpen} blocker requirement(s) still open`,`error`);a({type:`APPROVE_CATEGORY`,categoryId:m.id,approvedBy:c.state.user?.username??`system`}),u(`${m.name} approved`,`success`)}function P(){g.trim()&&(a({type:`ADD_GAP`,categoryId:m.id,gap:g.trim(),user:c.state.user?.username??`system`}),_(``))}function F(e){a({type:`RESOLVE_GAP`,categoryId:m.id,gapIndex:e,user:c.state.user?.username??`system`})}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:m.name,title:m.name,icon:(0,L.jsx)(k,{size:18,style:{color:`var(--os-blue)`}}),sub:m.description,right:(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(z,{status:m.status}),O.length>0&&(0,L.jsxs)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,onClick:A,title:`Auto-mark requirements whose evidence is already visible in other OneSource modules`,children:[(0,L.jsx)(C,{size:12}),` Sync from system (`,O.length,`)`]}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-secondary os-btn-sm`,onClick:()=>x({}),children:[(0,L.jsx)(E,{size:12}),` Upload evidence`]}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,disabled:D.blockersOpen>0,onClick:N,children:[(0,L.jsx)(h,{size:12}),` Approve category`]})]})}),(0,L.jsxs)(`div`,{className:`os-card`,style:{marginBottom:12},children:[(0,L.jsxs)(`div`,{style:{padding:`14px 16px`,display:`grid`,gridTemplateColumns:`repeat(4, 1fr)`,gap:12},children:[(0,L.jsx)(K,{label:`Section`,value:m.section}),(0,L.jsx)(K,{label:`Completion`,value:`${D.percent}% (${D.completed}/${D.total})`}),(0,L.jsx)(K,{label:`Open blockers`,value:String(D.blockersOpen)}),(0,L.jsx)(K,{label:`Production-blocking`,value:m.productionBlocking?`Yes`:`No`})]}),m.applicableWhen&&(0,L.jsxs)(`div`,{style:{padding:`8px 16px`,borderTop:`1px dashed var(--os-border)`,fontSize:`11.5px`,color:`var(--os-text-3)`},children:[(0,L.jsx)(`strong`,{children:`Applicable when:`}),` `,m.applicableWhen]})]}),(0,L.jsxs)(`div`,{className:`os-card`,style:{marginBottom:12},children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsx)(`span`,{className:`os-card-title`,children:`Requirements`})}),(0,L.jsxs)(`table`,{className:`os-table`,children:[(0,L.jsx)(`thead`,{children:(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`th`,{style:{width:60},children:`Risk`}),(0,L.jsx)(`th`,{style:{width:80},children:`Impact`}),(0,L.jsx)(`th`,{children:`Requirement`}),(0,L.jsx)(`th`,{children:`Owner`}),(0,L.jsx)(`th`,{children:`Evidence`}),(0,L.jsx)(`th`,{style:{width:120},children:`Status`}),(0,L.jsx)(`th`,{})]})}),(0,L.jsx)(`tbody`,{children:m.requirements.map(e=>{let t=i.filter(t=>t.relatedRequirementIds.includes(e.id)),n=f[e.id];return(0,L.jsxs)(`tr`,{onClick:()=>w(S===e.id?null:e.id),style:{background:S===e.id?`var(--os-blue-bg)`:void 0,cursor:`pointer`},children:[(0,L.jsx)(`td`,{children:(0,L.jsx)(V,{risk:e.risk})}),(0,L.jsx)(`td`,{children:(0,L.jsx)(`span`,{className:`os-badge ${e.productionImpact===`blocker`?`red`:e.productionImpact===`warning`?`amber`:`gray`}`,style:{fontSize:`10.5px`},children:e.productionImpact})}),(0,L.jsxs)(`td`,{style:{fontSize:`12.5px`,fontWeight:600},children:[e.title,e.externalReviewNeeded&&(0,L.jsx)(`span`,{className:`os-badge blue`,style:{fontSize:`10px`,marginLeft:6},children:`ext review`}),e.description&&(0,L.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--os-text-4)`,marginTop:2},children:e.description}),n&&(0,L.jsxs)(`div`,{style:{fontSize:`11px`,color:n.derivedStatus===`completed`?`var(--os-green)`:`var(--os-amber)`,marginTop:3,display:`flex`,alignItems:`center`,gap:4},children:[(0,L.jsx)(C,{size:10}),(0,L.jsxs)(`em`,{children:[`Auto-detected `,n.derivedStatus,` · `,n.evidence]})]})]}),(0,L.jsx)(`td`,{style:{fontSize:`11.5px`},children:e.owner??(0,L.jsx)(`span`,{style:{color:`var(--os-text-4)`},children:`unassigned`})}),(0,L.jsx)(`td`,{children:t.length===0?(0,L.jsx)(`span`,{style:{color:`var(--os-text-4)`,fontSize:`11px`},children:`—`}):(0,L.jsxs)(`span`,{style:{display:`flex`,gap:4,alignItems:`center`,fontSize:`11px`},children:[(0,L.jsx)(d,{size:10}),` `,t.length]})}),(0,L.jsx)(`td`,{children:(0,L.jsx)(B,{status:e.status})}),(0,L.jsx)(`td`,{children:(0,L.jsxs)(`select`,{value:e.status,onChange:t=>{t.stopPropagation(),M(e,t.target.value)},onClick:e=>e.stopPropagation(),style:{padding:`3px 6px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`11px`,background:`#fff`},children:[(0,L.jsx)(`option`,{value:`not-started`,children:`Not started`}),(0,L.jsx)(`option`,{value:`in-progress`,children:`In progress`}),(0,L.jsx)(`option`,{value:`completed`,children:`Completed`}),(0,L.jsx)(`option`,{value:`not-applicable`,children:`Not applicable`}),(0,L.jsx)(`option`,{value:`blocked`,children:`Blocked`})]})})]},e.id)})})]})]}),(0,L.jsxs)(`div`,{className:`os-card`,style:{marginBottom:12},children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsxs)(`span`,{className:`os-card-title`,children:[`Open gaps (`,m.gaps.length,`)`]})}),(0,L.jsxs)(`div`,{style:{padding:`8px 14px`},children:[m.gaps.length===0&&(0,L.jsx)(`div`,{style:{fontSize:`12px`,color:`var(--os-text-4)`,padding:`6px 0`},children:`No gaps logged.`}),m.gaps.map((e,t)=>(0,L.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,alignItems:`center`,padding:`6px 0`,borderBottom:`1px dotted var(--os-border)`,fontSize:`12.5px`},children:[(0,L.jsxs)(`span`,{children:[`• `,e]}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:()=>F(t),children:[(0,L.jsx)(h,{size:11}),` Resolve`]})]},t)),(0,L.jsxs)(`div`,{style:{display:`flex`,gap:6,marginTop:8},children:[(0,L.jsx)(`input`,{value:g,onChange:e=>_(e.target.value),placeholder:`Describe a gap…`,style:{flex:1,padding:`5px 8px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12px`}}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-secondary os-btn-sm`,onClick:P,children:[(0,L.jsx)(ee,{size:12}),` Add gap`]})]})]})]}),v&&(0,L.jsx)(q,{categoryId:m.id,requirementId:v.requirement?.id,onClose:()=>x(null)})]})}function K({label:e,value:t}){return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`div`,{style:{fontSize:`10.5px`,color:`var(--os-text-4)`,fontWeight:700,textTransform:`uppercase`,letterSpacing:`0.06em`},children:e}),(0,L.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:700,marginTop:2},children:t})]})}function ne(){let{evidence:e,categories:t,dispatch:n}=T(),r=s(),{toast:i}=y(),[a,o]=(0,j.useState)(!1),[c,l]=(0,j.useState)(`all`),[u,p]=(0,j.useState)(``),m=(0,j.useMemo)(()=>e.filter(e=>!(c!==`all`&&e.category!==c||u&&!e.fileName.toLowerCase().includes(u.toLowerCase()))),[e,c,u]);function h(e){n({type:`APPROVE_EVIDENCE`,evidenceId:e.id,reviewer:r.state.user?.username??`system`}),i(`Evidence approved: ${e.fileName}`,`success`)}function g(e){let t=prompt(`Rejection reason?`);t&&(n({type:`REJECT_EVIDENCE`,evidenceId:e.id,reviewer:r.state.user?.username??`system`,reason:t}),i(`Evidence rejected: ${e.fileName}`,`success`))}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`Evidence`,title:`Evidence Repository`,icon:(0,L.jsx)(d,{size:18,style:{color:`var(--os-blue)`}}),sub:`Versioned evidence for every compliance requirement (§22). Restricted access + audit trail.`,right:(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`div`,{style:{position:`relative`},children:[(0,L.jsx)(x,{size:12,style:{position:`absolute`,left:8,top:`50%`,transform:`translateY(-50%)`,color:`var(--os-text-4)`}}),(0,L.jsx)(`input`,{value:u,onChange:e=>p(e.target.value),placeholder:`Search files…`,style:{padding:`5px 10px 5px 26px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,width:220}})]}),(0,L.jsxs)(`select`,{value:c,onChange:e=>l(e.target.value),style:{padding:`5px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,background:`#fff`},children:[(0,L.jsx)(`option`,{value:`all`,children:`All categories`}),(0,L.jsx)(`option`,{value:`registration-certificate`,children:`Registration certificate`}),(0,L.jsx)(`option`,{value:`external-review`,children:`External review`}),(0,L.jsx)(`option`,{value:`cpa-signoff`,children:`CPA sign-off`}),(0,L.jsx)(`option`,{value:`legal-signoff`,children:`Legal sign-off`}),(0,L.jsx)(`option`,{value:`payroll-signoff`,children:`Payroll sign-off`}),(0,L.jsx)(`option`,{value:`security-policy`,children:`Security policy`}),(0,L.jsx)(`option`,{value:`access-review`,children:`Access review`}),(0,L.jsx)(`option`,{value:`pentest`,children:`Pentest`}),(0,L.jsx)(`option`,{value:`vulnerability-scan`,children:`Vulnerability scan`}),(0,L.jsx)(`option`,{value:`backup-restore`,children:`Backup restore`}),(0,L.jsx)(`option`,{value:`incident-response`,children:`Incident response`}),(0,L.jsx)(`option`,{value:`uniform-file-simulator`,children:`Uniform-file simulator`}),(0,L.jsx)(`option`,{value:`api-sandbox`,children:`API sandbox`}),(0,L.jsx)(`option`,{value:`payroll-test-file`,children:`Payroll test file`}),(0,L.jsx)(`option`,{value:`vat-test-file`,children:`VAT test file`}),(0,L.jsx)(`option`,{value:`accessibility-audit`,children:`Accessibility audit`}),(0,L.jsx)(`option`,{value:`soc2-evidence`,children:`SOC 2 evidence`}),(0,L.jsx)(`option`,{value:`iso27001-evidence`,children:`ISO 27001 evidence`}),(0,L.jsx)(`option`,{value:`contract`,children:`Contract`}),(0,L.jsx)(`option`,{value:`other`,children:`Other`})]}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,onClick:()=>o(!0),children:[(0,L.jsx)(E,{size:12}),` Upload`]})]})}),(0,L.jsx)(`div`,{className:`os-card`,children:(0,L.jsxs)(`table`,{className:`os-table`,children:[(0,L.jsx)(`thead`,{children:(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`th`,{children:`File`}),(0,L.jsx)(`th`,{children:`Category`}),(0,L.jsx)(`th`,{children:`Related requirements`}),(0,L.jsx)(`th`,{children:`Uploaded by`}),(0,L.jsx)(`th`,{children:`Uploaded at`}),(0,L.jsx)(`th`,{children:`Version`}),(0,L.jsx)(`th`,{children:`Expires`}),(0,L.jsx)(`th`,{children:`Status`}),(0,L.jsx)(`th`,{})]})}),(0,L.jsxs)(`tbody`,{children:[m.length===0&&(0,L.jsx)(`tr`,{children:(0,L.jsx)(`td`,{colSpan:9,style:{padding:`2rem`,textAlign:`center`,color:`var(--os-text-4)`},children:`No evidence. Upload the first item via the button above.`})}),m.map(e=>{let n=e.relatedRequirementIds.map(e=>t.flatMap(e=>e.requirements).find(t=>t.id===e)?.title??e),r=e.expirationDate&&e.expirationDate<new Date().toISOString().slice(0,10);return(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`td`,{style:{fontWeight:700},children:e.fileName}),(0,L.jsx)(`td`,{style:{fontSize:`11.5px`},children:e.category}),(0,L.jsxs)(`td`,{style:{fontSize:`11.5px`,color:`var(--os-text-3)`},children:[n.slice(0,2).join(` · `),n.length>2?` +${n.length-2}`:``]}),(0,L.jsx)(`td`,{style:{fontSize:`11.5px`},children:e.uploadedBy}),(0,L.jsx)(`td`,{style:{fontSize:`11px`,fontFamily:`monospace`,color:`var(--os-text-3)`},children:e.uploadedAt}),(0,L.jsxs)(`td`,{style:{textAlign:`center`,fontSize:`11.5px`},children:[`v`,e.version]}),(0,L.jsx)(`td`,{style:{fontSize:`11.5px`,color:r?`var(--os-red)`:void 0},children:e.expirationDate??`—`}),(0,L.jsx)(`td`,{children:(0,L.jsx)(`span`,{className:`os-badge ${e.approvalStatus===`approved`?`green`:e.approvalStatus===`rejected`?`red`:`amber`}`,children:e.approvalStatus})}),(0,L.jsxs)(`td`,{style:{display:`flex`,gap:4},children:[e.approvalStatus===`pending`&&(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,onClick:()=>h(e),children:`Approve`}),(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:()=>g(e),children:`Reject`})]}),(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,children:(0,L.jsx)(f,{size:11})})]})]},e.id)})]})]})}),a&&(0,L.jsx)(q,{onClose:()=>o(!1)})]})}function q({categoryId:e,requirementId:t,onClose:n}){let{categories:r,dispatch:i}=T(),a=s(),{toast:o}=y(),[l,u]=(0,j.useState)(``),[d,f]=(0,j.useState)(`security-policy`),[p,m]=(0,j.useState)(``),[h,g]=(0,j.useState)(t?[t]:[]),[_,v]=(0,j.useState)(``),b=r.flatMap(e=>e.requirements),x=e?r.find(t=>t.id===e)?.requirements??[]:b;function S(){if(!l.trim())return o(`File name required`,`error`);i({type:`UPLOAD_EVIDENCE`,evidence:{id:`ev-${Date.now()}-${Math.floor(Math.random()*1e4)}`,category:d,fileName:l.trim(),uploadedBy:a.state.user?.username??`system`,uploadedAt:new Date().toISOString().slice(0,19),relatedRequirementIds:h,approvalStatus:`pending`,expirationDate:p||void 0,version:1,notes:_||void 0}}),o(`Uploaded ${l}`,`success`),n()}return(0,L.jsx)(`div`,{style:J,onClick:n,children:(0,L.jsxs)(`div`,{style:Y,onClick:e=>e.stopPropagation(),children:[(0,L.jsxs)(`header`,{style:X,children:[(0,L.jsxs)(`div`,{style:{fontSize:`16px`,fontWeight:800,display:`flex`,alignItems:`center`,gap:8},children:[(0,L.jsx)(E,{size:16,style:{color:`var(--os-blue)`}}),` Upload evidence`]}),(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:n,children:(0,L.jsx)(c,{size:14})})]}),(0,L.jsxs)(`div`,{style:{padding:16,display:`grid`,gap:10},children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)($,{children:`File name`}),(0,L.jsx)(`input`,{value:l,onChange:e=>u(e.target.value),placeholder:`e.g. 2026 Q3 access-review.xlsx`,style:Q})]}),(0,L.jsxs)(`div`,{children:[(0,L.jsx)($,{children:`Category`}),(0,L.jsxs)(`select`,{value:d,onChange:e=>f(e.target.value),style:Q,children:[(0,L.jsx)(`option`,{value:`registration-certificate`,children:`Registration certificate`}),(0,L.jsx)(`option`,{value:`external-review`,children:`External review`}),(0,L.jsx)(`option`,{value:`cpa-signoff`,children:`CPA sign-off`}),(0,L.jsx)(`option`,{value:`legal-signoff`,children:`Legal sign-off`}),(0,L.jsx)(`option`,{value:`payroll-signoff`,children:`Payroll sign-off`}),(0,L.jsx)(`option`,{value:`security-policy`,children:`Security policy`}),(0,L.jsx)(`option`,{value:`access-review`,children:`Access review`}),(0,L.jsx)(`option`,{value:`pentest`,children:`Pentest`}),(0,L.jsx)(`option`,{value:`vulnerability-scan`,children:`Vulnerability scan`}),(0,L.jsx)(`option`,{value:`backup-restore`,children:`Backup restore`}),(0,L.jsx)(`option`,{value:`incident-response`,children:`Incident response`}),(0,L.jsx)(`option`,{value:`uniform-file-simulator`,children:`Uniform-file simulator`}),(0,L.jsx)(`option`,{value:`api-sandbox`,children:`API sandbox`}),(0,L.jsx)(`option`,{value:`payroll-test-file`,children:`Payroll test file`}),(0,L.jsx)(`option`,{value:`vat-test-file`,children:`VAT test file`}),(0,L.jsx)(`option`,{value:`accessibility-audit`,children:`Accessibility audit`}),(0,L.jsx)(`option`,{value:`soc2-evidence`,children:`SOC 2 evidence`}),(0,L.jsx)(`option`,{value:`iso27001-evidence`,children:`ISO 27001 evidence`}),(0,L.jsx)(`option`,{value:`contract`,children:`Contract`}),(0,L.jsx)(`option`,{value:`other`,children:`Other`})]})]}),(0,L.jsxs)(`div`,{children:[(0,L.jsxs)($,{children:[`Related requirements (`,h.length,` selected)`]}),(0,L.jsx)(`div`,{style:{maxHeight:180,overflowY:`auto`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,padding:6},children:x.map(e=>(0,L.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:6,padding:`3px 4px`,fontSize:`11.5px`,cursor:`pointer`},children:[(0,L.jsx)(`input`,{type:`checkbox`,checked:h.includes(e.id),onChange:t=>g(t.target.checked?[...h,e.id]:h.filter(t=>t!==e.id))}),(0,L.jsx)(`span`,{children:e.title})]},e.id))})]}),(0,L.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:8},children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)($,{children:`Expires (optional)`}),(0,L.jsx)(`input`,{type:`date`,value:p,onChange:e=>m(e.target.value),style:Q})]}),(0,L.jsxs)(`div`,{children:[(0,L.jsx)($,{children:`Notes`}),(0,L.jsx)(`input`,{value:_,onChange:e=>v(e.target.value),placeholder:`Optional notes`,style:Q})]})]})]}),(0,L.jsxs)(`footer`,{style:Z,children:[(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:n,children:`Cancel`}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,onClick:S,children:[(0,L.jsx)(E,{size:12}),` Upload`]})]})]})})}function re(){let e=l(),{state:t,categories:n,blockersFor:r,canActivateProduction:i,dispatch:a}=T(),o=s(),{toast:c}=y(),[u,d]=(0,j.useState)(`acme-il`),[f,p]=(0,j.useState)(null),m=r(u),g=t.entities[u];function _(){if(!i(u))return c(`Cannot activate — unresolved blockers remain`,`error`);confirm(`Activate production for ${g?.country} legal entity? This step is logged in the audit trail.`)&&(a({type:`ACTIVATE_PRODUCTION`,entityId:u,user:o.state.user?.username??`system`,approver:o.state.user?.username??`system`}),c(`Production ACTIVATED for ${u}`,`success`))}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`Production Blockers`,title:`Production Blockers & Overrides`,icon:(0,L.jsx)(A,{size:18,style:{color:`var(--os-red)`}}),sub:`Categories that hold up production activation. Overrides require reason + expiry + super-admin approval (spec §20).`,right:(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`select`,{value:u,onChange:e=>d(e.target.value),style:{padding:`5px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,background:`#fff`},children:Object.keys(t.entities).map(e=>(0,L.jsx)(`option`,{value:e,children:e},e))}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-success os-btn-sm`,disabled:!i(u)||g?.productionActivated,onClick:_,children:[(0,L.jsx)(O,{size:12}),` Activate production`]})]})}),g?.productionActivated&&(0,L.jsxs)(`div`,{style:{marginBottom:12,padding:`0.75rem 1rem`,background:`var(--os-green-bg)`,border:`1px solid var(--os-green)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,color:`#065f46`,display:`flex`,alignItems:`center`,gap:8},children:[(0,L.jsx)(h,{size:14}),` `,(0,L.jsx)(`strong`,{children:`Production is ACTIVE`}),` for `,g.country,`. All customer transactions flow through the production pipeline.`]}),m.length===0&&(0,L.jsxs)(`div`,{className:`os-card`,style:{padding:`2.5rem`,textAlign:`center`},children:[(0,L.jsx)(h,{size:32,style:{color:`var(--os-green)`,margin:`0 auto 8px`}}),(0,L.jsx)(`div`,{style:{fontSize:`15px`,fontWeight:700},children:`No production blockers.`}),(0,L.jsx)(`div`,{style:{fontSize:`12px`,color:`var(--os-text-3)`,marginTop:4},children:`All blocker requirements across production-gating categories are completed or overridden.`})]}),m.length>0&&(0,L.jsx)(`div`,{className:`os-card`,children:(0,L.jsxs)(`table`,{className:`os-table`,children:[(0,L.jsx)(`thead`,{children:(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`th`,{children:`Category`}),(0,L.jsx)(`th`,{children:`Section`}),(0,L.jsx)(`th`,{children:`Blocker requirements`}),(0,L.jsx)(`th`,{children:`Override`}),(0,L.jsx)(`th`,{})]})}),(0,L.jsx)(`tbody`,{children:m.map(t=>{let r=n.find(e=>e.id===t.categoryId),i=g?.overrides.find(e=>e.active&&e.categoryId===t.categoryId);return(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`td`,{style:{fontWeight:700},children:r?.name}),(0,L.jsx)(`td`,{style:{fontSize:`11.5px`},children:r?.section}),(0,L.jsxs)(`td`,{style:{fontSize:`12px`},children:[t.requirementIds.length,` open blocker`,t.requirementIds.length===1?``:`s`,(0,L.jsxs)(`div`,{style:{fontSize:`11px`,color:`var(--os-text-4)`,marginTop:2},children:[t.requirementIds.slice(0,2).map(e=>r?.requirements.find(t=>t.id===e)?.title).join(` · `),t.requirementIds.length>2?` +${t.requirementIds.length-2} more`:``]})]}),(0,L.jsx)(`td`,{children:t.overridden&&i?(0,L.jsxs)(`span`,{style:{fontSize:`11.5px`},children:[(0,L.jsx)(`span`,{className:`os-badge amber`,children:`overridden`}),(0,L.jsxs)(`div`,{style:{fontSize:`10.5px`,color:`var(--os-text-4)`,marginTop:2},children:[`by `,i.approvedBy,`, expires `,i.expiresAt]})]}):(0,L.jsx)(`span`,{className:`os-badge red`,children:`blocking`})}),(0,L.jsxs)(`td`,{style:{display:`flex`,gap:4},children:[(0,L.jsx)(`button`,{className:`os-btn os-btn-secondary os-btn-sm`,onClick:()=>e(`/compliance/${W(t.categoryId)}`),children:`Open`}),!t.overridden&&(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:()=>p({categoryId:t.categoryId,requirementIds:t.requirementIds}),children:`Override`})]})]},t.categoryId)})})]})}),f&&(0,L.jsx)(ie,{entityId:u,categoryId:f.categoryId,requirementIds:f.requirementIds,onClose:()=>p(null)})]})}function ie({entityId:e,categoryId:t,requirementIds:n,onClose:r}){let{dispatch:i}=T(),a=s(),{toast:o}=y(),[l,u]=(0,j.useState)(``),[d,f]=(0,j.useState)(`Super Admin`),[p,m]=(0,j.useState)(new Date(Date.now()+30*864e5).toISOString().slice(0,10)),[h,g]=(0,j.useState)(!1);function _(){if(!l.trim()||!h)return o(`Reason + acknowledgement required`,`error`);i({type:`CREATE_OVERRIDE`,entityId:e,override:{id:`ov-${Date.now()}-${Math.floor(Math.random()*1e4)}`,categoryId:t,reason:l.trim(),approvedBy:a.state.user?.username??`system`,approvedByRole:d,approvedAt:new Date().toISOString().slice(0,19),expiresAt:p,active:!0}}),o(`Override created; expires ${p}`,`success`),r()}return(0,L.jsx)(`div`,{style:J,onClick:r,children:(0,L.jsxs)(`div`,{style:Y,onClick:e=>e.stopPropagation(),children:[(0,L.jsxs)(`header`,{style:X,children:[(0,L.jsxs)(`div`,{style:{fontSize:`16px`,fontWeight:800,display:`flex`,alignItems:`center`,gap:8},children:[(0,L.jsx)(O,{size:16,style:{color:`var(--os-amber)`}}),` Production override`]}),(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:r,children:(0,L.jsx)(c,{size:14})})]}),(0,L.jsxs)(`div`,{style:{padding:16},children:[(0,L.jsxs)(`div`,{style:{padding:`0.75rem 0.9rem`,background:`var(--os-red-bg)`,border:`1px solid var(--os-red)`,borderRadius:`var(--r-sm)`,fontSize:`12px`,color:`var(--os-red)`,marginBottom:12},children:[(0,L.jsx)(b,{size:13,style:{verticalAlign:-2,marginRight:6}}),`You are bypassing a production blocker on category `,(0,L.jsx)(`strong`,{children:t}),`. This action is logged and expires on the date you set. Requires legal/compliance approval.`]}),(0,L.jsx)($,{children:`Approver role`}),(0,L.jsxs)(`select`,{value:d,onChange:e=>f(e.target.value),style:Q,children:[(0,L.jsx)(`option`,{children:`Super Admin`}),(0,L.jsx)(`option`,{children:`Compliance Officer`}),(0,L.jsx)(`option`,{children:`Legal Counsel`}),(0,L.jsx)(`option`,{children:`CFO`})]}),(0,L.jsx)($,{children:`Reason (mandatory)`}),(0,L.jsx)(`textarea`,{value:l,onChange:e=>u(e.target.value),rows:3,placeholder:`e.g. Pilot cohort of 3 employees; ITA cert is submitted, awaiting response; risk accepted through 2026-08-30.`,style:{...Q,resize:`vertical`}}),(0,L.jsx)($,{children:`Expires on`}),(0,L.jsx)(`input`,{type:`date`,value:p,onChange:e=>m(e.target.value),style:Q}),(0,L.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:8,marginTop:12,fontSize:`12.5px`},children:[(0,L.jsx)(`input`,{type:`checkbox`,checked:h,onChange:e=>g(e.target.checked)}),`I acknowledge the risk and confirm legal/compliance sign-off is on file.`]})]}),(0,L.jsxs)(`footer`,{style:Z,children:[(0,L.jsx)(`button`,{className:`os-btn os-btn-ghost os-btn-sm`,onClick:r,children:`Cancel`}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,disabled:!l.trim()||!h,onClick:_,children:[(0,L.jsx)(O,{size:12}),` Create override`]})]})]})})}function ae(){let{state:e,dispatch:t}=T();s();let{toast:n}=y(),[r,i]=(0,j.useState)(`acme-il`),a=e.entities[r]?.ita,[o,c]=(0,j.useState)({}),l=a?{...a,...o}:void 0;function u(){l&&(t({type:`SET_ITA`,entityId:r,patch:l}),n(`ITA registration updated`,`success`))}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`ITA Registration`,title:`Israel Tax Authority Software Registration`,icon:(0,L.jsx)(_,{size:18,style:{color:`var(--os-blue)`}}),sub:`רישום תוכנה — רשות המסים. Applicable to accounting / document / inventory modules for Israeli legal entities. Spec §2.`,right:(0,L.jsx)(`select`,{value:r,onChange:e=>i(e.target.value),style:{padding:`5px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,background:`#fff`},children:Object.keys(e.entities).map(e=>(0,L.jsx)(`option`,{value:e,children:e},e))})}),!a&&(0,L.jsx)(`div`,{className:`os-card`,style:{padding:`2rem`,textAlign:`center`},children:`ITA registration not applicable for this entity.`}),a&&(0,L.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:12},children:[(0,L.jsxs)(`div`,{className:`os-card`,children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsx)(`span`,{className:`os-card-title`,children:`Registration status`})}),(0,L.jsxs)(`div`,{style:{padding:`14px 16px`},children:[(0,L.jsx)($,{children:`Required for this entity`}),(0,L.jsxs)(`select`,{value:l.required?`yes`:`no`,onChange:e=>c({...o,required:e.target.value===`yes`}),style:Q,children:[(0,L.jsx)(`option`,{value:`yes`,children:`Yes`}),(0,L.jsx)(`option`,{value:`no`,children:`No — not required`})]}),(0,L.jsx)($,{children:`Status`}),(0,L.jsxs)(`select`,{value:l.status,onChange:e=>c({...o,status:e.target.value}),style:Q,children:[(0,L.jsx)(`option`,{value:`not-required`,children:`Not required`}),(0,L.jsx)(`option`,{value:`required-not-started`,children:`Required — not started`}),(0,L.jsx)(`option`,{value:`in-progress`,children:`In progress`}),(0,L.jsx)(`option`,{value:`submitted`,children:`Submitted`}),(0,L.jsx)(`option`,{value:`approved`,children:`Approved`}),(0,L.jsx)(`option`,{value:`rejected`,children:`Rejected`}),(0,L.jsx)(`option`,{value:`expired`,children:`Expired`})]}),(0,L.jsx)($,{children:`Certificate number`}),(0,L.jsx)(`input`,{value:l.certificateNumber??``,onChange:e=>c({...o,certificateNumber:e.target.value}),style:Q}),(0,L.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:8},children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)($,{children:`Valid from`}),(0,L.jsx)(`input`,{type:`date`,value:l.validFrom??``,onChange:e=>c({...o,validFrom:e.target.value}),style:Q})]}),(0,L.jsxs)(`div`,{children:[(0,L.jsx)($,{children:`Valid until`}),(0,L.jsx)(`input`,{type:`date`,value:l.validUntil??``,onChange:e=>c({...o,validUntil:e.target.value}),style:Q})]})]}),(0,L.jsx)($,{children:`Registered software version`}),(0,L.jsx)(`input`,{value:l.registeredVersion??``,onChange:e=>c({...o,registeredVersion:e.target.value}),placeholder:`e.g. OneSource 1.0`,style:Q})]})]}),(0,L.jsxs)(`div`,{className:`os-card`,children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsx)(`span`,{className:`os-card-title`,children:`Registered modules + reviewer`})}),(0,L.jsxs)(`div`,{style:{padding:`14px 16px`},children:[(0,L.jsx)($,{children:`Registered modules`}),[`accounting`,`document_generation`,`inventory`,`payroll`,`VAT`,`other`].map(e=>(0,L.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:8,fontSize:`12.5px`,padding:`4px 0`},children:[(0,L.jsx)(`input`,{type:`checkbox`,checked:l.registeredModules.includes(e),onChange:t=>{let n=t.target.checked?[...l.registeredModules??[],e]:(l.registeredModules??[]).filter(t=>t!==e);c({...o,registeredModules:n})}}),e]},e)),(0,L.jsx)($,{children:`External reviewer`}),(0,L.jsx)(`input`,{value:l.externalReviewerName??``,onChange:e=>c({...o,externalReviewerName:e.target.value}),placeholder:`CPA / regulatory expert name`,style:Q}),(0,L.jsx)($,{children:`External reviewer approval date`}),(0,L.jsx)(`input`,{type:`date`,value:l.externalReviewerApprovalDate??``,onChange:e=>c({...o,externalReviewerApprovalDate:e.target.value}),style:Q}),l.validUntil&&l.validUntil<new Date().toISOString().slice(0,10)&&(0,L.jsxs)(`div`,{style:{marginTop:10,padding:`8px 10px`,background:`var(--os-red-bg)`,border:`1px solid var(--os-red)`,borderRadius:`var(--r-sm)`,fontSize:`12px`,color:`var(--os-red)`,display:`flex`,alignItems:`center`,gap:6},children:[(0,L.jsx)(b,{size:12}),` Certificate expired on `,l.validUntil,` — renew before further production use.`]})]}),(0,L.jsx)(`div`,{style:{padding:`10px 16px`,borderTop:`1px solid var(--os-border)`,display:`flex`,justifyContent:`flex-end`},children:(0,L.jsx)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,onClick:u,children:`Save`})})]})]})]})}function oe(){let{state:e,dispatch:t}=T(),n=s(),{toast:r}=y(),i=S(),a=D(),[o,c]=(0,j.useState)(`acme-il`),l=e.entities[o]?.uniformFile;function f(){let e=i.chartOfAccounts.length>=30,n=a.state.journals.filter(e=>e.postedAt).length>=1,s=e&&n,c=s?`Simulator returned no critical errors. Chart of accounts: ${i.chartOfAccounts.length} accounts. Posted journals: ${a.state.journals.filter(e=>e.postedAt).length}.`:`Simulator FAILED. ${e?``:`Chart of accounts too small (${i.chartOfAccounts.length} < 30 required). `}${n?``:`No posted journals yet.`}`;t({type:`SET_UNIFORM_FILE`,entityId:o,patch:{simulatorTestStatus:s?`pass`:`fail`,simulatorTestReport:c}}),r(s?`Simulator run passed`:`Simulator run FAILED — see report`,s?`success`:`error`)}function p(e){let s=n.companies.find(e=>e.id===o);if(!s)return r(`Entity not found`,`error`);let c=N(s,i.chartOfAccounts,a.state.journals.filter(e=>e.legalEntityId===o),{from:e.from,to:e.to});F(c);let l=`sha256:`+Math.abs(ce(e.label+i.chartOfAccounts.length+a.state.journals.length)).toString(16).padStart(8,`0`);t({type:`SET_UNIFORM_FILE`,entityId:o,patch:{lastGeneratedAt:new Date().toISOString().slice(0,19),lastGeneratedBy:n.state.user?.username??`system`,lastValidationStatus:`pass`,lastFileHash:l}}),t({type:`ADD_UNIFORM_FILE_HISTORY`,entityId:o,entry:{generatedAt:new Date().toISOString().slice(0,19),hash:l,period:e.label,status:`pass`}}),r(`${c.filename} downloaded · ${l.slice(-8)}`,`success`)}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`Uniform File`,title:`Uniform Audit File · קובץ במבנה אחיד`,icon:(0,L.jsx)(d,{size:18,style:{color:`var(--os-blue)`}}),sub:`Israeli Tax Authority uniform audit file. Spec §4. Uses the versioned regulatory rule set + document + master data.`,right:(0,L.jsx)(`select`,{value:o,onChange:e=>c(e.target.value),style:{padding:`5px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,background:`#fff`},children:Object.keys(e.entities).map(e=>(0,L.jsx)(`option`,{value:e,children:e},e))})}),!l&&(0,L.jsx)(`div`,{className:`os-card`,style:{padding:`2rem`,textAlign:`center`},children:`Not enabled for this entity.`}),l&&(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`div`,{className:`os-stats-grid`,style:{gridTemplateColumns:`repeat(4,1fr)`,marginBottom:`1rem`},children:[(0,L.jsxs)(`div`,{className:`os-stat`,children:[(0,L.jsx)(`div`,{className:`os-stat-icon blue`,children:(0,L.jsx)(d,{})}),(0,L.jsx)(`div`,{className:`os-stat-label`,children:`Enabled`}),(0,L.jsx)(`div`,{className:`os-stat-value`,children:l.enabled?`Yes`:`No`})]}),(0,L.jsxs)(`div`,{className:`os-stat`,children:[(0,L.jsx)(`div`,{className:`os-stat-icon ${l.simulatorTestStatus===`pass`?`green`:l.simulatorTestStatus===`fail`?`red`:`gray`}`,children:(0,L.jsx)(C,{})}),(0,L.jsx)(`div`,{className:`os-stat-label`,children:`Simulator`}),(0,L.jsx)(`div`,{className:`os-stat-value`,children:l.simulatorTestStatus??`—`})]}),(0,L.jsxs)(`div`,{className:`os-stat`,children:[(0,L.jsx)(`div`,{className:`os-stat-icon cyan`,children:(0,L.jsx)(u,{})}),(0,L.jsx)(`div`,{className:`os-stat-label`,children:`Last generated`}),(0,L.jsx)(`div`,{className:`os-stat-value`,style:{fontSize:`13px`},children:l.lastGeneratedAt??`—`})]}),(0,L.jsxs)(`div`,{className:`os-stat`,children:[(0,L.jsx)(`div`,{className:`os-stat-icon purple`,children:(0,L.jsx)(g,{})}),(0,L.jsx)(`div`,{className:`os-stat-label`,children:`History`}),(0,L.jsx)(`div`,{className:`os-stat-value`,children:l.history.length})]})]}),(0,L.jsxs)(`div`,{className:`os-card`,style:{marginBottom:12},children:[(0,L.jsxs)(`div`,{className:`os-card-header`,children:[(0,L.jsx)(`span`,{className:`os-card-title`,children:`Actions`}),(0,L.jsxs)(`span`,{style:{marginLeft:`auto`,display:`flex`,gap:6},children:[(0,L.jsx)(`button`,{className:`os-btn os-btn-secondary os-btn-sm`,onClick:f,children:`Run ITA simulator`}),(0,L.jsx)(`button`,{className:`os-btn os-btn-secondary os-btn-sm`,onClick:()=>p({from:`2026-04-01`,to:`2026-06-30`,label:`2026-Q2`}),children:`Generate 2026-Q2 XML`}),(0,L.jsx)(`button`,{className:`os-btn os-btn-secondary os-btn-sm`,onClick:()=>p({from:`2025-01-01`,to:`2025-12-31`,label:`2025 FY`}),children:`Generate 2025 FY XML`}),(0,L.jsx)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,onClick:()=>t({type:`SET_UNIFORM_FILE`,entityId:o,patch:{enabled:!l.enabled}}),children:l.enabled?`Disable`:`Enable`})]})]}),l.simulatorTestReport&&(0,L.jsxs)(`div`,{style:{padding:`10px 14px`,fontSize:`12px`,background:l.simulatorTestStatus===`pass`?`var(--os-green-bg)`:`var(--os-red-bg)`,color:l.simulatorTestStatus===`pass`?`#065f46`:`var(--os-red)`},children:[(0,L.jsx)(`strong`,{children:`Latest simulator report:`}),` `,l.simulatorTestReport]})]}),(0,L.jsxs)(`div`,{className:`os-card`,children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsx)(`span`,{className:`os-card-title`,children:`Generation history`})}),(0,L.jsxs)(`table`,{className:`os-table`,children:[(0,L.jsx)(`thead`,{children:(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`th`,{children:`Generated at`}),(0,L.jsx)(`th`,{children:`Period`}),(0,L.jsx)(`th`,{children:`Hash`}),(0,L.jsx)(`th`,{children:`Status`})]})}),(0,L.jsxs)(`tbody`,{children:[l.history.length===0&&(0,L.jsx)(`tr`,{children:(0,L.jsx)(`td`,{colSpan:4,style:{padding:`1.5rem`,textAlign:`center`,color:`var(--os-text-4)`},children:`No files generated yet.`})}),l.history.map((e,t)=>(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`td`,{style:{fontFamily:`monospace`,fontSize:`11.5px`},children:e.generatedAt}),(0,L.jsx)(`td`,{children:e.period}),(0,L.jsx)(`td`,{style:{fontFamily:`monospace`,fontSize:`11px`,color:`var(--os-text-3)`},children:e.hash}),(0,L.jsx)(`td`,{children:(0,L.jsx)(`span`,{className:`os-badge ${e.status===`pass`?`green`:`red`}`,children:e.status})})]},t))]})]})]})]})]})}function se(){let{state:e,dispatch:t}=T(),{toast:n}=y(),[r,i]=(0,j.useState)(`acme-il`),a=e.entities[r]?.vat;function o(e,i){t({type:`SET_VAT`,entityId:r,patch:{[e]:i}}),n(`Updated ${String(e)}`,`success`)}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`VAT / PCN874`,title:`VAT · PCN874 · Israel Invoice Allocation`,icon:(0,L.jsx)(_,{size:18,style:{color:`var(--os-blue)`}}),sub:`Israeli VAT compliance. Spec §5. Allocation numbers are issued by ITA — ERP must not self-generate them.`,right:(0,L.jsx)(`select`,{value:r,onChange:e=>i(e.target.value),style:{padding:`5px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,background:`#fff`},children:Object.keys(e.entities).map(e=>(0,L.jsx)(`option`,{value:e,children:e},e))})}),!a&&(0,L.jsx)(`div`,{className:`os-card`,style:{padding:`2rem`,textAlign:`center`},children:`Not applicable.`}),a&&(0,L.jsxs)(`div`,{className:`os-card`,children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsx)(`span`,{className:`os-card-title`,children:`VAT compliance checklist`})}),(0,L.jsx)(`div`,{style:{padding:`14px 18px`},children:[[`vatCodesConfigured`,`VAT codes configured`],[`vatReportWorks`,`Regular VAT report generator works`],[`pcn874ExportWorks`,`PCN874.TXT export works + validators`],[`vatToGLReconciliation`,`VAT ↔ GL reconciliation`],[`allocationNumberWorkflowWorks`,`Allocation number workflow works (API + fallback)`],[`allocationNumberApiEnabled`,`Allocation number API integration enabled`],[`sandboxTestPassed`,`Sandbox testing passed`],[`productionCredentialsSecured`,`Production credentials in vault (not code)`],[`manualSubmissionConfirmation`,`Manual submission confirmation workflow`]].map(([e,t])=>(0,L.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,justifyContent:`space-between`,padding:`8px 0`,borderBottom:`1px dotted var(--os-border)`},children:[(0,L.jsx)(`div`,{style:{fontSize:`12.5px`},children:t}),(0,L.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:6,cursor:`pointer`},children:[(0,L.jsx)(`input`,{type:`checkbox`,checked:a[e],onChange:t=>o(e,t.target.checked)}),(0,L.jsx)(`span`,{style:{fontSize:`11.5px`,color:`var(--os-text-3)`},children:a[e]?`Yes`:`No`})]})]},e))})]})]})}var J={position:`fixed`,inset:0,background:`rgba(15,23,42,0.55)`,zIndex:1300,display:`flex`,alignItems:`center`,justifyContent:`center`,padding:`2rem 1rem`},Y={width:560,maxWidth:`96vw`,background:`#fff`,borderRadius:`var(--r-md)`,boxShadow:`0 24px 60px rgba(0,0,0,0.35)`,display:`flex`,flexDirection:`column`,maxHeight:`90vh`,overflow:`hidden`},X={padding:`14px 18px`,borderBottom:`1px solid var(--os-border)`,display:`flex`,alignItems:`center`,justifyContent:`space-between`},Z={padding:`12px 18px`,borderTop:`1px solid var(--os-border)`,display:`flex`,justifyContent:`flex-end`,gap:8},Q={width:`100%`,padding:`6px 10px`,border:`1px solid var(--os-border)`,borderRadius:`var(--r-sm)`,fontSize:`12.5px`,outline:`none`,marginTop:2};function $({children:e}){return(0,L.jsx)(`div`,{style:{fontSize:`10.5px`,fontWeight:700,color:`var(--os-text-4)`,textTransform:`uppercase`,letterSpacing:`0.06em`,margin:`10px 0 3px`},children:e})}function ce(e){let t=0;for(let n=0;n<e.length;n++)t=(t<<5)-t+e.charCodeAt(n),t|=0;return t}function le(){let[e,t]=(0,j.useState)(I[0]),{toast:n}=y();function r(e){let t=new Blob([e.body],{type:`text/markdown; charset=utf-8`}),r=URL.createObjectURL(t),i=document.createElement(`a`);i.href=r,i.download=`${e.id}.md`,document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(r),n(`${e.title} downloaded`,`success`)}return(0,L.jsxs)(`div`,{children:[(0,L.jsx)(R,{crumb:`Legal Docs Templates`,title:`Legal Documents · Templates`,icon:(0,L.jsx)(d,{size:18,style:{color:`var(--os-blue)`}}),sub:`Starter templates for the 12 legal docs required at production (§18). Adapt with your counsel before publishing.`}),(0,L.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`340px 1fr`,gap:12,alignItems:`start`},children:[(0,L.jsxs)(`div`,{className:`os-card`,children:[(0,L.jsx)(`div`,{className:`os-card-header`,children:(0,L.jsxs)(`span`,{className:`os-card-title`,children:[`Templates (`,I.length,`)`]})}),I.map(n=>(0,L.jsxs)(`div`,{onClick:()=>t(n),style:{padding:`11px 14px`,borderBottom:`1px solid var(--os-border)`,cursor:`pointer`,background:e.id===n.id?`var(--os-blue-bg)`:void 0},children:[(0,L.jsx)(`div`,{style:{fontSize:`13px`,fontWeight:700},children:n.title}),(0,L.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--os-text-3)`,marginTop:2},children:n.description})]},n.id))]}),(0,L.jsxs)(`div`,{className:`os-card`,children:[(0,L.jsxs)(`div`,{className:`os-card-header`,children:[(0,L.jsx)(`span`,{className:`os-card-title`,children:e.title}),(0,L.jsxs)(`button`,{className:`os-btn os-btn-primary os-btn-sm`,style:{marginLeft:`auto`},onClick:()=>r(e),children:[(0,L.jsx)(f,{size:12}),` Download .md`]})]}),(0,L.jsx)(`div`,{style:{padding:`16px 20px`,maxHeight:`70vh`,overflowY:`auto`},children:(0,L.jsx)(`pre`,{style:{whiteSpace:`pre-wrap`,fontFamily:`ui-sans-serif, system-ui, sans-serif`,fontSize:`12.5px`,margin:0,color:`var(--os-text-2)`},children:e.body})})]})]})]})}export{G as ComplianceCategoryPage,H as ComplianceCenterPage,ne as EvidenceRepositoryPage,ae as ITARegistrationPage,le as LegalDocsTemplatesPage,re as ProductionBlockersPage,oe as UniformFilePage,se as VATCompliancePage};