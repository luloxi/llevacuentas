import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, it } from "node:test";
import {
  casitaSeptGastoIsPayment,
  matchesCasitaSep3ServiceCoveredByReintegro,
} from "./seed-septiembre";
import { parseCasitaSeptiembreCsv } from "./septiembre-csv";
import {
  isConsumosHiddenPayment,
  isReintegroHogarTipo,
} from "@/lib/reintegro-hogar";

const KATHERINE = "Katherine Fernanda Sanchez Carrasco";

describe("matchesCasitaSep3ServiceCoveredByReintegro", () => {
  it("matches alquiler/luz/agua by description or category slug", () => {
    assert.equal(
      matchesCasitaSep3ServiceCoveredByReintegro({
        descriptionNormalized: "Alquiler",
      }),
      "alquiler",
    );
    assert.equal(
      matchesCasitaSep3ServiceCoveredByReintegro({
        descriptionNormalized: "EDENOR FACTURA",
        categorySlug: "luz",
      }),
      "luz",
    );
    assert.equal(
      matchesCasitaSep3ServiceCoveredByReintegro({
        descriptionNormalized: "Agua",
      }),
      "agua",
    );
  });

  it("does not delete Katherine even if miscategorized as alquiler", () => {
    assert.equal(
      matchesCasitaSep3ServiceCoveredByReintegro({
        descriptionNormalized: KATHERINE,
        categorySlug: "alquiler",
      }),
      null,
    );
    assert.equal(
      matchesCasitaSep3ServiceCoveredByReintegro({
        descriptionNormalized: "Retiro a Katherine Fernanda Sanchez Carrasco",
        categorySlug: "luz",
      }),
      null,
    );
  });
});

describe("casitaSeptGastoIsPayment / ensure Katherine as Reintegro hogar", () => {
  it("marks fixture Katherine ~225750 as isPayment (reintegro)", () => {
    const text = readFileSync(
      join(process.cwd(), "fixtures/casita/gastos-septiembre.csv"),
      "utf8",
    );
    const rows = parseCasitaSeptiembreCsv(text);
    const kath = rows.find((r) => /katherine\s+fernanda/i.test(r.description));
    assert.ok(kath);
    assert.equal(kath!.date, "2026-09-03");
    assert.equal(kath!.amountArs, -225750);
    assert.equal(casitaSeptGastoIsPayment(kath!.description), true);
    assert.equal(
      isReintegroHogarTipo(true, kath!.description),
      true,
    );
    assert.equal(
      isConsumosHiddenPayment(true, kath!.description),
      false,
      "Katherine isPayment must stay visible in Consumos",
    );
  });

  it("still hides plain card payments from Consumos", () => {
    assert.equal(
      isConsumosHiddenPayment(true, "SU PAGO EN PESOS"),
      true,
    );
  });
});
