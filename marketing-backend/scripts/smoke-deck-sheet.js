/* Smoke test for the investor-deck sheet writer.
   Requires `npm run build` to have produced dist/.
   Runs the compiled xlsx-worker in-process against the v7 template
   and verifies the new sheet exists with expected content.
*/
const path = require('path');
const fs   = require('fs').promises;
const JSZip = require('jszip');

(async () => {
  const distRoot = path.resolve(__dirname, '..', 'dist');
  // Import the compiled worker — it registers a process.on('message') handler.
  require(path.join(distRoot, 'workers', 'xlsx-worker.js'));

  const workerInput = {
    customerName: 'SmokeCo',
    formData: {
      general: { sector: 'SaaS', round: 'Seed', capitalGoal: '5000000', yearsSinceFound: '2', firstYear: '2024' },
      investorDeck: {
        companyName: 'SmokeCo',
        companyTagline: 'Detect smoke before fire.',
        oneLineDescription: 'SmokeCo helps SMBs catch financial smoke signals before the fire.',
        problemHeadline: 'Most SMBs only see their financial problems too late.',
        stat01: '67%', stat01Label: 'of SMBs miss a cash-flow alert in any given quarter.',
        kpi1Label: 'ARR', kpi2Label: 'NRR', kpi3Label: 'GM', kpi4Label: 'Burn',
        contactName: 'Raphael Haim', contactTitle: 'Managing Partner',
        contactEmail: 'raphi@example.com',
        leadInvestor: 'TBD',
        fyStart: 2026, fyEnd: 2030,
        year1: 2026, year2: 2027, year3: 2028, year4: 2029, year5: 2030,
      },
    },
    templatePath: path.resolve(__dirname, '..', 'templates', 'Financial Model v8.xlsx'),
    filePath:     path.resolve(__dirname, '..', '..', 'smoke-deck-output.xlsx'),
  };

  // The worker calls process.exit() on completion; intercept it so the test
  // continues to the verification step.
  await new Promise((resolve, reject) => {
    const origExit = process.exit;
    const origSend = process.send;
    process.exit = (code) => {
      process.exit = origExit;
      process.send = origSend;
      if (code === 0) resolve(); else reject(new Error(`worker exit ${code}`));
    };
    process.send = () => true;
    process.emit('message', workerInput, undefined);
    setTimeout(() => {
      process.exit = origExit;
      process.send = origSend;
      reject(new Error('worker timed out'));
    }, 30_000);
  });

  // Verify the output.
  const buf = await fs.readFile(workerInput.filePath);
  const zip = await JSZip.loadAsync(buf);
  const wb  = await zip.file('xl/workbook.xml').async('string');
  const hasSheet = /name="Investor_Deck_Questionnaire_Inputs"/.test(wb);
  console.log(`new sheet registered in workbook.xml: ${hasSheet}`);
  if (!hasSheet) process.exit(1);

  // Find the <sheet/> tag for our sheet (attribute order isn't fixed).
  const sheetTag = wb.match(/<sheet\b[^/>]*name="Investor_Deck_Questionnaire_Inputs"[^/>]*\/>/);
  if (!sheetTag) { console.error('Sheet tag not found'); process.exit(1); }
  const ridMatch = /r:id="([^"]+)"/.exec(sheetTag[0]);
  if (!ridMatch) { console.error('No r:id in sheet tag: ' + sheetTag[0]); process.exit(1); }
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  // The Type attribute contains `/` chars (URLs), so [^/>]* can't span them.
  // indexOf the literal Id="<rid>" then look for the next `/>` end-of-tag.
  const idMarker = `Id="${ridMatch[1]}"`;
  const idIdx = rels.indexOf(idMarker);
  if (idIdx < 0) { console.error(`Marker ${idMarker} not in rels XML`); process.exit(1); }
  const tagStart = rels.lastIndexOf('<Relationship', idIdx);
  const tagEnd   = rels.indexOf('/>', idIdx);
  if (tagStart < 0 || tagEnd < 0) { console.error('Could not bound Relationship tag'); process.exit(1); }
  const relTag = [ rels.slice(tagStart, tagEnd + 2) ];
  const tMatch = /Target="([^"]+)"/.exec(relTag[0]);
  const target = tMatch[1].startsWith('/') ? tMatch[1].slice(1) : `xl/${tMatch[1].replace(/^\.\//, '')}`;
  console.log(`new sheet path: ${target}`);
  const sheetXml = await zip.file(target).async('string');

  const ct = await zip.file('[Content_Types].xml').async('string');
  const hasOverride = ct.includes(`PartName="/${target}"`);
  console.log(`[Content_Types].xml has Override: ${hasOverride}`);

  // Check the structural content.
  const checks = [
    ['Slide_Number header',     /<t[^>]*>Slide_Number<\/t>/],
    ['Placeholder_Name header', /<t[^>]*>Placeholder_Name<\/t>/],
    ['Answer_Value header',     /<t[^>]*>Answer_Value<\/t>/],
    ['COMPANY_NAME row',        /<t[^>]*>\{\{COMPANY_NAME\}\}<\/t>/],
    ['LEAD_INVESTOR row',       /<t[^>]*>\{\{LEAD_INVESTOR\}\}<\/t>/],
    ['Sample answer SmokeCo',   /<t[^>]*>SmokeCo<\/t>/],
    ['Sample answer TBD',       /<t[^>]*>TBD<\/t>/],
    // Answer_Value is always inline-string so customer-entered values like
    // "$5M" / "Q3 2026" don't get auto-formatted by Excel. Numeric inputs
    // are stringified before being written into the Answer_Value column.
    ['Answer value 2030 present', /<t[^>]*>2030<\/t>/],
    // Slide_Number column IS numeric — confirm at least one row has it.
    ['Slide_Number numeric',     /<c r="A\d+"><v>\d+<\/v>/],
  ];
  let allPassed = true;
  for (const [label, re] of checks) {
    const ok = re.test(sheetXml);
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) allPassed = false;
  }

  // Count rows: should be 1 header + ~130 placeholders.
  const rowCount = (sheetXml.match(/<row\b/g) || []).length;
  console.log(`row count: ${rowCount}`);

  // Confirm the existing sheet wasn't broken.
  const sheetsCount = (wb.match(/<sheet\b/g) || []).length;
  // v8 ships with 12 sheets (incl. Investor_Deck_Calculations); we add one more.
  console.log(`total <sheet/> entries in workbook: ${sheetsCount} (was 12, expect 13)`);

  if (!allPassed || sheetsCount !== 13) process.exit(1);
  console.log('\nAll smoke checks passed.');
  process.exit(0);
})().catch((e) => { console.error('Smoke failed:', e); process.exit(1); });
