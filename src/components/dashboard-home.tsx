"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
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

function Meter({
  total,
  prevTotal,
  prevPeriod,
  accent = "emerald",
}: {
  total: number;
  prevTotal: number;
  prevPeriod: string;
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
    <div className="relative mx-auto mt-3 max-w-[220px]">
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barGrad)}
          style={{ width: `${Math.min(100, barPct)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-2 text-sm text-zinc-500">
        <span className="tabular-nums">
          {formatPeriodShort(prevPeriod)} · {formatArs(prevTotal)}
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
    <div className="animate-fade-up mx-auto flex max-w-lg flex-col gap-5">
      <div className="text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Hola, {firstName}
        </p>

        <div className="relative mt-5">
          <SpendBurst active={burst} />

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80 dark:text-emerald-400/80">
            Tus gastos · {formatPeriodLabel(period)}
          </p>
          <p
            className={cn(
              "mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 transition-transform dark:text-zinc-50 sm:text-5xl",
              pop && "lc-amount-pop",
            )}
          >
            {formatArs(Math.round(displayTotal))}
          </p>

          <Meter
            total={liveTotal}
            prevTotal={prevTotalArs}
            prevPeriod={prevPeriod}
            accent="emerald"
          />

          {liveCount > 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              {liveCount} movimiento{liveCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      {/* Hogar level on home */}
      <div className="rounded-2xl border border-violet-200/70 bg-violet-50/50 p-4 text-center dark:border-violet-900/50 dark:bg-violet-950/30">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
          <Users className="h-3.5 w-3.5" />
          Hogar · {formatPeriodLabel(period)}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-violet-950 dark:text-violet-50">
          {formatArs(sharedTotalArs)}
        </p>
        <Meter
          total={sharedTotalArs}
          prevTotal={sharedPrevTotalArs}
          prevPeriod={prevPeriod}
          accent="violet"
        />
      </div>

      {liveCats.length > 0 && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Este mes
          </p>
          <ul className="space-y-2.5">
            {liveCats.map((c) => {
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
                        className="h-full rounded-full transition-all duration-500"
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
