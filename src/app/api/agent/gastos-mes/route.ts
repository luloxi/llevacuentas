import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";
import {
  convertUsdToArs,
  getMonthEndBuyRates,
} from "@/lib/fx/month-end-rates";
import { formatPeriodLabel } from "@/lib/period-label";
import {
  resolveExpensePeriod,
  summarizeMonthExpenses,
} from "@/lib/stats/month-expenses";

/**
 * Gastos del mes from live DB rows (no mocked totals).
 * GET /api/agent/gastos-mes
 * GET /api/agent/gastos-mes?period=2026-07
 * Default period: calendar month in America/Argentina/Buenos_Aires.
 */
export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    const ctx = await requireHousehold(user.id);
    const { searchParams } = new URL(req.url);
    const period = resolveExpensePeriod(searchParams.get("period"));

    const db = getDb();
    const { byId } = await getCategoryMap();
    const allRows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    const summary = summarizeMonthExpenses({
      rows: allRows,
      period,
      viewerUserId: user.id,
      categoryById: byId,
    });

    const rates = await getMonthEndBuyRates([period]);
    const fx = rates.get(period);
    const usdRate = fx?.buy ?? 0;

    const categories = summary.categories
      .map((c) => {
        const amountArsFromUsd = convertUsdToArs(c.amountUsd, usdRate);
        const amountArsCombined = c.amountArs + amountArsFromUsd;
        return { ...c, amountArsFromUsd, amountArsCombined };
      })
      .sort((a, b) => b.amountArsCombined - a.amountArsCombined);

    const totalArsFromUsd = categories.reduce((s, c) => s + c.amountArsFromUsd, 0);
    const totalArsCombined = summary.totalArs + totalArsFromUsd;

    return NextResponse.json({
      period,
      label: formatPeriodLabel(period),
      totalArs: summary.totalArs,
      totalUsd: summary.totalUsd,
      totalArsFromUsd,
      totalArsCombined,
      totalCount: summary.totalCount,
      usdRate: fx
        ? { buy: fx.buy, asOf: fx.asOf, source: fx.source }
        : null,
      categories: categories.map((c) => ({
        ...c,
        pct:
          totalArsCombined > 0
            ? (c.amountArsCombined / totalArsCombined) * 100
            : 0,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "NO_HOUSEHOLD") {
      return NextResponse.json(
        { error: "Creá o uníte a un hogar primero" },
        { status: 400 },
      );
    }
    if (msg === "INVALID_PERIOD") {
      return NextResponse.json(
        { error: "period inválido (usá YYYY-MM o current)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
