"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

export function ImportForm() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("kind", "bbva");

    try {
      const res = await fetch("/api/import/bbva", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const text = await res.text();
      type ImportResult = {
        error?: string;
        total?: number;
        inserted?: number;
        skipped?: number;
      };
      let data: ImportResult | null = null;
      try {
        data = text ? (JSON.parse(text) as ImportResult) : null;
      } catch {
        throw new Error(
          res.status === 413
            ? "El archivo es demasiado grande."
            : text.slice(0, 160) || `Error ${res.status}`,
        );
      }
      if (!res.ok) throw new Error(data?.error || "Error al importar");
      if ((data?.total ?? 0) === 0) {
        throw new Error(
          "No se leyeron movimientos. ¿Es el Excel de “Últimos movimientos” de BBVA (.xls o .xlsx)?",
        );
      }
      setResult({
        total: data?.total ?? 0,
        inserted: data?.inserted ?? 0,
        skipped: data?.skipped ?? 0,
      });
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-8 dark:border-emerald-800 dark:bg-emerald-950/20"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <FileSpreadsheet className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Subí el Excel de tu tarjeta</h2>
            <p className="mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Exportá “Últimos movimientos” desde BBVA (app o home banking).
              Acepta <strong>.xls</strong> y <strong>.xlsx</strong>. Los
              categorizamos al importar.
            </p>
          </div>
          <input
            name="file"
            type="file"
            accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="block w-full max-w-sm text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {loading ? "Importando…" : "Importar y categorizar"}
          </button>
        </div>
      </form>

      {result && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div className="text-sm">
            <p className="font-medium">Importación completa</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              {result.inserted} nuevos · {result.skipped} ya existían ·{" "}
              {result.total} filas leídas
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
