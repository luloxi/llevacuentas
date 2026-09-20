import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("ensure-schema debt_settings saldo_deuda ALTERs", () => {
  it("adds saldo_deuda_ars and saldo_deuda_usd when table already exists", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "ensure-schema.ts"), "utf8");
    assert.match(
      src,
      /ALTER TABLE debt_settings ADD COLUMN IF NOT EXISTS saldo_deuda_ars/,
    );
    assert.match(
      src,
      /ALTER TABLE debt_settings ADD COLUMN IF NOT EXISTS saldo_deuda_usd/,
    );
  });
});
