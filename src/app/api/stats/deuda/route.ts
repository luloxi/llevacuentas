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

export async function GET() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const ctx = await requireHousehold(sessionUser.id);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, ctx.household.id));

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
      const b = bucket(p);

      // Currency reclassifications (pesificación / deuda USD→ARS): not new spend nor cash payment
      if (isBankAccountingEntry(r.descriptionNormalized)) {
        continue;
      }

      if (r.isPayment) {
        const cardPay = isCardPaymentEntry(r.descriptionNormalized);
        if (cardPay) {
          b.paymentsArs += ars;
          b.paymentsUsd += usd;
          b.paymentCount += 1;
          paymentList.push({
            id: r.id,
            date: r.date,
            description: r.descriptionNormalized,
            amountArs: r.amountArs != null ? Number(r.amountArs) : null,
            amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
            kind: "payment",
          });
        } else {
          // Refunds / credits also lower the balance
          b.creditsArs += ars;
          b.creditsUsd += usd;
          b.creditCount += 1;
          paymentList.push({
            id: r.id,
            date: r.date,
            description: r.descriptionNormalized,
            amountArs: r.amountArs != null ? Number(r.amountArs) : null,
            amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
            kind: "credit",
          });
        }
      } else {
        b.chargesArs += ars;
        b.chargesUsd += usd;
        b.chargeCount += 1;
      }
    }

    const periods = [...byPeriod.keys()].sort(); // oldest → newest for running balance
    const rates = await getMonthEndBuyRates(periods);

    let balanceArs = 0;
    let balanceUsd = 0;
    let peakArs = 0;

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

    return NextResponse.json({
      months: [...months].reverse(), // newest first for UI
      chartMonths: months, // oldest → newest for charts
      payments: paymentList,
      summary: {
        currentBalanceArs: balanceArs,
        currentBalanceUsd: balanceUsd,
        peakBalanceArs: peakArs,
        totalPaidArs,
        totalPaidUsd,
        totalChargesArs,
        totalChargesUsd,
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
