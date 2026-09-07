import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CASITA_HOGAR_UTILITIES_SMOKE,
  CASITA_HOGAR_UTILITIES_SOURCE,
  casitaHogarUtilitySmokeFingerprint,
  isCasitaSep3PurgeDate,
} from "./hogar-utilities-smoke";
import { HOGAR_UTILITY_SLUGS } from "@/lib/gasto-cubierto";

describe("casita hogar utilities smoke (Cubierto hOlQBdhf)", () => {
  it("seeds Luz + Internet with real ARS, shared-ready slugs, not Sep3", () => {
    assert.equal(CASITA_HOGAR_UTILITIES_SOURCE, "casita_hogar_utilities");
    assert.ok(CASITA_HOGAR_UTILITIES_SMOKE.length >= 1);

    const luz = CASITA_HOGAR_UTILITIES_SMOKE.find((r) => r.categorySlug === "luz");
    const internet = CASITA_HOGAR_UTILITIES_SMOKE.find(
      (r) => r.categorySlug === "internet",
    );
    assert.ok(luz, "needs Luz for Cubierto smoke");
    assert.ok(internet, "needs Internet for Cubierto smoke");
    assert.equal(luz!.description, "Luz");
    assert.equal(internet!.description, "Internet");
    assert.ok(luz!.amountArs > 0);
    assert.ok(internet!.amountArs > 0);
    assert.equal(luz!.amountArs, 45000);
    assert.equal(internet!.amountArs, 25000);

    for (const row of CASITA_HOGAR_UTILITIES_SMOKE) {
      assert.equal(isCasitaSep3PurgeDate(row.date), false);
      assert.ok(
        (HOGAR_UTILITY_SLUGS as readonly string[]).includes(row.categorySlug),
      );
      const fp = casitaHogarUtilitySmokeFingerprint(row);
      assert.equal(fp.length, 32);
      assert.equal(casitaHogarUtilitySmokeFingerprint(row), fp);
    }
  });

  it("fingerprints differ by date/slug/amount", () => {
    const a = CASITA_HOGAR_UTILITIES_SMOKE[0]!;
    const b = CASITA_HOGAR_UTILITIES_SMOKE[1]!;
    assert.notEqual(
      casitaHogarUtilitySmokeFingerprint(a),
      casitaHogarUtilitySmokeFingerprint(b),
    );
  });
});
