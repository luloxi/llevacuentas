"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatArs, formatUsd, formatDateAr } from "@/lib/utils";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };
type Tx = {
  id: string;
  date: string;
  descriptionNormalized: string;
  amountArs: number | null;
  amountUsd: number | null;
  installment: string | null;
  isPayment: boolean;
  paidByUserId: string | null;
  category: Category | null;
};

function memberLabel(m: Member): string {
  const n = m.name.trim();
  if (!n) return "Sin nombre";
  // Prefer first given name for compact table cells
  return n.split(/\s+/)[0] ?? n;
}

export function TransactionsTable() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [period, setPeriod] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (q) params.set("q", q);
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
      setRows(data.transactions ?? []);
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [period, q]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Persist change in DB without reloading the whole list (keeps scroll/focus). */
  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    setSavingId(id);

    const prev = rows;
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const next: Tx = { ...r };
        if ("categoryId" in body) {
          const catId = body.categoryId as string | null;
          next.category =
            catId == null || catId === ""
              ? null
              : (categories.find((c) => c.id === catId) ?? r.category);
        }
        if ("paidByUserId" in body) {
          next.paidByUserId = (body.paidByUserId as string | null) ?? null;
        }
        return next;
      }),
    );

    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setRows(prev);
        setError(data?.error || "No se pudo guardar el cambio");
      }
    } catch {
      setRows(prev);
      setError("Error de red al guardar");
    } finally {
      setSavingId(null);
    }
  }

  const periods = useMemo(
    () => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar comercio…"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Todos los períodos</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Monto $</th>
              <th className="px-3 py-2">USD</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Pagó</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  No hay consumos. Importá el resumen BBVA.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    r.isPayment
                      ? "bg-sky-50/50 dark:bg-sky-950/20"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  }
                >
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {formatDateAr(r.date)}
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <div className="truncate font-medium">
                      {r.descriptionNormalized}
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
                    <select
                      value={r.category?.id ?? ""}
                      disabled={savingId === r.id}
                      onChange={(e) =>
                        void patch(r.id, {
                          categoryId: e.target.value || null,
                        })
                      }
                      className="max-w-[160px] rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
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
                      className="max-w-[120px] rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {memberLabel(m)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">{rows.length} movimientos</p>
    </div>
  );
}
