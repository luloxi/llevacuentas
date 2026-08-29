import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveExpensePeriod,
  summarizeMonthExpenses,
  type MonthExpenseRow,
} from "./month-expenses";

const ME = "user-luciano";
const OTHER = "user-other";

const cats = new Map([
  ["cat-super", { slug: "supermercado", name: "Supermercado" }],
  ["cat-subs", { slug: "suscripciones", name: "Suscripciones" }],
]);

function row(
  partial: Partial<MonthExpenseRow> & Pick<MonthExpenseRow, "date" | "descriptionNormalized">,
): MonthExpenseRow {
  return {
    amountArs: null,
    amountUsd: null,
    isPayment: false,
    categoryId: null,
    ownership: "personal",
    paidByUserId: ME,
    ...partial,
  };
}

test("resolveExpensePeriod accepts YYYY-MM and current aliases", () => {
  assert.equal(resolveExpensePeriod("2026-08"), "2026-08");
  assert.match(resolveExpensePeriod("current"), /^\d{4}-\d{2}$/);
  assert.match(resolveExpensePeriod("mes"), /^\d{4}-\d{2}$/);
  assert.match(resolveExpensePeriod(null), /^\d{4}-\d{2}$/);
  assert.throws(() => resolveExpensePeriod("agosto"), /INVALID_PERIOD/);
  assert.throws(() => resolveExpensePeriod("2026-8"), /INVALID_PERIOD/);
});

test("summarizeMonthExpenses sums real ARS/USD from rows (no fake totals)", () => {
  const rows: MonthExpenseRow[] = [
    row({
      date: "2026-08-01",
      descriptionNormalized: "DIA TIENDA 12",
      amountArs: "15000.50",
      categoryId: "cat-super",
    }),
    row({
      date: "2026-08-10",
      descriptionNormalized: "NETFLIX",
      amountUsd: 15,
      categoryId: "cat-subs",
    }),
    row({
      date: "2026-08-12",
      descriptionNormalized: "JUMBO PALERMO",
      amountArs: 2000,
      categoryId: "cat-super",
    }),
  ];

  const s = summarizeMonthExpenses({
    rows,
    period: "2026-08",
    viewerUserId: ME,
    categoryById: cats,
  });

  assert.equal(s.period, "2026-08");
  assert.equal(s.totalArs, 17000.5);
  assert.equal(s.totalUsd, 15);
  assert.equal(s.totalCount, 3);
  const superCat = s.categories.find((c) => c.slug === "supermercado");
  assert.ok(superCat);
  assert.equal(superCat.amountArs, 17000.5);
  assert.equal(superCat.count, 2);
  const subs = s.categories.find((c) => c.slug === "suscripciones");
  assert.ok(subs);
  assert.equal(subs.amountUsd, 15);
  assert.equal(subs.count, 1);
});

test("excludes payments, bank accounting lines, other people's personal spends, other months", () => {
  const rows: MonthExpenseRow[] = [
    row({
      date: "2026-08-01",
      descriptionNormalized: "DIA TIENDA",
      amountArs: 1000,
    }),
    row({
      date: "2026-08-02",
      descriptionNormalized: "SU PAGO",
      amountArs: 50000,
      isPayment: true,
    }),
    row({
      date: "2026-08-03",
      descriptionNormalized: "PESIFICACION USD",
      amountArs: 80000,
    }),
    row({
      date: "2026-08-04",
      descriptionNormalized: "GASTO AJENO",
      amountArs: 9999,
      paidByUserId: OTHER,
      ownership: "personal",
    }),
    row({
      date: "2026-08-05",
      descriptionNormalized: "SUPER COMPARTIDO",
      amountArs: 400,
      ownership: "shared",
      paidByUserId: OTHER,
    }),
    row({
      date: "2026-07-31",
      descriptionNormalized: "MES PASADO",
      amountArs: 12345,
    }),
  ];

  const s = summarizeMonthExpenses({
    rows,
    period: "2026-08",
    viewerUserId: ME,
    categoryById: cats,
  });

  assert.equal(s.totalArs, 1400);
  assert.equal(s.totalUsd, 0);
  assert.equal(s.totalCount, 2);
});

test("empty month returns zeros, not mocked totals", () => {
  const s = summarizeMonthExpenses({
    rows: [],
    period: "2026-08",
    viewerUserId: ME,
    categoryById: cats,
  });
  assert.equal(s.totalArs, 0);
  assert.equal(s.totalUsd, 0);
  assert.equal(s.totalCount, 0);
  assert.deepEqual(s.categories, []);
});
