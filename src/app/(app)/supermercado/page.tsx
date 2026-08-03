"use client";

import { useState } from "react";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ReceiptsList } from "@/components/receipts-list";

export default function SupermercadoPage() {
  const [key, setKey] = useState(0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supermercado</h1>
        <p className="text-sm text-zinc-500">
          Foto del ticket → se asocia al gasto del resumen bancario o se agrega si no existe.
        </p>
      </div>

      <ReceiptUpload onDone={() => setKey((k) => k + 1)} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Desglose de tickets</h2>
        <ReceiptsList refreshKey={key} />
      </section>
    </div>
  );
}
