import { describe, it, expect } from "vitest";
import { validatePdfBuffer, cleanExtractedText, MAX_RESUME_BYTES, PdfValidationError } from "./pdf";

const pdf = (extra = 0) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(extra, 32)]);

describe("validatePdfBuffer", () => {
  it("accepts a PDF header", () => { expect(() => validatePdfBuffer(pdf(100))).not.toThrow(); });
  it("rejects wrong magic bytes even with .pdf name", () => {
    expect(() => validatePdfBuffer(Buffer.from("PK\u0003\u0004 docx content"))).toThrow(PdfValidationError);
    expect(() => validatePdfBuffer(Buffer.from("<html></html>"))).toThrow(/PDF/);
  });
  it("rejects empty and >5MB", () => {
    expect(() => validatePdfBuffer(Buffer.alloc(0))).toThrow(/empty/);
    expect(() => validatePdfBuffer(pdf(MAX_RESUME_BYTES))).toThrow(/5MB/);
    expect(() => validatePdfBuffer(pdf(MAX_RESUME_BYTES - 20))).not.toThrow();
  });
});

describe("cleanExtractedText", () => {
  it("normalizes whitespace and strips page markers", () => {
    expect(cleanExtractedText("a  b\r\n\r\n\r\n\r\n-- 1 of 2 --\nc\u0000")).toBe("a b\n\nc");
  });
});
