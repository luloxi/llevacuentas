"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutList, LineChart, List } from "lucide-react";
import { TransactionsTable } from "@/components/transactions-table";
import { MesAMesView } from "@/components/mes-a-mes";
import { PageStack, SegmentedControl, Toast } from "@/components/ui";

type Tab = "lista" | "resumen" | "charts";

function tabFromParam(raw: string | null): Tab {
  if (raw === "resumen" || raw === "charts" || raw === "lista") return raw;
  return "lista";
}

/**
 * Gastos hosts the expense list plus the former Análisis resumen/charts.
 * Add expense and card import live in the central + modal.
 */
export function ConsumosWorkspace() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    tabFromParam(searchParams.get("tab")),
  );
  const [tableKey, setTableKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setTab(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    function onCreated() {
      setToast("Gasto agregado.");
      setTableKey((k) => k + 1);
    }
    function onImported() {
      setToast("Importación lista.");
      setTableKey((k) => k + 1);
    }
    window.addEventListener("lc:expense-created", onCreated);
    window.addEventListener("lc:card-imported", onImported);
    return () => {
      window.removeEventListener("lc:expense-created", onCreated);
      window.removeEventListener("lc:card-imported", onImported);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <PageStack>
      <div className="flex justify-end">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            {
              id: "lista",
              label: "Lista",
              icon: <List className="h-3.5 w-3.5" />,
            },
            {
              id: "resumen",
              label: "Resumen",
              icon: <LayoutList className="h-3.5 w-3.5" />,
            },
            {
              id: "charts",
              label: "Gráficos",
              icon: <LineChart className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </div>

      {toast && <Toast>{toast}</Toast>}

      {tab === "lista" ? (
        <TransactionsTable key={tableKey} compactToolbar />
      ) : (
        <MesAMesView mode={tab === "charts" ? "charts" : "resumen"} />
      )}
    </PageStack>
  );
}
