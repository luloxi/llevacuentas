import { requireUser } from "@/lib/session";
import { getUserHousehold, getCategoryMap } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { DashboardHome } from "@/components/dashboard-home";
import {
  isBankAccountingEntry,
  isCardPaymentEntry,
} from "@/lib/bbva/bank-entries";
import {
  convertUsdToArs,
  getMonthEndBuyRates,
} from "@/lib/fx/month-end-rates";
import { currentPeriodAr, periodFromDateString } from "@/lib/utils";
import { isVisibleToUser } from "@/lib/transactions";

const FIXED_HOUSEHOLD_SERVICES: Array<{ slug: string; name: string }> = [
  { slug: "alquiler", name: "Alquiler" },
  { slug: "luz", name: "Luz" },
  { slug: "agua", name: "Agua" },
  { slug: "gas", name: "Gas" },
  { slug: "internet", name: "Internet" },
];

function isPrivateToUser(
  r: { ownership: string | null; paidByUserId: string | null },
  userId: string,
): boolean {
  if (r.paidByUserId) return r.paidByUserId === userId;
  return r.ownership === "personal" || r.ownership == null;
}

export default async function DashboardPage() {
  const user = await requireUser();

  if (!hasDatabase()) redirect("/onboarding");

  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  const db = getDb();
  const txs = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, ctx.household.id));

  const period = currentPeriodAr();
  const [py, pm] = period.split("-").map(Number);
  let prevY = py!;
  let prevM = pm! - 1;
  if (prevM < 1) {
    prevM = 12;
    prevY -= 1;
  }
  const prevPeriod = `${prevY}-${String(prevM).padStart(2, "0")}`;

  const spendTxs = txs.filter(
    (t) =>
      !t.isPayment &&
      !isBankAccountingEntry(t.descriptionNormalized ?? "") &&
      isVisibleToUser(t, user.id),
  );

  const sharedTxs = txs.filter(
    (t) =>
      !t.isPayment &&
      !isBankAccountingEntry(t.descriptionNormalized ?? "") &&
      t.ownership === "shared",
  );

  const monthTx = spendTxs.filter(
    (t) => periodFromDateString(t.date) === period,
  );
  const prevMonthTx = spendTxs.filter(
    (t) => periodFromDateString(t.date) === prevPeriod,
  );
  const sharedMonthTx = sharedTxs.filter(
    (t) => periodFromDateString(t.date) === period,
  );
  const sharedPrevTx = sharedTxs.filter(
    (t) => periodFromDateString(t.date) === prevPeriod,
  );

  const rates = await getMonthEndBuyRates([period, prevPeriod]);
  const rateNow = rates.get(period)?.buy ?? 0;
  const ratePrev = rates.get(prevPeriod)?.buy ?? 0;

  function totalCombined(
    list: typeof monthTx,
    buyRate: number,
  ): number {
    let ars = 0;
    let usd = 0;
    for (const t of list) {
      if (t.amountArs != null) ars += Math.abs(Number(t.amountArs));
      if (t.amountUsd != null) usd += Math.abs(Number(t.amountUsd));
    }
    return ars + convertUsdToArs(usd, buyRate);
  }

  const totalArs = totalCombined(monthTx, rateNow);
  const prevTotalArs = totalCombined(prevMonthTx, ratePrev);
  const sharedTotalArs = totalCombined(sharedMonthTx, rateNow);
  const sharedPrevTotalArs = totalCombined(sharedPrevTx, ratePrev);

  // Personal debt estimate (same privacy rules as /api/stats/deuda)
  const debtRows = txs.filter((t) => isPrivateToUser(t, user.id));
  const debtPeriods = [
    ...new Set(debtRows.map((r) => periodFromDateString(r.date))),
  ].sort();
  const debtRates = await getMonthEndBuyRates(debtPeriods);
  let balanceArs = 0;
  for (const p of debtPeriods) {
    let chargesArs = 0;
    let chargesUsd = 0;
    let paymentsArs = 0;
    let paymentsUsd = 0;
    let creditsArs = 0;
    let creditsUsd = 0;
    for (const r of debtRows) {
      if (periodFromDateString(r.date) !== p) continue;
      const desc = r.descriptionNormalized ?? "";
      if (isBankAccountingEntry(desc)) continue;
      const ars = r.amountArs != null ? Math.abs(Number(r.amountArs)) : 0;
      const usd = r.amountUsd != null ? Math.abs(Number(r.amountUsd)) : 0;
      const looksPay = isCardPaymentEntry(desc);
      const isPay = Boolean(r.isPayment);
      const isCredit = Boolean(r.isCredit);
      if (looksPay || (isPay && !isCredit)) {
        paymentsArs += ars;
        paymentsUsd += usd;
      } else if (isPay || isCredit) {
        creditsArs += ars;
        creditsUsd += usd;
      } else {
        if (r.ownership === "shared") continue;
        chargesArs += ars;
        chargesUsd += usd;
      }
    }
    const rate = debtRates.get(p)?.buy ?? 0;
    const charges =
      chargesArs + convertUsdToArs(chargesUsd, rate);
    const reductions =
      paymentsArs +
      convertUsdToArs(paymentsUsd, rate) +
      creditsArs +
      convertUsdToArs(creditsUsd, rate);
    balanceArs += charges - reductions;
    if (balanceArs < 0) balanceArs = 0;
  }
  const debtBalanceArs = balanceArs < 50 ? 0 : balanceArs;
  const debtSettled = debtBalanceArs === 0 && debtPeriods.length > 0;

  const { byId } = await getCategoryMap();

  const byCat = new Map<string, number>();
  for (const t of monthTx) {
    const id = t.categoryId ?? "none";
    const ars = t.amountArs != null ? Math.abs(Number(t.amountArs)) : 0;
    const usd = t.amountUsd != null ? Math.abs(Number(t.amountUsd)) : 0;
    const amt = ars + convertUsdToArs(usd, rateNow);
    byCat.set(id, (byCat.get(id) ?? 0) + amt);
  }
  const sorted = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .filter(([, total]) => total > 0);

  const categorySummary = sorted.map(([id, total]) => {
    const cat = id === "none" ? null : byId.get(id);
    return {
      id,
      slug: cat?.slug ?? "uncategorized",
      name: cat?.name ?? "Sin categoría",
      total,
      pct: totalArs > 0 ? (total / totalArs) * 100 : 0,
    };
  });

  const paidServiceSlugs = new Set<string>();
  for (const t of sharedMonthTx) {
    const cat = t.categoryId ? byId.get(t.categoryId) : null;
    if (cat?.slug) paidServiceSlugs.add(cat.slug);
  }
  const householdServices = FIXED_HOUSEHOLD_SERVICES.map((svc) => ({
    slug: svc.slug,
    name: svc.name,
    paid: paidServiceSlugs.has(svc.slug),
  }));

  const firstName = (user.name || user.email || "").split(/\s+/)[0] || "vos";

  return (
    <DashboardHome
      firstName={firstName}
      period={period}
      prevPeriod={prevPeriod}
      totalArs={totalArs}
      prevTotalArs={prevTotalArs}
      sharedTotalArs={sharedTotalArs}
      sharedPrevTotalArs={sharedPrevTotalArs}
      debtBalanceArs={debtBalanceArs}
      debtSettled={debtSettled}
      monthTxCount={monthTx.length}
      categorySummary={categorySummary}
      householdServices={householdServices}
    />
  );
}
