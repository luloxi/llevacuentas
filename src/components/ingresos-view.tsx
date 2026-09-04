"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  EmptyState,
  FieldLabel,
  ListSkeleton,
  PageStack,
  Surface,
  Toast,
} from "@/components/ui";
import {
  formatArs,
  formatUsd,
  formatDateAr,
  todayDateAr,
  cn,
  currentPeriodAr,
  periodFromDateString,
} from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";

type IncomeRow = {
  id: string;
  date: string;
  label: string;
  amountArs: number | null;
  amountUsd: number | null;
};

export function IngresosView() {
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [date, setDate] = useState(todayDateAr);
  const [label, setLabel] = useState("");
  const [amountArs, setAmountArs] = useState("");
  const [amountUsd, setAmountUsd] = useState("");

  const period = currentPeriodAr();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incomes", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setRows(data.incomes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const monthRows = useMemo(
    () => rows.filter((r) => periodFromDateString(r.date) === period),
    [rows, period],
  );

  async function submit() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const ars = amountArs.trim() ? Number(amountArs.replace(",", ".")) : null;
      const usd = amountUsd.trim() ? Number(amountUsd.replace(",", ".")) : null;
      const res = await fetch("/api/incomes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          label,
          amountArs: ars,
          amountUsd: usd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setLabel("");
      setAmountArs("");
      setAmountUsd("");
      setOk("Ingreso guardado");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/incomes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  if (loading) return <ListSkeleton label="Cargando ingresos…" rows={4} />;

  return (
    <PageStack className="!space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Ingresos</h1>
        <p className="text-xs text-[var(--muted-fg)]">
          Sueldos y otros ingresos · {formatPeriodLabel(period)}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
          {error}
        </p>
      )}
      {ok && <Toast>{ok}</Toast>}

      <Surface className="space-y-3 !p-4">
        <p className="text-sm font-semibold">Agregar ingreso</p>
        <div>
          <FieldLabel>Fecha</FieldLabel>
          <input
            type="date"
            className="lc-input w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>Qué es</FieldLabel>
          <input
            className="lc-input w-full"
            placeholder="Sueldo, freelance, alquiler…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Pesos</FieldLabel>
            <input
              className="lc-input w-full"
              inputMode="decimal"
              placeholder="0"
              value={amountArs}
              onChange={(e) => setAmountArs(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Dólares</FieldLabel>
            <input
              className="lc-input w-full"
              inputMode="decimal"
              placeholder="0"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="lc-btn lc-btn-primary w-full"
          disabled={saving || !label.trim()}
          onClick={() => void submit()}
        >
          {saving ? "Guardando…" : "Guardar ingreso"}
        </button>
      </Surface>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-fg)]">
          Este mes
        </h2>
        {monthRows.length === 0 ? (
          <EmptyState
            title="Todavía no hay ingresos"
            description="Cuando cargues algo, la neta del home pasa a ser ingresos − gastos."
          />
        ) : (
          <ul className="space-y-2">
            {monthRows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-[var(--muted-fg)]">
                    {formatDateAr(r.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--brand-fg)]">
                  {r.amountArs != null && <div>{formatArs(r.amountArs)}</div>}
                  {r.amountUsd != null && (
                    <div
                      className={cn(
                        r.amountArs != null && "text-xs font-medium",
                      )}
                    >
                      {formatUsd(r.amountUsd)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--surface-muted)] hover:text-red-600"
                  aria-label="Borrar"
                  onClick={() => void remove(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.some((r) => periodFromDateString(r.date) !== period) && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-fg)]">
            Anteriores
          </h2>
          <ul className="space-y-2">
            {rows
              .filter((r) => periodFromDateString(r.date) !== period)
              .map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-3.5 py-2.5 opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.label}</p>
                    <p className="text-xs text-[var(--muted-fg)]">
                      {formatDateAr(r.date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    {r.amountArs != null && formatArs(r.amountArs)}
                    {r.amountUsd != null && (
                      <div className="text-xs">{formatUsd(r.amountUsd)}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--surface-muted)] hover:text-red-600"
                    aria-label="Borrar"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </PageStack>
  );
}
