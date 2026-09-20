import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { internalTransferFingerprint } from "@/lib/import/reclassify-fiwind";

describe("internalTransferFingerprint", () => {
  it("is stable for CR TBE 300k (Consumos upsert key)", () => {
    const a = internalTransferFingerprint({
      date: "2026-09-10",
      label: "CR TBE INM COE",
      amountArs: 300000,
      amountUsd: null,
    });
    const b = internalTransferFingerprint({
      date: "2026-09-10",
      label: "cr tbe inm coe",
      amountArs: 300000.0,
      amountUsd: null,
    });
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });
});
