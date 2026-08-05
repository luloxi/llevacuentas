"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn, formatArs, formatUsd, formatDateAr } from "@/lib/utils";
import { formatPeriodLabel, formatPeriodShort } from "@/lib/period-label";
import {
  LoadingBlock,
  SegmentedControl,
  Surface,
} from "@/components/ui";

type MonthRow = {
  period: string;
  chargesArs: number;
  chargesUsd: number;
  chargesCombined: number;
  paymentsArs: number;
  paymentsUsd: number;
  paymentsCombined: number;
  creditsCombined: number;
  net: number;
  balanceArs: number;
  balanceUsd: number;
  chargeCount: number;
  paymentCount: number;
  creditCount: number;
  usdRate: { buy: number; asOf: string; source: string } | null;
};

type PaymentRow = {
  id: string;
  date: string;
  description: string;
  amountArs: number | null;
  amountUsd: number | null;
  kind: "payment" | "credit";
};

type Summary = {
  currentBalanceArs: number;
  currentBalanceUsd: number;
  peakBalanceArs: number;
  totalPaidArs: number;
  totalPaidUsd: number;
  totalChargesArs: number;
  totalChargesUsd: number;
  monthCount: number;
  monthsPaidInFull?: number;
  settled?: boolean;
};

type DebtTab = "evolucion" | "pagos";

function tabFromParam(raw: string | null): DebtTab {
  return raw === "pagos" ? "pagos" : "evolucion";
}

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 32, left: 52 };

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * exp;
}

function DebtChart({ months }: { months: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const max = useMemo(() => {
    const m = Math.max(
      ...months.map((x) =>
        Math.max(x.balanceArs, x.chargesCombined, x.paymentsCombined),
      ),
      0,
    );
    return niceMax(m);
  }, [months]);

  if (months.length === 0) return null;

  const scaleX = (i: number) =>
    months.length <= 1
      ? PAD.left + chartW / 2
      : PAD.left + (i / (months.length - 1)) * chartW;
  const scaleY = (v: number) =>
    PAD.top + chartH - (Math.max(v, 0) / max) * chartH;

  const balPath = months
    .map(
      (m, i) =>
        `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(m.balanceArs).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + chartH * (1 - f);
          return (
            <g key={f}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                className="stroke-zinc-200 dark:stroke-zinc-800"
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-zinc-400 text-[10px]"
              >
                {max * f >= 1_000_000
                  ? `${(max * f) / 1_000_000}M`
                  : max * f >= 1000
                    ? `${Math.round((max * f) / 1000)}k`
                    : Math.round(max * f)}
              </text>
            </g>
          );
        })}

        {months.map((m, i) => {
          const x = scaleX(i);
          const barW = Math.max(4, chartW / months.length / 3);
          const payH = (m.paymentsCombined / max) * chartH;
          return (
            <rect
              key={`p-${m.period}`}
              x={x - barW / 2}
              y={PAD.top + chartH - payH}
              width={barW}
              height={Math.max(payH, 0)}
              className="fill-emerald-500/40"
              rx={2}
            />
          );
        })}

        <path
          d={balPath}
          fill="none"
          stroke="#dc2626"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {months.map((m, i) => (
          <g key={m.period}>
            <circle
              cx={scaleX(i)}
              cy={scaleY(m.balanceArs)}
              r={hover === i ? 5 : 3}
              className="fill-red-600"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            <rect
              x={scaleX(i) - chartW / months.length / 2}
              y={PAD.top}
              width={chartW / Math.max(months.length, 1)}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            <text
              x={scaleX(i)}
              y={H - 10}
              textAnchor="middle"
              className="fill-zinc-500 text-[9px]"
            >
              {formatPeriodShort(m.period)}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-red-600" /> Deuda estimada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-emerald-500/40" /> Pagos del mes
        </span>
      </div>

      {hover != null && months[hover] && (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-semibold capitalize">
            {formatPeriodLabel(months[hover]!.period)}
          </p>
          <p>Cargos: {formatArs(months[hover]!.chargesCombined)}</p>
          <p>Pagos: {formatArs(months[hover]!.paymentsCombined)}</p>
          <p className="font-medium">
            Deuda al cierre: {formatArs(Math.max(months[hover]!.balanceArs, 0))}
          </p>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "brand" | "danger";
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-xl border px-2.5 py-2 text-center",
        tone === "danger" &&
          "border-red-200/80 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/30",
        tone === "brand" &&
          "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30",
        tone === "neutral" &&
          "border-zinc-200/90 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/60",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums tracking-tight sm:text-base",
          tone === "danger" && "text-red-800 dark:text-red-200",
          tone === "brand" && "text-emerald-900 dark:text-emerald-100",
          tone === "neutral" && "text-zinc-900 dark:text-zinc-50",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MonthCard({ m }: { m: MonthRow }) {
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold capitalize tracking-tight">
            {formatPeriodLabel(m.period)}
          </p>
          <p className="text-[11px] text-zinc-400">
            {m.chargeCount} cargos · {m.paymentCount} pagos
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Cierre
          </p>
          <p className="text-base font-bold tabular-nums">
            {formatArs(Math.max(m.balanceArs, 0))}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-amber-50 px-2 py-1.5 dark:bg-amber-950/30">
          <p className="text-[10px] font-medium uppercase text-amber-700/80 dark:text-amber-300/80">
            Cargos
          </p>
          <p className="text-xs font-semibold tabular-nums text-amber-900 dark:text-amber-100">
            {formatArs(m.chargesCombined)}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/30">
          <p className="text-[10px] font-medium uppercase text-emerald-700/80 dark:text-emerald-300/80">
            Pagos
          </p>
          <p className="text-xs font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
            {formatArs(m.paymentsCombined)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl px-2 py-1.5",
            m.net > 0
              ? "bg-red-50 dark:bg-red-950/30"
              : m.net < 0
                ? "bg-emerald-50 dark:bg-emerald-950/30"
                : "bg-zinc-50 dark:bg-zinc-900",
          )}
        >
          <p className="text-[10px] font-medium uppercase text-zinc-500">Neto</p>
          <p
            className={cn(
              "text-xs font-semibold tabular-nums",
              m.net > 0
                ? "text-red-700 dark:text-red-300"
                : m.net < 0
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-zinc-600",
            )}
          >
            {m.net > 0 ? "+" : ""}
            {formatArs(m.net)}
          </p>
        </div>
      </div>
    </li>
  );
}

export function DeudaView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [chartMonths, setChartMonths] = useState<MonthRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DebtTab>(() =>
    tabFromParam(searchParams.get("tab")),
  );

  useEffect(() => {
    setTab(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  const onTab = useCallback(
    (v: DebtTab) => {
      setTab(v);
      router.replace(`/deuda?tab=${v}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/stats/deuda", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        if (cancelled) return;
        setMonths(data.months ?? []);
        setChartMonths(data.chartMonths ?? []);
        setPayments(data.payments ?? []);
        setSummary(data.summary ?? null);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingBlock label="Calculando deuda y pagos…" />;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
        {error}
      </p>
    );
  }

  const onlyPayments = payments.filter((p) => p.kind === "payment");
  const settled = summary?.settled || (summary?.currentBalanceArs ?? 0) <= 0;
  const paymentRows = onlyPayments.length ? onlyPayments : payments;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <SegmentedControl
          value={tab}
          onChange={onTab}
          options={[
            { id: "evolucion", label: "Evolución" },
            { id: "pagos", label: "Pagos" },
          ]}
        />
      </div>

      {summary && (
        <div className="flex gap-2">
          <MiniStat
            label={settled ? "Estado" : "Deuda"}
            value={
              settled
                ? "Saldada"
                : formatArs(Math.max(summary.currentBalanceArs, 0))
            }
            tone={settled ? "brand" : "danger"}
          />
          <MiniStat
            label="Pagado"
            value={formatArs(summary.totalPaidArs)}
            tone="brand"
          />
          <MiniStat label="Pico" value={formatArs(summary.peakBalanceArs)} />
        </div>
      )}

      <p className="text-[11px] leading-snug text-zinc-500">
        Solo vos ves esto · cargos y pagos tuyos (sin Hogar ni otros). USD al TC
        de fin de mes.
      </p>

      {tab === "evolucion" ? (
        <div className="space-y-3">
          <Surface>
            <h2 className="mb-2 text-sm font-semibold tracking-tight">
              Deuda mes a mes
            </h2>
            <DebtChart months={chartMonths} />
          </Surface>

          <ul className="space-y-2 md:hidden">
            {months.map((m) => (
              <MonthCard key={m.period} m={m} />
            ))}
            {months.length === 0 && (
              <li className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
                Todavía no hay meses con datos.
              </li>
            )}
          </ul>

          <div className="lc-table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-left">Mes</th>
                  <th className="px-3 py-2.5 text-right">Cargos</th>
                  <th className="px-3 py-2.5 text-right">Pagos</th>
                  <th className="px-3 py-2.5 text-right">Neto</th>
                  <th className="px-3 py-2.5 text-right">Deuda al cierre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {months.map((m) => (
                  <tr key={m.period}>
                    <td className="px-3 py-2.5 font-medium capitalize">
                      {formatPeriodLabel(m.period)}
                      <div className="text-[10px] font-normal text-zinc-400">
                        {m.chargeCount} cargos · {m.paymentCount} pagos
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-800 dark:text-amber-200">
                      {formatArs(m.chargesCombined)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatArs(m.paymentsCombined)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums font-medium",
                        m.net > 0
                          ? "text-red-600"
                          : m.net < 0
                            ? "text-emerald-600"
                            : "text-zinc-500",
                      )}
                    >
                      {m.net > 0 ? "+" : ""}
                      {formatArs(m.net)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {formatArs(Math.max(m.balanceArs, 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {paymentRows.map((p) => (
              <li
                key={p.id}
                className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">
                      {p.description}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatDateAr(p.date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        p.kind === "payment"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
                      )}
                    >
                      {p.kind === "payment" ? "Pago" : "Crédito"}
                    </span>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {p.amountArs != null
                        ? formatArs(Math.abs(p.amountArs))
                        : p.amountUsd != null
                          ? formatUsd(Math.abs(p.amountUsd))
                          : "—"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {paymentRows.length === 0 && (
              <li className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
                Todavía no hay pagos en tus resúmenes importados.
              </li>
            )}
          </ul>

          <div className="lc-table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-left">Fecha</th>
                  <th className="px-3 py-2.5 text-left">Descripción</th>
                  <th className="px-3 py-2.5 text-left">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {paymentRows.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                      {formatDateAr(p.date)}
                    </td>
                    <td className="px-3 py-2 font-medium">{p.description}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          p.kind === "payment"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
                        )}
                      >
                        {p.kind === "payment" ? "Pago" : "Crédito"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                      {p.amountArs != null
                        ? formatArs(Math.abs(p.amountArs))
                        : p.amountUsd != null
                          ? formatUsd(Math.abs(p.amountUsd))
                          : "—"}
                    </td>
                  </tr>
                ))}
                {paymentRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-zinc-500"
                    >
                      Todavía no hay pagos en tus resúmenes importados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
