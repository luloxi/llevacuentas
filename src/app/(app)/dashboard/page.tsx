import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { formatArs } from "@/lib/utils";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  ArrowRight,
  List,
  Users,
  PieChart,
  Wallet,
  Receipt,
  Share2,
  Sparkles,
} from "lucide-react";
import { formatPeriodLabel } from "@/lib/period-label";
import { PageStack, StatTile, Surface } from "@/components/ui";

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
  const firstName = (user.name || user.email || "").split(/\s+/)[0] || "vos";

  return (
    <PageStack>
      <Surface
        elevated
        className="relative overflow-hidden !p-0"
        padding={false}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-teal-300/25 blur-3xl dark:bg-teal-600/10" />
        <div className="relative px-5 py-6 sm:px-7 sm:py-8">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200">
            <Sparkles className="h-3 w-3" />
            {formatPeriodLabel(period)}
          </div>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Hola, {firstName}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
            {ctx.household.name}
          </h1>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Resumen del mes en curso. Importá, categorizá y mirá el análisis
            cuando quieras.
          </p>
        </div>
      </Surface>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Gastos del mes"
          value={formatArs(totalArs)}
          hint="Solo pesos nativos"
          tone="brand"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatTile
          label="Movimientos"
          value={String(monthTx.length)}
          hint="Sin pagos de tarjeta"
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatTile
          label="Personal / compartido"
          value={`${personal} / ${shared}`}
          hint="Cantidad de gastos"
          tone="violet"
          icon={<Share2 className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <QuickLink
          href="/consumos"
          icon={<List className="h-5 w-5" />}
          title="Consumos"
          desc="Importar banco, tickets y categorizar"
          accent="emerald"
        />
        <QuickLink
          href="/analisis"
          icon={<PieChart className="h-5 w-5" />}
          title="Análisis"
          desc="Resumen, gráficos y deuda"
          accent="teal"
        />
        <QuickLink
          href="/compartido"
          icon={<Users className="h-5 w-5" />}
          title="Hogar"
          desc="Presupuesto de gastos compartidos"
          accent="violet"
          className="sm:col-span-2"
        />
      </div>

      {txs.length === 0 && (
        <Surface className="border-dashed border-emerald-300/80 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="font-semibold text-emerald-950 dark:text-emerald-100">
            Primer paso
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            En Consumos importá el Excel de últimos movimientos de tu tarjeta
            para ver el desglose mes a mes.
          </p>
          <Link
            href="/consumos"
            className="lc-btn lc-btn-primary mt-4 inline-flex"
          >
            Ir a consumos
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Surface>
      )}
    </PageStack>
  );
}

function QuickLink({
  href,
  icon,
  title,
  desc,
  accent = "emerald",
  className,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent?: "emerald" | "teal" | "violet";
  className?: string;
}) {
  const iconBg = {
    emerald:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    violet:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  } as const;

  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-2xl border border-zinc-200/90 bg-white/85 p-4 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/80 hover:shadow-md hover:shadow-emerald-900/5 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-emerald-800 ${className ?? ""}`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${iconBg[accent]}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold tracking-tight">{title}</div>
          <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:text-zinc-600" />
        </div>
        <div className="mt-0.5 text-sm text-zinc-500">{desc}</div>
      </div>
    </Link>
  );
}
