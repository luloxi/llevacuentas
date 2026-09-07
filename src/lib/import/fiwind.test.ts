import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchCategory } from "@/lib/categorize/rules";
import { isBankAccountingEntry, isCardPaymentEntry } from "@/lib/bbva/bank-entries";
import { isExpenseRow } from "@/lib/stats/monthly-expenses";
import {
  categoryHintForFiwindKind,
  classifyFiwindTipo,
  conversionPairedWithSpend,
  exactFiwindMerchantSlug,
  extractFiwindMerchant,
  flagsForFiwindKind,
  isDustYield,
  isFiwindNonExpenseTipo,
} from "@/lib/import/fiwind";

describe("Fiwind Tipo classification", () => {
  it("splits conversions, crypto, yields, deposits and real spends", () => {
    assert.equal(classifyFiwindTipo("Conversión"), "conversion");
    assert.equal(classifyFiwindTipo("Compra KO"), "investment");
    assert.equal(classifyFiwindTipo("Venta KO"), "investment");
    assert.equal(classifyFiwindTipo("Ganancia diaria"), "yield");
    assert.equal(classifyFiwindTipo("Rendimiento bonificado"), "yield");
    assert.equal(classifyFiwindTipo("Depósito de cuenta propia"), "deposit");
    assert.equal(classifyFiwindTipo("Devolución de RAPPI"), "refund");
    assert.equal(classifyFiwindTipo("Retiro"), "crypto_out");
    assert.equal(classifyFiwindTipo("Pago a DIA"), "spend");
    assert.equal(classifyFiwindTipo("Retiro a Elena Paco Coro"), "spend");
    assert.equal(classifyFiwindTipo("Cargo extra de RAPPI"), "spend");
  });

  it("skips near-zero yields and keeps meaningful ones", () => {
    assert.equal(isDustYield("yield", 0.68, null), true);
    assert.equal(isDustYield("yield", 0, 0.00005), true);
    assert.equal(isDustYield("yield", 0, 0), true);
    assert.equal(isDustYield("yield", 9.28, null), false);
    assert.equal(isDustYield("yield", 460, null), false);
    assert.equal(isDustYield("spend", 0.5, null), false);
  });

  it("does not treat Pago a X as a card payment", () => {
    assert.equal(isCardPaymentEntry("Pago a DIA"), false);
    assert.equal(isCardPaymentEntry("SU PAGO EN PESOS"), true);
  });

  it("marks conversions / crypto / yields as accounting, not gastos", () => {
    assert.equal(isBankAccountingEntry("Conversión"), true);
    assert.equal(isBankAccountingEntry("Compra KO"), true);
    assert.equal(isBankAccountingEntry("Venta KO"), true);
    assert.equal(isBankAccountingEntry("Ganancia diaria"), true);
    assert.equal(isBankAccountingEntry("Rendimiento bonificado"), true);
    assert.equal(isBankAccountingEntry("Depósito"), true);
    assert.equal(isBankAccountingEntry("Retiro"), true);
    assert.equal(isBankAccountingEntry("Pago a DIA"), false);
    assert.equal(isBankAccountingEntry("Retiro a Elena Paco Coro"), false);
    assert.equal(isFiwindNonExpenseTipo("Conversión"), true);
  });

  it("pairs convert-then-pay so the conversion is not a second expense", () => {
    const rows = [
      {
        date: "2026-08-18",
        kind: "spend" as const,
        amountArs: 15600,
        amountUsd: null,
      },
      {
        date: "2026-08-18",
        kind: "conversion" as const,
        amountArs: 15600,
        amountUsd: null,
      },
    ];
    assert.equal(conversionPairedWithSpend(rows[1]!, rows), true);
    assert.equal(
      isExpenseRow({
        isPayment: flagsForFiwindKind("conversion").isPayment,
        isCredit: flagsForFiwindKind("conversion").isCredit,
        descriptionNormalized: "Conversión",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "Retiro a Felicitas Ocampo Jimenez",
      }),
      true,
    );
  });

  it("maps Tipo to category hints", () => {
    assert.equal(categoryHintForFiwindKind("conversion"), "conversiones");
    assert.equal(categoryHintForFiwindKind("investment"), "crypto-inversiones");
    assert.equal(categoryHintForFiwindKind("yield"), "rendimientos");
    assert.equal(categoryHintForFiwindKind("spend"), undefined);
  });

  it("extracts merchants so Pago a DIA / YPF / UBER categorize", () => {
    assert.equal(extractFiwindMerchant("Pago a DIA"), "DIA");
    assert.equal(extractFiwindMerchant("Cargo extra de RAPPI"), "RAPPI");
    assert.equal(exactFiwindMerchantSlug("Pago a DIA"), "supermercado");
    assert.equal(matchCategory("Pago a DIA").slug, "supermercado");
    assert.equal(matchCategory("Pago a DIA TIENDA 536").slug, "supermercado");
    assert.equal(matchCategory("Pago a PAYU*AR*UBER").slug, "transporte");
    assert.equal(matchCategory("Pago a YPF").slug, "transporte");
    assert.equal(matchCategory("Pago a Spotify").slug, "streaming");
    assert.equal(matchCategory("Retiro a Elena Paco Coro").slug, "envios");
    assert.equal(matchCategory("Conversión").slug, "conversiones");
    assert.equal(matchCategory("Compra KO").slug, "crypto-inversiones");
    assert.equal(matchCategory("Ganancia diaria").slug, "rendimientos");
  });
});
