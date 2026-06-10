/* ============================================================
   Investors Marketplace — Deck PDF storage
   Customer uploads a view-only PDF of their investor deck; we
   store it on the persistent disk and stream it (inline only) to
   investors who have signed the standard NDA.
   ============================================================ */

import path from 'path';
import fs from 'fs';

export const MAX_DECK_PDF_BYTES = 30 * 1024 * 1024; // 30 MB

function dataRoot(): string {
  return path.resolve(path.dirname(process.env.DB_PATH || './data/marketing.db'));
}

function decksDir(): string {
  const dir = path.join(dataRoot(), 'marketplace-decks');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeListingId(listingId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(listingId)) {
    throw new Error('Invalid listing id');
  }
  return listingId;
}

/** Absolute on-disk path for a listing's deck PDF. */
export function deckPdfAbsPath(listingId: string): string {
  return path.join(decksDir(), `${safeListingId(listingId)}.pdf`);
}

/** Store the uploaded PDF, returning the public-facing reference path
 *  (stored on the listing as deck_pdf_path; investors fetch via API). */
export function storeDeckPdf(listingId: string, body: Buffer): string {
  if (!body || body.length === 0) throw new Error('Empty PDF body');
  if (body.length > MAX_DECK_PDF_BYTES) throw new Error('PDF too large');
  // Quick header check: PDF files start with "%PDF-"
  const head = body.slice(0, 5).toString('utf8');
  if (head !== '%PDF-') throw new Error('Not a PDF file');
  const abs = deckPdfAbsPath(listingId);
  fs.writeFileSync(abs, body);
  return `marketplace-deck:${listingId}`;
}

/** Return the buffer for streaming, or null if the file is gone. */
export function readDeckPdf(listingId: string): Buffer | null {
  const abs = deckPdfAbsPath(listingId);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

/** Delete the PDF file for a listing (idempotent). */
export function deleteDeckPdf(listingId: string): void {
  const abs = deckPdfAbsPath(listingId);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}
