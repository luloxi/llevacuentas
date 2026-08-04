"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Landmark,
  LineChart,
  LayoutList,
} from "lucide-react";
import { cn, formatArs, formatUsd, formatDateAr } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { colorForCategory } from "@/lib/category-colors";
import { CategoryLinesChart, TotalSpendChart } from "@/components/spend-charts";
import { DeudaView } from "@/components/deuda-view";

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

type MainTab = "resumen" | "charts" | "deuda";

function aggregateMonths(months: MonthBlock[]): MonthBlock {
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
  };
}

export function MesAMesView() {
  const [mainTab, setMainTab] = useState<MainTab>("resumen");
  /** "all" or YYYY-MM */
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [periods, setPeriods] = useState<string[]>([]);
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

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats/mes-a-mes?period=all`, {
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
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Load transactions for expand + recategorize (one month or all)
  useEffect(() => {
    if (mainTab !== "resumen") {
      setTxs([]);
      return;
    }
    let cancelled = false;
    async function loadTxs() {
      setTxsLoading(true);
      try {
        const q =
          filterPeriod && filterPeriod !== "all"
            ? `?period=${encodeURIComponent(filterPeriod)}`
            : "";
        const res = await fetch(`/api/transactions${q}`, {
          credentials: "include",
        });
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
  }, [mainTab, filterPeriod]);

  const grand = useMemo(() => aggregateMonths(months), [months]);

  const selectedMonth = useMemo(() => {
    if (filterPeriod === "all") return null;
    return months.find((m) => m.period === filterPeriod) ?? null;
  }, [months, filterPeriod]);

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

  const periodIndex = periods.indexOf(filterPeriod);

  function goPrev() {
    if (periodIndex < 0 || periodIndex >= periods.length - 1) return;
    setFilterPeriod(periods[periodIndex + 1]!);
  }
  function goNext() {
    if (periodIndex <= 0) return;
    setFilterPeriod(periods[periodIndex - 1]!);
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
    const cat = categories.find((c) => c.id === categoryId) ?? null;
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
      void loadStats();
      const q =
        filterPeriod && filterPeriod !== "all"
          ? `?period=${encodeURIComponent(filterPeriod)}`
          : "";
      const res2 = await fetch(`/api/transactions${q}`, {
        credentials: "include",
      });
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

  if (loading && months.length === 0 && !chart && mainTab !== "deuda") {
    return <p className="text-sm text-zinc-500">Calculando análisis…</p>;
  }

  if (error && months.length === 0 && mainTab !== "deuda") {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-inner dark:border-zinc-700/80 dark:bg-zinc-900/80">
          {(
            [
              { id: "resumen" as const, label: "Resumen", icon: LayoutList },
              { id: "charts" as const, label: "Gráficos", icon: LineChart },
              { id: "deuda" as const, label: "Deuda", icon: Landmark },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMainTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                mainTab === id
                  ? "bg-white text-emerald-700 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:text-emerald-400 dark:ring-white/10"
                  : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {mainTab === "resumen" && periods.length > 0 && (
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">Todos los meses</option>
            {periods.map((p) => (
              <option key={p} value={p}>
                {formatPeriodLabel(p)}
              </option>
            ))}
          </select>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 right-4 z-50 max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg md:bottom-6 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
        >
          {toast}
        </div>
      )}
      {error && months.length > 0 && mainTab === "resumen" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </p>
      )}

      {mainTab === "deuda" ? (
        <DeudaView />
      ) : mainTab === "charts" ? (
        periods.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todavía no hay datos. Importá el resumen de la tarjeta.
          </p>
        ) : (
          <ChartsPanel chart={chart} />
        )
      ) : periods.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Todavía no hay datos. Importá el resumen de la tarjeta.
        </p>
      ) : filterPeriod === "all" ? (
        <MonthDetail
          month={grand}
          title="Resumen de gastos"
          subtitle={`${months.length} ${months.length === 1 ? "mes" : "meses"} · ${grand.totalCount} movimientos · tocá una categoría para ver y recategorizar · USD al TC compra fin de cada mes`}
          variant="grand"
          canPrev={false}
          canNext={false}
          onPrev={() => {}}
          onNext={() => {}}
          expanded={expanded}
          onToggle={toggleExpand}
          txsByCat={txsByCat}
          categories={categories}
          txsLoading={txsLoading}
          savingId={savingId}
          onChangeCategory={changeCategory}
        />
      ) : selectedMonth ? (
        <MonthDetail
          month={selectedMonth}
          canPrev={periodIndex >= 0 && periodIndex < periods.length - 1}
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

function MonthDetail({
  month,
  title,
  subtitle,
  variant = "month",
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
  title?: string;
  subtitle?: string;
  variant?: "month" | "grand";
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
  const isGrand = variant === "grand";
  const showNav = canPrev || canNext;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border",
        isGrand
          ? "border-2 border-emerald-500/80 shadow-sm shadow-emerald-500/10 dark:border-emerald-400/70"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3",
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
            {subtitle ??
              `${month.totalCount} movimientos · tocá una categoría para ver y recategorizar`}
          </p>
          {formatUsdRateLabel(month.usdRate) && (
            <p className="text-[10px] text-zinc-400">
              {formatUsdRateLabel(month.usdRate)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Total pesos
            </p>
            <div
              className={cn(
                "font-semibold tabular-nums",
                isGrand && "text-xl text-emerald-800 dark:text-emerald-200",
              )}
            >
              {formatArs(monthTotalArs(month))}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Total dólares
            </p>
            <div className="tabular-nums text-zinc-600 dark:text-zinc-300">
              {formatUsd(month.totalUsd)}
            </div>
          </div>
          {showNav && (
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
          )}
        </div>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4.5rem_3.5rem]">
          <span className="pl-9">Categoría</span>
          <span className="text-right">Total $</span>
          <span className="text-right">Pesos</span>
          <span className="text-right">USD</span>
          <span className="text-right">%</span>
        </div>
        {month.categories.map((c) => {
          const open = expanded.has(c.slug);
          const list = txsByCat.get(c.slug) ?? [];
          const combined =
            c.amountArsCombined ?? c.amountArs + (c.amountArsFromUsd ?? 0);
          return (
            <div key={c.slug + c.name}>
              <button
                type="button"
                onClick={() => onToggle(c.slug)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-zinc-50 sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4.5rem_3.5rem] sm:gap-2 dark:hover:bg-zinc-900/50"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
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
                  <span className="min-w-0 truncate font-medium">{c.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500 sm:hidden">
                    {c.count}×
                  </span>
                </span>
                <span className="ml-auto text-right text-sm tabular-nums font-semibold sm:ml-0 sm:w-auto">
                  {combined > 0 ? formatArs(combined) : "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums text-zinc-600 sm:block">
                  {c.amountArs > 0 ? formatArs(c.amountArs) : "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums text-zinc-600 sm:block">
                  {c.amountUsd > 0 ? formatUsd(c.amountUsd) : "—"}
                </span>
                {/* Mobile: show ARS + USD under the name */}
                <span className="w-full pl-9 text-xs tabular-nums text-zinc-500 sm:hidden">
                  {c.amountArs > 0 ? formatArs(c.amountArs) : "— $"}
                  {" · "}
                  {c.amountUsd > 0 ? formatUsd(c.amountUsd) : "— USD"}
                  {" · "}
                  {c.pct.toFixed(1)}%
                </span>
                <span className="hidden text-right text-xs tabular-nums text-zinc-500 sm:block">
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
                      {list.map((t) => {
                        const hasArs =
                          t.amountArs != null &&
                          Number.isFinite(t.amountArs) &&
                          Math.abs(t.amountArs) > 0;
                        const hasUsd =
                          t.amountUsd != null &&
                          Number.isFinite(t.amountUsd) &&
                          Math.abs(t.amountUsd) > 0;
                        return (
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
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            {hasArs && (
                              <span className="inline-flex items-center gap-1.5 tabular-nums">
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                  ARS
                                </span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                                  {formatArs(Math.abs(t.amountArs!))}
                                </span>
                              </span>
                            )}
                            {hasUsd && (
                              <span className="inline-flex items-center gap-1.5 tabular-nums">
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                                  USD
                                </span>
                                <span className="font-medium text-sky-900 dark:text-sky-100">
                                  {formatUsd(Math.abs(t.amountUsd!))}
                                </span>
                              </span>
                            )}
                            {!hasArs && !hasUsd && (
                              <span className="text-zinc-400">—</span>
                            )}
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
                        );
                      })}
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
