"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileSpreadsheet,
  List,
  Plus,
  Upload,
} from "lucide-react";
import { TransactionsTable } from "@/components/transactions-table";
import { AddExpenseModal } from "@/components/add-expense-modal";
import { UploadModal } from "@/components/upload-modal";
import {
  EmptyState,
  PageStack,
  SegmentedControl,
  Toast,
} from "@/components/ui";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };

type Tab = "gastos" | "importar";

const OPEN_FLAG = "lc_open_add_expense";

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
  const searchParams = useSearchParams();
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
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) return;
      const data = JSON.parse(text) as {
        categories?: Category[];
        members?: Member[];
      };
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // Open modal from deep link / FAB without remounting (no router.replace)
  useEffect(() => {
    let shouldOpen = false;

    try {
      if (sessionStorage.getItem(OPEN_FLAG) === "1") {
        sessionStorage.removeItem(OPEN_FLAG);
        shouldOpen = true;
      }
    } catch {
      // private mode etc.
    }

    if (searchParams.get("scan") === "1") {
      shouldOpen = true;
      // Soft-clear query without Next navigation (avoids Suspense remount)
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/consumos");
      }
    }

    if (shouldOpen) {
      setTab("gastos");
      setAddOpen(true);
    }
  }, [searchParams]);

  // Listen for open requests while already on this page
  useEffect(() => {
    function onOpen() {
      setTab("gastos");
      setAddOpen(true);
    }
    window.addEventListener("lc:open-add-expense", onOpen);
    return () => window.removeEventListener("lc:open-add-expense", onOpen);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    <PageStack>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { id: "gastos", label: "Gastos", icon: <List className="h-4 w-4" /> },
            {
              id: "importar",
              label: "Importar tarjeta",
              icon: <FileSpreadsheet className="h-4 w-4" />,
            },
          ]}
        />

        {tab === "gastos" && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="lc-btn lc-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        )}
      </div>

      {toast && <Toast tone={toastTone}>{toast}</Toast>}

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
    </PageStack>
  );
}

function ImportCardPanel({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <EmptyState
      icon={<Upload className="h-7 w-7" />}
      title="Resumen de la tarjeta"
      description="Importá el Excel de últimos movimientos o el PDF del resumen BBVA. Los movimientos nuevos se suman a Gastos; los duplicados se detectan solos."
      action={
        <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
          <ul className="space-y-2 text-left text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 dark:bg-emerald-950/30">
              <span className="font-semibold text-emerald-600">✓</span>
              Home Banking → Últimos movimientos → exportar Excel
            </li>
            <li className="flex gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 dark:bg-emerald-950/30">
              <span className="font-semibold text-emerald-600">✓</span>
              O el PDF del resumen de cuenta del mes
            </li>
            <li className="flex gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 dark:bg-emerald-950/30">
              <span className="font-semibold text-emerald-600">✓</span>
              Varios archivos en una sola subida
            </li>
          </ul>
          <button
            type="button"
            onClick={onOpenModal}
            className="lc-btn lc-btn-primary w-full"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Elegir archivos
          </button>
        </div>
      }
    />
  );
}
