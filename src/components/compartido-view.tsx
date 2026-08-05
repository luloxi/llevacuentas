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
import { LoadingBlock, PageStack, SegmentedControl } from "@/components/ui";
import { HogarCharts } from "@/components/hogar-charts";
import { CategoryIcon } from "@/lib/category-icons";
import { colorForCategory } from "@/lib/category-colors";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Copy,
  LayoutList,
  LineChart,
  Link2,
  Minus,
  UserPlus,
  Users,
  X,
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

type ReceiptItem = {
  id: string;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  productCategory: string | null;
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
  hasTicket: boolean;
  receiptItems: ReceiptItem[];
};

function firstName(name: string) {
  const n = name.trim();
  return n ? (n.split(/\s+/)[0] ?? n) : "Sin nombre";
}

export function CompartidoView() {
  const [viewTab, setViewTab] = useState<"vista" | "charts">("vista");
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ticketOpen, setTicketOpen] = useState<Set<string>>(new Set());

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

  const inviteLink =
    typeof window !== "undefined" && inviteCode
      ? `${window.location.origin}/onboarding?invite=${encodeURIComponent(inviteCode)}`
      : inviteCode
        ? `/onboarding?invite=${encodeURIComponent(inviteCode)}`
        : "";

  async function copyText(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  function toggleCat(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleTicket(id: string) {
    setTicketOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading && expenses.length === 0 && total === 0 && viewTab === "vista") {
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
      <div className="flex justify-end">
        <SegmentedControl
          value={viewTab}
          onChange={setViewTab}
          options={[
            {
              id: "vista",
              label: "Vista",
              icon: <LayoutList className="h-3.5 w-3.5" />,
            },
            {
              id: "charts",
              label: "Gráficos",
              icon: <LineChart className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          <Users className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">
          {householdName || "Hogar"}
        </h1>
        {inviteCode && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-300/80 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invitar
          </button>
        )}
      </div>

      {viewTab === "charts" ? (
        <HogarCharts />
      ) : (
        <>
          <div className="flex w-full items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="lc-input min-w-0 flex-1"
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

          {/* Hero indicator — violet like Home */}
          <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50 to-white p-5 text-center shadow-sm dark:border-violet-900/50 dark:from-violet-950/40 dark:to-[var(--surface)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Hogar · {period === "all" ? "Todos" : formatPeriodLabel(period)}
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-violet-950 dark:text-violet-50">
              {formatArs(total)}
            </p>
            {period !== "all" && (
              <div className="relative mx-auto mt-3 max-w-[240px]">
                <div className="h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950">
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
                <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] text-violet-700/70 dark:text-violet-300/70">
                  {prevPeriod && (
                    <span className="tabular-nums">
                      vs {formatPeriodShort(prevPeriod)} · {formatArs(prevTotalArs)}
                    </span>
                  )}
                  {delta != null && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 font-medium",
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
              <p className="mt-2 text-xs text-violet-600/60 dark:text-violet-400/60">
                {expenseCount} gasto{expenseCount === 1 ? "" : "s"} compartido
                {expenseCount === 1 ? "" : "s"}
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-violet-200/60 bg-[var(--surface)] dark:border-violet-900/40">
            <div className="border-b border-violet-100 px-4 py-3 dark:border-violet-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600/80 dark:text-violet-400/80">
                Por categoría
              </p>
            </div>
            {categories.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted-fg)]">
                No hay gastos marcados como <strong>Hogar</strong> en este período.
                En Gastos cambiá el tipo a “Hogar”.
              </p>
            ) : (
              <ul className="divide-y divide-violet-100/80 dark:divide-violet-900/30">
                {categories.map((c) => {
                  const open = expanded.has(c.slug);
                  const list = expenses.filter((e) => e.categorySlug === c.slug);
                  const color = colorForCategory(c.slug);
                  return (
                    <li key={c.slug}>
                      <button
                        type="button"
                        onClick={() => toggleCat(c.slug)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-violet-50/50 dark:hover:bg-violet-950/25"
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-violet-400 transition",
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
                          <span className="text-xs text-[var(--muted-fg)]">
                            {c.count}× · {c.pct.toFixed(0)}%
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-violet-950 dark:text-violet-100">
                          {formatArs(c.total)}
                        </span>
                      </button>
                      {open && (
                        <ul className="space-y-1.5 bg-violet-50/40 px-3 py-2 dark:bg-violet-950/20">
                          {list.map((e) => {
                            const ticketShown = ticketOpen.has(e.id);
                            const hasItems = e.receiptItems?.length > 0;
                            return (
                              <li
                                key={e.id}
                                className={cn(
                                  "rounded-xl border bg-[var(--surface)]",
                                  e.hasTicket
                                    ? "border-violet-300 dark:border-violet-800"
                                    : "border-violet-100 dark:border-violet-900/40",
                                )}
                              >
                                <div className="flex items-start justify-between gap-2 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium leading-snug">
                                      {e.description}
                                      {e.hasTicket && (
                                        <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                                          Ticket
                                        </span>
                                      )}
                                    </p>
                                    <p className="mt-0.5 text-xs text-[var(--muted-fg)]">
                                      {formatDateAr(e.date)} ·{" "}
                                      {firstName(e.paidByName)}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    {e.amountArs != null && e.amountArs > 0 && (
                                      <p className="text-sm font-semibold tabular-nums">
                                        {formatArs(e.amountArs)}
                                      </p>
                                    )}
                                    {e.amountUsd != null && e.amountUsd > 0 && (
                                      <p className="text-xs tabular-nums text-emerald-700 dark:text-emerald-300">
                                        {formatUsd(e.amountUsd)}
                                      </p>
                                    )}
                                    {e.amountArs == null &&
                                      e.amountUsd == null && (
                                        <p className="text-sm tabular-nums">
                                          {formatArs(e.amountCombined)}
                                        </p>
                                      )}
                                  </div>
                                </div>
                                {hasItems && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => toggleTicket(e.id)}
                                      className="flex w-full items-center justify-center gap-1 border-t border-violet-100 py-1.5 text-xs font-medium text-violet-700 dark:border-violet-900 dark:text-violet-300"
                                    >
                                      {ticketShown ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                      {ticketShown
                                        ? "Ocultar ítems"
                                        : `Ver ${e.receiptItems.length} ítems`}
                                    </button>
                                    {ticketShown && (
                                      <ul className="space-y-1.5 border-t border-violet-100 bg-violet-50/50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
                                        {e.receiptItems.map((it) => (
                                          <li
                                            key={it.id}
                                            className="flex items-start justify-between gap-2 text-sm"
                                          >
                                            <div className="min-w-0">
                                              <p className="leading-snug">
                                                {it.name}
                                              </p>
                                              {it.productCategory && (
                                                <p className="text-[11px] text-[var(--muted-fg)]">
                                                  {it.productCategory}
                                                </p>
                                              )}
                                            </div>
                                            <span className="shrink-0 tabular-nums text-[var(--muted-fg)]">
                                              {it.quantity && it.quantity !== 1
                                                ? `${it.quantity}× `
                                                : ""}
                                              {formatArs(it.lineTotal)}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {members.some((m) => m.paidArs > 0) && (
            <div className="rounded-2xl border border-violet-200/60 bg-[var(--surface)] p-4 dark:border-violet-900/40">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600/80 dark:text-violet-400/80">
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
                          <span className="font-semibold text-violet-950 dark:text-violet-100">
                            {formatArs(m.paidArs)}
                          </span>
                          <span className="ml-1.5 text-xs text-[var(--muted-fg)]">
                            {m.pct.toFixed(0)}% del total
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950">
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
        </>
      )}

      {inviteOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={() => setInviteOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-violet-200 bg-white p-5 shadow-2xl dark:border-violet-900 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                  Invitar
                </p>
                <h2 className="mt-0.5 text-lg font-bold tracking-tight">
                  Sumá alguien al hogar
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                <p className="text-xs font-medium text-zinc-500">Código</p>
                <p className="mt-1 font-mono text-xl font-bold tracking-widest">
                  {inviteCode}
                </p>
                <button
                  type="button"
                  onClick={() => void copyText(inviteCode, "code")}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === "code" ? "¡Copiado!" : "Copiar código"}
                </button>
              </div>

              {inviteLink && (
                <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                  <p className="text-xs font-medium text-zinc-500">Link</p>
                  <p className="mt-1 break-all text-xs text-zinc-600 dark:text-zinc-300">
                    {inviteLink}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyText(inviteLink, "link")}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {copied === "link" ? "¡Copiado!" : "Copiar link"}
                  </button>
                </div>
              )}

              <p className="text-xs leading-relaxed text-zinc-500">
                Quien se una con el código o el link entra a este hogar y puede
                ver los gastos compartidos.
              </p>
            </div>
          </div>
        </div>
      )}
    </PageStack>
  );
}
