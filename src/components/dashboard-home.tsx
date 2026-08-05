"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Landmark,
  Minus,
  Users,
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

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const delta = target - from;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(from + delta * easeOutCubic(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setValue(target);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  useEffect(() => {
    fromRef.current = value;
  }, [value]);

  return value;
}

const BURST_COLORS = [
  "#10b981",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
  "#a78bfa",
  "#fb7185",
];

function SpendBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
      aria-hidden
    >
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 48 + (i % 4) * 18;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist - 10;
        const size = 5 + (i % 4);
        const color = BURST_COLORS[i % BURST_COLORS.length]!;
        const delay = (i % 5) * 28;
        return (
          <span
            key={i}
            className="lc-burst-particle absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              background: color,
              boxShadow: `0 0 8px ${color}`,
              ["--bx" as string]: `${x}px`,
              ["--by" as string]: `${y}px`,
              animationDelay: `${delay}ms`,
            }}
          />
        );
      })}
      <span className="lc-burst-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      <span className="lc-burst-flash absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}

/** Compact delta vs previous month — bar + % only */
function MiniMeter({
  total,
  prevTotal,
  accent = "emerald",
}: {
  total: number;
  prevTotal: number;
  accent?: "emerald" | "violet";
}) {
  const delta =
    prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
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
    prevTotal > 0
      ? Math.min(120, (total / prevTotal) * 100)
      : total > 0
        ? 100
        : 0;
  const barGrad =
    barPct >= 100
      ? "bg-gradient-to-r from-amber-500 to-orange-500"
      : accent === "violet"
        ? "bg-gradient-to-r from-violet-500 to-fuchsia-400"
        : "bg-gradient-to-r from-emerald-500 to-teal-400";

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barGrad)}
          style={{ width: `${Math.min(100, barPct)}%` }}
        />
      </div>
      {delta != null && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums",
            deltaColor,
          )}
        >
          <DeltaIcon className="h-3 w-3" />
          {Math.abs(delta).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function TapHint() {
  return (
    <ChevronRight
      className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400"
      aria-hidden
    />
  );
}

export function DashboardHome({
  firstName,
  period,
  prevPeriod,
  totalArs,
  prevTotalArs,
  sharedTotalArs,
  sharedPrevTotalArs,
  debtBalanceArs,
  debtSettled,
  monthTxCount,
  categorySummary,
}: {
  firstName: string;
  period: string;
  prevPeriod: string;
  totalArs: number;
  prevTotalArs: number;
  sharedTotalArs: number;
  sharedPrevTotalArs: number;
  debtBalanceArs: number;
  debtSettled: boolean;
  monthTxCount: number;
  categorySummary: CategorySummary[];
  householdName?: string;
  initialCategories?: unknown;
  initialMembers?: unknown;
}) {
  const router = useRouter();
  const [liveTotal, setLiveTotal] = useState(totalArs);
  const [liveCount, setLiveCount] = useState(monthTxCount);
  const [liveCats, setLiveCats] = useState(categorySummary);
  const [burst, setBurst] = useState(false);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    setLiveTotal(totalArs);
    setLiveCount(monthTxCount);
    setLiveCats(categorySummary);
  }, [totalArs, monthTxCount, categorySummary]);

  const displayTotal = useCountUp(liveTotal, 750);

  const triggerCelebrate = useCallback(() => {
    setBurst(true);
    setPop(true);
    window.setTimeout(() => setBurst(false), 900);
    window.setTimeout(() => setPop(false), 500);
  }, []);

  useEffect(() => {
    function onCreated() {
      triggerCelebrate();
      setLiveCount((c) => c + 1);
      router.refresh();
    }
    window.addEventListener("lc:expense-created", onCreated);
    return () => window.removeEventListener("lc:expense-created", onCreated);
  }, [router, triggerCelebrate]);

  return (
    <div className="animate-fade-up mx-auto flex max-w-lg flex-col gap-3">
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Hola, {firstName}
      </p>

      {/* 1. Total personal → lista */}
      <Link
        href="/consumos?tab=lista"
        className="group relative block rounded-2xl border border-emerald-200/60 bg-emerald-50/40 px-4 py-3.5 transition active:scale-[0.99] dark:border-emerald-900/40 dark:bg-emerald-950/25"
        aria-label={`Tus gastos del mes, ${formatArs(Math.round(displayTotal))}`}
      >
        <SpendBurst active={burst} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/70 dark:text-emerald-400/70">
              {formatPeriodLabel(period)}
            </p>
            <p
              className={cn(
                "mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-zinc-900 transition-transform dark:text-zinc-50",
                pop && "lc-amount-pop",
              )}
            >
              {formatArs(Math.round(displayTotal))}
            </p>
            {liveCount > 0 && (
              <p className="mt-0.5 text-[11px] tabular-nums text-zinc-400">
                {liveCount} mov.
              </p>
            )}
          </div>
          <TapHint />
        </div>
        <MiniMeter total={liveTotal} prevTotal={prevTotalArs} accent="emerald" />
      </Link>

      {/* 2. Categorías → resumen */}
      {liveCats.length > 0 && (
        <Link
          href="/consumos?tab=resumen"
          className="group block rounded-2xl border border-zinc-200/80 bg-white/70 px-3.5 py-3 transition active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-950/60"
          aria-label="Gastos por categoría"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex -space-x-1.5">
              {liveCats.slice(0, 4).map((c) => {
                const color = colorForCategory(c.slug);
                return (
                  <span
                    key={c.id}
                    className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white dark:ring-zinc-950"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    <CategoryIcon slug={c.slug} size={12} />
                  </span>
                );
              })}
            </div>
            <TapHint />
          </div>
          <ul className="space-y-1.5">
            {liveCats.map((c) => {
              const color = colorForCategory(c.slug);
              return (
                <li key={c.id} className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                    {formatArs(c.total)}
                  </span>
                  <div className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, c.pct)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Link>
      )}

      {/* 3. Deuda */}
      <Link
        href="/deuda"
        className={cn(
          "group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition active:scale-[0.99]",
          debtSettled
            ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/25"
            : "border-red-200/60 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/25",
        )}
        aria-label={
          debtSettled
            ? "Deuda saldada"
            : `Deuda ${formatArs(debtBalanceArs)}`
        }
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            debtSettled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
              : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
          )}
        >
          <Landmark className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-lg font-bold tabular-nums tracking-tight",
              debtSettled
                ? "text-emerald-900 dark:text-emerald-100"
                : "text-red-900 dark:text-red-100",
            )}
          >
            {debtSettled ? "Saldada" : formatArs(debtBalanceArs)}
          </p>
        </div>
        <TapHint />
      </Link>

      {/* 4. Hogar last */}
      <Link
        href="/compartido"
        className="group flex items-center gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/40 px-3.5 py-3 transition active:scale-[0.99] dark:border-violet-900/40 dark:bg-violet-950/25"
        aria-label={`Hogar ${formatArs(sharedTotalArs)}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold tabular-nums tracking-tight text-violet-950 dark:text-violet-50">
            {formatArs(sharedTotalArs)}
          </p>
          <MiniMeter
            total={sharedTotalArs}
            prevTotal={sharedPrevTotalArs}
            accent="violet"
          />
        </div>
        <TapHint />
      </Link>

      {/* silent: prevPeriod still available if needed later */}
      <span className="sr-only">vs {formatPeriodShort(prevPeriod)}</span>
    </div>
  );
}
