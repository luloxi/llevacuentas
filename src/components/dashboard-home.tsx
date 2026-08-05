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
  Moon,
  Sun,
  Users,
} from "lucide-react";
import { formatArs, cn } from "@/lib/utils";
import { formatPeriodLabel, formatPeriodShort } from "@/lib/period-label";
import { CategoryIcon } from "@/lib/category-icons";
import { colorForCategory } from "@/lib/category-colors";
import { useTheme } from "@/components/theme-provider";

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
  "#5a9a88",
  "#7eb8a8",
  "#c4a574",
  "#8a9bb5",
  "#a88bb0",
];

function SpendBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
      aria-hidden
    >
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2 + (i % 3) * 0.15;
        const dist = 40 + (i % 4) * 14;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist - 8;
        const size = 4 + (i % 3);
        const color = BURST_COLORS[i % BURST_COLORS.length]!;
        const delay = (i % 4) * 30;
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

function VsPrevMeter({
  total,
  prevTotal,
  prevPeriod,
}: {
  total: number;
  prevTotal: number;
  prevPeriod: string;
}) {
  if (prevTotal <= 0 && total <= 0) return null;

  const diff = total - prevTotal;
  const pct =
    prevTotal > 0 ? (total / prevTotal) * 100 : total > 0 ? 100 : 0;
  const barPct = Math.min(100, pct);
  const over = pct > 100;

  const DiffIcon =
    Math.abs(diff) < 1 ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const diffColor =
    Math.abs(diff) < 1
      ? "text-[var(--muted-fg)]"
      : diff > 0
        ? "text-amber-700 dark:text-amber-400"
        : "text-[var(--brand-fg)]";

  return (
    <div className="mt-2.5 space-y-1.5">
      <div className="relative h-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            over ? "bg-amber-500/90" : "bg-[var(--brand)]",
          )}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-[var(--muted-fg)]">
          vs {formatPeriodShort(prevPeriod)}{" "}
          <span className="tabular-nums font-medium text-[var(--foreground)]/70">
            {formatArs(prevTotal)}
          </span>
        </span>
        {prevTotal > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums",
              diffColor,
            )}
          >
            <DiffIcon className="h-3 w-3" />
            {diff > 0 ? "+" : ""}
            {formatArs(diff)}
            <span className="ml-0.5 opacity-70">
              ({Math.abs(pct - 100).toFixed(0)}%
              {diff > 0 ? " más" : diff < 0 ? " menos" : ""})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function TapHint() {
  return (
    <ChevronRight
      className="h-4 w-4 shrink-0 text-[var(--border-strong)] transition group-hover:text-[var(--muted-fg)]"
      aria-hidden
    />
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-fg)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
      aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={resolved === "dark" ? "Tema claro" : "Tema oscuro"}
    >
      {resolved === "dark" ? (
        <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
      ) : (
        <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
    </button>
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted-fg)]">
            Hola, {firstName}
          </p>
          <p className="text-xs font-medium capitalize text-[var(--muted-fg)]/80">
            {formatPeriodLabel(period)}
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* 1. Tus gastos */}
      <Link
        href="/consumos?tab=lista"
        className="group relative block rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 transition active:scale-[0.99]"
        aria-label={`Tus gastos, ${formatArs(Math.round(displayTotal))}`}
      >
        <SpendBurst active={burst} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-fg)]">
              Tus gastos
            </p>
            <p
              className={cn(
                "mt-1 text-3xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]",
                pop && "lc-amount-pop",
              )}
            >
              {formatArs(Math.round(displayTotal))}
            </p>
            {liveCount > 0 && (
              <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted-fg)]">
                {liveCount} movimiento{liveCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <TapHint />
        </div>
        <VsPrevMeter
          total={liveTotal}
          prevTotal={prevTotalArs}
          prevPeriod={prevPeriod}
        />
      </Link>

      {/* 2. Por categoría */}
      {liveCats.length > 0 && (
        <Link
          href="/consumos?tab=resumen"
          className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 transition active:scale-[0.99]"
          aria-label="Gastos por categoría"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-fg)]">
              Por categoría
            </p>
            <TapHint />
          </div>
          <ul className="space-y-2">
            {liveCats.map((c) => {
              const color = colorForCategory(c.slug);
              return (
                <li key={c.id} className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${color}14`, color }}
                  >
                    <CategoryIcon slug={c.slug} size={13} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]/80">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--muted-fg)]">
                    {formatArs(c.total)}
                  </span>
                  <div className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div
                      className="h-full rounded-full opacity-80"
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

      {/* 3. Hogar */}
      <Link
        href="/compartido"
        className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 transition active:scale-[0.99]"
        aria-label={`Hogar ${formatArs(sharedTotalArs)}`}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted-fg)]">
            <Users className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-fg)]">
                  Hogar
                </p>
                <p className="text-lg font-semibold tabular-nums tracking-tight text-[var(--foreground)]">
                  {formatArs(sharedTotalArs)}
                </p>
              </div>
              <TapHint />
            </div>
            <VsPrevMeter
              total={sharedTotalArs}
              prevTotal={sharedPrevTotalArs}
              prevPeriod={prevPeriod}
            />
          </div>
        </div>
      </Link>

      {/* 4. Deuda */}
      <Link
        href="/deuda"
        className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 transition active:scale-[0.99]"
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
              ? "bg-[var(--brand-soft)] text-[var(--brand-fg)]"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
          )}
        >
          <Landmark className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-fg)]">
            Deuda
          </p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums tracking-tight",
              debtSettled
                ? "text-[var(--brand-fg)]"
                : "text-red-800 dark:text-red-200",
            )}
          >
            {debtSettled ? "Saldada" : formatArs(debtBalanceArs)}
          </p>
        </div>
        <TapHint />
      </Link>
    </div>
  );
}
