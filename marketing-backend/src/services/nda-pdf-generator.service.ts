/* ============================================================
   NDA PDF Generator
   Overlays the investor's signed form data onto the Vision &
   Virtue NDA master PDF and returns a populated, downloadable
   PDF buffer for the Agreements panel.
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NdaSignature } from '../db/partner.repository';

const TEMPLATE_RELATIVE = path.join(__dirname, '..', '..', 'templates', 'Vision_Virtue_NDA_VC_PE_Investors.pdf');

/** Resolve the path to the master NDA template, with a couple of fallbacks
 *  in case the file lives next to the compiled JS (dist) vs src. */
function templatePath(): string {
  const candidates = [
    TEMPLATE_RELATIVE,
    path.resolve(process.cwd(), 'templates', 'Vision_Virtue_NDA_VC_PE_Investors.pdf'),
    path.resolve(process.cwd(), 'marketing-backend', 'templates', 'Vision_Virtue_NDA_VC_PE_Investors.pdf'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('NDA template PDF not found. Looked at: ' + candidates.join(' | '));
}

/**
 * Build a populated NDA PDF from a stored signature record. The original
 * template is read fresh on every call; we don't cache (low frequency).
 *
 * Strategy: append a single signature page to the end of the original NDA,
 * containing all collected fields + the signature image. This guarantees
 * the original NDA text remains untouched while the signature data is
 * appended in a clean, audit-friendly format.
 *
 * (We append rather than overlay because the master PDF uses an interactive
 * form layout — overlaying text on top of form fields is brittle.)
 */
export async function generatePopulatedNdaPdf(nda: NdaSignature): Promise<Buffer> {
  const templateBytes = fs.readFileSync(templatePath());
  const pdf = await PDFDocument.load(templateBytes);

  const helv     = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvObl  = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Append a fresh page in standard letter size for the signature record.
  const page = pdf.addPage([612, 792]);
  const navy = rgb(10 / 255, 21 / 255, 51 / 255);
  const gold = rgb(212 / 255, 175 / 255, 55 / 255);
  const ink  = rgb(0.12, 0.16, 0.24);

  // Header band
  page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: navy });
  page.drawText('VISION & VIRTUE  ·  NDA SIGNATURE RECORD', {
    x: 36, y: 763, size: 12, font: helvBold, color: rgb(1, 1, 1),
  });
  page.drawRectangle({ x: 0, y: 748, width: 612, height: 4, color: gold });

  // Body title
  page.drawText('Confidentiality & Non-Circumvention — Signed Acceptance', {
    x: 36, y: 712, size: 14, font: helvBold, color: navy,
  });
  page.drawText('Counterpart appended to the master NDA on the prior pages.', {
    x: 36, y: 696, size: 9.5, font: helvObl, color: ink,
  });

  const labelFont = helvBold;
  const valueFont = helv;
  let y = 660;
  function row(label: string, value: string) {
    page.drawText(label, { x: 36, y, size: 10.5, font: labelFont, color: navy });
    page.drawText(value || '—', { x: 200, y, size: 11, font: valueFont, color: ink });
    y -= 24;
  }
  row('Investor / Fund',  nda.fundName);
  row('Signatory',        nda.fullName);
  row('Title',            nda.title);
  row('Business email',   nda.businessEmail);
  row('Date signed',      nda.signDate);
  row('Counterparty (V&V customer)', nda.customerName);
  row('Signed at (server timestamp)', nda.signedAt);
  if (nda.ipAddress) row('Originating IP', nda.ipAddress);

  // Confirmation clause snapshot
  y -= 6;
  page.drawText('Confirmation:', { x: 36, y, size: 10.5, font: labelFont, color: navy });
  y -= 16;
  const clause =
    'I confirm that I have read and understood this Confidentiality and Non-Circumvention\n' +
    'Agreement and agree to be legally bound by its terms.';
  clause.split('\n').forEach(line => {
    page.drawText(line, { x: 36, y, size: 10.5, font: valueFont, color: ink });
    y -= 14;
  });

  // Signature block
  y -= 18;
  page.drawText('Electronic signature', { x: 36, y, size: 10.5, font: labelFont, color: navy });
  y -= 12;
  page.drawLine({ start: { x: 36, y }, end: { x: 320, y }, thickness: 0.8, color: ink });
  y -= 6;
  page.drawText('(' + (nda.signatureType === 'drawn' ? 'drawn' : 'typed') + ')', {
    x: 36, y, size: 9, font: helvObl, color: ink,
  });

  if (nda.signatureType === 'drawn' && nda.signatureValue.startsWith('data:image/png')) {
    try {
      const base64 = nda.signatureValue.split(',')[1] || '';
      const pngBytes = Buffer.from(base64, 'base64');
      const png = await pdf.embedPng(pngBytes);
      // Fit into a 280×80 box above the line
      const ratio = png.width / png.height;
      let pw = 280, ph = pw / ratio;
      if (ph > 80) { ph = 80; pw = ph * ratio; }
      page.drawImage(png, { x: 36, y: y + 14, width: pw, height: ph });
    } catch {
      page.drawText(nda.signatureValue.slice(0, 80), {
        x: 36, y: y + 14, size: 14, font: helvObl, color: ink,
      });
    }
  } else {
    // Typed: render the typed name in oblique above the line
    page.drawText(nda.signatureValue, {
      x: 36, y: y + 14, size: 18, font: helvObl, color: ink,
    });
  }

  // Footer
  page.drawText('Vision & Virtue Partnership  ·  Generated NDA counterpart  ·  Document ID: ' + nda.id, {
    x: 36, y: 36, size: 8, font: helv, color: ink,
  });

  const out = await pdf.save();
  return Buffer.from(out);
}
