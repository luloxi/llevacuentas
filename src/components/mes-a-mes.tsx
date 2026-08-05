"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LineChart,
  LayoutList,
} from "lucide-react";
import { cn, formatArs, formatUsd, currentPeriodAr } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { colorForCategory } from "@/lib/category-colors";
import { CategoryLinesChart, TotalSpendChart } from "@/components/spend-charts";
import { MesAMesTxRow } from "@/components/mes-a-mes-tx-row";
import {
  EmptyState,
  LoadingBlock,
  PageStack,
  Surface,
  Toast,
} from "@/components/ui";

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
  totalArs: number;
  totalUsd: number;
  totalArsFromUsd?: number;
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
  return `TC compra ${dateLabel}: ${formatArs(rate.buy)} / USD`;
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

/** Resumen / gráficos — embebe en Gastos via mode. */
export function MesAMesView({
  mode = "resumen",
}: {
  mode?: "resumen" | "charts";
}) {
  const [filterPeriod, setFilterPeriod] = useState<string>(currentPeriodAr);
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
  const [periodReady, setPeriodReady] = useState(false);

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
      const loadedPeriods: string[] = data.periods ?? [];
      setPeriods(loadedPeriods);
      setMonths(data.months ?? []);
      setChart(data.chart ?? null);
      setCategories(data.categories ?? []);

      setFilterPeriod((prev) => {
        if (prev !== "all" && loadedPeriods.includes(prev)) return prev;
        const now = currentPeriodAr();
        if (loadedPeriods.includes(now)) return now;
        if (loadedPeriods.length > 0) return loadedPeriods[0]!;
        return now;
      });
      setPeriodReady(true);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (mode !== "resumen" || !periodReady) {
      if (mode !== "resumen") setTxs([]);
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
  }, [mode, filterPeriod, periodReady]);

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
  const canPrev = periodIndex >= 0 && periodIndex < periods.length - 1;
  const canNext = periodIndex > 0;

  function goPrev() {
    if (!canPrev) return;
    setFilterPeriod(periods[periodIndex + 1]!);
  }
  function goNext() {
    if (!canNext) return;
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

  if (loading && months.length === 0 && !chart) {
    return <LoadingBlock label="Calculando análisis…" />;
  }

  if (error && months.length === 0) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </p>
    );
  }

  const emptyHint = (
    <EmptyState
      icon={<LayoutList className="h-7 w-7" />}
      title="Todavía no hay datos"
      description="Importá el resumen de la tarjeta o cargá gastos para ver el análisis."
    />
  );

  if (mode === "charts") {
    return (
      <div className="space-y-4">
        {periods.length === 0 ? emptyHint : <ChartsPanel chart={chart} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {periods.length > 0 && (
        <div className="flex w-full items-center gap-2">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="lc-input min-w-0 flex-1"
          >
            <option value="all">Todos los meses</option>
            {periods.map((p) => (
              <option key={p} value={p}>
                {formatPeriodLabel(p)}
              </option>
            ))}
          </select>
          {filterPeriod !== "all" && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev}
                aria-label="Mes anterior"
                className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext}
                aria-label="Mes siguiente"
                className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {toast && <Toast>{toast}</Toast>}
      {error && months.length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
          {error}
        </p>
      )}

      {periods.length === 0 ? (
        emptyHint
      ) : filterPeriod === "all" ? (
        <MonthDetail
          month={grand}
          isGrand
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
          expanded={expanded}
          onToggle={toggleExpand}
          txsByCat={txsByCat}
          categories={categories}
          txsLoading={txsLoading}
          savingId={savingId}
          onChangeCategory={changeCategory}
        />
      ) : (
        <p className="text-sm text-zinc-500">
          Sin movimientos en {formatPeriodLabel(filterPeriod)}. Elegí otro mes o
          "Todos los meses".
        </p>
      )}
    </div>
  );
}

function ChartsPanel({ chart }: { chart: ChartData | null }) {
  if (!chart || chart.periods.length === 0) {
    return (
      <EmptyState
        icon={<LineChart className="h-7 w-7" />}
        title="Sin datos para graficar"
        description="Cuando haya movimientos, vas a ver la evolución acá."
      />
    );
  }
  return (
    <div className="space-y-4">
      <Surface>
        <h3 className="mb-1 text-sm font-semibold tracking-tight">
          Gasto total por mes
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          En pesos (los dólares se convierten al tipo de cambio de fin de mes).
        </p>
        <TotalSpendChart totals={chart.totals} />
      </Surface>
      <Surface>
        <h3 className="mb-1 text-sm font-semibold tracking-tight">
          Por categoría
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          Tocá una categoría para mostrarla u ocultarla.
        </p>
        <CategoryLinesChart
          periods={chart.periods}
          byCategory={chart.byCategory}
        />
      </Surface>
    </div>
  );
}

function TotalRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "sky" | "strong";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2",
        tone === "sky" &&
          "bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
        tone === "strong" &&
          "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50",
        tone === "default" && "text-zinc-700 dark:text-zinc-200",
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums tracking-tight">{value}</span>
    </div>
  );
}

function MonthDetail({
  month,
  isGrand = false,
  expanded,
  onToggle,
  txsByCat,
  categories,
  txsLoading,
  savingId,
  onChangeCategory,
}: {
  month: MonthBlock;
  isGrand?: boolean;
  expanded: Set<string>;
  onToggle: (slug: string) => void;
  txsByCat: Map<string, Tx[]>;
  categories: CategoryOpt[];
  txsLoading: boolean;
  savingId: string | null;
  onChangeCategory: (txId: string, categoryId: string) => void;
}) {
  const combined = monthTotalArs(month);
  const rateLabel = formatUsdRateLabel(month.usdRate);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border backdrop-blur",
        isGrand
          ? "border-emerald-400/70 bg-white/80 shadow-lg shadow-emerald-600/10 dark:border-emerald-500/50 dark:bg-zinc-950/70 dark:shadow-emerald-900/20"
          : "border-zinc-200/90 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60",
      )}
    >
      <div className="space-y-1.5 border-b border-zinc-100 px-3 py-3 dark:border-zinc-800 sm:px-4">
        <TotalRow label="Pesos" value={formatArs(month.totalArs)} />
        <TotalRow label="Dólares" value={formatUsd(month.totalUsd)} tone="sky" />
        <TotalRow label="Neto" value={formatArs(combined)} tone="strong" />
        <p className="px-1 text-[10px] leading-snug text-zinc-400">
          Neto = pesos + dólares convertidos al TC del mes
        </p>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {month.categories.map((c) => {
          const open = expanded.has(c.slug);
          const list = txsByCat.get(c.slug) ?? [];
          const catCombined =
            c.amountArsCombined ?? c.amountArs + (c.amountArsFromUsd ?? 0);
          return (
            <div key={c.slug + c.name}>
              <button
                type="button"
                onClick={() => onToggle(c.slug)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
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
                  <span className="shrink-0 text-xs text-zinc-500">{c.count}×</span>
                </span>
                <span className="ml-auto text-right">
                  <span className="block text-sm font-semibold tabular-nums">
                    {catCombined > 0 ? formatArs(catCombined) : "—"}
                  </span>
                </span>
                <span className="w-full space-y-0.5 pl-9 text-xs">
                  {c.amountArs > 0 && (
                    <span className="mr-3 inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
                      <span className="font-semibold text-zinc-500">Pesos:</span>
                      {formatArs(c.amountArs)}
                    </span>
                  )}
                  {c.amountUsd > 0 && (
                    <span className="mr-3 inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
                      <span className="font-semibold">Dólares:</span>
                      {formatUsd(c.amountUsd)}
                    </span>
                  )}
                  <span className="text-zinc-400">{c.pct.toFixed(1)}% del mes</span>
                </span>
              </button>

              {open && (
                <div className="border-t border-zinc-100 bg-zinc-50/80 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/50 sm:px-4">
                  {txsLoading && list.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-zinc-500">Cargando gastos…</p>
                  ) : list.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-zinc-500">
                      No hay gastos listados en esta categoría.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((t) => (
                        <MesAMesTxRow
                          key={t.id}
                          t={t}
                          categories={categories}
                          savingId={savingId}
                          onChangeCategory={onChangeCategory}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-zinc-100 px-4 py-3 text-center dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          {month.totalCount} movimiento{month.totalCount === 1 ? "" : "s"}
          {isGrand ? " en total" : ""}
        </p>
        {rateLabel && (
          <p className="mt-1 text-[11px] text-zinc-400">{rateLabel}</p>
        )}
      </div>
    </section>
  );
}
