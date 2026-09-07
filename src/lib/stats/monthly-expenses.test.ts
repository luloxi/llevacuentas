import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateByBank,
  aggregateByPeriod,
  buildMonthFromAgg,
  formatGastosHeadline,
  isExpenseRow,
  visibleExpenseRows,
  type ExpenseTx,
} from "./monthly-expenses";
import type { MonthEndRate } from "@/lib/fx/month-end-rates";

function tx(
  partial: Partial<ExpenseTx> & Pick<ExpenseTx, "date" | "descriptionNormalized">,
): ExpenseTx {
  return {
    amountArs: null,
    amountUsd: null,
    isPayment: false,
    categoryId: null,
    bank: "BBVA",
    ownership: "personal",
    paidByUserId: "user-1",
    ...partial,
  };
}

const cats = new Map([
  ["cat-super", { slug: "supermercado", name: "Supermercado" }],
  ["cat-saas", { slug: "tecnologia", name: "Tecnología" }],
]);

const augustRate: MonthEndRate = {
  period: "2026-08",
  buy: 1400,
  asOf: "2026-08-28",
  source: "oficial_compra",
};

describe("isExpenseRow", () => {
  it("keeps real spends and drops payments / pesificación", () => {
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "DIA TIENDA 123",
      }),
      true,
    );
    assert.equal(
      isExpenseRow({
        isPayment: true,
        descriptionNormalized: "SU PAGO EN PESOS",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "PESIFICACION USD",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "Conversión",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "Compra KO",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        isCredit: true,
        descriptionNormalized: "Depósito de cuenta propia",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "TRANSFERENCIA ARS",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "12800",
      }),
      false,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "COMPRA SUPER ARS",
      }),
      true,
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "DIA TIENDA 536",
        source: "bbva_period",
      }),
      false,
      "period xls feeds Deuda, not gastos neta",
    );
    assert.equal(
      isExpenseRow({
        isPayment: false,
        descriptionNormalized: "DIA TIENDA 536",
        source: "bbva_pdf",
      }),
      false,
    );
  });
});

describe("visibleExpenseRows", () => {
  it("hides someone else's personal spend", () => {
    const rows = [
      tx({
        date: "2026-08-01",
        descriptionNormalized: "MIO",
        amountArs: 100,
        paidByUserId: "user-1",
        ownership: "personal",
      }),
      tx({
        date: "2026-08-01",
        descriptionNormalized: "AJENO",
        amountArs: 999999,
        paidByUserId: "user-2",
        ownership: "personal",
      }),
      tx({
        date: "2026-08-01",
        descriptionNormalized: "HOGAR",
        amountArs: 50,
        paidByUserId: "user-2",
        ownership: "shared",
      }),
    ];
    const vis = visibleExpenseRows(rows, "user-1");
    assert.deepEqual(
      vis.map((r) => r.descriptionNormalized),
      ["MIO", "HOGAR"],
    );
  });
});

describe("aggregate monthly expenses from stored rows", () => {
  const rows: ExpenseTx[] = [
    tx({
      date: "2026-08-01",
      descriptionNormalized: "DIA TIENDA",
      amountArs: 10000,
      categoryId: "cat-super",
    }),
    tx({
      date: "2026-08-02",
      descriptionNormalized: "CAFE MARTINEZ",
      amountArs: "2500.00",
      categoryId: null,
    }),
    tx({
      date: "2026-08-03",
      descriptionNormalized: "OPENAI",
      amountUsd: 20,
      categoryId: "cat-saas",
      bank: "Fiwind",
    }),
    tx({
      date: "2026-08-04",
      descriptionNormalized: "SU PAGO",
      amountArs: 50000,
      isPayment: true,
    }),
    tx({
      date: "2026-08-05",
      descriptionNormalized: "PESIFICACION",
      amountArs: 1000,
    }),
    tx({
      date: "2026-07-15",
      descriptionNormalized: "YPF NAFTA",
      amountArs: 8000,
    }),
  ];

  const expenses = rows.filter(isExpenseRow);
  const { periods, byPeriod } = aggregateByPeriod(expenses, cats);

  it("lists periods newest first from real dates", () => {
    assert.deepEqual(periods, ["2026-08", "2026-07"]);
  });

  it("sums August ARS + USD without payments or accounting lines", () => {
    const month = buildMonthFromAgg(
      "2026-08",
      byPeriod.get("2026-08"),
      augustRate,
    );
    assert.equal(month.totalCount, 3);
    assert.equal(month.totalArs, 12500);
    assert.equal(month.totalUsd, 20);
    assert.equal(month.totalArsFromUsd, 28000);
    assert.equal(month.totalArsCombined, 40500);
    const superCat = month.categories.find((c) => c.slug === "supermercado");
    assert.equal(superCat?.amountArs, 10000);
    const saas = month.categories.find((c) => c.slug === "tecnologia");
    assert.equal(saas?.amountUsd, 20);
    assert.equal(saas?.amountArsCombined, 28000);
  });

  it("does not invent totals for an empty month", () => {
    const month = buildMonthFromAgg(
      "2026-01",
      byPeriod.get("2026-01"),
      undefined,
    );
    assert.equal(month.totalArs, 0);
    assert.equal(month.totalUsd, 0);
    assert.equal(month.totalCount, 0);
    assert.equal(month.totalArsCombined, 0);
    assert.match(formatGastosHeadline(month), /No hay gastos registrados/);
  });

  it("headline uses the combined total from stored amounts", () => {
    const month = buildMonthFromAgg(
      "2026-08",
      byPeriod.get("2026-08"),
      augustRate,
    );
    const headline = formatGastosHeadline(month);
    assert.match(headline, /agosto.*2026/i);
    assert.match(headline, /3 movimientos/);
    assert.ok(headline.includes("20"));
  });

  it("groups by bank from stored rows", () => {
    const august = expenses.filter((r) => r.date.startsWith("2026-08"));
    const banks = aggregateByBank(august);
    const bbva = banks.find((b) => b.bank === "BBVA");
    const fiwind = banks.find((b) => b.bank === "Fiwind");
    assert.equal(bbva?.amountArs, 12500);
    assert.equal(bbva?.count, 2);
    assert.equal(fiwind?.amountUsd, 20);
    assert.equal(fiwind?.count, 1);
  });
});
