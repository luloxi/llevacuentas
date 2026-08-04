"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, formatArs, formatUsd, formatDateAr } from "@/lib/utils";
import { formatPeriodLabel, formatPeriodShort } from "@/lib/period-label";
import {
  LoadingBlock,
  SegmentedControl,
  StatTile,
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
};

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
      ...months.map((x) => Math.max(x.balanceArs, x.chargesCombined, x.paymentsCombined)),
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
    .map((m, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(m.balanceArs).toFixed(1)}`)
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

        {/* Payments as green bars (down) / charges as amber thin marks via balance line */}
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
            Deuda al cierre: {formatArs(months[hover]!.balanceArs)}
          </p>
        </div>
      )}
    </div>
  );
}

export function DeudaView() {
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [chartMonths, setChartMonths] = useState<MonthRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"evolucion" | "pagos">("evolucion");

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

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Deuda estimada actual"
            value={formatArs(Math.max(summary.currentBalanceArs, 0))}
            hint={
              summary.currentBalanceUsd !== 0
                ? `+ ${formatUsd(Math.abs(summary.currentBalanceUsd))} en USD`
                : undefined
            }
            tone="danger"
          />
          <StatTile
            label="Total pagado"
            value={formatArs(summary.totalPaidArs)}
            hint={
              summary.totalPaidUsd > 0
                ? `+ ${formatUsd(summary.totalPaidUsd)} en USD`
                : undefined
            }
            tone="brand"
          />
          <StatTile
            label="Pico de deuda"
            value={formatArs(summary.peakBalanceArs)}
            hint={`en ${summary.monthCount} meses con datos`}
          />
        </div>
      )}

      <p className="rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
        La deuda se estima sumando cargos del resumen y restando pagos (y
        créditos/devoluciones). USD se convierten al TC compra de fin de mes.
        Es una aproximación a partir de los movimientos importados.
      </p>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { id: "evolucion", label: "Evolución" },
          { id: "pagos", label: "Pagos" },
        ]}
      />

      {tab === "evolucion" ? (
        <div className="space-y-4">
          <Surface>
            <h2 className="mb-2 text-sm font-semibold tracking-tight">
              Deuda mes a mes
            </h2>
            <DebtChart months={chartMonths} />
          </Surface>

          <div className="lc-table-wrap">
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
                      {m.chargesUsd > 0 && (
                        <div className="text-[10px] text-zinc-400">
                          incl. {formatUsd(m.chargesUsd)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatArs(m.paymentsCombined)}
                      {m.paymentsUsd > 0 && (
                        <div className="text-[10px] text-zinc-400">
                          incl. {formatUsd(m.paymentsUsd)}
                        </div>
                      )}
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
        <div className="lc-table-wrap">
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
              {(onlyPayments.length ? onlyPayments : payments).map((p) => (
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
              {payments.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    Todavía no hay pagos en los resúmenes importados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
