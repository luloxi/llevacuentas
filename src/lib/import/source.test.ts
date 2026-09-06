import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectBankFromFileName,
  detectFileKind,
  emptyParseMessage,
  resolveImportBank,
  statementTxSource,
  statementTypeLabel,
} from "./source";

describe("statement source labels", () => {
  it("does not call a Fiwind Excel a BBVA statement", () => {
    assert.equal(
      statementTypeLabel("xlsx", "Fiwind"),
      "Movimientos Excel (Fiwind)",
    );
    assert.equal(
      statementTypeLabel("csv", "Fiwind"),
      "Movimientos CSV (Fiwind)",
    );
    assert.equal(statementTypeLabel("pdf", "Fiwind"), "Resumen PDF (Fiwind)");
    assert.equal(
      statementTypeLabel("bbva_xlsx", "Fiwind"),
      "Movimientos Excel (Fiwind)",
    );
  });

  it("keeps BBVA on classic BBVA sources when bank is missing", () => {
    assert.equal(statementTypeLabel("bbva_pdf", null), "Resumen PDF (BBVA)");
    assert.equal(
      statementTypeLabel("bbva_xlsx", null),
      "Movimientos Excel (BBVA)",
    );
  });

  it("never surfaces the technical source code as the label", () => {
    const codes = [
      "bbva_xlsx",
      "bbva_pdf",
      "xlsx",
      "xls",
      "csv",
      "pdf",
      "pdf_ai",
      "statement_pdf",
    ];
    for (const code of codes) {
      const label = statementTypeLabel(code, "BBVA");
      assert.notEqual(label, code);
      assert.doesNotMatch(label, /bbva_xlsx|bbva_pdf|pdf_ai/);
    }
  });
});

describe("resolveImportBank", () => {
  it("overrides default BBVA when the file is clearly Fiwind", () => {
    assert.equal(
      resolveImportBank({
        selected: "BBVA",
        fileName: "Fiwind-agosto-2026.xlsx",
      }),
      "Fiwind",
    );
    assert.equal(detectBankFromFileName("movimientos_fiwind.csv"), "Fiwind");
  });

  it("keeps an explicit non-default pick", () => {
    assert.equal(
      resolveImportBank({
        selected: "Galicia",
        fileName: "fiwind.xlsx",
      }),
      "Galicia",
    );
  });
});

describe("file kind + empty hints", () => {
  it("sniffs csv vs pdf vs xlsx", () => {
    assert.equal(detectFileKind(Buffer.from("Fecha;Concepto\n"), "a.csv"), "csv");
    assert.equal(detectFileKind(Buffer.from("%PDF-1.4\n"), "x.bin"), "pdf");
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    assert.equal(detectFileKind(zip, "mov.xlsx"), "xlsx");
  });

  it("explains how to export if the bank does not give a file", () => {
    const pdf = emptyParseMessage({
      fileName: "foto.pdf",
      fileKind: "pdf",
      pdfTextLength: 10,
    });
    assert.match(pdf.message, /texto seleccionable/i);
    assert.match(pdf.hint, /Imprimir/i);
    assert.match(pdf.hint, /Fiwind/i);

    const csv = emptyParseMessage({ fileName: "mov.csv", fileKind: "csv" });
    assert.match(csv.hint, /Fecha/i);
  });
});

describe("tx source mapping", () => {
  it("does not store every import as bbva_import", () => {
    assert.equal(statementTxSource("csv"), "csv_import");
    assert.equal(statementTxSource("xlsx"), "xlsx_import");
    assert.equal(statementTxSource("pdf"), "statement_pdf");
    assert.equal(statementTxSource("bbva_xlsx"), "bbva_import");
    assert.equal(statementTxSource("bbva_pdf"), "bbva_pdf");
  });
});
