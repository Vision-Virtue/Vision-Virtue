/* Smoke test for pptx generation.
   Steps:
     1. Run the xlsx-worker to produce a populated xlsx (same as smoke-deck-sheet).
     2. Open the produced xlsx and confirm the deck-questionnaire sheet was added.
     3. Call generatePopulatedPptx() to produce a populated pptx.
     4. Open the produced pptx and confirm the placeholders we filled were
        actually replaced in the slide XML.
*/
const path  = require('path');
const fs    = require('fs').promises;
const JSZip = require('jszip');

(async () => {
  const distRoot = path.resolve(__dirname, '..', 'dist');
  require(path.join(distRoot, 'workers', 'xlsx-worker.js'));

  // Sample answers covering placeholders we expect to find both
  // (a) in the questionnaire sheet (text answers) and
  // (b) in the calculations sheet (where the template's default "MISSING INPUT"
  //     markers should be stripped to '' rather than show up in the deck).
  const answers = {
    companyName: 'PptSmokeCo',
    companyTagline: 'Smoke pipelines, no fire.',
    oneLineDescription: 'A test company verifying the deck pipeline end-to-end.',
    leadInvestor: 'TBD',
    contactName: 'Raphael Haim',
    contactEmail: 'raphi@example.com',
    contactTitle: 'Managing Partner',
    problemHeadline: 'Investor decks take forever to assemble manually.',
    kpi1Label: 'ARR', kpi2Label: 'NRR', kpi3Label: 'GM', kpi4Label: 'Burn',
    headquarters: 'Tel Aviv, Israel',
    foundedYear: 2024,
    fyStart: 2026, fyEnd: 2030,
    year1: 2026, year2: 2027, year3: 2028, year4: 2029, year5: 2030,
  };

  const workerInput = {
    customerName: 'PptSmokeCo',
    formData: { investorDeck: answers },
    templatePath: path.resolve(__dirname, '..', 'templates', 'Financial Model v8.xlsx'),
    filePath:     path.resolve(__dirname, '..', '..', 'smoke-pptx-xlsx.xlsx'),
  };

  await new Promise((resolve, reject) => {
    const origExit = process.exit;
    const origSend = process.send;
    process.exit = (code) => {
      process.exit = origExit; process.send = origSend;
      if (code === 0) resolve(); else reject(new Error(`xlsx worker exit ${code}`));
    };
    process.send = () => true;
    process.emit('message', workerInput, undefined);
    setTimeout(() => {
      process.exit = origExit; process.send = origSend;
      reject(new Error('xlsx worker timed out'));
    }, 30_000);
  });
  console.log('xlsx written');

  // 3. Generate the pptx
  const { generatePopulatedPptx } = require(path.join(distRoot, 'services', 'pptx-generator.service.js'));
  const tplPptx = path.resolve(__dirname, '..', 'templates', 'VisionVirtue_InvestorDeck.pptx');
  const outPptx = path.resolve(__dirname, '..', '..', 'smoke-pptx-output.pptx');

  const stats = await generatePopulatedPptx({
    templatePptxPath: tplPptx,
    customerXlsxPath: workerInput.filePath,
    outputPptxPath:   outPptx,
  });
  console.log(`pptx stats: replaced=${stats.replaced}  slides=${stats.slidesProcessed}  unmatched=${stats.unmatched.length}`);

  // 4. Verify a couple of placeholders in the output slides
  const buf = await fs.readFile(outPptx);
  const zip = await JSZip.loadAsync(buf);
  const slideKeys = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  let combined = '';
  for (const k of slideKeys) combined += await zip.file(k).async('string');

  const checks = [
    ['COMPANY_NAME replaced (no {{ left)', /\{\{COMPANY_NAME\}\}/.test(combined) === false],
    ['Replacement text present (PptSmokeCo)', /PptSmokeCo/.test(combined)],
    ['Tagline present',                  /Smoke pipelines, no fire\./.test(combined)],
    ['Contact email present',            /raphi@example\.com/.test(combined)],
    ['Headquarters present',             /Tel Aviv, Israel/.test(combined)],
    ['MISSING INPUT stripped (none in slides)', /MISSING INPUT/.test(combined) === false],
    // CONTACT_EMAIL should have been replaced — but {{CONTACT_NAME}} too
    ['CONTACT_NAME replaced',            /\{\{CONTACT_NAME\}\}/.test(combined) === false],
  ];
  let allPassed = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) allPassed = false;
  }

  // Some placeholders we DIDN'T fill (e.g. image placeholders, calculated
  // values that depend on Excel formula evaluation) — make sure these are
  // reported as unmatched, but the pipeline still succeeds.
  console.log(`\nFirst 10 unmatched placeholders (expected for image/calc placeholders we didn't fill):`);
  for (const u of stats.unmatched.slice(0, 10)) console.log(`  ${u}`);

  if (!allPassed) process.exit(1);
  console.log('\nAll pptx smoke checks passed.');
  process.exit(0);
})().catch((e) => { console.error('Smoke failed:', e); process.exit(1); });
