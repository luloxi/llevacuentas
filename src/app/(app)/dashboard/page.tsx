import { requireUser } from "@/lib/session";
import { getUserHousehold, getCategoryMap } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { DashboardHome } from "@/components/dashboard-home";

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

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const monthTx = txs.filter((t) => t.date.startsWith(period) && !t.isPayment);
  const prevMonthTx = txs.filter(
    (t) => t.date.startsWith(prevPeriod) && !t.isPayment,
  );

  const totalArs = monthTx.reduce(
    (s, t) => s + (t.amountArs != null ? Math.abs(Number(t.amountArs)) : 0),
    0,
  );
  const prevTotalArs = prevMonthTx.reduce(
    (s, t) => s + (t.amountArs != null ? Math.abs(Number(t.amountArs)) : 0),
    0,
  );

  const { byId } = await getCategoryMap();

  const byCat = new Map<string, number>();
  for (const t of monthTx) {
    const id = t.categoryId ?? "none";
    const amt = t.amountArs != null ? Math.abs(Number(t.amountArs)) : 0;
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

  const members = ctx.members.map((m) => ({
    userId: m.userId,
    name: m.displayName || m.name || m.email || "Sin nombre",
  }));

  const cats = [...byId.values()]
    .filter((c) => c.kind === "expense")
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name }));

  return (
    <DashboardHome
      firstName={firstName}
      householdName={ctx.household.name}
      period={period}
      prevPeriod={prevPeriod}
      totalArs={totalArs}
      prevTotalArs={prevTotalArs}
      monthTxCount={monthTx.length}
      categorySummary={categorySummary}
      initialCategories={cats}
      initialMembers={members}
    />
  );
}
