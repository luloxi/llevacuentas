import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { parseBbvaWorkbook } from "@/lib/bbva/parse";
import { BANKS, normalizeBank } from "@/lib/banks";

function workbookFromRows(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("Fiwind is a first-class bank on the existing import path", () => {
  assert.ok(BANKS.includes("Fiwind"));
  assert.ok(BANKS.includes("BBVA"));
  assert.equal(normalizeBank("fiwind"), "Fiwind");
  assert.equal(normalizeBank("BBVA"), "BBVA");
});

test("load-summary: parse BBVA-shaped xlsx into real movements (no fake rows)", () => {
  const buf = workbookFromRows([
    ["Nro. Tarjeta", "Fecha", "Establecimiento", "Cuota", "Importe en $", "Importe en U$S"],
    ["1234", "01/08/2026", "DIA TIENDA 12", "/", 15000.5, null],
    ["1234", "02/08/2026", "NETFLIX", "/", null, 15],
    ["1234", "03/08/2026", "SU PAGO", "/", -50000, null],
    [null, null, "Total", null, 0, null],
    [null, null, null, null, null, null],
  ]);

  const movements = parseBbvaWorkbook(buf);
  assert.equal(movements.length, 3);

  const dia = movements.find((m) => m.descriptionNormalized.includes("DIA"));
  assert.ok(dia);
  assert.equal(dia.date, "2026-08-01");
  assert.equal(dia.amountArs, 15000.5);
  assert.equal(dia.isPayment, false);

  const netflix = movements.find((m) => m.descriptionNormalized.includes("NETFLIX"));
  assert.ok(netflix);
  assert.equal(netflix.amountUsd, 15);

  const pago = movements.find((m) => m.descriptionNormalized.includes("SU PAGO"));
  assert.ok(pago);
  assert.equal(pago.isPayment, true);
});

test("load-summary: same parser accepts Fiwind-labeled sheet (fecha/comercio)", () => {
  const buf = workbookFromRows([
    ["Fecha", "Comercio", "Importe en $", "Importe en U$S"],
    ["15/08/2026", "FIWIND CAFE", 2500, null],
  ]);
  const movements = parseBbvaWorkbook(buf);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].date, "2026-08-15");
  assert.equal(movements[0].descriptionNormalized, "FIWIND CAFE");
  assert.equal(movements[0].amountArs, 2500);
});
