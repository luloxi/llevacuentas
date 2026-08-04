import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";
import {
  convertUsdToArs,
  getMonthEndBuyRates,
} from "@/lib/fx/month-end-rates";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";

export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const ctx = await requireHousehold(sessionUser.id);
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period"); // YYYY-MM | "all" | null (latest)

    const db = getDb();
    const { byId, cats } = await getCategoryMap();
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    type Agg = {
      amountArs: number;
      amountUsd: number;
      count: number;
      categoryId: string | null;
    };
    const byPeriod = new Map<string, Map<string, Agg>>();
    const periodsSet = new Set<string>();

    for (const r of rows) {
      if (r.isPayment) continue;
      if (isBankAccountingEntry(r.descriptionNormalized)) continue;
      const p = r.date.slice(0, 7);
      periodsSet.add(p);

      const cat = r.categoryId ? byId.get(r.categoryId) : null;
      const slug = cat?.slug ?? "uncategorized";
      const name = cat?.name ?? "Sin categoría";
      const key = `${slug}||${name}||${r.categoryId ?? ""}`;

      if (!byPeriod.has(p)) byPeriod.set(p, new Map());
      const map = byPeriod.get(p)!;
      const cur = map.get(key) ?? {
        amountArs: 0,
        amountUsd: 0,
        count: 0,
        categoryId: r.categoryId ?? null,
      };
      cur.amountArs += r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      cur.amountUsd += r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      cur.count += 1;
      map.set(key, cur);
    }

    const periods = [...periodsSet].sort().reverse();
    const rates = await getMonthEndBuyRates(periods);

    function buildMonth(p: string) {
      const map = byPeriod.get(p) ?? new Map();
      const fx = rates.get(p);
      const usdRate = fx?.buy ?? 0;

      const categories = [...map.entries()]
        .map(([key, agg]) => {
          const [slug, name, categoryId] = key.split("||");
          const amountArsFromUsd = convertUsdToArs(agg.amountUsd, usdRate);
          const amountArsCombined = agg.amountArs + amountArsFromUsd;
          return {
            slug,
            name,
            categoryId: categoryId || agg.categoryId || null,
            amountArs: agg.amountArs,
            amountUsd: agg.amountUsd,
            amountArsFromUsd,
            amountArsCombined,
            count: agg.count,
          };
        })
        .sort((a, b) => b.amountArsCombined - a.amountArsCombined);

      const totalArs = categories.reduce((s, c) => s + c.amountArs, 0);
      const totalUsd = categories.reduce((s, c) => s + c.amountUsd, 0);
      const totalArsFromUsd = categories.reduce(
        (s, c) => s + c.amountArsFromUsd,
        0,
      );
      const totalArsCombined = totalArs + totalArsFromUsd;
      const totalCount = categories.reduce((s, c) => s + c.count, 0);

      return {
        period: p,
        /** Native ARS spends only */
        totalArs,
        /** USD spends */
        totalUsd,
        /** USD converted to ARS at month-end buy rate */
        totalArsFromUsd,
        /** totalArs + totalArsFromUsd — final monthly total in pesos */
        totalArsCombined,
        totalCount,
        usdRate: fx
          ? {
              buy: fx.buy,
              asOf: fx.asOf,
              source: fx.source,
            }
          : null,
        categories: categories.map((c) => ({
          ...c,
          pct:
            totalArsCombined > 0
              ? (c.amountArsCombined / totalArsCombined) * 100
              : 0,
        })),
      };
    }

    let selected: string[];
    if (periodParam === "all") {
      selected = periods;
    } else if (periodParam) {
      selected = periods.includes(periodParam) ? [periodParam] : [periodParam];
    } else {
      selected = periods[0] ? [periods[0]] : [];
    }

    const result = selected.map(buildMonth);

    // Full chart series across every period with data (oldest → newest for charts)
    const chartPeriods = [...periods].reverse();
    const totals = chartPeriods.map((p) => {
      const m = buildMonth(p);
      return {
        period: p,
        amountArs: m.totalArsCombined,
        amountArsNative: m.totalArs,
        amountUsd: m.totalUsd,
        amountArsFromUsd: m.totalArsFromUsd,
        count: m.totalCount,
        usdRate: m.usdRate,
      };
    });

    const catSeriesMap = new Map<
      string,
      { slug: string; name: string; values: Record<string, number> }
    >();
    for (const p of chartPeriods) {
      const m = buildMonth(p);
      for (const c of m.categories) {
        if (!catSeriesMap.has(c.slug)) {
          catSeriesMap.set(c.slug, {
            slug: c.slug,
            name: c.name,
            values: {},
          });
        }
        const entry = catSeriesMap.get(c.slug)!;
        // Combined ARS so charts reflect full spend
        entry.values[p] = (entry.values[p] ?? 0) + c.amountArsCombined;
        if (c.slug !== "uncategorized" && c.name) entry.name = c.name;
      }
    }

    const byCategory = [...catSeriesMap.values()]
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        series: chartPeriods.map((p) => ({
          period: p,
          amountArs: c.values[p] ?? 0,
        })),
        totalArs: chartPeriods.reduce((s, p) => s + (c.values[p] ?? 0), 0),
      }))
      .sort((a, b) => b.totalArs - a.totalArs);

    const balPeriod =
      periodParam && periodParam !== "all"
        ? periodParam
        : (periods[0] ?? null);
    let sharedBalance = null;
    if (balPeriod) {
      const shared = rows.filter(
        (r) =>
          !r.isPayment &&
          r.ownership === "shared" &&
          r.date.startsWith(balPeriod) &&
          r.amountArs != null,
      );
      const byUser = new Map<string, number>();
      for (const r of shared) {
        const uid = r.paidByUserId ?? "unknown";
        byUser.set(uid, (byUser.get(uid) ?? 0) + Math.abs(Number(r.amountArs)));
      }
      sharedBalance = {
        period: balPeriod,
        byUser: Object.fromEntries(byUser),
        members: ctx.members,
      };
    }

    return NextResponse.json({
      periods,
      months: result,
      chart: { periods: chartPeriods, totals, byCategory },
      categories: cats.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
      })),
      sharedBalance,
      coupleBalance: sharedBalance,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
