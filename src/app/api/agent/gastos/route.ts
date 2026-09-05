import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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

export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    const ctx = await requireHousehold(user.id);
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period");

    const db = getDb();
    const { byId } = await getCategoryMap();
    const allRows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    const expenses = visibleExpenseRows(allRows, user.id);
    const { periods, byPeriod } = aggregateByPeriod(expenses, byId);
    const extraPeriod =
      periodParam && periodParam !== "latest" && periodParam !== "current"
        ? [periodParam]
        : [];
    const rates = await getMonthEndBuyRates([
      ...new Set([...periods, ...extraPeriod]),
    ]);

    const latest = periods[0] ?? null;
    let period: string;
    if (!periodParam || periodParam === "current") {
      period = currentPeriodAr();
    } else if (periodParam === "latest") {
      period = latest ?? currentPeriodAr();
    } else {
      period = periodParam;
    }

    const month = buildMonthFromAgg(
      period,
      byPeriod.get(period),
      rates.get(period),
    );
    const inPeriod = expenses.filter((r) => r.date.startsWith(period));
    const byBank = aggregateByBank(inPeriod);
    const headline = formatGastosHeadline(month);

    return NextResponse.json({
      period: month.period,
      latestPeriodWithData: latest,
      availablePeriods: periods,
      totalArs: month.totalArs,
      totalUsd: month.totalUsd,
      totalArsFromUsd: month.totalArsFromUsd,
      totalArsCombined: month.totalArsCombined,
      totalCount: month.totalCount,
      usdRate: month.usdRate,
      categories: month.categories,
      byBank,
      formatted: {
        headline,
        totalArs: formatArs(month.totalArs),
        totalUsd: formatUsd(month.totalUsd),
        totalArsCombined: formatArs(month.totalArsCombined),
      },
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
