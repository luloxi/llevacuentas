import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseBbvaWorkbook, parseStatementWorkbook } from "@/lib/bbva/parse";
import {
  parseBbvaPdfText,
  parseGenericPdfText,
} from "@/lib/bbva/parse-pdf";
import { parseBbvaAmount } from "@/lib/money";
import { summarizeParsedMovements } from "@/lib/agent/import-summary";
import { statementTypeLabel } from "@/lib/import/source";

function workbookBuffer(
  rows: Array<Array<string | number | null>>,
  sheet = "Movimientos",
): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("BBVA Excel regression", () => {
  it("parses classic Últimos movimientos amounts", () => {
    const buf = workbookBuffer([
      [
        "Nro. Tarjeta",
        "Fecha",
        "Establecimiento",
        "Cuota",
        "Importe en $",
        "Importe en U$S",
      ],
      ["1234", "01/08/2026", "DIA TIENDA 99", "/", 15420.5, null],
      ["1234", "02/08/2026", "CAFE MARTINEZ", "/", 3200, null],
      ["1234", "03/08/2026", "OPENAI", "/", null, 20],
      ["1234", "04/08/2026", "SU PAGO EN PESOS", "/", -18000, null],
    ]);

    const parsed = parseStatementWorkbook(buf, "bbva-movimientos.xlsx");
    assert.equal(parsed.classicBbva, true);
    assert.ok(parsed.movements.length >= 4);

    const summary = summarizeParsedMovements(parsed.movements, "bbva_xlsx");
    assert.equal(summary.source, "bbva_xlsx");
    const august = summary.byPeriod.find((p) => p.period === "2026-08");
    assert.ok(august);
    assert.equal(august.amountArs, 15420.5 + 3200);
    assert.equal(august.amountUsd, 20);

    const same = parseBbvaWorkbook(buf);
    assert.equal(same.length, parsed.movements.length);
    assert.equal(same[0].fingerprint, parsed.movements[0].fingerprint);
  });
});

describe("Fiwind Excel / CSV", () => {
  it("parses Fecha + Descripción + Monto + Moneda", () => {
    const buf = workbookBuffer([
      ["Fecha", "Descripción", "Monto", "Moneda"],
      ["01/08/2026", "DIA TIENDA 99", 15420.5, "ARS"],
      ["03/08/2026", "OPENAI", 20, "USD"],
      ["04/08/2026", "PAGO RECIBIDO", -18000, "ARS"],
    ]);
    const parsed = parseStatementWorkbook(buf, "Fiwind-agosto.xlsx");
    assert.equal(parsed.detectedBank, "Fiwind");
    assert.equal(parsed.classicBbva, false);
    assert.equal(parsed.movements.length, 3);

    const dia = parsed.movements.find((m) => m.descriptionNormalized.includes("DIA"));
    assert.equal(dia?.amountArs, 15420.5);
    const openai = parsed.movements.find((m) => m.descriptionNormalized.includes("OPENAI"));
    assert.equal(openai?.amountUsd, 20);
    assert.equal(openai?.amountArs, null);
    const pago = parsed.movements.find((m) => m.isPayment);
    assert.ok(pago);

    assert.equal(
      statementTypeLabel("xlsx", parsed.detectedBank),
      "Movimientos Excel (Fiwind)",
    );
  });

  it("parses semicolon CSV with débito/crédito", () => {
    const csv = [
      "Fecha;Concepto;Débito;Crédito",
      "01/08/2026;DIA TIENDA 99;15.420,50;",
      "02/08/2026;CAFE MARTINEZ;3.200,00;",
      "04/08/2026;PAGO RECIBIDO;;18.000,00",
    ].join("\n");
    const buf = Buffer.from(csv, "utf8");
    const parsed = parseStatementWorkbook(buf, "fiwind-movimientos.csv");
    assert.equal(parsed.fileKind, "csv");
    assert.equal(parsed.movements.length, 3);
    const dia = parsed.movements.find((m) => /DIA/i.test(m.descriptionNormalized));
    assert.equal(dia?.amountArs, 15420.5);
    const pago = parsed.movements.find((m) => m.isPayment);
    assert.ok(pago);
    assert.ok((pago?.amountArs ?? 0) < 0);
  });

  it("parses comma CSV", () => {
    const csv = [
      "Fecha,Descripción,Monto,Moneda",
      "15/07/2026,YPF,8900,ARS",
      "16/07/2026,OPENAI,12.5,USD",
    ].join("\n");
    const parsed = parseStatementWorkbook(
      Buffer.from(csv, "utf8"),
      "extracto.csv",
    );
    assert.equal(parsed.movements.length, 2);
    assert.equal(parsed.movements[0].amountArs, 8900);
    assert.equal(parsed.movements[1].amountUsd, 12.5);
  });
});

describe("PDF text parsers", () => {
  it("keeps BBVA DD-MMM-YY movement lines", () => {
    const text = [
      "DETALLE DE CONSUMOS",
      "04-Ago-26 SU PAGO EN PESOS 123456 180.000,00",
      "05-Ago-26 DIA TIENDA 99 654321 15.420,50",
      "06-Ago-26 OPENAI 111222 USD 20,00",
    ].join("\n");
    const rows = parseBbvaPdfText(text);
    assert.ok(rows.length >= 2, `got ${rows.length}`);
    const pago = rows.find((r) => r.isPayment);
    assert.ok(pago);
    const dia = rows.find((r) => /DIA/i.test(r.descriptionNormalized));
    assert.equal(dia?.date, "2026-08-05");
    assert.equal(dia?.amountArs, 15420.5);
  });

  it("parses Fiwind-like DD/MM/YYYY lines", () => {
    const text = [
      "Fiwind Mastercard",
      "Fecha Descripción Importe",
      "01/08/2026 DIA TIENDA 99 15.420,50",
      "03/08/2026 OPENAI 20,00",
      "04/08/2026 PAGO RECIBIDO -18.000,00",
    ].join("\n");
    const rows = parseGenericPdfText(text);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].date, "2026-08-01");
    assert.equal(rows[0].amountArs, 15420.5);
    const pago = rows.find((r) => r.isPayment);
    assert.ok(pago);
  });
});

describe("amount formats", () => {
  it("uses the last separator so AR and US both work", () => {
    assert.equal(parseBbvaAmount("15.420,50")?.value, 15420.5);
    assert.equal(parseBbvaAmount("15,420.50")?.value, 15420.5);
    assert.equal(parseBbvaAmount("$ 30.277,00")?.value, 30277);
    assert.equal(parseBbvaAmount("USD 20,00")?.currency, "USD");
  });
});
