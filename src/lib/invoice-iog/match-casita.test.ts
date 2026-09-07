import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountMatchVia,
  isBbvaOrFiwindCandidate,
  matchInvoiceIogToCasita,
} from "./match-casita";

describe("amountMatchVia", () => {
  it("matches USD and ARS independently", () => {
    assert.equal(
      amountMatchVia(
        { amountUsd: 20, amountArs: 29600 },
        { amountUsd: 20, amountArs: null },
      ),
      "usd",
    );
    assert.equal(
      amountMatchVia(
        { amountUsd: 6, amountArs: 8880 },
        { amountUsd: null, amountArs: 8880 },
      ),
      "ars",
    );
    assert.equal(
      amountMatchVia(
        { amountUsd: 20, amountArs: null },
        { amountUsd: null, amountArs: 20 },
      ),
      "usd",
    );
  });
});

describe("matchInvoiceIogToCasita", () => {
  it("1:1 greedy by amount + nearer date", () => {
    const iog = [
      {
        id: "i1",
        date: "2026-01-12",
        descriptionNormalized: "Cursor",
        amountUsd: 20,
        amountArs: 29600,
        bank: null,
        source: "invoice_iog",
      },
      {
        id: "i2",
        date: "2026-02-12",
        descriptionNormalized: "Cursor",
        amountUsd: 20,
        amountArs: 29600,
        bank: null,
        source: "invoice_iog",
      },
    ];
    const casita = [
      {
        id: "c-far",
        date: "2026-03-01",
        descriptionNormalized: "CURSOR",
        amountUsd: 20,
        amountArs: null,
        bank: "BBVA",
        source: "bbva_import",
      },
      {
        id: "c-near",
        date: "2026-01-13",
        descriptionNormalized: "CURSOR AI",
        amountUsd: 20,
        amountArs: null,
        bank: "BBVA",
        source: "bbva_import",
      },
      {
        id: "c-fiwind",
        date: "2026-02-10",
        descriptionNormalized: "Pago a CURSOR",
        amountUsd: null,
        amountArs: 20,
        bank: "Fiwind",
        source: "xlsx",
      },
    ];
    const pairs = matchInvoiceIogToCasita(iog, casita);
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0]!.casitaId, "c-near");
    assert.equal(pairs[1]!.casitaId, "c-fiwind");
    assert.ok(isBbvaOrFiwindCandidate(casita[0]!));
    assert.equal(
      isBbvaOrFiwindCandidate({ bank: null, source: "casita_csv" }),
      false,
    );
  });
});
