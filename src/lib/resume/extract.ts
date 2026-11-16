import "server-only";
import { cleanExtractedText } from "./pdf";

/** Extracts text from a PDF using pdf-parse v2 (`PDFParse` class). */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const res = await parser.getText();
    return cleanExtractedText(res.text ?? "");
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
