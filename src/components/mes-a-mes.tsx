"use client";

import { useEffect, useState } from "react";
import { formatArs, formatUsd } from "@/lib/utils";

type MonthBlock = {
  period: string;
  totalArs: number;
  totalUsd: number;
  totalCount: number;
  categories: Array<{
    slug: string;
    name: string;
    amountArs: number;
    amountUsd: number;
    count: number;
    pct: number;
  }>;
};

export function MesAMesView() {
  const [months, setMonths] = useState<MonthBlock[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = period ? `?period=${period}` : "";
      const res = await fetch(`/api/stats/mes-a-mes${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
        setLoading(false);
        return;
      }
      setMonths(data.months);
      setPeriods(data.periods);
      setLoading(false);
    }
    load();
  }, [period]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Calculando desglose…</p>;
  }
  if (error) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
    );
  }

  return (
    <div className="space-y-6">
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">Últimos meses</option>
        {periods.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {months.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Todavía no hay datos. Importá el resumen de la tarjeta.
        </p>
      ) : (
        months.map((m) => (
          <section
            key={m.period}
            className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <h3 className="text-lg font-semibold">{m.period}</h3>
                <p className="text-xs text-zinc-500">{m.totalCount} movimientos</p>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold tabular-nums">
                  {formatArs(m.totalArs)}
                </div>
                <div className="text-zinc-500 tabular-nums">
                  {formatUsd(m.totalUsd)}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Categoría</th>
                    <th className="px-4 py-2 text-right">Monto $</th>
                    <th className="px-4 py-2 text-right">USD</th>
                    <th className="px-4 py-2 text-right">Cant.</th>
                    <th className="px-4 py-2 text-right">% del total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {m.categories.map((c) => (
                    <tr key={c.slug + c.name}>
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.amountArs > 0 ? formatArs(c.amountArs) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.amountUsd > 0 ? formatUsd(c.amountUsd) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.count}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(c.pct, 100)}%` }}
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
            </div>
          </section>
        ))
      )}
    </div>
  );
}
