"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Search, SlidersHorizontal, X, List,
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatArs, cn, currentPeriodAr, periodFromDateString } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { EmptyState, ListSkeleton, Toast } from "@/components/ui";
import {
  ApplyCriterionToast,
  type ApplyCriterionPrompt,
} from "@/components/apply-criterion-toast";

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
  linkedTransactionId?: string | null;
  linkedToInvoiceIog?: boolean;
  category: Category | null; hasTicket: boolean; receipt: ReceiptInfo | null;
};

type HouseholdOption = { id: string; name: string };
type OwnershipFilter = "all" | "personal" | "shared";
type CategoryFilter = "all" | "uncategorized" | string;
type TicketFilter = "all" | "ticket" | "no-ticket";
type CurrencyFilter = "all" | "ars" | "usd";

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

/** Amber IOG pill — keep shrink-0 so truncate never eats it. */
function IogBadge({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={
        size === "sm"
          ? "shrink-0 rounded-full bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white dark:bg-amber-300 dark:text-amber-950"
          : "shrink-0 rounded-full bg-amber-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-amber-300 dark:text-amber-950"
      }
      title="Vinculado a Invoice IOG — no cuenta en la neta"
    >
      IOG
    </span>
  );
}

function hasAnyAmount(t: { amountArs: number | null; amountUsd: number | null }) {
  return (
    (t.amountArs != null && Number.isFinite(t.amountArs) && Math.abs(t.amountArs) > 0) ||
    (t.amountUsd != null && Number.isFinite(t.amountUsd) && Math.abs(t.amountUsd) > 0)
  );
}

/** Never wipe the last currency on blur of an empty field (imported rows). */
function nextAmountOnBlur(
  raw: string,
  current: number | null,
  other: number | null,
): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    // Refuse to clear the only monto — keep current (incl. null → no patch).
    if (other == null || !Number.isFinite(other) || Math.abs(other) === 0) {
      return undefined; // skip patch
    }
    return null;
  }
  const n = Number(trimmed);
  if (Number.isNaN(n)) return undefined;
  return n;
}
function isUncategorized(t: Tx) {
  const slug = t.category?.slug?.toLowerCase();
  const name = t.category?.name?.toLowerCase();
  return !t.category || slug === "uncategorized" || name === "uncategorized" || name === "sin categoría";
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

export function TransactionsTable() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [period, setPeriod] = useState(currentPeriodAr);
  const [allPeriods, setAllPeriods] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [ownershipF, setOwnershipF] = useState<OwnershipFilter>("all");
  const [categoryF, setCategoryF] = useState<CategoryFilter>("all");
  const [ticketF, setTicketF] = useState<TicketFilter>("all");
  const [currencyF, setCurrencyF] = useState<CurrencyFilter>("all");
  const [iogOnly, setIogOnly] = useState(false);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [applyPrompt, setApplyPrompt] = useState<ApplyCriterionPrompt | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = [
    ownershipF !== "all",
    categoryF !== "all",
    ticketF !== "all",
    currencyF !== "all",
    iogOnly,
  ].filter(Boolean).length;

  useEffect(() => {
    if (!toast || applyPrompt) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast, applyPrompt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/household/active", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await parseJson<{
          households?: HouseholdOption[];
          activeHouseholdId?: string | null;
        }>(res);
        if (cancelled) return;
        setHouseholds(data.households ?? []);
        setActiveHouseholdId(data.activeHouseholdId ?? null);
      } catch {
        /* ignore — Tipo falls back to Personal/Hogar */
      }
    })();
    function onSwitch() {
      void (async () => {
        try {
          const res = await fetch("/api/household/active", { credentials: "include" });
          if (!res.ok) return;
          const data = await parseJson<{
            households?: HouseholdOption[];
            activeHouseholdId?: string | null;
          }>(res);
          setHouseholds(data.households ?? []);
          setActiveHouseholdId(data.activeHouseholdId ?? null);
        } catch { /* ignore */ }
      })();
    }
    window.addEventListener("lc:household-switched", onSwitch);
    window.addEventListener("lc:household-created", onSwitch);
    return () => {
      cancelled = true;
      window.removeEventListener("lc:household-switched", onSwitch);
      window.removeEventListener("lc:household-created", onSwitch);
    };
  }, []);


  useEffect(() => {
    if (!exportOpen && !filterOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (exportOpen && exportRef.current && !exportRef.current.contains(t)) setExportOpen(false);
      if (filterOpen && filterRef.current && !filterRef.current.contains(t)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportOpen, filterOpen]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (q) params.set("q", q);
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
  }, [period, q]);

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

  const linkedIogCount = useMemo(
    () => rows.filter((r) => r.linkedToInvoiceIog).length,
    [rows],
  );

  const sorted = useMemo(() => {
    let list = [...rows];
    if (ownershipF !== "all") list = list.filter((t) => t.ownership === ownershipF);
    if (categoryF === "uncategorized") list = list.filter(isUncategorized);
    else if (categoryF !== "all") list = list.filter((t) => t.category?.id === categoryF);
    if (ticketF === "ticket") list = list.filter((t) => t.hasTicket);
    else if (ticketF === "no-ticket") list = list.filter((t) => !t.hasTicket);
    if (currencyF === "ars") list = list.filter((t) => t.amountArs != null && t.amountArs > 0);
    else if (currencyF === "usd") list = list.filter((t) => t.amountUsd != null && t.amountUsd > 0);
    if (iogOnly) list = list.filter((t) => t.linkedToInvoiceIog);
    // Pin Casita↔Invoice IOG links to the top so badges are on page 1 (hint uses all rows).
    list.sort((a, b) => {
      const aIog = a.linkedToInvoiceIog ? 1 : 0;
      const bIog = b.linkedToInvoiceIog ? 1 : 0;
      if (aIog !== bIog) return bIog - aIog;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    return list;
  }, [rows, ownershipF, categoryF, ticketF, currencyF, iogOnly]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [ownershipF, categoryF, ticketF, currencyF, iogOnly]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null); setSavingId(id);
    const prev = rows;
    const catId = "categoryId" in body ? (body.categoryId as string | null) : undefined;
    const nextCat =
      catId === undefined ? undefined
        : !catId ? null
        : (categories.find((c) => c.id === catId) ?? null);
    const prevCatId = rows.find((r) => r.id === id)?.category?.id ?? null;
    const categoryChanged =
      catId !== undefined && catId !== null && catId !== prevCatId;

    setRows((list) => list.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r };
      if (nextCat !== undefined) next.category = nextCat;
      if ("paidByUserId" in body) next.paidByUserId = (body.paidByUserId as string | null) ?? null;
      if ("ownership" in body) {
        next.ownership = body.ownership === "shared" ? "shared" : "personal";
      }
      if ("date" in body && typeof body.date === "string") next.date = body.date;
      if ("amountArs" in body) next.amountArs = body.amountArs as number | null;
      if ("amountUsd" in body) next.amountUsd = body.amountUsd as number | null;
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

      if (body.applyToSimilar) {
        setApplyPrompt(null);
        const n = typeof data?.similarUpdated === "number" ? data.similarUpdated : 0;
        setToast(
          n > 0
            ? `Criterio aplicado a ${n + 1} gasto${n + 1 === 1 ? "" : "s"}.`
            : "Criterio guardado.",
        );
        void load();
        return;
      }

      const similarCount =
        typeof data?.similarCount === "number" ? data.similarCount : 0;
      if (categoryChanged && similarCount >= 2 && catId) {
        setToast(null);
        setApplyPrompt({ txId: id, categoryId: catId, count: similarCount });
      } else if (body.ownership || categoryChanged) {
        setApplyPrompt(null);
        setToast("Guardado.");
      }
    } catch {
      setRows(prev); setError("Error de red al guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function applyCriterion() {
    if (!applyPrompt) return;
    setApplyBusy(true);
    try {
      await patch(applyPrompt.txId, {
        categoryId: applyPrompt.categoryId,
        applyToSimilar: true,
      });
    } finally {
      setApplyBusy(false);
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

  function clearFilters() {
    setOwnershipF("all");
    setCategoryF("all");
    setTicketF("all");
    setCurrencyF("all");
    setIogOnly(false);
  }

  function assignValueFor(r: Tx): string {
    if (r.ownership === "personal") return "personal";
    return activeHouseholdId ?? "shared";
  }

  async function onAssignChange(r: Tx, value: string) {
    if (value === "personal") {
      if (r.ownership !== "personal") void patch(r.id, { ownership: "personal" });
      return;
    }
    if (value === "internal") {
      // Hide from Consumos + neta (isPayment); keep history in statements.
      setError(null);
      setSavingId(r.id);
      const prev = rows;
      setRows((list) => list.filter((x) => x.id !== r.id));
      try {
        const res = await fetch("/api/transactions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: r.id, internalTransfer: true }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setRows(prev);
          setError(data?.error || "No se pudo marcar");
          return;
        }
        setToast("Marcado como transferencia interna (no cuenta en la neta).");
      } catch (e) {
        setRows(prev);
        setError(e instanceof Error ? e.message : "Error de red");
      } finally {
        setSavingId(null);
      }
      return;
    }
    // value is a household id (or legacy "shared")
    if (value === "shared" || value === (activeHouseholdId ?? "")) {
      if (r.ownership !== "shared") void patch(r.id, { ownership: "shared" });
      return;
    }
    // Move to another household — drop from this list on success
    setError(null);
    setSavingId(r.id);
    const prev = rows;
    setRows((list) => list.filter((x) => x.id !== r.id));
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: r.id, targetHouseholdId: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRows(prev);
        setError(data?.error || "No se pudo mover");
        return;
      }
      const dest = households.find((h) => h.id === value)?.name ?? "otro hogar";
      setToast(`Movido a ${dest}.`);
    } catch (e) {
      setRows(prev);
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSavingId(null);
    }
  }

  function AssignSelect({ r }: { r: Tx }) {
    const value = assignValueFor(r);
    const opts =
      households.length > 0
        ? households
        : activeHouseholdId
          ? [{ id: activeHouseholdId, name: "Hogar" }]
          : [];
    return (
      <select
        value={value === "shared" && activeHouseholdId ? activeHouseholdId : value}
        disabled={savingId === r.id}
        onChange={(e) => void onAssignChange(r, e.target.value)}
        className={cn(
          "lc-input !px-2 !py-1.5 text-xs font-medium",
          r.ownership === "shared"
            ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
            : "",
        )}
        aria-label="Asignar a"
      >
        <option value="personal">Personal</option>
        {opts.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
        {opts.length === 0 && <option value="shared">Hogar</option>}
        <option value="internal">Transferencia interna</option>
      </select>
    );
  }


  const periods = allPeriods.length
    ? allPeriods
    : [...new Set(rows.map((r) => periodFromDateString(r.date)))].sort().reverse();

  const catOptions = useMemo(() => {
    return categories
      .filter((c) => c.slug !== "uncategorized")
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [categories]);

  function exportCsv() {
    const ws = XLSX.utils.json_to_sheet(toSheet(sorted, members));
    downloadBlob(`gastos-${period || "todos"}.csv`, new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }));
    setExportOpen(false);
  }
  function exportXls() {
    const ws = XLSX.utils.json_to_sheet(toSheet(sorted, members));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(`gastos-${period || "todos"}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    setExportOpen(false);
  }

  function Chip({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-medium transition",
          active
            ? "border-[var(--brand)]/40 bg-[var(--brand-soft)] text-[var(--brand-fg)]"
            : "border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex w-full items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="lc-input min-w-0 flex-1"
        >
          <option value="">Todos los meses</option>
          {periods.map((p) => (
            <option key={p} value={p}>{formatPeriodLabel(p)}</option>
          ))}
        </select>

        <div className="relative shrink-0" ref={exportRef}>
          <button
            type="button"
            onClick={() => { setExportOpen((o) => !o); setFilterOpen(false); }}
            disabled={!sorted.length}
            className="lc-btn lc-btn-secondary !px-2.5 disabled:opacity-40"
            aria-label="Descargar"
            aria-expanded={exportOpen}
          >
            <Download className="h-4 w-4" />
            <ChevronDown className={cn("h-3.5 w-3.5 transition", exportOpen && "rotate-180")} />
          </button>
          {exportOpen && (
            <div className="absolute left-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
              <p className="border-b border-zinc-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                Exportar listado filtrado
              </p>
              <button type="button" onClick={exportCsv} className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>
                  <span className="block text-sm font-semibold">CSV</span>
                  <span className="block text-xs text-zinc-500">Texto separado por comas. Ideal para Sheets.</span>
                </span>
              </button>
              <button type="button" onClick={exportXls} className="flex w-full items-start gap-3 border-t border-zinc-100 px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <span className="block text-sm font-semibold">Excel (.xlsx)</span>
                  <span className="block text-xs text-zinc-500">Planilla lista para Office o LibreOffice.</span>
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="relative ml-auto shrink-0" ref={filterRef}>
          <button
            type="button"
            onClick={() => { setFilterOpen((o) => !o); setExportOpen(false); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
              activeFilterCount > 0 || filterOpen
                ? "border-[var(--brand)]/40 bg-[var(--brand-soft)] text-[var(--brand-fg)]"
                : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
            )}
            aria-expanded={filterOpen}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white dark:text-[#121110]">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-[min(100vw-1.5rem,20rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Filtros</p>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearFilters} className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Limpiar
                  </button>
                )}
              </div>

              <div className="space-y-3 p-3">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-500">Tipo</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={ownershipF === "all"} onClick={() => setOwnershipF("all")}>Todos</Chip>
                    <Chip active={ownershipF === "personal"} onClick={() => setOwnershipF("personal")}>Personal</Chip>
                    <Chip active={ownershipF === "shared"} onClick={() => setOwnershipF("shared")}>Hogar</Chip>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-500">Categoría</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={categoryF === "all"} onClick={() => setCategoryF("all")}>Todas</Chip>
                    <Chip active={categoryF === "uncategorized"} onClick={() => setCategoryF("uncategorized")}>Sin categoría</Chip>
                    {catOptions.map((c) => (
                      <Chip key={c.id} active={categoryF === c.id} onClick={() => setCategoryF(c.id)}>
                        {categoryLabel(c.name)}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-500">Origen</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={ticketF === "all"} onClick={() => setTicketF("all")}>Todos</Chip>
                    <Chip active={ticketF === "ticket"} onClick={() => setTicketF("ticket")}>Con ticket</Chip>
                    <Chip active={ticketF === "no-ticket"} onClick={() => setTicketF("no-ticket")}>Sin ticket</Chip>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-500">Moneda</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={currencyF === "all"} onClick={() => setCurrencyF("all")}>Todas</Chip>
                    <Chip active={currencyF === "ars"} onClick={() => setCurrencyF("ars")}>Pesos</Chip>
                    <Chip active={currencyF === "usd"} onClick={() => setCurrencyF("usd")}>Dólares</Chip>
                  </div>
                </div>

                {linkedIogCount > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold text-zinc-500">Invoice IOG</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip active={!iogOnly} onClick={() => setIogOnly(false)}>Todos</Chip>
                      <Chip active={iogOnly} onClick={() => setIogOnly(true)}>Solo IOG</Chip>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ownershipF !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium dark:bg-zinc-800">
              {ownershipF === "personal" ? "Personal" : "Hogar"}
              <button type="button" onClick={() => setOwnershipF("all")} aria-label="Quitar"><X className="h-3 w-3" /></button>
            </span>
          )}
          {categoryF !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium dark:bg-zinc-800">
              {categoryF === "uncategorized"
                ? "Sin categoría"
                : categoryLabel(categories.find((c) => c.id === categoryF)?.name)}
              <button type="button" onClick={() => setCategoryF("all")} aria-label="Quitar"><X className="h-3 w-3" /></button>
            </span>
          )}
          {ticketF !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium dark:bg-zinc-800">
              {ticketF === "ticket" ? "Con ticket" : "Sin ticket"}
              <button type="button" onClick={() => setTicketF("all")} aria-label="Quitar"><X className="h-3 w-3" /></button>
            </span>
          )}
          {currencyF !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium dark:bg-zinc-800">
              {currencyF === "ars" ? "Pesos" : "Dólares"}
              <button type="button" onClick={() => setCurrencyF("all")} aria-label="Quitar"><X className="h-3 w-3" /></button>
            </span>
          )}
          {iogOnly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
              Solo IOG
              <button type="button" onClick={() => setIogOnly(false)} aria-label="Quitar"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar comercio…"
          className="lc-input w-full !pl-9"
        />
      </div>

      {linkedIogCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="min-w-0 flex-1">
            <span className="font-semibold tabular-nums">{linkedIogCount}</span>
            {" "}
            vinculado{linkedIogCount === 1 ? "" : "s"} a Invoice IOG — no cuentan en la neta
          </p>
          <button
            type="button"
            onClick={() => setIogOnly((v) => !v)}
            className={
              iogOnly
                ? "shrink-0 rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-amber-300 dark:text-amber-950"
                : "shrink-0 rounded-full border border-amber-300/80 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/50"
            }
            aria-pressed={iogOnly}
          >
            Solo IOG
          </button>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {applyPrompt ? (
        <ApplyCriterionToast
          prompt={applyPrompt}
          busy={applyBusy || savingId === applyPrompt.txId}
          onApply={() => void applyCriterion()}
          onSoloEste={() => {
            setApplyPrompt(null);
            setToast("Guardado.");
          }}
        />
      ) : (
        toast && <Toast>{toast}</Toast>
      )}

      {loading && !rows.length ? (
        <ListSkeleton label="Cargando consumos…" />
      ) : !sorted.length ? (
        <EmptyState
          icon={<List className="h-7 w-7" />}
          title={
            activeFilterCount > 0
              ? "Nada con esos filtros"
              : period
                ? `Nada en ${formatPeriodLabel(period)}`
                : "Todavía no hay consumos"
          }
          description={
            activeFilterCount > 0
              ? "Sacá un filtro o limpiá todo. Seguro está, escondido."
              : period
                ? "Probá otro mes, o cargá el resumen de la tarjeta."
                : "Cargá el Excel o el PDF, o sumá un gasto con el botón de abajo."
          }
          action={
            activeFilterCount > 0 ? (
              <button type="button" onClick={clearFilters} className="lc-btn lc-btn-secondary">
                Limpiar filtros
              </button>
            ) : (
              <Link href="/cargas" className="lc-btn lc-btn-primary">
                Cargá el resumen
              </Link>
            )
          }
        />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {pageRows.map((r) => {
              const isTicket = r.hasTicket;
              const isOpen = expanded.has(r.id);
              return (
                <li key={r.id} className={cn("rounded-2xl border p-3.5", isTicket ? "lc-ticket" : "border-[var(--border)] bg-[var(--surface)]")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{r.descriptionNormalized}</span>
                        {isTicket && <span className="shrink-0 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white dark:bg-violet-300 dark:text-violet-950">Ticket</span>}
                        {r.linkedToInvoiceIog && <IogBadge size="sm" />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                        <input
                          type="date"
                          defaultValue={r.date}
                          disabled={savingId === r.id}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v && v !== r.date) void patch(r.id, { date: v });
                          }}
                          className="lc-input !w-auto !px-1.5 !py-0.5 text-xs"
                          aria-label="Fecha"
                        />
                        {r.installment ? <span>· cuota {r.installment}</span> : null}
                      </div>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      {r.linkedToInvoiceIog && (
                        <div className="mb-0.5 flex justify-end">
                          <IogBadge size="sm" />
                        </div>
                      )}
                      <label className="flex items-center justify-end gap-1">
                        <span className="text-[10px] font-medium text-zinc-400">$</span>
                        <input
                          key={`${r.id}-ars-${r.amountArs ?? "∅"}`}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={r.amountArs ?? ""}
                          placeholder={hasAnyAmount(r) ? undefined : "sin monto"}
                          disabled={savingId === r.id}
                          onBlur={(e) => {
                            const next = nextAmountOnBlur(e.target.value, r.amountArs, r.amountUsd);
                            if (next === undefined) return;
                            if (next !== r.amountArs) void patch(r.id, { amountArs: next });
                          }}
                          className="lc-input w-[7.5rem] !px-1.5 !py-0.5 text-right text-sm font-semibold tabular-nums placeholder:text-[10px] placeholder:font-normal placeholder:text-zinc-400"
                          aria-label="Monto en pesos"
                        />
                      </label>
                      <label className="flex items-center justify-end gap-1">
                        <span className="text-[10px] font-medium text-zinc-400">USD</span>
                        <input
                          key={`${r.id}-usd-${r.amountUsd ?? "∅"}`}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={r.amountUsd ?? ""}
                          placeholder={hasAnyAmount(r) ? undefined : "sin monto"}
                          disabled={savingId === r.id}
                          onBlur={(e) => {
                            const next = nextAmountOnBlur(e.target.value, r.amountUsd, r.amountArs);
                            if (next === undefined) return;
                            if (next !== r.amountUsd) void patch(r.id, { amountUsd: next });
                          }}
                          className="lc-input w-[7.5rem] !px-1.5 !py-0.5 text-right text-xs tabular-nums text-zinc-600 placeholder:text-[10px] placeholder:font-normal placeholder:text-zinc-400"
                          aria-label="Monto en dólares"
                        />
                      </label>
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
                    <AssignSelect r={r} />
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
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                          <input
                            type="date"
                            defaultValue={r.date}
                            disabled={savingId === r.id}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v && v !== r.date) void patch(r.id, { date: v });
                            }}
                            className="lc-input !w-auto !px-1.5 !py-1 text-xs"
                            aria-label="Fecha"
                          />
                        </td>
                        <td className="max-w-xs px-3 py-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-medium">{r.descriptionNormalized}</span>
                            {isTicket && <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white dark:bg-violet-300 dark:text-violet-950">Ticket</span>}
                            {r.linkedToInvoiceIog && <IogBadge />}
                          </div>
                          {r.installment && <div className="text-xs text-zinc-500">cuota {r.installment}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          <div className="inline-flex items-center gap-1.5">
                            {r.linkedToInvoiceIog && <IogBadge />}
                            <input
                              key={`${r.id}-desk-ars-${r.amountArs ?? "∅"}`}
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              defaultValue={r.amountArs ?? ""}
                              placeholder={hasAnyAmount(r) ? undefined : "sin monto"}
                              disabled={savingId === r.id}
                              onBlur={(e) => {
                                const next = nextAmountOnBlur(e.target.value, r.amountArs, r.amountUsd);
                                if (next === undefined) return;
                                if (next !== r.amountArs) void patch(r.id, { amountArs: next });
                              }}
                              className="lc-input w-[7.5rem] !px-1.5 !py-1 text-right text-sm tabular-nums placeholder:text-[10px] placeholder:font-normal placeholder:text-zinc-400"
                              aria-label="Monto en pesos"
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          <input
                            key={`${r.id}-desk-usd-${r.amountUsd ?? "∅"}`}
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            defaultValue={r.amountUsd ?? ""}
                            placeholder={hasAnyAmount(r) ? undefined : "sin monto"}
                            disabled={savingId === r.id}
                            onBlur={(e) => {
                              const next = nextAmountOnBlur(e.target.value, r.amountUsd, r.amountArs);
                              if (next === undefined) return;
                              if (next !== r.amountUsd) void patch(r.id, { amountUsd: next });
                            }}
                            className="lc-input w-[7rem] !px-1.5 !py-1 text-right text-sm tabular-nums placeholder:text-[10px] placeholder:font-normal placeholder:text-zinc-400"
                            aria-label="Monto en dólares"
                          />
                        </td>
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
                          <div className="max-w-[140px]">
                            <AssignSelect r={r} />
                          </div>
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
