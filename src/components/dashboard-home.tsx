"use client";

import Link from "next/link";
import {
  List,
  PieChart,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { formatArs, cn } from "@/lib/utils";
import { formatPeriodLabel, formatPeriodShort } from "@/lib/period-label";
import { CategoryIcon } from "@/lib/category-icons";
import { colorForCategory } from "@/lib/category-colors";

type CategorySummary = {
  id: string;
  slug: string;
  name: string;
  total: number;
  pct: number;
};

export function DashboardHome({
  firstName,
  householdName,
  period,
  prevPeriod,
  totalArs,
  prevTotalArs,
  monthTxCount,
  categorySummary,
}: {
  firstName: string;
  householdName: string;
  period: string;
  prevPeriod: string;
  totalArs: number;
  prevTotalArs: number;
  monthTxCount: number;
  categorySummary: CategorySummary[];
  initialCategories?: unknown;
  initialMembers?: unknown;
}) {
  const delta =
    prevTotalArs > 0 ? ((totalArs - prevTotalArs) / prevTotalArs) * 100 : null;
  const DeltaIcon =
    delta == null || Math.abs(delta) < 0.5
      ? Minus
      : delta > 0
        ? ArrowUpRight
        : ArrowDownRight;
  const deltaColor =
    delta == null || Math.abs(delta) < 0.5
      ? "text-zinc-400"
      : delta > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  const barPct =
    prevTotalArs > 0
      ? Math.min(100, (totalArs / prevTotalArs) * 100)
      : totalArs > 0
        ? 100
        : 0;

  return (
    <div className="animate-fade-up mx-auto flex max-w-lg flex-col gap-6">
      <div className="text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Hola, {firstName}
        </p>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
          {householdName}
        </p>

        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80 dark:text-emerald-400/80">
            {formatPeriodLabel(period)}
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            {formatArs(totalArs)}
          </p>

          <div className="mx-auto mt-3 max-w-[220px]">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  barPct > 100
                    ? "bg-gradient-to-r from-amber-500 to-orange-500"
                    : "bg-gradient-to-r from-emerald-500 to-teal-400",
                )}
                style={{ width: `${Math.min(100, barPct)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <span className="tabular-nums">
                {formatPeriodShort(prevPeriod)} · {formatArs(prevTotalArs)}
              </span>
              {delta != null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
                    deltaColor,
                  )}
                >
                  <DeltaIcon className="h-3.5 w-3.5" />
                  {Math.abs(delta).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {monthTxCount > 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              {monthTxCount} movimiento{monthTxCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <NavPill href="/consumos" icon={<List className="h-5 w-5" />} label="Gastos" />
        <NavPill href="/analisis" icon={<PieChart className="h-5 w-5" />} label="Análisis" />
        <NavPill href="/compartido" icon={<Users className="h-5 w-5" />} label="Hogar" />
      </div>

      {categorySummary.length > 0 && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Este mes
          </p>
          <ul className="space-y-2.5">
            {categorySummary.map((c) => {
              const color = colorForCategory(c.slug);
              return (
                <li key={c.id} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    <CategoryIcon slug={c.slug} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {c.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-sm text-zinc-600 dark:text-zinc-400">
                        {formatArs(c.total)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, c.pct)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function NavPill({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-200/90 bg-white/80 px-3 py-3.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300/70 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-emerald-800"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        {icon}
      </span>
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
    </Link>
  );
}
