import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, it } from "node:test";
import {
  casitaSeptFingerprint,
  parseCasitaCsvDate,
  parseCasitaSeptiembreCsv,
} from "./septiembre-csv";

describe("parseCasitaSeptiembreCsv", () => {
  it("parses fixture by tipo (incluye cuenta tuya)", () => {
    const text = readFileSync(
      join(process.cwd(), "fixtures/casita/gastos-septiembre.csv"),
      "utf8",
    );
    const rows = parseCasitaSeptiembreCsv(text);
    assert.equal(rows.length, 25);
    const gastos = rows.filter((r) => r.tipo === "gasto");
    const ingresos = rows.filter((r) => r.tipo === "ingreso");
    assert.equal(gastos.length, 21);
    assert.equal(ingresos.length, 4);
    assert.ok(rows.some((r) => /cuenta tuya/i.test(r.description)));
    assert.equal(parseCasitaCsvDate("07/09/2026"), "2026-09-07");
    const opens = rows.filter((r) => /pago a open 25/i.test(r.description));
    assert.equal(opens.length, 2);
    assert.deepEqual(
      opens.map((r) => ({ date: r.date, amountArs: r.amountArs })).sort((a, b) => a.date.localeCompare(b.date)),
      [
        { date: "2026-09-02", amountArs: -2800 },
        { date: "2026-09-07", amountArs: -15000 },
      ],
    );
    const fps = new Set(rows.map(casitaSeptFingerprint));
    assert.equal(fps.size, rows.length);
  });
});
