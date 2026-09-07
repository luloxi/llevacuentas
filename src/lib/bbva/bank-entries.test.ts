import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBankAccountingEntry,
  isOwnAccountTransferDescription,
} from "@/lib/bbva/bank-entries";

describe("isBankAccountingEntry internal transfers", () => {
  it("skips own-account / internal transfer descriptions", () => {
    for (const d of [
      "TRANSFERENCIA ENTRE CUENTAS",
      "TRANSF A CUENTA PROPIA",
      "DEB CTA A CTA",
      "TRANSFERENCIA INTERNA ARS",
      "A una cuenta tuya",
      "De una cuenta tuya",
      "A UNA CUENTA TUYA",
      "De una cuenta tuya (Fiwind)",
    ]) {
      assert.equal(isOwnAccountTransferDescription(d), true, d);
      assert.equal(isBankAccountingEntry(d), true, d);
    }
  });

  it("keeps real spends", () => {
    assert.equal(isOwnAccountTransferDescription("COMPRA SUPER ARS"), false);
    assert.equal(isBankAccountingEntry("COMPRA SUPER ARS"), false);
    assert.equal(isBankAccountingEntry("TRANSFERENCIA A JUAN PEREZ"), false);
    assert.equal(isOwnAccountTransferDescription("Pago a DIA"), false);
  });
});
