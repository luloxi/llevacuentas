import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountMatchVia,
  invoiceIogMerchantKeys,
  isBbvaOrFiwindCandidate,
  matchInvoiceIogToCasita,
  merchantsOverlap,
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

  it("matches IOG arsLiq ↔ Casita converted ARS with small FX drift", () => {
    // IOG arsLiq 29600 vs Fiwind/BBVA settled ~30500 (~3%)
    assert.equal(
      amountMatchVia(
        { amountUsd: 20, amountArs: 29600 },
        { amountUsd: null, amountArs: 30500 },
      ),
      "ars",
    );
    // Too far without merchant loose (~23%)
    assert.equal(
      amountMatchVia(
        { amountUsd: 6, amountArs: 8880 },
        { amountUsd: null, amountArs: 11534.97 },
      ),
      null,
    );
  });

  it("loose + merchant allows wider ARS FX/tax drift", () => {
    assert.equal(
      amountMatchVia(
        { amountUsd: 20, amountArs: 29600 },
        { amountUsd: null, amountArs: 31800 },
        { loose: true },
      ),
      "ars",
    );
  });
});

describe("isBbvaOrFiwindCandidate", () => {
  it("includes prod import sources and Fiwind CSV seed", () => {
    assert.ok(isBbvaOrFiwindCandidate({ bank: "BBVA", source: "bbva_import" }));
    assert.ok(
      isBbvaOrFiwindCandidate({ bank: "Fiwind", source: "xlsx_import" }),
    );
    assert.ok(
      isBbvaOrFiwindCandidate({ bank: null, source: "xlsx_import" }),
    );
    assert.ok(
      isBbvaOrFiwindCandidate({ bank: null, source: "csv_import" }),
    );
    assert.ok(
      isBbvaOrFiwindCandidate({ bank: "Fiwind", source: "casita_csv" }),
    );
    assert.ok(
      isBbvaOrFiwindCandidate({ bank: null, source: "casita_csv" }),
    );
    assert.ok(
      isBbvaOrFiwindCandidate({ bank: null, source: "statement_pdf" }),
    );
    assert.equal(
      isBbvaOrFiwindCandidate({ bank: null, source: "invoice_iog" }),
      false,
    );
    assert.equal(
      isBbvaOrFiwindCandidate({ bank: "BBVA", source: "bbva_period" }),
      false,
    );
  });
});

describe("merchantsOverlap", () => {
  it("links DO / OpenAI / Cursor / Railway memos", () => {
    assert.ok(
      merchantsOverlap(
        "A.I. Tools - Digital Ocean usage charge",
        "Pago a DIGITALOCEAN.COM",
      ),
    );
    assert.ok(merchantsOverlap("OpenAI API usage", "OPENAI *CHATGPT SUBSCR"));
    assert.ok(merchantsOverlap("Cursor Pro subscription", "CURSOR AI"));
    assert.ok(merchantsOverlap("Railway Hobby plan", "RAILWAY.APP"));
    assert.equal(
      merchantsOverlap("Cursor Pro", "DIA TIENDA 99"),
      false,
    );
    assert.ok(invoiceIogMerchantKeys("DIGITALOCEAN.COM").includes("DIGITALOCEAN"));
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
        source: "xlsx_import",
      },
    ];
    const pairs = matchInvoiceIogToCasita(iog, casita);
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0]!.casitaId, "c-near");
    assert.equal(pairs[1]!.casitaId, "c-fiwind");
    assert.ok(isBbvaOrFiwindCandidate(casita[0]!));
  });

  it("links DO via arsLiq ↔ converted ARS + merchant when FX drifts", () => {
    const iog = [
      {
        id: "iog-do",
        date: "2026-01-07",
        descriptionNormalized: "DigitalOcean",
        amountUsd: 4.93,
        amountArs: 7296.4,
        bank: null,
        source: "invoice_iog",
      },
    ];
    const casita = [
      {
        id: "c-do",
        date: "2026-01-08",
        descriptionNormalized: "DIGITALOCEAN.COM",
        amountUsd: null,
        amountArs: 7600,
        bank: "Fiwind",
        source: "casita_csv",
      },
      {
        id: "c-noise",
        date: "2026-01-08",
        descriptionNormalized: "DIA TIENDA",
        amountUsd: null,
        amountArs: 7600,
        bank: "Fiwind",
        source: "xlsx_import",
      },
    ];
    const pairs = matchInvoiceIogToCasita(iog, casita);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]!.casitaId, "c-do");
    assert.equal(pairs[0]!.via, "ars");
  });
});
