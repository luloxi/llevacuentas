import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";
import {
  convertUsdToArs,
  getMonthEndBuyRates,
} from "@/lib/fx/month-end-rates";

/**
 * Shared-only household budget view (no “who owes whom”).
 */
export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const ctx = await requireHousehold(sessionUser.id);
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period"); // YYYY-MM | all | null=all

    const db = getDb();
    const { byId } = await getCategoryMap();
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    type Agg = {
      amountArs: number;
      amountUsd: number;
      count: number;
      byMember: Map<string, number>; // combined ARS paid by member
    };

    const byPeriod = new Map<string, Map<string, Agg>>();
    const periodsSet = new Set<string>();

    for (const r of rows) {
      if (r.isPayment) continue;
      if (r.ownership !== "shared") continue;
      const p = r.date.slice(0, 7);
      periodsSet.add(p);
      if (periodParam && periodParam !== "all" && p !== periodParam) continue;

      const cat = r.categoryId ? byId.get(r.categoryId) : null;
      const slug = cat?.slug ?? "uncategorized";
      const name = cat?.name ?? "Sin categoría";
      const key = `${slug}||${name}`;

      if (!byPeriod.has(p)) byPeriod.set(p, new Map());
      const map = byPeriod.get(p)!;
      const cur = map.get(key) ?? {
        amountArs: 0,
        amountUsd: 0,
        count: 0,
        byMember: new Map(),
      };
      const ars = r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      const usd = r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      cur.amountArs += ars;
      cur.amountUsd += usd;
      cur.count += 1;
      map.set(key, cur);
    }

    const periods = [...periodsSet].sort().reverse();
    const rates = await getMonthEndBuyRates(
      periodParam && periodParam !== "all" ? [periodParam] : periods,
    );

    const selected =
      periodParam && periodParam !== "all"
        ? periods.includes(periodParam)
          ? [periodParam]
          : [periodParam]
        : periods;

    const months = selected.map((p) => {
      const map = byPeriod.get(p) ?? new Map();
      const rate = rates.get(p)?.buy ?? 0;
      const categories = [...map.entries()]
        .map(([key, agg]) => {
          const [slug, name] = key.split("||");
          const amountArsFromUsd = convertUsdToArs(agg.amountUsd, rate);
          const amountArsCombined = agg.amountArs + amountArsFromUsd;
          return {
            slug: slug!,
            name: name!,
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
        totalArs,
        totalUsd,
        totalArsFromUsd,
        totalArsCombined,
        totalCount,
        usdRate: rates.get(p)
          ? {
              buy: rates.get(p)!.buy,
              asOf: rates.get(p)!.asOf,
              source: rates.get(p)!.source,
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
    });

    // Who paid shared (for info only — budget split suggestion, not debts)
    const paidByMember = new Map<string, number>();
    for (const r of rows) {
      if (r.isPayment || r.ownership !== "shared") continue;
      const p = r.date.slice(0, 7);
      if (periodParam && periodParam !== "all" && p !== periodParam) continue;
      const rate = rates.get(p)?.buy ?? 0;
      const ars = r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      const usd = r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      const combined = ars + convertUsdToArs(usd, rate);
      const uid = r.paidByUserId ?? "unknown";
      paidByMember.set(uid, (paidByMember.get(uid) ?? 0) + combined);
    }

    const members = ctx.members.map((m) => ({
      userId: m.userId,
      name: m.displayName || m.name || m.email || m.userId,
      paidArs: paidByMember.get(m.userId) ?? 0,
    }));

    const grandTotal = months.reduce((s, m) => s + m.totalArsCombined, 0);
    const fairShare =
      members.length > 0 ? grandTotal / members.length : grandTotal;

    return NextResponse.json({
      periods,
      months,
      members,
      inviteCode: ctx.household.inviteCode,
      summary: {
        totalArsCombined: grandTotal,
        fairSharePerMember: fairShare,
        memberCount: members.length,
        monthCount: months.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
