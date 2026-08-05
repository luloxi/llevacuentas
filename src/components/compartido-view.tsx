"use client";

import { useEffect, useState } from "react";
import {
  formatArs,
  formatUsd,
  formatDateAr,
  currentPeriodAr,
  cn,
} from "@/lib/utils";
import { formatPeriodLabel, formatPeriodShort } from "@/lib/period-label";
import { LoadingBlock, PageStack } from "@/components/ui";
import { CategoryIcon } from "@/lib/category-icons";
import { colorForCategory } from "@/lib/category-colors";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Copy,
  Minus,
  Users,
} from "lucide-react";

type Member = {
  userId: string;
  name: string;
  paidArs: number;
  pct: number;
};

type Cat = {
  slug: string;
  name: string;
  total: number;
  count: number;
  pct: number;
};

type Expense = {
  id: string;
  date: string;
  description: string;
  amountArs: number | null;
  amountUsd: number | null;
  amountCombined: number;
  categorySlug: string;
  categoryName: string;
  paidByName: string;
};

function firstName(name: string) {
  const n = name.trim();
  return n ? (n.split(/\s+/)[0] ?? n) : "Sin nombre";
}

export function CompartidoView() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState(currentPeriodAr);
  const [prevPeriod, setPrevPeriod] = useState<string | null>(null);
  const [prevTotalArs, setPrevTotalArs] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [total, setTotal] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q =
          period === "all"
            ? "?period=all"
            : `?period=${encodeURIComponent(period)}`;
        const res = await fetch(`/api/stats/compartido${q}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        if (cancelled) return;
        setExpenses(data.expenses ?? []);
        setCategories(data.categories ?? []);
        setPeriods(data.periods ?? []);
        setMembers(data.members ?? []);
        setInviteCode(data.inviteCode ?? "");
        setHouseholdName(data.householdName ?? "");
        setPrevPeriod(data.prevPeriod ?? null);
        setPrevTotalArs(data.prevTotalArs ?? 0);
        setTotal(data.summary?.totalArsCombined ?? 0);
        setExpenseCount(data.summary?.expenseCount ?? 0);
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

  function toggle(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  if (loading && expenses.length === 0 && total === 0) {
    return <LoadingBlock label="Cargando hogar…" />;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
        {error}
      </p>
    );
  }

  const delta =
    prevTotalArs > 0 ? ((total - prevTotalArs) / prevTotalArs) * 100 : null;
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
    prevTotalArs > 0
      ? Math.min(120, (total / prevTotalArs) * 100)
      : total > 0
        ? 100
        : 0;

  return (
    <PageStack>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {householdName || "Hogar"}
              </h1>
              <p className="text-xs text-zinc-500">Gastos compartidos</p>
            </div>
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
          {period !== "all" && !periods.includes(period) && (
            <option value={period}>{formatPeriodLabel(period)}</option>
          )}
        </select>
      </div>

      {/* Big counter + meter vs prev month */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white/80 p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700/80 dark:text-violet-400/80">
          {period === "all" ? "Todos los meses" : formatPeriodLabel(period)}
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
          {formatArs(total)}
        </p>
        {period !== "all" && (
          <div className="relative mx-auto mt-3 max-w-[240px]">
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  barPct >= 100
                    ? "bg-gradient-to-r from-amber-500 to-orange-500"
                    : "bg-gradient-to-r from-violet-500 to-fuchsia-400",
                )}
                style={{ width: `${Math.min(100, barPct)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-2 text-sm text-zinc-500">
              {prevPeriod && (
                <span className="tabular-nums">
                  {formatPeriodShort(prevPeriod)} · {formatArs(prevTotalArs)}
                </span>
              )}
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
        )}
        {expenseCount > 0 && (
          <p className="mt-2 text-xs text-zinc-400">
            {expenseCount} gasto{expenseCount === 1 ? "" : "s"} compartido
            {expenseCount === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {/* Who paid — % of total only, no debt */}
      {members.some((m) => m.paidArs > 0) && (
        <div className="rounded-2xl border border-zinc-200/90 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Quién pagó
          </p>
          <ul className="space-y-3">
            {members
              .filter((m) => m.paidArs > 0)
              .sort((a, b) => b.paidArs - a.paidArs)
              .map((m) => (
                <li key={m.userId} className="text-sm">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="font-medium">{firstName(m.name)}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{formatArs(m.paidArs)}</span>
                      <span className="ml-1.5 text-xs text-zinc-400">
                        {m.pct.toFixed(0)}% del total
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
                      style={{
                        width: `${Math.min(Math.max(m.pct, 0), 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Categories expandable */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Por categoría
          </p>
        </div>
        {categories.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            No hay gastos marcados como <strong>Hogar</strong> en este período.
            En Gastos cambiá el tipo a “Hogar”.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categories.map((c) => {
              const open = expanded.has(c.slug);
              const list = expenses.filter((e) => e.categorySlug === c.slug);
              const color = colorForCategory(c.slug);
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => toggle(c.slug)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-violet-50/40 dark:hover:bg-violet-950/20"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-zinc-400 transition",
                        open && "rotate-180",
                      )}
                    />
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${color}18`, color }}
                    >
                      <CategoryIcon slug={c.slug} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {c.name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {c.count}× · {c.pct.toFixed(0)}%
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatArs(c.total)}
                    </span>
                  </button>
                  {open && (
                    <ul className="space-y-1.5 bg-zinc-50/80 px-3 py-2 dark:bg-zinc-950/50">
                      {list.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-start justify-between gap-2 rounded-xl border border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug">
                              {e.description}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {formatDateAr(e.date)} · {firstName(e.paidByName)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {e.amountArs != null && e.amountArs > 0 && (
                              <p className="text-sm font-semibold tabular-nums">
                                {formatArs(e.amountArs)}
                              </p>
                            )}
                            {e.amountUsd != null && e.amountUsd > 0 && (
                              <p className="text-xs tabular-nums text-sky-700 dark:text-sky-300">
                                {formatUsd(e.amountUsd)}
                              </p>
                            )}
                            {e.amountArs == null && e.amountUsd == null && (
                              <p className="text-sm tabular-nums">
                                {formatArs(e.amountCombined)}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Invite */}
      {inviteCode && (
        <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Código de invitación
          </p>
          <button
            type="button"
            onClick={() => void copyInvite()}
            className="mt-1 inline-flex items-center gap-2 font-mono text-base font-bold tracking-widest"
          >
            {inviteCode}
            <Copy className="h-3.5 w-3.5 text-zinc-400" />
          </button>
          <p className="text-xs text-zinc-500">
            {copied ? "¡Copiado!" : "Tocá para copiar"}
          </p>
        </div>
      )}
    </PageStack>
  );
}
