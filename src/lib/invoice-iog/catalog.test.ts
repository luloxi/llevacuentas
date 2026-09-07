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

describe("Invoice IOG Gastos fixture", () => {
  it("is a second household named exactly Invoice IOG, not Casita", () => {
    assert.equal(fixture.household, "Invoice IOG");
    assert.equal(INVOICE_IOG_HOUSEHOLD_NAME, "Invoice IOG");
    assert.notEqual(INVOICE_IOG_HOUSEHOLD_NAME, "Casita");
    assert.equal(INVOICE_IOG_OWNER_EMAIL, "lucianoolivabianco@gmail.com");
  });

  it("has 68 unique Gastos rows totaling ≈ USD 846", () => {
    assert.equal(fixture.count, 68);
    assert.equal(fixture.items.length, 68);
    const unique = uniqueInvoiceIogItems(fixture.items);
    assert.equal(unique.length, 68);
    const fps = new Set(fixture.items.map(invoiceIogFingerprint));
    assert.equal(fps.size, 68);
    const usd = sumInvoiceIogUsd(fixture.items);
    assert.ok(Math.abs(usd - 845.967522459) < 1e-6);
    assert.ok(Math.abs(usd - 846) < 0.05);
    assert.equal(Math.round(usd), 846);
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
    assert.equal(counts["Herramientas AI"], 21);
    assert.equal(counts["Infra y cloud"], 20);
    assert.equal(counts["Eventos y extras"], 2);
    assert.equal(counts["Movilidad"], 24);
    assert.equal(counts["Hardware"], 1);
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
