import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  configurePdfJsWorker,
  resolvePdfJsWorkerSrc,
} from "./pdf-polyfill";
import { extractPdfText } from "./parse-pdf";

/** Tiny 1-page PDF with Helvetica "Hello LlevaCuentas". */
function helloPdf(): Buffer {
  const stream = "BT /F1 12 Tf 72 720 Td (Hello LlevaCuentas) Tj ET";
  const objs = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let body = "";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(9 + body.length); // after "%PDF-1.4\n"
    body += obj;
  }
  const xrefStart = 9 + body.length;
  const pad = (n: number) => String(n).padStart(10, "0");
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += `${pad(offsets[i])} 00000 n \n`;
  }
  const trailer = `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "latin1");
}

describe("pdfjs worker on Node/serverless", () => {
  it("resolves pdf.worker.mjs to an existing file URL", () => {
    const src = resolvePdfJsWorkerSrc();
    assert.ok(src, "expected to find pdf.worker.mjs next to pdf-parse/pdfjs");
    assert.match(src, /^file:\/\//);
    assert.match(src, /pdf\.worker\.mjs$/);
    assert.ok(existsSync(fileURLToPath(src)));
  });

  it("extracts text from a tiny PDF without a relative worker path", async () => {
    const src = resolvePdfJsWorkerSrc();
    assert.ok(src);
    const { PDFParse } = await import("pdf-parse");
    const applied = configurePdfJsWorker(PDFParse);
    assert.equal(applied, src);
    assert.doesNotMatch(PDFParse.setWorker(), /^\.\/pdf\.worker/);

    const text = await extractPdfText(helloPdf());
    assert.match(text, /Hello LlevaCuentas/);
  });
});
