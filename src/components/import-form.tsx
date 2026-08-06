"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { BANKS } from "@/lib/banks";

export function ImportForm({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone?: () => void;
} = {}) {
  const [loading, setLoading] = useState(false);
  const [bank, setBank] = useState("BBVA");
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    alreadyExists: number;
    message: string;
    warning: string | null;
    fullyDuplicate: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const form = e.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (files.length === 0) {
      setError("Elegí al menos un archivo");
      setLoading(false);
      return;
    }

    type ImportResult = {
      error?: string;
      total?: number;
      inserted?: number;
      alreadyExists?: number;
      skipped?: number;
      message?: string;
      warning?: string | null;
      fullyDuplicate?: boolean;
    };

    try {
      let total = 0;
      let inserted = 0;
      let alreadyExists = 0;
      const warnings: string[] = [];
      const messages: string[] = [];

      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", "bbva");
        fd.set("bank", bank);
        const res = await fetch("/api/import/bbva", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const text = await res.text();
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
        if (!res.ok) throw new Error(data?.error || `Error al importar ${file.name}`);
        if ((data?.total ?? 0) === 0) {
          throw new Error(
            `No se leyeron movimientos de “${file.name}”. Probá Excel de movimientos o PDF de resumen.`,
          );
        }
        total += data?.total ?? 0;
        inserted += data?.inserted ?? 0;
        alreadyExists += data?.alreadyExists ?? data?.skipped ?? 0;
        if (data?.message) messages.push(`${file.name}: ${data.message}`);
        if (data?.warning) warnings.push(`${file.name}: ${data.warning}`);
      }

      const fullyDuplicate = inserted === 0 && alreadyExists > 0;
      setResult({
        total,
        inserted,
        alreadyExists,
        message:
          files.length > 1
            ? `${files.length} archivos · ${inserted} nuevos · ${alreadyExists} coincidencias · ${total} filas leídas`
            : (messages[0] ?? `${inserted} nuevos · ${alreadyExists} coincidencias`),
        warning: warnings[0] ?? null,
        fullyDuplicate,
      });
      form.reset();
      if (inserted > 0) onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      <form
        onSubmit={onSubmit}
        className={
          compact
            ? "rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4 dark:border-emerald-800 dark:bg-emerald-950/20"
            : "rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-8 dark:border-emerald-800 dark:bg-emerald-950/20"
        }
      >
        <div
          className={
            compact
              ? "flex flex-col gap-3"
              : "flex flex-col items-center gap-4 text-center"
          }
        >
          {!compact && (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <FileSpreadsheet className="h-7 w-7" />
            </div>
          )}
          <div className={compact ? "text-left" : ""}>
            <h2 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>
              {compact ? "Importar resumen" : "Subí el resumen de la tarjeta"}
            </h2>
            <p
              className={
                compact
                  ? "mt-0.5 text-xs text-zinc-500"
                  : "mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400"
              }
            >
              {compact
                ? "Excel o PDF del banco"
                : "Excel de movimientos o PDF de resumen. Sin duplicados."}
            </p>
          </div>
          <label className={`block w-full ${compact ? "text-left" : "text-left max-w-md"}`}>
            <span className="mb-1 block text-xs font-medium text-zinc-500">Banco</span>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <input
            name="file"
            type="file"
            accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            multiple
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
          >
            <Upload className="h-4 w-4" />
            {loading ? "Importando…" : "Importar"}
          </button>
        </div>
      </form>

      {result && (
        <div
          className={
            result.fullyDuplicate || result.warning
              ? "flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
              : "flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40"
          }
        >
          {result.fullyDuplicate || result.warning ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          )}
          <div className="text-sm">
            <p className="font-medium">
              {result.fullyDuplicate
                ? "Resumen ya cargado"
                : result.inserted > 0
                  ? "Importación completa"
                  : "Sin cambios"}
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              {result.message ||
                `${result.inserted} nuevos · ${result.alreadyExists} coincidencias · ${result.total} filas`}
            </p>
            {result.warning && !result.fullyDuplicate && (
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                {result.warning}
              </p>
            )}
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
