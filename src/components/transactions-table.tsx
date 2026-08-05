"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw, Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatArs, formatUsd, formatDateAr, cn, currentPeriodAr, periodFromDateString } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { LoadingBlock, Toast } from "@/components/ui";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };
type ReceiptItem = {
  id: string; name: string; quantity: number | null;
  unitPrice: number | null; lineTotal: number | null; productCategory: string | null;
};
type ReceiptInfo = {
  id: string; merchantName: string | null; receiptDate: string | null;
  totalArs: number | null; items: ReceiptItem[];
};
type Tx = {
  id: string; date: string; descriptionNormalized: string;
  amountArs: number | null; amountUsd: number | null; installment: string | null;
  isPayment: boolean; ownership: "personal" | "shared";
  paidByUserId: string | null; source: string;
  category: Category | null; hasTicket: boolean; receipt: ReceiptInfo | null;
};

const PRODUCT_SUBCATS = [
  "Lácteos","Panadería","Bebidas","Carnes","Verduras","Frutas",
  "Limpieza","Higiene","Snacks","Congelados","Almacén","Otros",
];
const PAGE_SIZES = [5, 10, 25, 50] as const;

function memberLabel(m: Member) {
  const n = m.name.trim();
  return n ? (n.split(/\s+/)[0] ?? n) : "Sin nombre";
}
function categoryLabel(name?: string | null) {
  if (!name) return "—";
  return name.toLowerCase() === "uncategorized" ? "Sin categoría" : name;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(res.ok ? "Respuesta vacía" : `Error ${res.status}`);
  try { return JSON.parse(text) as T; }
  catch {
    throw new Error(`Respuesta inválida (${res.status})`);
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function toSheet(rows: Tx[], members: Member[]) {
  return rows.map((r) => ({
    Fecha: r.date,
    Comercio: r.descriptionNormalized,
    "Monto $": r.amountArs ?? "",
    USD: r.amountUsd ?? "",
    Categoría: categoryLabel(r.category?.name),
    Tipo: r.ownership === "shared" ? "Hogar" : "Personal",
    Pagó: (() => {
      const m = members.find((x) => x.userId === r.paidByUserId);
      return m ? memberLabel(m) : "";
    })(),
    Cuota: r.installment ?? "",
    Ticket: r.hasTicket ? "Sí" : "No",
  }));
}

export function TransactionsTable({ compactToolbar = false }: { compactToolbar?: boolean } = {}) {
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [period, setPeriod] = useState(currentPeriodAr);
  const [allPeriods, setAllPeriods] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (q) params.set("q", q);
    if (uncategorizedOnly) params.set("uncategorized", "1");
    try {
      const res = await fetch(`/api/transactions?${params}`, { credentials: "include" });
      const data = await parseJson<{
        error?: string; transactions?: Tx[]; categories?: Category[]; members?: Member[];
      }>(res);
      if (!res.ok) { setError(data.error || `Error ${res.status}`); return; }
      const list = (data.transactions ?? [])
        .filter((t) => !t.isPayment)
        .map((t) => ({
          ...t,
          ownership: t.ownership === "shared" ? "shared" as const : "personal" as const,
        }));

      // Client-side safety: never show another month when a period is selected
      const filtered = period
        ? list.filter((t) => periodFromDateString(t.date) === period)
        : list;

      setRows(filtered);
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
      setPage(1);

      const fromRows = [...new Set(list.map((r) => periodFromDateString(r.date)))];
      setAllPeriods((prev) => {
        const merged = new Set([...prev, ...fromRows]);
        if (period) merged.add(period);
        return [...merged].sort().reverse();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [period, q, uncategorizedOnly]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/transactions", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await parseJson<{ transactions?: Tx[] }>(res);
        if (cancelled) return;
        const ps = [
          ...new Set(
            (data.transactions ?? [])
              .filter((t) => !t.isPayment)
              .map((r) => periodFromDateString(r.date)),
          ),
        ].sort().reverse();
        setAllPeriods(ps);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function onCreated() {
      void load();
    }
    window.addEventListener("lc:expense-created", onCreated);
    return () => window.removeEventListener("lc:expense-created", onCreated);
  }, [load]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [rows],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null); setSavingId(id);
    const prev = rows;
    const catId = "categoryId" in body ? (body.categoryId as string | null) : undefined;
    const nextCat =
      catId === undefined ? undefined
        : !catId ? null
        : (categories.find((c) => c.id === catId) ?? null);

    setRows((list) => list.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r };
      if (nextCat !== undefined) next.category = nextCat;
      if ("paidByUserId" in body) next.paidByUserId = (body.paidByUserId as string | null) ?? null;
      if ("ownership" in body) {
        next.ownership = body.ownership === "shared" ? "shared" : "personal";
      }
      return next;
    }));

    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setRows(prev); setError(data?.error || "No se pudo guardar"); return; }
      if (data?.learned || body.ownership) setToast("Guardado.");
    } catch {
      setRows(prev); setError("Error de red al guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function patchItem(txId: string, itemId: string, body: { name?: string; productCategory?: string | null }) {
    const prev = rows;
    setRows((list) => list.map((r) => {
      if (r.id !== txId || !r.receipt) return r;
      return {
        ...r,
        receipt: {
          ...r.receipt,
          items: r.receipt.items.map((it) =>
            it.id === itemId
              ? { ...it, name: body.name ?? it.name, productCategory: "productCategory" in body ? (body.productCategory ?? null) : it.productCategory }
              : it,
          ),
        },
      };
    }));
    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemId, ...body }),
      });
      if (!res.ok) setRows(prev);
    } catch { setRows(prev); }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const periods = allPeriods.length
    ? allPeriods
    : [...new Set(rows.map((r) => periodFromDateString(r.date)))].sort().reverse();

  function exportCsv() {
    const ws = XLSX.utils.json_to_sheet(toSheet(sorted, members));
    downloadBlob(`gastos-${period || "todos"}.csv`, new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }));
  }
  function exportXls() {
    const ws = XLSX.utils.json_to_sheet(toSheet(sorted, members));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(`gastos-${period || "todos"}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  return (
    <div className="space-y-4">
      <div className="lc-card flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
        <div className="relative min-w-[140px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comercio…" className="lc-input w-full !pl-9" />
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="lc-input">
          {periods.map((p) => (
            <option key={p} value={p}>{formatPeriodLabel(p)}</option>
          ))}
          <option value="">Todos los períodos</option>
        </select>
        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm", uncategorizedOnly ? "border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40" : "border-zinc-200 dark:border-zinc-700")}>
          <input type="checkbox" checked={uncategorizedOnly} onChange={(e) => setUncategorizedOnly(e.target.checked)} className="h-4 w-4 rounded" />
          Sin cat.
        </label>
        <button type="button" onClick={() => void load()} className="lc-btn lc-btn-secondary">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
        <button type="button" onClick={exportCsv} disabled={!sorted.length} className="lc-btn lc-btn-secondary !px-2.5" title="CSV">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <button type="button" onClick={exportXls} disabled={!sorted.length} className="lc-btn lc-btn-secondary !px-2.5" title="Excel">
          <Download className="h-3.5 w-3.5" /> XLS
        </button>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {toast && <Toast>{toast}</Toast>}

      {loading && !rows.length ? (
        <LoadingBlock label="Cargando consumos…" />
      ) : !sorted.length ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800">
          {period
            ? `No hay gastos en ${formatPeriodLabel(period)}. Probá otro mes o "Todos los períodos".`
            : compactToolbar
              ? "No hay consumos. Usá Agregar o importá el resumen de la tarjeta."
              : "No hay consumos."}
        </p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {pageRows.map((r) => {
              const isTicket = r.hasTicket;
              const isOpen = expanded.has(r.id);
              return (
                <li key={r.id} className={cn("rounded-2xl border p-3", isTicket ? "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{r.descriptionNormalized}</span>
                        {isTicket && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Ticket</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">{formatDateAr(r.date)}{r.installment ? ` · cuota ${r.installment}` : ""}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatArs(r.amountArs)}</p>
                      {r.amountUsd != null && <p className="text-xs tabular-nums text-zinc-500">{formatUsd(r.amountUsd)}</p>}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {isTicket ? (
                      <span className="inline-flex items-center rounded-lg bg-violet-100 px-2 py-1.5 text-xs font-medium text-violet-900 dark:bg-violet-900/50 dark:text-violet-100">{categoryLabel(r.category?.name) || "Supermercado"}</span>
                    ) : (
                      <select value={r.category?.id ?? ""} disabled={savingId === r.id} onChange={(e) => void patch(r.id, { categoryId: e.target.value || null })} className="lc-input !px-2 !py-1.5 text-xs">
                        {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c.name)}</option>)}
                      </select>
                    )}
                    <select
                      value={r.ownership}
                      disabled={savingId === r.id}
                      onChange={(e) => void patch(r.id, { ownership: e.target.value })}
                      className={cn(
                        "lc-input !px-2 !py-1.5 text-xs font-medium",
                        r.ownership === "shared"
                          ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                          : "",
                      )}
                    >
                      <option value="personal">Personal</option>
                      <option value="shared">Hogar</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <select value={r.paidByUserId ?? members[0]?.userId ?? ""} disabled={savingId === r.id || !members.length} onChange={(e) => void patch(r.id, { paidByUserId: e.target.value || null })} className="lc-input w-full !px-2 !py-1.5 text-xs">
                      {members.map((m) => <option key={m.userId} value={m.userId}>{memberLabel(m)}</option>)}
                    </select>
                  </div>
                  {isTicket && (
                    <button type="button" onClick={() => toggleExpand(r.id)} className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {isOpen ? "Ocultar ítems" : "Ver ítems"}
                    </button>
                  )}
                  {isTicket && isOpen && r.receipt && (
                    <div className="mt-2 space-y-2 border-t border-violet-200/80 pt-2 dark:border-violet-900">
                      {r.receipt.items.length === 0 ? (
                        <p className="text-xs text-zinc-500">Sin ítems leídos.</p>
                      ) : r.receipt.items.map((item) => (
                        <div key={item.id} className="space-y-1.5 rounded-lg bg-white/80 p-2 dark:bg-zinc-900/60">
                          <input defaultValue={item.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.name) void patchItem(r.id, item.id, { name: v }); }} className="w-full rounded-md border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
                          <div className="flex items-center gap-2">
                            <select value={item.productCategory ?? ""} onChange={(e) => void patchItem(r.id, item.id, { productCategory: e.target.value || null })} className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900">
                              <option value="">Subcategoría…</option>
                              {PRODUCT_SUBCATS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <span className="shrink-0 text-xs tabular-nums text-zinc-600">{item.quantity && item.quantity !== 1 ? `${item.quantity}× ` : ""}{formatArs(item.lineTotal)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="lc-table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Descripción</th>
                  <th className="px-3 py-2.5">Monto $</th>
                  <th className="px-3 py-2.5">USD</th>
                  <th className="px-3 py-2.5">Categoría</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Pagó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {pageRows.map((r) => {
                  const isTicket = r.hasTicket;
                  const isOpen = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className={isTicket ? "bg-violet-50/80 dark:bg-violet-950/30" : undefined}>
                        <td className="px-2 py-2">
                          {isTicket && (
                            <button type="button" onClick={() => toggleExpand(r.id)} className="rounded p-1 text-violet-700 dark:text-violet-300">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{formatDateAr(r.date)}</td>
                        <td className="max-w-xs px-3 py-2">
                          <span className="truncate font-medium">{r.descriptionNormalized}</span>
                          {isTicket && <span className="ml-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Ticket</span>}
                          {r.installment && <div className="text-xs text-zinc-500">cuota {r.installment}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatArs(r.amountArs)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatUsd(r.amountUsd)}</td>
                        <td className="px-3 py-2">
                          {isTicket ? (
                            <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-medium text-violet-900 dark:bg-violet-900/50 dark:text-violet-100">{categoryLabel(r.category?.name) || "Supermercado"}</span>
                          ) : (
                            <select value={r.category?.id ?? ""} disabled={savingId === r.id} onChange={(e) => void patch(r.id, { categoryId: e.target.value || null })} className="lc-input max-w-[160px] !px-1.5 !py-1 text-xs">
                              {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c.name)}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={r.ownership}
                            disabled={savingId === r.id}
                            onChange={(e) => void patch(r.id, { ownership: e.target.value })}
                            className={cn(
                              "lc-input max-w-[110px] !px-1.5 !py-1 text-xs font-medium",
                              r.ownership === "shared"
                                ? "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40"
                                : "",
                            )}
                          >
                            <option value="personal">Personal</option>
                            <option value="shared">Hogar</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={r.paidByUserId ?? members[0]?.userId ?? ""} disabled={savingId === r.id || !members.length} onChange={(e) => void patch(r.id, { paidByUserId: e.target.value || null })} className="lc-input max-w-[120px] !px-1.5 !py-1 text-xs">
                            {members.map((m) => <option key={m.userId} value={m.userId}>{memberLabel(m)}</option>)}
                          </select>
                        </td>
                      </tr>
                      {isTicket && isOpen && r.receipt && (
                        <tr className="bg-violet-50/50 dark:bg-violet-950/20">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-zinc-950">
                              <p className="mb-2 text-xs font-semibold uppercase text-violet-700 dark:text-violet-300">
                                Detalle del ticket{r.receipt.items.length ? ` · ${r.receipt.items.length} ítems` : ""}
                              </p>
                              {r.receipt.items.length === 0 ? (
                                <p className="text-sm text-zinc-500">Sin ítems leídos.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {r.receipt.items.map((item) => (
                                    <li key={item.id} className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-center">
                                      <input defaultValue={item.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.name) void patchItem(r.id, item.id, { name: v }); }} className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
                                      <select value={item.productCategory ?? ""} onChange={(e) => void patchItem(r.id, item.id, { productCategory: e.target.value || null })} className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900">
                                        <option value="">Subcategoría…</option>
                                        {PRODUCT_SUBCATS.map((s) => <option key={s} value={s}>{s}</option>)}
                                      </select>
                                      <span className="text-right text-sm tabular-nums text-zinc-600">{item.quantity && item.quantity !== 1 ? `${item.quantity}× ` : ""}{formatArs(item.lineTotal)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-zinc-500">
              <span>
                {sorted.length === 0 ? "0" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)}`} de {sorted.length}
              </span>
              <label className="inline-flex items-center gap-1.5">
                <span className="text-xs">por pág.</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="lc-input !px-2 !py-1 text-xs">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="lc-btn lc-btn-secondary !px-2.5 disabled:opacity-40" aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[4.5rem] text-center tabular-nums text-zinc-600 dark:text-zinc-400">{safePage} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="lc-btn lc-btn-secondary !px-2.5 disabled:opacity-40" aria-label="Siguiente">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
