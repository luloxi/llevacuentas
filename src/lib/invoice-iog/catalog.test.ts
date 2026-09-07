import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isBbvaCardDebtRow } from "@/lib/stats/debt";
import { isPeriodDebtSource, statementTypeLabel } from "@/lib/import/source";
import {
  INVOICE_IOG_HOUSEHOLD_NAME,
  INVOICE_IOG_OWNER_EMAIL,
  INVOICE_IOG_RUBROS,
  INVOICE_IOG_SOURCE,
  invoiceIogAmounts,
  invoiceIogFingerprint,
  rubroForInvoiceIogTool,
  slugForInvoiceIogRubro,
  sumInvoiceIogUsd,
  uniqueInvoiceIogItems,
  type InvoiceIogFixture,
} from "./catalog";

const fixture = JSON.parse(
  readFileSync(
    join(process.cwd(), "fixtures/invoice-iog/invoice-iog-gastos.json"),
    "utf8",
  ),
) as InvoiceIogFixture;

describe("Invoice IOG Gastos fixture (v3)", () => {
  it("is a second household named exactly Invoice IOG, not Casita", () => {
    assert.equal(fixture.household, "Invoice IOG");
    assert.equal(INVOICE_IOG_HOUSEHOLD_NAME, "Invoice IOG");
    assert.notEqual(INVOICE_IOG_HOUSEHOLD_NAME, "Casita");
    assert.equal(INVOICE_IOG_OWNER_EMAIL, "lucianoolivabianco@gmail.com");
    assert.equal(fixture.version, 3);
  });

  it("has 92 unique Gastos rows totaling ≈ USD 1121 (Jan–Sep 2026)", () => {
    assert.equal(fixture.count, 92);
    assert.equal(fixture.items.length, 92);
    const unique = uniqueInvoiceIogItems(fixture.items);
    assert.equal(unique.length, 92);
    const fps = new Set(fixture.items.map(invoiceIogFingerprint));
    assert.equal(fps.size, 92);
    const usd = sumInvoiceIogUsd(fixture.items);
    assert.ok(Math.abs(usd - 1120.9993940806216) < 1e-6);
    assert.ok(Math.abs(usd - 1121) < 0.05);
    assert.equal(Math.round(usd), 1121);
    assert.ok(
      fixture.totalArs != null &&
        Math.abs(fixture.totalArs - 1659079.10323932) < 0.01,
    );
    for (const item of fixture.items) {
      assert.match(item.mes, /^2026-(0[1-9])$/);
      assert.notEqual(item.mes, "2026-12");
    }
  });

  it("maps each rubro to the Invoice IOG categories", () => {
    const counts: Record<string, number> = {};
    for (const item of fixture.items) {
      assert.ok(
        (INVOICE_IOG_RUBROS as readonly string[]).includes(item.rubro),
        item.rubro,
      );
      const slug = slugForInvoiceIogRubro(item.rubro);
      assert.notEqual(slug, "uncategorized");
      counts[item.rubro] = (counts[item.rubro] ?? 0) + 1;
      const amounts = invoiceIogAmounts(item);
      assert.ok(amounts.amountUsd, `usd missing for n=${item.n}`);
      assert.ok(amounts.amountArs, `arsLiq missing for n=${item.n}`);
    }
    assert.equal(counts["Herramientas AI"], 22);
    assert.equal(counts["Infra y cloud"], 25);
    assert.equal(counts["Eventos y extras"], 2);
    assert.equal(counts["Movilidad"], 42);
    assert.equal(counts["Hardware"], 1);
  });

  it("includes post-corte Uber tickets + Mercado Pago (Grok, DiDi, DO)", () => {
    const byN = Object.fromEntries(fixture.items.map((i) => [i.n, i]));
    assert.equal(byN[73].date, "2026-07-28");
    assert.equal(byN[73].importe, 6183);
    assert.match(byN[73].desc, /UberX/i);
    assert.equal(byN[74].date, "2026-07-29");
    assert.equal(byN[74].importe, 6309);
    assert.equal(byN[79].date, "2026-08-06");
    assert.equal(byN[79].importe, 5828);
    assert.ok(
      fixture.items.some(
        (i) => /Grok|SuperGrok/i.test(i.desc) && i.date.startsWith("2026-08"),
      ),
    );
    assert.ok(fixture.items.some((i) => /DiDi/i.test(i.desc)));
    assert.ok(
      fixture.items.some(
        (i) =>
          /DigitalOcean/i.test(i.desc) &&
          /Mercado Pago/i.test(i.invoice) &&
          i.date === "2026-09-01",
      ),
    );
  });

  it("classifies listed tools as herramientas / infra", () => {
    assert.equal(rubroForInvoiceIogTool("SuperGrok"), "Herramientas AI");
    assert.equal(rubroForInvoiceIogTool("Claude Pro"), "Herramientas AI");
    assert.equal(rubroForInvoiceIogTool("OpenAI API"), "Herramientas AI");
    assert.equal(rubroForInvoiceIogTool("Cursor Pro"), "Herramientas AI");
    assert.equal(rubroForInvoiceIogTool("DigitalOcean"), "Infra y cloud");
    assert.equal(rubroForInvoiceIogTool("Digital Ocean usage"), "Infra y cloud");
    assert.equal(rubroForInvoiceIogTool("Railway Hobby"), "Infra y cloud");
    assert.equal(rubroForInvoiceIogTool("Vercel Pro"), "Infra y cloud");
  });

  it("does not feed Casita Deuda (not a period/BBVA ledger)", () => {
    assert.equal(isPeriodDebtSource(INVOICE_IOG_SOURCE), false);
    assert.equal(
      isBbvaCardDebtRow({ source: INVOICE_IOG_SOURCE, bank: null }),
      false,
    );
    assert.equal(statementTypeLabel(INVOICE_IOG_SOURCE, null), "Invoice IOG");
  });
});

const ubersFixture = JSON.parse(
  readFileSync(
    join(process.cwd(), "fixtures/invoice-iog/invoice-iog-ubers.json"),
    "utf8",
  ),
) as InvoiceIogFixture;

describe("Invoice IOG Uber receipts fixture (merged into v3)", () => {
  it("is empty — UberX tickets live in Gastos v3 (n=73,74,79)", () => {
    assert.equal(ubersFixture.household, "Invoice IOG");
    assert.equal(ubersFixture.count, 0);
    assert.equal(ubersFixture.items.length, 0);
    assert.equal(uniqueInvoiceIogItems(ubersFixture.items).length, 0);
  });
});
