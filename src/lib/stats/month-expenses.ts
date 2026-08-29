import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import { currentPeriodAr, periodFromDateString } from "@/lib/utils";

/**
 * Transaction shape needed to compute "gastos del mes".
 * Matches the columns we read from schema.transactions — no fake totals.
 */
export type MonthExpenseRow = {
  date: string;
  descriptionNormalized: string;
  amountArs: string | number | null;
  amountUsd: string | number | null;
  isPayment: boolean;
  categoryId: string | null;
  ownership: string;
  paidByUserId: string | null;
};

export type CategoryLookup = {
  slug: string;
  name: string;
};

export type MonthCategoryAgg = {
  slug: string;
  name: string;
  categoryId: string | null;
  amountArs: number;
  amountUsd: number;
  count: number;
};

export type MonthExpenseSummary = {
  period: string;
  totalArs: number;
  totalUsd: number;
  totalCount: number;
  categories: MonthCategoryAgg[];
};

/**
 * Keep in sync with isVisibleToUser in transactions.ts.
 * Inlined so this module stays free of DB imports (unit tests, agents).
 */
function isVisibleToUser(
  tx: { ownership: string; paidByUserId: string | null },
  userId: string,
): boolean {
  if (tx.ownership === "shared") return true;
  return tx.paidByUserId === userId;
}

export function isCountableExpense(row: MonthExpenseRow): boolean {
  if (row.isPayment) return false;
  if (isBankAccountingEntry(row.descriptionNormalized)) return false;
  return true;
}

/**
 * Resolve which calendar month an agent asked for.
 * Default / "current" / "mes" → America/Argentina/Buenos_Aires this month.
 */
export function resolveExpensePeriod(
  periodParam: string | null | undefined,
): string {
  const raw = periodParam?.trim() ?? "";
  if (!raw || raw === "current" || raw === "mes") {
    return currentPeriodAr();
  }
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new Error("INVALID_PERIOD");
  }
  return raw;
}

/**
 * Sum real ARS/USD from DB-shaped rows for one YYYY-MM period.
 * Empty month → zeros (never a mocked total).
 */
export function summarizeMonthExpenses(opts: {
  rows: MonthExpenseRow[];
  period: string;
  viewerUserId: string;
  categoryById: { get(id: string): CategoryLookup | undefined };
}): MonthExpenseSummary {
  const { rows, period, viewerUserId, categoryById } = opts;
  const byKey = new Map<string, MonthCategoryAgg>();

  for (const r of rows) {
    if (!isCountableExpense(r)) continue;
    if (!isVisibleToUser(r, viewerUserId)) continue;
    if (periodFromDateString(r.date) !== period) continue;

    const cat = r.categoryId ? categoryById.get(r.categoryId) : undefined;
    const slug = cat?.slug ?? "uncategorized";
    const name = cat?.name ?? "Sin categoría";
    const key = `${slug}||${name}||${r.categoryId ?? ""}`;
    const cur = byKey.get(key) ?? {
      slug,
      name,
      categoryId: r.categoryId ?? null,
      amountArs: 0,
      amountUsd: 0,
      count: 0,
    };
    cur.amountArs += r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
    cur.amountUsd += r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
    cur.count += 1;
    byKey.set(key, cur);
  }

  const categories = [...byKey.values()].sort((a, b) => {
    const ta = a.amountArs + a.amountUsd;
    const tb = b.amountArs + b.amountUsd;
    return tb - ta;
  });
  const totalArs = categories.reduce((s, c) => s + c.amountArs, 0);
  const totalUsd = categories.reduce((s, c) => s + c.amountUsd, 0);
  const totalCount = categories.reduce((s, c) => s + c.count, 0);

  return { period, totalArs, totalUsd, totalCount, categories };
}
