import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";

describe("isBankAccountingEntry internal transfers", () => {
  it("skips own-account / internal transfer descriptions", () => {
    for (const d of [
      "TRANSFERENCIA ENTRE CUENTAS",
      "TRANSF A CUENTA PROPIA",
      "DEB CTA A CTA",
      "TRANSFERENCIA INTERNA ARS",
    ]) {
      assert.equal(isBankAccountingEntry(d), true, d);
    }
  });

  it("keeps real spends", () => {
    assert.equal(isBankAccountingEntry("COMPRA SUPER ARS"), false);
    assert.equal(isBankAccountingEntry("TRANSFERENCIA A JUAN PEREZ"), false);
  });
});
