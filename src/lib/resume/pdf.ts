export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export class PdfValidationError extends Error {}

/** Validates size and PDF magic bytes ("%PDF-" within the first 1024 bytes, per spec leniency). Throws PdfValidationError. */
export function validatePdfBuffer(buf: Uint8Array): void {
  if (!buf.length) throw new PdfValidationError("The file is empty.");
  if (buf.length > MAX_RESUME_BYTES) throw new PdfValidationError("File is larger than the 5MB limit.");
  const head = Buffer.from(buf.subarray(0, Math.min(1024, buf.length))).toString("latin1");
  if (!head.includes("%PDF-")) throw new PdfValidationError("Only PDF files are accepted (file content is not a valid PDF).");
}

/** Cleans extracted PDF text: normalizes whitespace, drops page markers and NULs. */
export function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^-- \d+ of \d+ --$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
