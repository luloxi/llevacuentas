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
import { periodFromDateString } from "@/lib/utils";

/**
 * Shared household view: list of shared spends + who paid (balance only).
 */
export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const ctx = await requireHousehold(sessionUser.id);
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period"); // YYYY-MM | all | null

    const db = getDb();
    const { byId } = await getCategoryMap();
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    const periodsSet = new Set<string>();
    for (const r of rows) {
      if (r.isPayment) continue;
      if (isBankAccountingEntry(r.descriptionNormalized)) continue;
      if (r.ownership !== "shared") continue;
      periodsSet.add(periodFromDateString(r.date));
    }
    const periods = [...periodsSet].sort().reverse();

    const filterPeriod =
      periodParam && periodParam !== "all" ? periodParam : null;

    const rates = await getMonthEndBuyRates(
      filterPeriod ? [filterPeriod, ...periods] : periods,
    );

    type Expense = {
      id: string;
      date: string;
      description: string;
      amountArs: number | null;
      amountUsd: number | null;
      amountCombined: number;
      categoryName: string;
      categorySlug: string;
      paidByUserId: string | null;
      paidByName: string;
    };

    const nameByUser = new Map(
      ctx.members.map((m) => [
        m.userId,
        m.displayName || m.name || m.email || m.userId,
      ]),
    );

    const expenses: Expense[] = [];
    const paidByMember = new Map<string, number>();

    for (const r of rows) {
      if (r.isPayment) continue;
      if (isBankAccountingEntry(r.descriptionNormalized)) continue;
      if (r.ownership !== "shared") continue;
      const p = periodFromDateString(r.date);
      if (filterPeriod && p !== filterPeriod) continue;

      const rate = rates.get(p)?.buy ?? 0;
      const ars = r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      const usd = r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      const combined = ars + convertUsdToArs(usd, rate);
      const uid = r.paidByUserId ?? null;
      if (uid) {
        paidByMember.set(uid, (paidByMember.get(uid) ?? 0) + combined);
      }

      const cat = r.categoryId ? byId.get(r.categoryId) : null;
      expenses.push({
        id: r.id,
        date: r.date,
        description: r.descriptionNormalized,
        amountArs: r.amountArs != null ? Math.abs(Number(r.amountArs)) : null,
        amountUsd: r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : null,
        amountCombined: combined,
        categoryName: cat?.name ?? "Sin categoría",
        categorySlug: cat?.slug ?? "uncategorized",
        paidByUserId: uid,
        paidByName: uid
          ? (nameByUser.get(uid) ?? "Desconocido")
          : "Sin asignar",
      });
    }

    expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const members = ctx.members.map((m) => ({
      userId: m.userId,
      name: m.displayName || m.name || m.email || m.userId,
      paidArs: paidByMember.get(m.userId) ?? 0,
    }));

    const totalArsCombined = members.reduce((s, m) => s + m.paidArs, 0);
    const fairShare =
      members.length > 0 ? totalArsCombined / members.length : 0;

    // Settlement: who paid more / less than fair share
    const balances = members.map((m) => ({
      userId: m.userId,
      name: m.name,
      paidArs: m.paidArs,
      fairShare,
      delta: m.paidArs - fairShare, // + paid more, - paid less
    }));

    return NextResponse.json({
      periods,
      expenses,
      members,
      balances,
      inviteCode: ctx.household.inviteCode,
      summary: {
        totalArsCombined,
        fairSharePerMember: fairShare,
        memberCount: members.length,
        expenseCount: expenses.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
