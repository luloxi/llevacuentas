"use client";

import { useEffect, useMemo, useState } from "react";
import { formatArs, formatUsd } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { colorForCategory } from "@/lib/category-colors";
import {
  LoadingBlock,
  PageStack,
  StatTile,
  Surface,
} from "@/components/ui";
import { Copy, Users } from "lucide-react";

type Member = { userId: string; name: string; paidArs: number };

type MonthCat = {
  slug: string;
  name: string;
  amountArs: number;
  amountUsd: number;
  amountArsCombined: number;
  count: number;
  pct: number;
};

type MonthBlock = {
  period: string;
  totalArs: number;
  totalUsd: number;
  totalArsCombined: number;
  totalCount: number;
  usdRate: { buy: number; asOf: string } | null;
  categories: MonthCat[];
};

export function CompartidoView() {
  const [months, setMonths] = useState<MonthBlock[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [summary, setSummary] = useState<{
    totalArsCombined: number;
    fairSharePerMember: number;
    memberCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q =
          period && period !== "all"
            ? `?period=${encodeURIComponent(period)}`
            : "";
        const res = await fetch(`/api/stats/compartido${q}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        if (cancelled) return;
        setMonths(data.months ?? []);
        setPeriods(data.periods ?? []);
        setMembers(data.members ?? []);
        setInviteCode(data.inviteCode ?? "");
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
  }, [period]);

  const grandCats = useMemo(() => {
    const map = new Map<
      string,
      { slug: string; name: string; amount: number; count: number }
    >();
    for (const m of months) {
      for (const c of m.categories) {
        const cur = map.get(c.slug) ?? {
          slug: c.slug,
          name: c.name,
          amount: 0,
          count: 0,
        };
        cur.amount += c.amountArsCombined;
        cur.count += c.count;
        cur.name = c.name;
        map.set(c.slug, cur);
      }
    }
    const total = [...map.values()].reduce((s, c) => s + c.amount, 0);
    return [...map.values()]
      .map((c) => ({
        ...c,
        pct: total > 0 ? (c.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [months]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (loading && months.length === 0) {
    return <LoadingBlock label="Cargando gastos compartidos…" />;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
        {error}
      </p>
    );
  }

  return (
    <PageStack>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Hogar compartido</h1>
            <p className="text-xs text-zinc-500">Presupuesto entre miembros</p>
          </div>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="lc-input"
        >
          <option value="all">Todos los meses</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {formatPeriodLabel(p)}
            </option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Total compartido"
            value={formatArs(summary.totalArsCombined)}
            hint={
              period === "all" ? "todos los meses" : formatPeriodLabel(period)
            }
            tone="violet"
          />
          <StatTile
            label="Por persona (partes iguales)"
            value={formatArs(summary.fairSharePerMember)}
            hint={`${summary.memberCount} ${summary.memberCount === 1 ? "miembro" : "miembros"}`}
          />
          <div className="rounded-2xl border border-zinc-200/90 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Invitación
            </p>
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="mt-1.5 inline-flex items-center gap-2 font-mono text-lg font-bold tracking-widest transition hover:text-violet-700 dark:hover:text-violet-300"
            >
              {inviteCode || "—"}
              <Copy className="h-3.5 w-3.5 text-zinc-400" />
            </button>
            <p className="mt-1 text-xs text-zinc-500">
              {copied ? "¡Copiado!" : "Tocá para copiar el código"}
            </p>
          </div>
        </div>
      )}

      <p className="rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
        Solo gastos marcados como <strong>compartidos</strong> (súper, hogar,
        etc.). Sirve para armar el presupuesto del hogar. No muestra deudas
        entre personas.
      </p>

      {/* Who paid shared — contribution, not debt */}
      {members.length > 0 && (
        <Surface>
          <h2 className="text-sm font-semibold tracking-tight">
            Quién registró / pagó
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Aporte de cada miembro en gastos compartidos (informativo).
          </p>
          <ul className="mt-3 space-y-3">
            {members.map((m) => {
              const pct =
                summary && summary.totalArsCombined > 0
                  ? (m.paidArs / summary.totalArsCombined) * 100
                  : 0;
              return (
                <li key={m.userId} className="text-sm">
                  <div className="mb-1.5 flex justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="tabular-nums text-zinc-600">
                      {formatArs(m.paidArs)}
                      <span className="ml-1 text-xs text-zinc-400">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {/* Category breakdown */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/80 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="border-b border-zinc-100 bg-gradient-to-r from-violet-50/80 to-transparent px-4 py-3 dark:border-zinc-800 dark:from-violet-950/30">
          <h2 className="font-semibold tracking-tight">
            {period === "all"
              ? "Por categoría (todos los meses)"
              : `Por categoría · ${formatPeriodLabel(period)}`}
          </h2>
        </div>
        {grandCats.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">
            No hay gastos compartidos en este período. En Consumos marcá gastos
            como “compartido”.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left">Categoría</th>
                <th className="px-4 py-2 text-right">Total $</th>
                <th className="px-4 py-2 text-right">Cant.</th>
                <th className="px-4 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grandCats.map((c) => (
                <tr key={c.slug}>
                  <td className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: colorForCategory(c.slug) }}
                      />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {formatArs(c.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {c.count}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{
                            width: `${Math.max(c.pct > 0 ? 2 : 0, Math.min(c.pct, 100))}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 tabular-nums text-zinc-600">
                        {c.pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Per-month cards when viewing all */}
      {period === "all" && months.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Detalle por mes
          </p>
          {months.map((m) => (
            <details
              key={m.period}
              className="group overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/80 shadow-sm open:shadow-md dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 transition hover:bg-violet-50/50 dark:hover:bg-violet-950/20">
                <span className="font-medium capitalize">
                  {formatPeriodLabel(m.period)}
                </span>
                <span className="tabular-nums text-sm font-semibold">
                  {formatArs(m.totalArsCombined)}
                  {m.totalUsd > 0 && (
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      {formatUsd(m.totalUsd)}
                    </span>
                  )}
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-2 pb-3 dark:border-zinc-800">
                <ul className="space-y-1 pt-2">
                  {m.categories.map((c) => (
                    <li
                      key={c.slug}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: colorForCategory(c.slug),
                          }}
                        />
                        {c.name}
                        <span className="text-xs text-zinc-400">
                          ×{c.count}
                        </span>
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatArs(c.amountArsCombined)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      )}
    </PageStack>
  );
}
