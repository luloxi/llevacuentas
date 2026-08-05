import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";
import {
  convertUsdToArs,
  getMonthEndBuyRates,
} from "@/lib/fx/month-end-rates";
import {
  isBankAccountingEntry,
  isCardPaymentEntry,
} from "@/lib/bbva/bank-entries";

/**
 * Debt is personal: only this user's card activity.
 * Never mix another member's charges/payments or pure household (shared) spend.
 */
function isPrivateToUser(
  r: {
    ownership: string | null;
    paidByUserId: string | null;
  },
  userId: string,
): boolean {
  if (r.paidByUserId) return r.paidByUserId === userId;
  // Legacy rows without assignee: only count as mine if marked personal
  return r.ownership === "personal" || r.ownership == null;
}

export async function GET() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const ctx = await requireHousehold(sessionUser.id);
    const db = getDb();
    const allRows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

    // Strict privacy: this member's ledger only
    const rows = allRows.filter((r) => isPrivateToUser(r, sessionUser.id));

    type Bucket = {
      period: string;
      chargesArs: number;
      chargesUsd: number;
      paymentsArs: number;
      paymentsUsd: number;
      creditsArs: number;
      creditsUsd: number;
      chargeCount: number;
      paymentCount: number;
      creditCount: number;
    };

    const byPeriod = new Map<string, Bucket>();

    function bucket(p: string): Bucket {
      let b = byPeriod.get(p);
      if (!b) {
        b = {
          period: p,
          chargesArs: 0,
          chargesUsd: 0,
          paymentsArs: 0,
          paymentsUsd: 0,
          creditsArs: 0,
          creditsUsd: 0,
          chargeCount: 0,
          paymentCount: 0,
          creditCount: 0,
        };
        byPeriod.set(p, b);
      }
      return b;
    }

    type PaymentRow = {
      id: string;
      date: string;
      description: string;
      amountArs: number | null;
      amountUsd: number | null;
      kind: "payment" | "credit";
    };
    const paymentList: PaymentRow[] = [];

    for (const r of rows) {
      const p = r.date.slice(0, 7);
      const ars = r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      const usd = r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      const desc = r.descriptionNormalized ?? "";
      const b = bucket(p);

      if (isBankAccountingEntry(desc)) continue;

      const looksLikePayment = isCardPaymentEntry(desc);
      const isPayFlag = Boolean(r.isPayment);
      const isCreditFlag = Boolean(r.isCredit);

      if (looksLikePayment || (isPayFlag && !isCreditFlag)) {
        b.paymentsArs += ars;
        b.paymentsUsd += usd;
        b.paymentCount += 1;
        paymentList.push({
          id: r.id,
          date: r.date,
          description: desc,
          amountArs: r.amountArs != null ? Number(r.amountArs) : null,
          amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
          kind: "payment",
        });
      } else if (isPayFlag || isCreditFlag) {
        b.creditsArs += ars;
        b.creditsUsd += usd;
        b.creditCount += 1;
        paymentList.push({
          id: r.id,
          date: r.date,
          description: desc,
          amountArs: r.amountArs != null ? Number(r.amountArs) : null,
          amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
          kind: "credit",
        });
      } else {
        // Shared household expenses are not personal card debt
        if (r.ownership === "shared") continue;
        b.chargesArs += ars;
        b.chargesUsd += usd;
        b.chargeCount += 1;
      }
    }

    const periods = [...byPeriod.keys()].sort();
    const rates = await getMonthEndBuyRates(periods);

    let balanceArs = 0;
    let balanceUsd = 0;
    let peakArs = 0;
    let monthsPaidInFull = 0;

    const months = periods.map((p) => {
      const b = byPeriod.get(p)!;
      const rate = rates.get(p)?.buy ?? 0;
      const chargesCombined =
        b.chargesArs + convertUsdToArs(b.chargesUsd, rate);
      const paymentsCombined =
        b.paymentsArs + convertUsdToArs(b.paymentsUsd, rate);
      const creditsCombined =
        b.creditsArs + convertUsdToArs(b.creditsUsd, rate);
      const reductions = paymentsCombined + creditsCombined;
      const net = chargesCombined - reductions;

      balanceArs += net;
      balanceUsd += b.chargesUsd - b.paymentsUsd - b.creditsUsd;

      if (balanceArs < 0) balanceArs = 0;
      if (balanceUsd < 0) balanceUsd = 0;

      if (balanceArs === 0 && reductions > 0) monthsPaidInFull += 1;
      if (balanceArs > peakArs) peakArs = balanceArs;

      return {
        period: p,
        chargesArs: b.chargesArs,
        chargesUsd: b.chargesUsd,
        chargesCombined,
        paymentsArs: b.paymentsArs,
        paymentsUsd: b.paymentsUsd,
        paymentsCombined,
        creditsArs: b.creditsArs,
        creditsUsd: b.creditsUsd,
        creditsCombined,
        net,
        balanceArs,
        balanceUsd,
        chargeCount: b.chargeCount,
        paymentCount: b.paymentCount,
        creditCount: b.creditCount,
        usdRate: rates.get(p)
          ? {
              buy: rates.get(p)!.buy,
              asOf: rates.get(p)!.asOf,
              source: rates.get(p)!.source,
            }
          : null,
      };
    });

    paymentList.sort((a, b) => b.date.localeCompare(a.date));

    const totalPaidArs = months.reduce((s, m) => s + m.paymentsArs, 0);
    const totalPaidUsd = months.reduce((s, m) => s + m.paymentsUsd, 0);
    const totalChargesArs = months.reduce((s, m) => s + m.chargesArs, 0);
    const totalChargesUsd = months.reduce((s, m) => s + m.chargesUsd, 0);

    const settledThreshold = 50;
    const currentBalanceArs =
      balanceArs < settledThreshold ? 0 : balanceArs;
    const currentBalanceUsd =
      currentBalanceArs === 0 ? 0 : balanceUsd;

    return NextResponse.json({
      months: [...months].reverse(),
      chartMonths: months,
      payments: paymentList,
      summary: {
        currentBalanceArs,
        currentBalanceUsd,
        peakBalanceArs: peakArs,
        totalPaidArs,
        totalPaidUsd,
        totalChargesArs,
        totalChargesUsd,
        monthCount: months.length,
        monthsPaidInFull,
        settled: currentBalanceArs === 0 && months.length > 0,
        private: true,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
