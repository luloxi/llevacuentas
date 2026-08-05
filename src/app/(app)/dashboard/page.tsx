import { requireUser } from "@/lib/session";
import { getUserHousehold, getCategoryMap } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { DashboardHome } from "@/components/dashboard-home";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import {
  convertUsdToArs,
  getMonthEndBuyRates,
} from "@/lib/fx/month-end-rates";
import { currentPeriodAr, periodFromDateString } from "@/lib/utils";
import { isVisibleToUser } from "@/lib/transactions";

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
      monthTxCount={monthTx.length}
      categorySummary={categorySummary}
    />
  );
}
