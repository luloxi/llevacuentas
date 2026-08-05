"use client";

import { useEffect, useState } from "react";
import {
  formatArs,
  formatUsd,
  formatDateAr,
  currentPeriodAr,
  cn,
} from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import {
  LoadingBlock,
  PageStack,
  StatTile,
  Surface,
} from "@/components/ui";
import { Copy, Users } from "lucide-react";

type Member = { userId: string; name: string; paidArs: number };

type Balance = {
  userId: string;
  name: string;
  paidArs: number;
  fairShare: number;
  delta: number;
};

type Expense = {
  id: string;
  date: string;
  description: string;
  amountArs: number | null;
  amountUsd: number | null;
  amountCombined: number;
  categoryName: string;
  categorySlug: string;
  paidByUserId: string | null;
  paidByName: string;
};

function firstName(name: string) {
  const n = name.trim();
  return n ? (n.split(/\s+/)[0] ?? n) : "Sin nombre";
}

export function CompartidoView() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState(currentPeriodAr);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [summary, setSummary] = useState<{
    totalArsCombined: number;
    fairSharePerMember: number;
    memberCount: number;
    expenseCount: number;
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
            : period === "all"
              ? "?period=all"
              : "";
        const res = await fetch(`/api/stats/compartido${q}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        if (cancelled) return;
        setExpenses(data.expenses ?? []);
        setPeriods(data.periods ?? []);
        setMembers(data.members ?? []);
        setBalances(data.balances ?? []);
        setInviteCode(data.inviteCode ?? "");
        setSummary(data.summary ?? null);

        // If current month has no shared data yet, still keep it selected
        const loaded: string[] = data.periods ?? [];
        if (period !== "all" && period && !loaded.includes(period) && loaded.length) {
          // keep current period empty state — user can switch
        }
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

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (loading && expenses.length === 0 && !summary) {
    return <LoadingBlock label="Cargando gastos del hogar…" />;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
        {error}
      </p>
    );
  }

  const periodLabel =
    period === "all" ? "todos los meses" : formatPeriodLabel(period);

  return (
    <PageStack>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Hogar</h1>
            <p className="text-xs text-zinc-500">Gastos compartidos · quién pagó</p>
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
          {/* Ensure current month appears even with no data yet */}
          {period !== "all" && !periods.includes(period) && (
            <option value={period}>{formatPeriodLabel(period)}</option>
          )}
        </select>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Total hogar"
            value={formatArs(summary.totalArsCombined)}
            hint={`${summary.expenseCount} gasto${summary.expenseCount === 1 ? "" : "s"} · ${periodLabel}`}
            tone="violet"
          />
          <StatTile
            label="Por persona"
            value={formatArs(summary.fairSharePerMember)}
            hint={`${summary.memberCount} ${summary.memberCount === 1 ? "miembro" : "miembros"} · partes iguales`}
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
              {copied ? "¡Copiado!" : "Tocá para copiar"}
            </p>
          </div>
        </div>
      )}

      {/* Balance: only who paid how much */}
      {balances.length > 0 && (
        <Surface>
          <h2 className="text-sm font-semibold tracking-tight">Balance</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cuánto puso cada uno en {periodLabel}.
          </p>
          <ul className="mt-3 space-y-3">
            {balances.map((m) => {
              const pct =
                summary && summary.totalArsCombined > 0
                  ? (m.paidArs / summary.totalArsCombined) * 100
                  : 0;
              const over = m.delta > 1;
              const under = m.delta < -1;
              return (
                <li key={m.userId} className="text-sm">
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{firstName(m.name)}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                        {formatArs(m.paidArs)}
                      </span>
                      <span className="ml-1 text-xs text-zinc-400">
                        ({pct.toFixed(0)}%)
                      </span>
                      {(over || under) && summary && summary.memberCount > 1 && (
                        <span
                          className={cn(
                            "ml-2 text-xs font-medium",
                            over
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {over ? "+" : ""}
                          {formatArs(m.delta)} vs parte
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500"
                      style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {/* Expense list — like home, with who paid */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold tracking-tight">
            Gastos del hogar
          </h2>
          <p className="text-xs text-zinc-500">{periodLabel}</p>
        </div>

        {expenses.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            No hay gastos marcados como <strong>Hogar</strong> en este período.
            En Gastos cambiá el tipo a “Hogar”.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {e.description}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatDateAr(e.date)}
                    {e.categoryName ? ` · ${e.categoryName}` : ""}
                  </p>
                  <p className="mt-1 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                    {firstName(e.paidByName)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {e.amountArs != null
                      ? formatArs(e.amountArs)
                      : e.amountUsd != null
                        ? formatUsd(e.amountUsd)
                        : formatArs(e.amountCombined)}
                  </p>
                  {e.amountArs != null && e.amountUsd != null && (
                    <p className="text-xs tabular-nums text-zinc-500">
                      {formatUsd(e.amountUsd)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageStack>
  );
}
