"use strict";
/* ============================================================
   Investors Marketplace — Deck PDF storage
   Customer uploads a view-only PDF of their investor deck; we
   store it on the persistent disk and stream it (inline only) to
   investors who have signed the standard NDA.
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DECK_PDF_BYTES = void 0;
exports.deckPdfAbsPath = deckPdfAbsPath;
exports.storeDeckPdf = storeDeckPdf;
exports.readDeckPdf = readDeckPdf;
exports.deleteDeckPdf = deleteDeckPdf;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.MAX_DECK_PDF_BYTES = 30 * 1024 * 1024; // 30 MB
function dataRoot() {
    return path_1.default.resolve(path_1.default.dirname(process.env.DB_PATH || './data/marketing.db'));
}
function decksDir() {
    const dir = path_1.default.join(dataRoot(), 'marketplace-decks');
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function safeListingId(listingId) {
    if (!/^[A-Za-z0-9-]+$/.test(listingId)) {
        throw new Error('Invalid listing id');
    }
    return listingId;
}
/** Absolute on-disk path for a listing's deck PDF. */
function deckPdfAbsPath(listingId) {
    return path_1.default.join(decksDir(), `${safeListingId(listingId)}.pdf`);
}
/** Store the uploaded PDF, returning the public-facing reference path
 *  (stored on the listing as deck_pdf_path; investors fetch via API). */
function storeDeckPdf(listingId, body) {
    if (!body || body.length === 0)
        throw new Error('Empty PDF body');
    if (body.length > exports.MAX_DECK_PDF_BYTES)
        throw new Error('PDF too large');
    // Quick header check: PDF files start with "%PDF-"
    const head = body.slice(0, 5).toString('utf8');
    if (head !== '%PDF-')
        throw new Error('Not a PDF file');
    const abs = deckPdfAbsPath(listingId);
    fs_1.default.writeFileSync(abs, body);
    return `marketplace-deck:${listingId}`;
}
/** Return the buffer for streaming, or null if the file is gone. */
function readDeckPdf(listingId) {
    const abs = deckPdfAbsPath(listingId);
    if (!fs_1.default.existsSync(abs))
        return null;
    return fs_1.default.readFileSync(abs);
}
/** Delete the PDF file for a listing (idempotent). */
function deleteDeckPdf(listingId) {
    const abs = deckPdfAbsPath(listingId);
    if (fs_1.default.existsSync(abs))
        fs_1.default.unlinkSync(abs);
}
