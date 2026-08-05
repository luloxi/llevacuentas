"use client";

import { useEffect, useState } from "react";
import { TransactionsTable } from "@/components/transactions-table";
import { PageStack, Toast } from "@/components/ui";

/**
 * Gastos = list + filters only.
 * Add expense and card import live in the central + modal.
 */
export function ConsumosWorkspace() {
  const [tableKey, setTableKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

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
      {toast && <Toast>{toast}</Toast>}
      <TransactionsTable key={tableKey} compactToolbar />
    </PageStack>
  );
}
