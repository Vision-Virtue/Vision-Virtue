/* ============================================================
   Per-customer DPA generator.

   Usage:
     node dist/scripts/generateCustomerDpa.js \
       --customer "Acme Corp Ltd" \
       --email acme-legal@example.com \
       [--vv-address "V&V registered office address"]

   Output:
     ./dpa-out/<slug>-DPA.md         — fully-personalized DPA Markdown
     ./dpa-out/<slug>-EMAIL.txt      — ready-to-send email body
     ./dpa-out/<slug>-NEXT-STEPS.txt — what Raphael does next (3 lines)

   That's it. Open the .md, save as PDF, paste the email body, attach,
   send. ~30 seconds per customer end-to-end.
   ============================================================ */

import fs from 'fs';
import path from 'path';

const args = parseArgs();

function parseArgs(): { customer: string; email: string; vvAddress: string } {
  const a = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    if (i === -1 || i + 1 >= a.length) return undefined;
    return a[i + 1];
  };
  const customer = get('--customer');
  const email = get('--email');
  if (!customer || !email) {
    console.error('Usage: node dist/scripts/generateCustomerDpa.js --customer "Legal Name" --email legal@example.com [--vv-address "..."]');
    process.exit(1);
  }
  return {
    customer,
    email,
    vvAddress: get('--vv-address') || '[V&V registered office — fill in once before first run]',
  };
}

const slug = args.customer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const today = new Date().toISOString().slice(0, 10);
const outDir = path.resolve('./dpa-out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ─── Read the master template ─────────────────────────────────────────────────
const templatePath = path.resolve(__dirname, '../../../DPA-TEMPLATE.md');
if (!fs.existsSync(templatePath)) {
  console.error(`Template not found at ${templatePath}`);
  process.exit(1);
}
let dpaContent = fs.readFileSync(templatePath, 'utf8');

// ─── Personalize ──────────────────────────────────────────────────────────────
dpaContent = dpaContent
  .replace(/\[Customer Legal Name\]/g, args.customer)
  .replace(/\[V&V registered office\]/g, args.vvAddress)
  .replace(/\*\*Effective date:\*\* ____________________/g, `**Effective date:** ${today}`);

const dpaFile = path.join(outDir, `${slug}-DPA.md`);
fs.writeFileSync(dpaFile, dpaContent, 'utf8');

// ─── Generate the cover email body ────────────────────────────────────────────
const emailBody = `Subject: Visibility Portal — Data Processing Agreement for Signature

Dear ${args.customer} team,

Attached is the Data Processing Agreement (DPA) for our Visibility Portal
service, in line with the Israeli Protection of Privacy Law 5741-1981
and, where applicable, EU GDPR Article 28.

Key points:
- Vision & Virtue acts as Processor; ${args.customer} remains Controller of your data
- We have signed DPAs with our two sub-processors: Anthropic, PBC
  (AI model API) and Render Services, Inc. (cloud hosting)
- All sensitive columns (salaries, vendor names, budget descriptions)
  are encrypted at rest with AES-256-GCM
- Customer access keys are stored as scrypt hashes (never recoverable)
- Daily encrypted backups, 30-day retention
- 72-hour breach notification per PPL and our DPA Section 7

Please review and, if acceptable, sign + return the executed PDF. Happy
to discuss any provisions or arrange a call.

Best regards,
Raphael Haim, CPA
Managing Partner — Vision & Virtue Partnership
raphihaim10@gmail.com
https://visionvirtuepartnership.com
`;

const emailFile = path.join(outDir, `${slug}-EMAIL.txt`);
fs.writeFileSync(emailFile, emailBody, 'utf8');

// ─── Generate the next-steps file ─────────────────────────────────────────────
const nextSteps = `NEXT STEPS for ${args.customer} (~30 seconds):

1. Open ${dpaFile}
   → Paste into Google Docs (or Word) → File → Download → PDF
   → Save as: DPA-${slug}-${today}.pdf

2. Open ${emailFile}
   → Copy subject + body
   → New email to ${args.email}
   → Attach the PDF from step 1
   → Send

3. When ${args.customer} returns the signed PDF:
   → Save to: Google Drive / "V&V Legal / Customer DPAs / ${args.customer}/"
   → Add line to KB-OPERATIONAL.md: "DPA ${args.customer} signed YYYY-MM-DD — gd://..."
   → Hit the admin endpoint to mark internal status:
     curl -X POST https://vv-marketing-api.onrender.com/api/admin/dpa-status \\
       -H "X-Admin-Pin: \$PIN" -H "Content-Type: application/json" \\
       -d '{"kind":"customer","customer":"${args.customer}","status":"signed","signedAt":"YYYY-MM-DD"}'
`;

const stepsFile = path.join(outDir, `${slug}-NEXT-STEPS.txt`);
fs.writeFileSync(stepsFile, nextSteps, 'utf8');

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Generated DPA pack for: ${args.customer}`);
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log(`  📄 DPA:        ${dpaFile}`);
console.log(`  ✉️  Email body: ${emailFile}`);
console.log(`  📋 Next steps: ${stepsFile}`);
console.log('');
console.log('  Total time to send: ~30 seconds');
console.log('  Follow the next-steps file ↑');
console.log('');
