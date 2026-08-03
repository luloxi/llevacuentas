import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";

export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const ctx = await requireHousehold(sessionUser.id);
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period"); // optional YYYY-MM

    const db = getDb();
    const { byId } = await getCategoryMap();
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    // period -> categorySlug -> aggregates
    type Agg = {
      amountArs: number;
      amountUsd: number;
      count: number;
    };
    const byPeriod = new Map<string, Map<string, Agg>>();
    const periodsSet = new Set<string>();

    for (const r of rows) {
      if (r.isPayment) continue;
      const p = r.date.slice(0, 7);
      periodsSet.add(p);
      if (period && p !== period) continue;

      const cat = r.categoryId ? byId.get(r.categoryId) : null;
      const slug = cat?.slug ?? "uncategorized";
      const name = cat?.name ?? "Uncategorized";
      const key = `${slug}||${name}`;

      if (!byPeriod.has(p)) byPeriod.set(p, new Map());
      const map = byPeriod.get(p)!;
      const cur = map.get(key) ?? { amountArs: 0, amountUsd: 0, count: 0 };
      cur.amountArs += r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      cur.amountUsd += r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      cur.count += 1;
      map.set(key, cur);
    }

    const periods = [...periodsSet].sort().reverse();
    const selected = period ? [period] : periods.slice(0, 6);

    const result = selected.map((p) => {
      const map = byPeriod.get(p) ?? new Map();
      const categories = [...map.entries()]
        .map(([key, agg]) => {
          const [slug, name] = key.split("||");
          return { slug, name, ...agg };
        })
        .sort((a, b) => b.amountArs - a.amountArs);

      const totalArs = categories.reduce((s, c) => s + c.amountArs, 0);
      const totalUsd = categories.reduce((s, c) => s + c.amountUsd, 0);
      const totalCount = categories.reduce((s, c) => s + c.count, 0);

      return {
        period: p,
        totalArs,
        totalUsd,
        totalCount,
        categories: categories.map((c) => ({
          ...c,
          pct: totalArs > 0 ? (c.amountArs / totalArs) * 100 : 0,
        })),
      };
    });

    // Couple balance for latest / selected period
    const balPeriod = period ?? periods[0];
    let coupleBalance = null;
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
      coupleBalance = {
        period: balPeriod,
        byUser: Object.fromEntries(byUser),
        members: ctx.members,
      };
    }

    return NextResponse.json({ periods, months: result, coupleBalance });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
