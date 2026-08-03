import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { formatArs } from "@/lib/utils";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { Upload, ShoppingCart, List, Users } from "lucide-react";

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
  const monthTx = txs.filter((t) => t.date.startsWith(period) && !t.isPayment);
  const totalArs = monthTx.reduce(
    (s, t) => s + (t.amountArs != null ? Math.abs(Number(t.amountArs)) : 0),
    0,
  );
  const shared = monthTx.filter((t) => t.ownership === "shared").length;
  const personal = monthTx.filter((t) => t.ownership === "personal").length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-500">Hola, {user.name || user.email}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {ctx.household.name}
        </h1>
        <p className="text-sm text-zinc-500">Resumen de {period}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Gastos del mes" value={formatArs(totalArs)} />
        <StatCard label="Movimientos" value={String(monthTx.length)} />
        <StatCard
          label="Personal / compartido"
          value={`${personal} / ${shared}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <QuickLink
          href="/importar"
          icon={<Upload className="h-5 w-5" />}
          title="Importar BBVA"
          desc="Subí el Excel de últimos movimientos"
        />
        <QuickLink
          href="/supermercado"
          icon={<ShoppingCart className="h-5 w-5" />}
          title="Ticket de súper"
          desc="Foto del ticket y desglose de ítems"
        />
        <QuickLink
          href="/consumos"
          icon={<List className="h-5 w-5" />}
          title="Consumos"
          desc="Tabla tipo Transparencia"
        />
        <QuickLink
          href="/pareja"
          icon={<Users className="h-5 w-5" />}
          title="Pareja"
          desc="Invitación y balance compartido"
        />
      </div>

      {txs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-sm dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="font-medium">Primer paso</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Importá el resumen de tu tarjeta BBVA o la planilla Transparencia
            para ver el desglose mes a mes.
          </p>
          <Link
            href="/importar"
            className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-white"
          >
            Ir a importar
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        {icon}
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-zinc-500">{desc}</div>
      </div>
    </Link>
  );
}
