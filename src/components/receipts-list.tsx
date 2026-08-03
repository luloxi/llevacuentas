"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArs, formatDateAr } from "@/lib/utils";

type Receipt = {
  id: string;
  merchantName: string | null;
  receiptDate: string | null;
  totalArs: number | null;
  status: string;
  transactionId: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number | null;
    lineTotal: number | null;
  }>;
};

export function ReceiptsList({ refreshKey }: { refreshKey?: number }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/receipts");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error");
      return;
    }
    setReceipts(data.receipts);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (receipts.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Todavía no hay tickets. Sacá una foto de un ticket de súper.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {receipts.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800"
        >
          <button
            type="button"
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <div className="font-medium">
                {r.merchantName || "Ticket"}
              </div>
              <div className="text-xs text-zinc-500">
                {formatDateAr(r.receiptDate)} · {r.items.length} ítems ·{" "}
                {r.status}
                {r.transactionId ? " · vinculado" : ""}
              </div>
            </div>
            <div className="font-semibold tabular-nums">
              {formatArs(r.totalArs)}
            </div>
          </button>
          {openId === r.id && (
            <ul className="border-t border-zinc-100 px-4 py-2 text-sm dark:border-zinc-800">
              {r.items.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between gap-2 border-b border-zinc-50 py-1.5 last:border-0 dark:border-zinc-900"
                >
                  <span>
                    {i.quantity && i.quantity !== 1 ? `${i.quantity}× ` : ""}
                    {i.name}
                  </span>
                  <span className="tabular-nums text-zinc-600">
                    {formatArs(i.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
