"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatArs, formatUsd, formatDateAr } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { LoadingBlock, Toast } from "@/components/ui";
import { RefreshCw, Search } from "lucide-react";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };
type ReceiptItem = {
  id: string;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  productCategory: string | null;
};
type ReceiptInfo = {
  id: string;
  merchantName: string | null;
  receiptDate: string | null;
  totalArs: number | null;
  items: ReceiptItem[];
};
type Tx = {
  id: string;
  date: string;
  descriptionNormalized: string;
  amountArs: number | null;
  amountUsd: number | null;
  installment: string | null;
  isPayment: boolean;
  paidByUserId: string | null;
  source: string;
  category: Category | null;
  hasTicket: boolean;
  receipt: ReceiptInfo | null;
};

const PRODUCT_SUBCATS = [
  "Lácteos",
  "Panadería",
  "Bebidas",
  "Carnes",
  "Verduras",
  "Frutas",
  "Limpieza",
  "Higiene",
  "Snacks",
  "Congelados",
  "Almacén",
  "Otros",
];

function memberLabel(m: Member): string {
  const n = m.name.trim();
  if (!n) return "Sin nombre";
  return n.split(/\s+/)[0] ?? n;
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) {
    if (res.status === 413) return "El archivo es demasiado grande.";
    return `Error ${res.status}`;
  }
  try {
    const data = JSON.parse(text) as { error?: string };
    if (data.error) return data.error;
  } catch {
    if (res.status === 413 || /entity too large/i.test(text)) {
      return "El archivo es demasiado grande.";
    }
    if (text.length < 200) return text;
  }
  return `Error ${res.status}`;
}

export function TransactionsTable({
  compactToolbar = false,
}: {
  /** When true, only filters (import/add live in ConsumosWorkspace). */
  compactToolbar?: boolean;
} = {}) {
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [period, setPeriod] = useState("");
  const [q, setQ] = useState("");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (q) params.set("q", q);
    if (uncategorizedOnly) params.set("uncategorized", "1");
    try {
      const res = await fetch(`/api/transactions?${params}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        transactions?: Tx[];
        categories?: Category[];
        members?: Member[];
      };
      if (!res.ok) {
        setError(data.error || "Error");
        return;
      }
      // Expenses only — payments live under Deuda
      setRows((data.transactions ?? []).filter((t) => !t.isPayment));
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [period, q, uncategorizedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    setSavingId(id);
    const prev = rows;
    const edited = rows.find((r) => r.id === id);
    const catId =
      "categoryId" in body ? (body.categoryId as string | null) : undefined;
    const nextCat =
      catId === undefined
        ? undefined
        : catId == null || catId === ""
          ? null
          : (categories.find((c) => c.id === catId) ?? null);

    // Optimistic: only touch the edited row (and similar merchant if learned)
    setRows((list) => {
      const mapped = list.map((r) => {
        if (r.id !== id) return r;
        const next: Tx = { ...r };
        if (nextCat !== undefined) next.category = nextCat;
        if ("paidByUserId" in body) {
          next.paidByUserId = (body.paidByUserId as string | null) ?? null;
        }
        return next;
      });
      if (
        uncategorizedOnly &&
        nextCat &&
        nextCat.slug !== "uncategorized"
      ) {
        return mapped.filter((r) => r.id !== id);
      }
      return mapped;
    });

    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...body }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        similarUpdated?: number;
        learned?: number;
      } | null;
      if (!res.ok) {
        setRows(prev);
        setError(data?.error || "No se pudo guardar el cambio");
        return;
      }
      // Similar merchants: update in place, never full reload
      if (nextCat && data?.similarUpdated && data.similarUpdated > 0 && edited) {
        const desc = edited.descriptionNormalized;
        setRows((list) => {
          const next = list.map((r) => {
            if (r.id === id) return { ...r, category: nextCat };
            if (r.descriptionNormalized !== desc) return r;
            if (r.category && r.category.slug !== "uncategorized") return r;
            return { ...r, category: nextCat };
          });
          if (uncategorizedOnly && nextCat.slug !== "uncategorized") {
            return next.filter(
              (r) => !r.category || r.category.slug === "uncategorized",
            );
          }
          return next;
        });
        showToast(
          `Guardado. También actualicé ${data.similarUpdated} gasto(s) similar(es).`,
        );
      } else if (data?.learned && data.learned > 0 && catId) {
        showToast("Guardado. Recordaré esta categoría para el mismo comercio.");
      }
    } catch {
      setRows(prev);
      setError("Error de red al guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function patchItem(
    txId: string,
    itemId: string,
    body: { name?: string; productCategory?: string | null },
  ) {
    setError(null);
    const prev = rows;
    setRows((list) =>
      list.map((r) => {
        if (r.id !== txId || !r.receipt) return r;
        return {
          ...r,
          receipt: {
            ...r.receipt,
            items: r.receipt.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    name: body.name ?? it.name,
                    productCategory:
                      "productCategory" in body
                        ? (body.productCategory ?? null)
                        : it.productCategory,
                  }
                : it,
            ),
          },
        };
      }),
    );

    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemId, ...body }),
      });
      if (!res.ok) {
        setRows(prev);
        setError(await readErrorMessage(res));
      }
    } catch {
      setRows(prev);
      setError("Error de red al guardar ítem");
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const periods = useMemo(
    () => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="lc-card flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
        <div className="relative min-w-[140px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar comercio…"
            className="lc-input w-full !pl-9"
          />
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="lc-input"
        >
          <option value="">Todos los períodos</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {formatPeriodLabel(p)}
            </option>
          ))}
        </select>
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
            uncategorizedOnly
              ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
              : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
          )}
        >
          <input
            type="checkbox"
            checked={uncategorizedOnly}
            onChange={(e) => setUncategorizedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
          />
          Solo sin categoría
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="lc-btn lc-btn-secondary"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {toast && <Toast>{toast}</Toast>}

      {loading && rows.length === 0 ? (
        <LoadingBlock label="Cargando consumos…" />
      ) : (
      <div className="lc-table-wrap">
        <table>
          <thead>
            <tr>
              <th className="w-8 px-2 py-2.5" />
              <th className="px-3 py-2.5">Fecha</th>
              <th className="px-3 py-2.5">Descripción</th>
              <th className="px-3 py-2.5">Monto $</th>
              <th className="px-3 py-2.5">USD</th>
              <th className="px-3 py-2.5">Categoría</th>
              <th className="px-3 py-2.5">Pagó</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-zinc-500">
                  {compactToolbar
                    ? "No hay consumos. Usá Agregar o importá el resumen de la tarjeta."
                    : "No hay consumos."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isTicket = r.hasTicket;
                const isOpen = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={cn(
                        isTicket
                          ? "bg-violet-50/80 dark:bg-violet-950/30"
                          : r.isPayment
                            ? "bg-sky-50/50 dark:bg-sky-950/20"
                            : undefined,
                      )}
                    >
                      <td className="px-2 py-2">
                        {isTicket ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(r.id)}
                            className="rounded p-1 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/50"
                            title="Ver detalle del ticket"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                        {formatDateAr(r.date)}
                      </td>
                      <td className="max-w-xs px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">
                            {r.descriptionNormalized}
                          </span>
                          {isTicket && (
                            <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              Ticket
                            </span>
                          )}
                        </div>
                        {r.installment && (
                          <div className="text-xs text-zinc-500">
                            cuota {r.installment}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatArs(r.amountArs)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatUsd(r.amountUsd)}
                      </td>
                      <td className="px-3 py-2">
                        {isTicket ? (
                          <span className="inline-flex rounded-md bg-violet-100 px-2 py-1 text-xs font-medium text-violet-900 dark:bg-violet-900/50 dark:text-violet-100">
                            {r.category?.name || "Supermercado"}
                          </span>
                        ) : (
                          <select
                            value={r.category?.id ?? ""}
                            disabled={savingId === r.id}
                            onChange={(e) =>
                              void patch(r.id, {
                                categoryId: e.target.value || null,
                              })
                            }
                            className="lc-input max-w-[160px] !px-1.5 !py-1 text-xs disabled:opacity-60"
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.paidByUserId ?? members[0]?.userId ?? ""}
                          disabled={savingId === r.id || members.length === 0}
                          onChange={(e) =>
                            void patch(r.id, {
                              paidByUserId: e.target.value || null,
                            })
                          }
                          className="lc-input max-w-[120px] !px-1.5 !py-1 text-xs disabled:opacity-60"
                        >
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {memberLabel(m)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {isTicket && isOpen && r.receipt && (
                      <tr className="bg-violet-50/50 dark:bg-violet-950/20">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-zinc-950">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                              Detalle del ticket
                              {r.receipt.items.length
                                ? ` · ${r.receipt.items.length} ítems`
                                : ""}
                            </p>
                            {r.receipt.items.length === 0 ? (
                              <p className="text-sm text-zinc-500">
                                Sin ítems leídos en este ticket.
                              </p>
                            ) : (
                              <ul className="space-y-2">
                                {r.receipt.items.map((item) => (
                                  <li
                                    key={item.id}
                                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-center"
                                  >
                                    <input
                                      defaultValue={item.name}
                                      onBlur={(e) => {
                                        const v = e.target.value.trim();
                                        if (v && v !== item.name) {
                                          void patchItem(r.id, item.id, {
                                            name: v,
                                          });
                                        }
                                      }}
                                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                    />
                                    <select
                                      value={item.productCategory ?? ""}
                                      onChange={(e) =>
                                        void patchItem(r.id, item.id, {
                                          productCategory:
                                            e.target.value || null,
                                        })
                                      }
                                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                    >
                                      <option value="">Subcategoría…</option>
                                      {PRODUCT_SUBCATS.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="text-right text-sm tabular-nums text-zinc-600">
                                      {item.quantity && item.quantity !== 1
                                        ? `${item.quantity}× `
                                        : ""}
                                      {formatArs(item.lineTotal)}
                                    </span>
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
              })
            )}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-zinc-500">
        {loading ? "Actualizando…" : `${rows.length} movimientos`}
      </p>
    </div>
  );
}
