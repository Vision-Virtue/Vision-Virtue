"use strict";
/* ============================================================
   NDA PDF Generator
   Overlays the investor's signed form data onto the Vision &
   Virtue NDA master PDF and returns a populated, downloadable
   PDF buffer for the Agreements panel.
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePopulatedNdaPdf = generatePopulatedNdaPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_lib_1 = require("pdf-lib");
const TEMPLATE_RELATIVE = path_1.default.join(__dirname, '..', '..', 'templates', 'Vision_Virtue_NDA_VC_PE_Investors.pdf');
/** Resolve the path to the master NDA template, with a couple of fallbacks
 *  in case the file lives next to the compiled JS (dist) vs src. */
function templatePath() {
    const candidates = [
        TEMPLATE_RELATIVE,
        path_1.default.resolve(process.cwd(), 'templates', 'Vision_Virtue_NDA_VC_PE_Investors.pdf'),
        path_1.default.resolve(process.cwd(), 'marketing-backend', 'templates', 'Vision_Virtue_NDA_VC_PE_Investors.pdf'),
    ];
    for (const p of candidates) {
        if (fs_1.default.existsSync(p))
            return p;
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
async function generatePopulatedNdaPdf(nda) {
    const templateBytes = fs_1.default.readFileSync(templatePath());
    const pdf = await pdf_lib_1.PDFDocument.load(templateBytes);
    const helv = await pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const helvObl = await pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaOblique);
    // Append a fresh page in standard letter size for the signature record.
    const page = pdf.addPage([612, 792]);
    const navy = (0, pdf_lib_1.rgb)(10 / 255, 21 / 255, 51 / 255);
    const gold = (0, pdf_lib_1.rgb)(212 / 255, 175 / 255, 55 / 255);
    const ink = (0, pdf_lib_1.rgb)(0.12, 0.16, 0.24);
    // Header band
    page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: navy });
    page.drawText('VISION & VIRTUE  ·  NDA SIGNATURE RECORD', {
        x: 36, y: 763, size: 12, font: helvBold, color: (0, pdf_lib_1.rgb)(1, 1, 1),
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
    function row(label, value) {
        page.drawText(label, { x: 36, y, size: 10.5, font: labelFont, color: navy });
        page.drawText(value || '—', { x: 200, y, size: 11, font: valueFont, color: ink });
        y -= 24;
    }
    row('Investor / Fund', nda.fundName);
    row('Signatory', nda.fullName);
    row('Title', nda.title);
    row('Business email', nda.businessEmail);
    row('Date signed', nda.signDate);
    row('Counterparty (V&V customer)', nda.customerName);
    row('Signed at (server timestamp)', nda.signedAt);
    if (nda.ipAddress)
        row('Originating IP', nda.ipAddress);
    // Confirmation clause snapshot
    y -= 6;
    page.drawText('Confirmation:', { x: 36, y, size: 10.5, font: labelFont, color: navy });
    y -= 16;
    const clause = 'I confirm that I have read and understood this Confidentiality and Non-Circumvention\n' +
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
            if (ph > 80) {
                ph = 80;
                pw = ph * ratio;
            }
            page.drawImage(png, { x: 36, y: y + 14, width: pw, height: ph });
        }
        catch {
            page.drawText(nda.signatureValue.slice(0, 80), {
                x: 36, y: y + 14, size: 14, font: helvObl, color: ink,
            });
        }
    }
    else {
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
