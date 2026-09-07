import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseBbvaWorkbook, parseStatementWorkbook } from "@/lib/bbva/parse";
import {
  parseBbvaPdfText,
  parseGenericPdfText,
} from "@/lib/bbva/parse-pdf";
import { isCardPaymentEntry } from "@/lib/bbva/bank-entries";
import { parseBbvaAmount } from "@/lib/money";
import { summarizeParsedMovements } from "@/lib/agent/import-summary";
import {
  detectFiwindActividadLayout,
  resolveImportBank,
  statementTypeLabel,
} from "@/lib/import/source";
import { parseStatementFile } from "@/lib/import/parse-statement";

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

  it("parses Fecha + Tipo + Monto + Moneda (Actividad export)", () => {
    const buf = workbookBuffer(
      [
        ["Fecha", "Tipo", "Monto", "Moneda", "Monto Origen", "Moneda Origen", "Precio"],
        ["31/08/2026 19:56:54", "Pago a DIA", 15420.5, "ARS", null, null, null],
        ["31/08/2026 19:23:58", "Depósito de cuenta propia", 12800, "ARS", null, null, null],
        ["30/08/2026 14:27:09", "Compra KO", 20, "USDC", null, null, null],
        ["29/08/2026 11:00:00", "Conversión", 110000, "ARS", 71.3, "USDC", 1542.7],
        ["28/08/2026 03:00:11", "Ganancia diaria", 0.68, "ARS", null, null, null],
      ],
      "Actividad",
    );
    const parsed = parseStatementWorkbook(buf, "actividad-1.xlsx");
    assert.equal(parsed.detectedBank, "Fiwind");
    assert.equal(parsed.classicBbva, false);
    assert.equal(parsed.movements.length, 5);

    const dia = parsed.movements.find((m) => /PAGO A DIA/i.test(m.descriptionNormalized));
    assert.ok(dia);
    assert.equal(dia?.date, "2026-08-31");
    assert.equal(dia?.amountArs, 15420.5);
    assert.equal(dia?.isPayment, false);
    assert.equal(isCardPaymentEntry(dia!.descriptionNormalized), false);

    const deposito = parsed.movements.find((m) => /DEP[OÓ]SITO/i.test(m.descriptionNormalized));
    assert.equal(deposito?.isCredit, true);

    const ko = parsed.movements.find((m) => /COMPRA KO/i.test(m.descriptionNormalized));
    assert.equal(ko?.amountUsd, 20);
    assert.equal(ko?.amountArs, null);

    assert.equal(
      statementTypeLabel("xlsx", parsed.detectedBank),
      "Movimientos Excel (Fiwind)",
    );
    assert.equal(
      resolveImportBank({
        selected: "BBVA",
        detected: parsed.detectedBank,
        fileName: "actividad-1.xlsx",
      }),
      "Fiwind",
    );
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

describe("Fiwind Actividad fixtures", () => {
  const dir = join(process.cwd(), "fixtures/fiwind");

  it("detects Fiwind from Actividad+Tipo+Moneda headers", () => {
    assert.equal(
      detectFiwindActividadLayout({
        fileName: "actividad-2.xlsx",
        sheetNames: ["Actividad", "Balance"],
        headers: [
          "Fecha",
          "Tipo",
          "Monto",
          "Moneda",
          "Monto Origen",
          "Moneda Origen",
          "Precio",
        ],
      }),
      true,
    );
  });

  it("reads the three Luciano exports", async () => {
    const expected: Array<{
      file: string;
      min: number;
      date: string;
      snippet: string;
    }> = [
      {
        file: "actividad-1.xlsx",
        min: 30,
        date: "2026-06-30",
        snippet: "Rendimiento bonificado",
      },
      {
        file: "actividad-2.xlsx",
        min: 170,
        date: "2026-08-31",
        snippet: "Retiro a Elena Paco Coro",
      },
      {
        file: "actividad-3.xlsx",
        min: 80,
        date: "2026-07-31",
        snippet: "Retiro a Katherine",
      },
    ];

    for (const exp of expected) {
      const buf = readFileSync(join(dir, exp.file));
      const parsed = await parseStatementFile(buf, exp.file);
      assert.equal(parsed.detectedBank, "Fiwind", exp.file);
      assert.equal(parsed.source, "xlsx", exp.file);
      assert.ok(
        parsed.movements.length >= exp.min,
        `${exp.file} got ${parsed.movements.length}`,
      );
      assert.ok(
        parsed.movements.some((m) => m.date === exp.date),
        `${exp.file} missing ${exp.date}`,
      );
      assert.ok(
        parsed.movements.some((m) =>
          m.descriptionNormalized.toLowerCase().includes(exp.snippet.toLowerCase()),
        ),
        `${exp.file} missing “${exp.snippet}” (got ${parsed.movements[0]?.descriptionNormalized})`,
      );
      assert.ok(
        parsed.movements.every((m) => !/^\d+(\.\d+)?$/.test(m.descriptionNormalized)),
        `${exp.file} still using amount as description`,
      );
      assert.equal(
        statementTypeLabel(parsed.source, parsed.detectedBank),
        "Movimientos Excel (Fiwind)",
      );
    }
  });

  it("maps USDC/USDT to USD and keeps ARS spends", () => {
    const buf = readFileSync(join(dir, "actividad-2.xlsx"));
    const parsed = parseStatementWorkbook(buf, "actividad-2.xlsx");
    const usd = parsed.movements.filter((m) => m.amountUsd != null);
    const ars = parsed.movements.filter((m) => m.amountArs != null);
    assert.ok(usd.length > 0, "expected USDC/USDT rows as USD");
    assert.ok(ars.length > 50, `expected many ARS rows, got ${ars.length}`);
    const pago = parsed.movements.find((m) => /PAGO A DIA/i.test(m.descriptionNormalized));
    assert.ok(pago);
    assert.equal(pago?.isPayment, false);
    assert.equal(isCardPaymentEntry(pago!.descriptionNormalized), false);
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
