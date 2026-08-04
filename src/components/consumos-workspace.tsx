"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, FileSpreadsheet, ChevronDown } from "lucide-react";
import { TransactionsTable } from "@/components/transactions-table";
import { ImportForm } from "@/components/import-form";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ReceiptsList } from "@/components/receipts-list";
import { cn } from "@/lib/utils";

type Panel = "import" | "ticket" | null;

/**
 * Consumos hub: bank import + ticket photo + transactions table.
 */
export function ConsumosWorkspace() {
  const [panel, setPanel] = useState<Panel>(null);
  const [tableKey, setTableKey] = useState(0);
  const [receiptKey, setReceiptKey] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [purging, setPurging] = useState(false);

  const refreshReceiptCount = useCallback(async () => {
    try {
      const res = await fetch("/api/receipts", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setReceiptCount((data.receipts as unknown[])?.length ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshReceiptCount();
  }, [refreshReceiptCount, receiptKey]);

  function refreshTable() {
    setTableKey((k) => k + 1);
  }

  function toggle(next: Panel) {
    setPanel((p) => (p === next ? null : next));
  }

  async function purgeAllTickets() {
    if (
      !confirm(
        "Se van a borrar todos los tickets de supermercado y los gastos creados desde tickets. ¿Continuar?",
      )
    ) {
      return;
    }
    setPurging(true);
    try {
      const res = await fetch("/api/receipts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setReceiptKey((k) => k + 1);
        refreshTable();
        setReceiptCount(0);
      }
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-5">
      {receiptCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p>
            Hay {receiptCount} ticket(s) cargado(s). Si alguno quedó mal (fecha
            incorrecta, etc.), podés borrarlos.
          </p>
          <button
            type="button"
            disabled={purging}
            onClick={() => void purgeAllTickets()}
            className="shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950"
          >
            {purging ? "Borrando…" : "Borrar todos los tickets"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggle("import")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
            panel === "import"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Importar banco
          <ChevronDown
            className={cn(
              "h-4 w-4 transition",
              panel === "import" && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => toggle("ticket")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
            panel === "ticket"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          <Camera className="h-4 w-4" />
          Foto de ticket
          <ChevronDown
            className={cn(
              "h-4 w-4 transition",
              panel === "ticket" && "rotate-180",
            )}
          />
        </button>
      </div>

      {panel === "import" && (
        <ImportForm
          compact
          onDone={() => {
            refreshTable();
            setPanel(null);
          }}
        />
      )}

      {panel === "ticket" && (
        <div className="space-y-4">
          <ReceiptUpload
            onDone={() => {
              setReceiptKey((k) => k + 1);
              refreshTable();
            }}
          />
          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Tickets cargados
            </h2>
            <ReceiptsList
              refreshKey={receiptKey}
              onChanged={() => {
                setReceiptKey((k) => k + 1);
                refreshTable();
              }}
            />
          </div>
        </div>
      )}

      <TransactionsTable key={tableKey} />
    </div>
  );
}
