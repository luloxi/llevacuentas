"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileSpreadsheet,
  List,
  Plus,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TransactionsTable } from "@/components/transactions-table";
import { AddExpenseModal } from "@/components/add-expense-modal";
import { UploadModal } from "@/components/upload-modal";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };

type Tab = "gastos" | "importar";

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

export function ConsumosWorkspace() {
  const [tab, setTab] = useState<Tab>("gastos");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tableKey, setTableKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "warn">("ok");

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
    } catch {
      // ignore — modal can still open with empty selects
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  function refreshTable() {
    setTableKey((k) => k + 1);
    void loadMeta();
  }

  async function handleCardImportFiles(files: File[]) {
    type ImportResult = {
      total?: number;
      inserted?: number;
      alreadyExists?: number;
      skipped?: number;
      message?: string;
    };

    let total = 0;
    let inserted = 0;
    let already = 0;
    const fileMsgs: string[] = [];

    for (const file of files) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "bbva");
      const res = await fetch("/api/import/bbva", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${file.name}: ${await readErrorMessage(res)}`);
      const data = (await res.json()) as ImportResult;
      if ((data.total ?? 0) === 0) {
        throw new Error(
          `No se leyeron movimientos de “${file.name}”. ¿Es un Excel de Últimos movimientos o un PDF de resumen BBVA?`,
        );
      }
      total += data.total ?? 0;
      inserted += data.inserted ?? 0;
      already += data.alreadyExists ?? data.skipped ?? 0;
      if (data.message) fileMsgs.push(`${file.name}: ${data.message}`);
    }

    const fullyDup = inserted === 0 && already > 0;
    const msg =
      files.length > 1
        ? `${files.length} archivos · ${inserted} nuevos · ${already} coincidencias · ${total} filas leídas`
        : fileMsgs[0] ||
          (fullyDup
            ? `Este resumen ya estaba cargado: ${already} coincidencias.`
            : `${inserted} nuevos · ${already} coincidencias · ${total} filas leídas`);
    setToastTone(fullyDup || already > 0 ? "warn" : "ok");
    setToast(msg);
    if (inserted > 0) {
      refreshTable();
      setTab("gastos");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tabs */}
        <div className="inline-flex rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-inner dark:border-zinc-700/80 dark:bg-zinc-900/80">
          <button
            type="button"
            onClick={() => setTab("gastos")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              tab === "gastos"
                ? "bg-white text-emerald-700 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:text-emerald-400 dark:ring-white/10"
                : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
            )}
          >
            <List className="h-4 w-4" />
            Gastos
          </button>
          <button
            type="button"
            onClick={() => setTab("importar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              tab === "importar"
                ? "bg-white text-emerald-700 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:text-emerald-400 dark:ring-white/10"
                : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
            )}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importar tarjeta
          </button>
        </div>

        {tab === "gastos" && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        )}
      </div>

      {toast && (
        <p
          className={
            toastTone === "warn"
              ? "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              : "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          }
        >
          {toast}
        </p>
      )}

      {tab === "gastos" ? (
        <TransactionsTable key={tableKey} compactToolbar />
      ) : (
        <ImportCardPanel onOpenModal={() => setImportOpen(true)} />
      )}

      <AddExpenseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setToastTone("ok");
          setToast("Gasto agregado.");
          refreshTable();
        }}
        categories={categories}
        members={members}
      />

      <UploadModal
        open={importOpen}
        title="Importar resumen de tarjeta"
        description="Excel de “Últimos movimientos” (.xls/.xlsx) o PDF de resumen mensual BBVA. Podés subir varios a la vez."
        accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        processingLabel="Procesando resumen…"
        multiple
        onClose={() => setImportOpen(false)}
        onFiles={handleCardImportFiles}
      />
    </div>
  );
}

function ImportCardPanel({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-emerald-50/40 to-white p-6 dark:border-zinc-800 dark:from-emerald-950/20 dark:to-zinc-950">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
          <Upload className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Resumen de la tarjeta</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Importá el Excel de últimos movimientos o el PDF del resumen BBVA.
            Los movimientos nuevos se suman a Gastos; los duplicados se
            detectan solos.
          </p>
        </div>
        <ul className="space-y-1.5 text-left text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span>
            Home Banking → Últimos movimientos → exportar Excel
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span>
            O el PDF del resumen de cuenta del mes
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span>
            Varios archivos en una sola subida
          </li>
        </ul>
        <button
          type="button"
          onClick={onOpenModal}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Elegir archivos
        </button>
      </div>
    </div>
  );
}
