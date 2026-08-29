import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";
import { getMonthEndBuyRates } from "@/lib/fx/month-end-rates";
import {
  aggregateByBank,
  aggregateByPeriod,
  buildMonthFromAgg,
  currentPeriodAr,
  formatGastosHeadline,
  visibleExpenseRows,
} from "@/lib/stats/monthly-expenses";
import { formatArs, formatUsd } from "@/lib/utils";

export async function GET() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    const ctx = await requireHousehold(user.id);
    const db = getDb();
    const { byId } = await getCategoryMap();

    const [allRows, statements] = await Promise.all([
      db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.householdId, ctx.household.id)),
      db
        .select({
          id: schema.cardStatements.id,
          source: schema.cardStatements.source,
          fileName: schema.cardStatements.fileName,
          importedAt: schema.cardStatements.importedAt,
          rowCount: schema.cardStatements.rowCount,
        })
        .from(schema.cardStatements)
        .where(eq(schema.cardStatements.householdId, ctx.household.id))
        .orderBy(desc(schema.cardStatements.importedAt))
        .limit(10),
    ]);

    const expenses = visibleExpenseRows(allRows, user.id);
    const { periods, byPeriod } = aggregateByPeriod(expenses, byId);
    const period = currentPeriodAr();
    const rates = await getMonthEndBuyRates([
      ...new Set([...periods, period]),
    ]);
    const month = buildMonthFromAgg(
      period,
      byPeriod.get(period),
      rates.get(period),
    );
    const latest = periods[0] ?? null;
    const latestMonth = latest
      ? buildMonthFromAgg(latest, byPeriod.get(latest), rates.get(latest))
      : null;

    return NextResponse.json({
      household: {
        id: ctx.household.id,
        name: ctx.household.name,
      },
      statements: statements.map((s) => ({
        id: s.id,
        source: s.source,
        fileName: s.fileName,
        importedAt: s.importedAt,
        rowCount: s.rowCount,
      })),
      availablePeriods: periods,
      currentPeriod: period,
      latestPeriodWithData: latest,
      currentMonth: {
        ...month,
        byBank: aggregateByBank(
          expenses.filter((r) => r.date.startsWith(period)),
        ),
        formatted: {
          headline: formatGastosHeadline(month),
          totalArs: formatArs(month.totalArs),
          totalUsd: formatUsd(month.totalUsd),
          totalArsCombined: formatArs(month.totalArsCombined),
        },
      },
      latestMonth: latestMonth
        ? {
            ...latestMonth,
            formatted: {
              headline: formatGastosHeadline(latestMonth),
              totalArs: formatArs(latestMonth.totalArs),
              totalUsd: formatUsd(latestMonth.totalUsd),
              totalArsCombined: formatArs(latestMonth.totalArsCombined),
            },
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "NO_HOUSEHOLD") {
      return NextResponse.json(
        { error: "Creá o uníte a un hogar primero" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
