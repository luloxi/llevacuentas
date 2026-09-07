"use client";

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { BANKS } from "@/lib/banks";
import {
  STATEMENT_FILE_ACCEPT,
  filesFromDrop,
  isStatementFileName,
  statementFileRejectMessage,
} from "@/lib/import/file-accept";
import { cn } from "@/lib/utils";

type ImportResult = {
  error?: string;
  total?: number;
  inserted?: number;
  alreadyExists?: number;
  skipped?: number;
  message?: string;
  warning?: string | null;
  fullyDuplicate?: boolean;
  hint?: string | null;
  bank?: string;
  source?: string;
};

function bankHintFromFiles(files: File[]): string | null {
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (n.includes("fiwind") || n.includes("actividad")) return "Fiwind";
    if (n.includes("bbva")) return "BBVA";
  }
  return null;
}

export function ImportForm({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone?: () => void;
} = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bank, setBank] = useState("BBVA");
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    alreadyExists: number;
    message: string;
    warning: string | null;
    fullyDuplicate: boolean;
    hint: string | null;
    bank: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importFiles = useCallback(
    async (rawFiles: File[]) => {
      if (rawFiles.length === 0) {
        setError("Elegí al menos un archivo");
        return;
      }
      if (loading) return;

      const rejected = rawFiles.filter(
        (f) => f.name.includes(".") && !isStatementFileName(f.name),
      );
      const files = rawFiles.filter(
        (f) => !f.name.includes(".") || isStatementFileName(f.name),
      );
      if (files.length === 0) {
        setError(statementFileRejectMessage(rejected[0]?.name ?? "el archivo"));
        setResult(null);
        return;
      }

      const hinted = bankHintFromFiles(files);
      const bankToSend = hinted && (bank === "BBVA" || !bank) ? hinted : bank;
      if (hinted && hinted !== bank) setBank(hinted);

      setLoading(true);
      setError(null);
      setResult(null);
      setFileLabel(
        files.length === 1 ? files[0].name : `${files.length} archivos`,
      );

      try {
        let total = 0;
        let inserted = 0;
        let alreadyExists = 0;
        let lastBank: string | null = bankToSend;
        const warnings: string[] = [];
        const messages: string[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          setFileLabel(
            files.length > 1
              ? `${i + 1}/${files.length} · ${file.name}`
              : file.name,
          );
          const fd = new FormData();
          fd.set("file", file);
          fd.set("kind", "bbva");
          fd.set("bank", bankToSend);
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
          if (!res.ok) {
            throw new Error(data?.error || `Error al importar ${file.name}`);
          }
          if ((data?.total ?? 0) === 0) {
            const detail =
              data?.message || `No se leyeron movimientos de “${file.name}”.`;
            const hint = data?.hint ? ` ${data.hint}` : "";
            throw new Error(`${detail}${hint}`);
          }
          total += data?.total ?? 0;
          inserted += data?.inserted ?? 0;
          alreadyExists += data?.alreadyExists ?? data?.skipped ?? 0;
          if (data?.message) messages.push(`${file.name}: ${data.message}`);
          if (data?.warning) warnings.push(`${file.name}: ${data.warning}`);
          if (data?.hint) warnings.push(`${file.name}: ${data.hint}`);
          lastBank = data?.bank ?? lastBank;
        }

        if (rejected.length > 0) {
          warnings.push(statementFileRejectMessage(rejected[0]!.name));
        }

        const fullyDuplicate = inserted === 0 && alreadyExists > 0;
        setResult({
          total,
          inserted,
          alreadyExists,
          message:
            files.length > 1
              ? `${files.length} archivos · ${inserted} nuevos · ${alreadyExists} coincidencias · ${total} filas leídas`
              : (messages[0] ??
                `${inserted} nuevos · ${alreadyExists} coincidencias`),
          warning: warnings[0] ?? null,
          fullyDuplicate,
          hint: null,
          bank: lastBank,
        });
        if (inputRef.current) inputRef.current.value = "";
        if (inserted > 0) onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [bank, loading, onDone],
  );

  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      <div
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
            <h2
              className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}
            >
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
                ? "Excel, CSV o PDF · BBVA y Fiwind · arrastrá o elegí"
                : "Excel, CSV o PDF de BBVA, Fiwind u otro banco. Arrastrá el archivo o elegilo. Sin duplicados."}
            </p>
          </div>
          <label
            className={`block w-full ${compact ? "text-left" : "text-left max-w-md"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Banco
            </span>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <div
            data-no-swipe
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "copy";
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const list = filesFromDrop(e.dataTransfer);
              if (!list.length) {
                setError(
                  "No se recibió ningún archivo. Probá elegirlo con el botón.",
                );
                return;
              }
              void importFiles(list);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all",
              compact ? "" : "max-w-md",
              dragOver
                ? "scale-[1.01] border-emerald-500 bg-emerald-50 shadow-inner dark:bg-emerald-950/40"
                : "border-emerald-300/80 bg-white/60 dark:border-emerald-800 dark:bg-zinc-900/40",
              loading && "pointer-events-none opacity-80",
            )}
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
            ) : (
              <Upload className="h-6 w-6 text-emerald-700" />
            )}
            <p className="text-sm font-semibold">
              {loading
                ? "Importando…"
                : dragOver
                  ? "Soltá el archivo acá"
                  : "Arrastrá el Excel acá"}
            </p>
            {fileLabel && loading && (
              <p className="max-w-full truncate text-xs text-zinc-500">
                {fileLabel}
              </p>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Importando…" : "Elegir archivos"}
            </button>
            <input
              ref={inputRef}
              name="file"
              type="file"
              accept={STATEMENT_FILE_ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => {
                const list = e.currentTarget.files
                  ? Array.from(e.currentTarget.files)
                  : [];
                e.currentTarget.value = "";
                if (!list.length) {
                  setError("No se recibió ningún archivo.");
                  return;
                }
                void importFiles(list);
              }}
            />
          </div>
        </div>
      </div>

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
              {result.bank ? ` · ${result.bank}` : ""}
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
