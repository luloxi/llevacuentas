"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LineChart,
} from "lucide-react";
import { cn, formatArs, formatUsd, formatDateAr } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { colorForCategory } from "@/lib/category-colors";
import { CategoryLinesChart, TotalSpendChart } from "@/components/spend-charts";

type CategoryOpt = { id: string; slug: string; name: string };

type UsdRate = {
  buy: number;
  asOf: string;
  source: string;
} | null;

type MonthCat = {
  slug: string;
  name: string;
  categoryId: string | null;
  amountArs: number;
  amountUsd: number;
  amountArsFromUsd?: number;
  amountArsCombined?: number;
  count: number;
  pct: number;
};

type MonthBlock = {
  period: string;
  /** Native ARS only */
  totalArs: number;
  totalUsd: number;
  /** USD → ARS at month-end buy rate */
  totalArsFromUsd?: number;
  /** Final total in pesos (ARS + USD convertidos) */
  totalArsCombined?: number;
  totalCount: number;
  usdRate?: UsdRate;
  categories: MonthCat[];
};

function monthTotalArs(m: MonthBlock): number {
  return m.totalArsCombined ?? m.totalArs + (m.totalArsFromUsd ?? 0);
}

function formatUsdRateLabel(rate: UsdRate | undefined): string | null {
  if (!rate || !(rate.buy > 0)) return null;
  const [y, mo, d] = rate.asOf.split("-");
  const dateLabel = d && mo && y ? `${d}/${mo}/${y}` : rate.asOf;
  return `TC compra ${dateLabel}: ${formatArs(rate.buy)}`;
}

type ChartData = {
  periods: string[];
  totals: Array<{ period: string; amountArs: number; amountUsd?: number }>;
  byCategory: Array<{
    slug: string;
    name: string;
    series: Array<{ period: string; amountArs: number }>;
    totalArs: number;
  }>;
};

type Tx = {
  id: string;
  date: string;
  descriptionNormalized: string;
  amountArs: number | null;
  amountUsd: number | null;
  isPayment?: boolean;
  category: CategoryOpt | null;
};

type ViewMode = "month" | "all" | "charts";

export function MesAMesView() {
  const [mode, setMode] = useState<ViewMode>("all");
  const [periods, setPeriods] = useState<string[]>([]);
  const [periodIndex, setPeriodIndex] = useState(0); // 0 = latest
  const [months, setMonths] = useState<MonthBlock[]>([]);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [txsLoading, setTxsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const currentPeriod = periods[periodIndex] ?? "";

  const statsQuery = useMemo(() => {
    if (mode === "all" || mode === "charts") return "all";
    if (currentPeriod) return currentPeriod;
    return ""; // latest
  }, [mode, currentPeriod]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params =
        statsQuery === "all"
          ? "?period=all"
          : statsQuery
            ? `?period=${encodeURIComponent(statsQuery)}`
            : "";
      const res = await fetch(`/api/stats/mes-a-mes${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar el análisis");
        return;
      }
      setPeriods(data.periods ?? []);
      setMonths(data.months ?? []);
      setChart(data.chart ?? null);
      setCategories(data.categories ?? []);

      // Keep periodIndex in range; default to latest (0)
      if (data.periods?.length) {
        setPeriodIndex((i) =>
          Math.min(Math.max(i, 0), data.periods.length - 1),
        );
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [statsQuery]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Load transactions for current month (expand + recategorize)
  useEffect(() => {
    if (mode !== "month" || !currentPeriod) {
      setTxs([]);
      return;
    }
    let cancelled = false;
    async function loadTxs() {
      setTxsLoading(true);
      try {
        const res = await fetch(
          `/api/transactions?period=${encodeURIComponent(currentPeriod)}`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setTxs(
            (data.transactions as Tx[]).filter(
              (t) =>
                !t.isPayment &&
                (t.amountArs != null || t.amountUsd != null),
            ),
          );
          if (data.categories?.length) setCategories(data.categories);
        }
      } finally {
        if (!cancelled) setTxsLoading(false);
      }
    }
    void loadTxs();
    setExpanded(new Set());
    return () => {
      cancelled = true;
    };
  }, [mode, currentPeriod]);

  const txsByCat = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const t of txs) {
      const slug = t.category?.slug ?? "uncategorized";
      if (!map.has(slug)) map.set(slug, []);
      map.get(slug)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.date.localeCompare(a.date));
    }
    return map;
  }, [txs]);

  function goPrev() {
    // periods[0] is latest; higher index = older
    setPeriodIndex((i) => Math.min(i + 1, periods.length - 1));
  }
  function goNext() {
    setPeriodIndex((i) => Math.max(i - 1, 0));
  }

  function toggleExpand(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function changeCategory(txId: string, categoryId: string) {
    setSavingId(txId);
    setToast(null);
    const prev = txs;
    const cat =
      categories.find((c) => c.id === categoryId) ??
      (categoryId ? null : null);
    setTxs((list) =>
      list.map((t) =>
        t.id === txId
          ? {
              ...t,
              category: cat
                ? { id: cat.id, slug: cat.slug, name: cat.name }
                : null,
            }
          : t,
      ),
    );
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: txId, categoryId: categoryId || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTxs(prev);
        setError(data?.error || "No se pudo guardar");
        return;
      }
      if (data?.similarUpdated > 0) {
        setToast(
          `Categoría actualizada. También ${data.similarUpdated} gasto(s) similar(es).`,
        );
      }
      // Refresh aggregates so amounts move between categories
      void loadStats();
      // Reload txs for accurate grouping
      const res2 = await fetch(
        `/api/transactions?period=${encodeURIComponent(currentPeriod)}`,
        { credentials: "include" },
      );
      if (res2.ok) {
        const d2 = await res2.json();
        setTxs(
          (d2.transactions as Tx[]).filter(
            (t) =>
              !t.isPayment &&
              (t.amountArs != null || t.amountUsd != null),
          ),
        );
      }
    } catch {
      setTxs(prev);
      setError("Error de red al guardar");
    } finally {
      setSavingId(null);
    }
  }

  if (loading && months.length === 0 && !chart) {
    return <p className="text-sm text-zinc-500">Calculando análisis…</p>;
  }

  if (error && months.length === 0 && !chart) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </p>
    );
  }

  const single =
    mode === "month"
      ? (months.find((m) => m.period === currentPeriod) ??
        (months[0]?.period === currentPeriod || !currentPeriod
          ? months[0]
          : undefined) ??
        null)
      : null;
  const monthStale =
    mode === "month" &&
    Boolean(currentPeriod) &&
    single != null &&
    single.period !== currentPeriod;

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-inner dark:border-zinc-700/80 dark:bg-zinc-900/80">
          {(
            [
              { id: "month" as const, label: "Por mes", icon: CalendarDays },
              { id: "all" as const, label: "Todos", icon: LayoutGrid },
              { id: "charts" as const, label: "Gráficos", icon: LineChart },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                mode === id
                  ? "bg-white text-emerald-700 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:text-emerald-400 dark:ring-white/10"
                  : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {mode === "month" && periods.length > 0 && (
          <select
            value={currentPeriod}
            onChange={(e) => {
              const idx = periods.indexOf(e.target.value);
              if (idx >= 0) setPeriodIndex(idx);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                {formatPeriodLabel(p)}
              </option>
            ))}
          </select>
        )}
      </div>

      {toast && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {toast}
        </p>
      )}
      {error && months.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </p>
      )}

      {periods.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Todavía no hay datos. Importá el resumen de la tarjeta.
        </p>
      ) : mode === "charts" ? (
        <ChartsPanel chart={chart} />
      ) : mode === "all" ? (
        <AllMonthsView months={months} />
      ) : loading || monthStale ? (
        <p className="text-sm text-zinc-500">Cargando mes…</p>
      ) : single ? (
        <MonthDetail
          month={single}
          canPrev={periodIndex < periods.length - 1}
          canNext={periodIndex > 0}
          onPrev={goPrev}
          onNext={goNext}
          expanded={expanded}
          onToggle={toggleExpand}
          txsByCat={txsByCat}
          categories={categories}
          txsLoading={txsLoading}
          savingId={savingId}
          onChangeCategory={changeCategory}
        />
      ) : (
        <p className="text-sm text-zinc-500">Sin datos para este mes.</p>
      )}
    </div>
  );
}

function AllMonthsView({ months }: { months: MonthBlock[] }) {
  const grand = useMemo(() => {
    const bySlug = new Map<
      string,
      {
        slug: string;
        name: string;
        amountArs: number;
        amountUsd: number;
        amountArsFromUsd: number;
        amountArsCombined: number;
        count: number;
      }
    >();
    let totalArs = 0;
    let totalUsd = 0;
    let totalArsFromUsd = 0;
    let totalCount = 0;

    for (const m of months) {
      totalArs += m.totalArs;
      totalUsd += m.totalUsd;
      totalArsFromUsd += m.totalArsFromUsd ?? 0;
      totalCount += m.totalCount;
      for (const c of m.categories) {
        const fromUsd = c.amountArsFromUsd ?? 0;
        const combined = c.amountArsCombined ?? c.amountArs + fromUsd;
        const cur = bySlug.get(c.slug) ?? {
          slug: c.slug,
          name: c.name,
          amountArs: 0,
          amountUsd: 0,
          amountArsFromUsd: 0,
          amountArsCombined: 0,
          count: 0,
        };
        cur.amountArs += c.amountArs;
        cur.amountUsd += c.amountUsd;
        cur.amountArsFromUsd += fromUsd;
        cur.amountArsCombined += combined;
        cur.count += c.count;
        if (c.name) cur.name = c.name;
        bySlug.set(c.slug, cur);
      }
    }

    const totalArsCombined = totalArs + totalArsFromUsd;
    const categories = [...bySlug.values()]
      .map((c) => ({
        ...c,
        categoryId: null as string | null,
        pct:
          totalArsCombined > 0
            ? (c.amountArsCombined / totalArsCombined) * 100
            : 0,
      }))
      .sort((a, b) => b.amountArsCombined - a.amountArsCombined);

    return {
      period: "total",
      totalArs,
      totalUsd,
      totalArsFromUsd,
      totalArsCombined,
      totalCount,
      categories,
    } satisfies MonthBlock;
  }, [months]);

  if (months.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Todavía no hay datos. Importá el resumen de la tarjeta.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <MonthSummaryCard
        month={grand}
        title="Total de todos los meses"
        subtitle={`${months.length} ${months.length === 1 ? "mes" : "meses"} · ${grand.totalCount} movimientos · USD al TC compra fin de cada mes`}
        variant="grand"
        showUsd
      />
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Por mes
        </p>
        {months.map((m) => (
          <MonthSummaryCard
            key={m.period}
            month={m}
            showUsd
          />
        ))}
      </div>
    </div>
  );
}

function ChartsPanel({ chart }: { chart: ChartData | null }) {
  if (!chart || chart.periods.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Sin datos para graficar.</p>
    );
  }
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="mb-1 text-sm font-semibold">Gasto total por mes</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Evolución en pesos (incluye USD convertidos al TC compra de fin de
          mes).
        </p>
        <TotalSpendChart totals={chart.totals} />
      </section>
      <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="mb-1 text-sm font-semibold">Por categoría</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Tocá una categoría para mostrarla u ocultarla. Pasá el mouse sobre el
          gráfico para ver montos.
        </p>
        <CategoryLinesChart
          periods={chart.periods}
          byCategory={chart.byCategory}
        />
      </section>
    </div>
  );
}

function MonthSummaryCard({
  month,
  title,
  subtitle,
  variant = "month",
  showUsd = false,
}: {
  month: MonthBlock;
  title?: string;
  subtitle?: string;
  variant?: "month" | "grand";
  /** Always show $ and USD columns (recommended for grand total). */
  showUsd?: boolean;
}) {
  const isGrand = variant === "grand";
  const withUsd = showUsd || isGrand || month.totalUsd > 0;
  const textSize = isGrand ? "text-sm sm:text-base" : "text-sm";
  const totalPesos = monthTotalArs(month);
  const rateLabel = formatUsdRateLabel(month.usdRate);
  const pesosNative = month.totalArs;
  const pesosFromUsd = month.totalArsFromUsd ?? 0;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border",
        isGrand
          ? "border-2 border-emerald-500/80 shadow-sm shadow-emerald-500/10 dark:border-emerald-400/70 dark:shadow-emerald-900/20"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3",
          isGrand
            ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/40"
            : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
        )}
      >
        <div className="min-w-0">
          <h3
            className={cn(
              "text-lg font-semibold capitalize",
              isGrand && "text-emerald-900 dark:text-emerald-100",
            )}
          >
            {title ?? formatPeriodLabel(month.period)}
          </h3>
          <p className="text-xs text-zinc-500">
            {subtitle ?? `${month.totalCount} movimientos`}
            {rateLabel ? ` · ${rateLabel}` : ""}
          </p>
          {!isGrand && pesosFromUsd > 0 && (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {formatArs(pesosNative)} en $ + {formatArs(pesosFromUsd)} por USD
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-x-5 gap-y-1 text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Total pesos
            </p>
            <p
              className={cn(
                "font-semibold tabular-nums",
                isGrand
                  ? "text-xl text-emerald-800 dark:text-emerald-200"
                  : "text-base",
              )}
            >
              {formatArs(totalPesos)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Total dólares
            </p>
            <p
              className={cn(
                "font-semibold tabular-nums",
                isGrand
                  ? "text-xl text-emerald-800 dark:text-emerald-200"
                  : "text-base text-zinc-700 dark:text-zinc-200",
              )}
            >
              {formatUsd(month.totalUsd)}
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className={cn("min-w-full", textSize)}>
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Categoría</th>
              <th className="px-4 py-2.5 text-right whitespace-nowrap">
                Total $
              </th>
              <th className="px-4 py-2.5 text-right whitespace-nowrap">
                Pesos
              </th>
              {withUsd && (
                <th className="px-4 py-2.5 text-right whitespace-nowrap">
                  Dólares
                </th>
              )}
              <th className="px-4 py-2.5 text-right">Cant.</th>
              <th className="min-w-[7rem] px-4 py-2.5 text-right">% del total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {month.categories.map((c) => {
              const combined =
                c.amountArsCombined ??
                c.amountArs + (c.amountArsFromUsd ?? 0);
              return (
              <tr
                key={c.slug + c.name}
                className={cn(isGrand && "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20")}
              >
                <td className="px-4 py-2.5 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForCategory(c.slug) }}
                    />
                    <span className="min-w-0">{c.name}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold">
                  {combined > 0 ? formatArs(combined) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-zinc-600">
                  {c.amountArs > 0 ? formatArs(c.amountArs) : "—"}
                </td>
                {withUsd && (
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                    {c.amountUsd > 0 ? formatUsd(c.amountUsd) : "—"}
                  </td>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">
                  {c.count}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-100 sm:w-20 dark:bg-zinc-800">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          isGrand ? "bg-emerald-500" : "bg-zinc-400",
                        )}
                        style={{
                          width: `${Math.max(c.pct > 0 ? 2 : 0, Math.min(c.pct, 100))}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 tabular-nums text-zinc-600">
                      {c.pct < 0.1 && c.pct > 0
                        ? "<0.1%"
                        : `${c.pct.toFixed(1)}%`}
                    </span>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthDetail({
  month,
  canPrev,
  canNext,
  onPrev,
  onNext,
  expanded,
  onToggle,
  txsByCat,
  categories,
  txsLoading,
  savingId,
  onChangeCategory,
}: {
  month: MonthBlock;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  expanded: Set<string>;
  onToggle: (slug: string) => void;
  txsByCat: Map<string, Tx[]>;
  categories: CategoryOpt[];
  txsLoading: boolean;
  savingId: string | null;
  onChangeCategory: (txId: string, categoryId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h3 className="text-lg font-semibold capitalize">
            {formatPeriodLabel(month.period)}
          </h3>
          <p className="text-xs text-zinc-500">
            {month.totalCount} movimientos · tocá una categoría para ver los
            gastos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <div className="font-semibold tabular-nums">
              {formatArs(monthTotalArs(month))}
            </div>
            <div className="text-zinc-500 tabular-nums">
              {formatUsd(month.totalUsd)}
            </div>
            {formatUsdRateLabel(month.usdRate) && (
              <div className="text-[10px] text-zinc-400">
                {formatUsdRateLabel(month.usdRate)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Mes anterior"
              className="rounded-lg border border-zinc-200 p-2 text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Mes siguiente"
              className="rounded-lg border border-zinc-200 p-2 text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {month.categories.map((c) => {
          const open = expanded.has(c.slug);
          const list = txsByCat.get(c.slug) ?? [];
          return (
            <div key={c.slug + c.name}>
              <button
                type="button"
                onClick={() => onToggle(c.slug)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-zinc-400 transition",
                    open && "rotate-180",
                  )}
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForCategory(c.slug) }}
                />
                <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                <span className="hidden text-xs text-zinc-500 sm:inline">
                  {c.count} {c.count === 1 ? "gasto" : "gastos"}
                </span>
                <span className="w-28 text-right text-sm tabular-nums font-medium">
                  {c.amountArs > 0 ? formatArs(c.amountArs) : "—"}
                </span>
                <span className="w-14 text-right text-xs tabular-nums text-zinc-500">
                  {c.pct.toFixed(1)}%
                </span>
              </button>

              {open && (
                <div className="border-t border-zinc-100 bg-zinc-50/60 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/40 sm:px-4">
                  {txsLoading && list.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-zinc-500">
                      Cargando gastos…
                    </p>
                  ) : list.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-zinc-500">
                      No hay gastos listados en esta categoría.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((t) => (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-zinc-900"
                        >
                          <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-500">
                            {formatDateAr(t.date)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {t.descriptionNormalized}
                          </span>
                          <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                            {t.amountArs != null
                              ? formatArs(Math.abs(t.amountArs))
                              : t.amountUsd != null
                                ? formatUsd(Math.abs(t.amountUsd))
                                : "—"}
                          </span>
                          <select
                            value={t.category?.id ?? ""}
                            disabled={savingId === t.id}
                            onChange={(e) =>
                              onChangeCategory(t.id, e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                            className="max-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                          >
                            <option value="">Sin categoría</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
