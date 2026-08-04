"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImageForUpload } from "@/lib/image-compress";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };

type LineItem = {
  key: string;
  name: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  productCategory: string;
};

const PRODUCT_SUBCATS = [
  "Lácteos",
  "Panadería",
  "Bebidas",
  "Carnes",
  "Verduras",
  "Frutas",
  "Limpieza",
  "Higiene",
  "Snacks",
  "Congelados",
  "Almacén",
  "Otros",
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function newItem(partial?: Partial<LineItem>): LineItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    quantity: "1",
    unitPrice: "",
    lineTotal: "",
    productCategory: "",
    ...partial,
  };
}

function memberLabel(m: Member): string {
  const n = m.name.trim();
  if (!n) return "Sin nombre";
  return n.split(/\s+/)[0] ?? n;
}

export function AddExpenseModal({
  open,
  onClose,
  onCreated,
  categories,
  members,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categories: Category[];
  members: Member[];
}) {
  const scanRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [amountArs, setAmountArs] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paidByUserId, setPaidByUserId] = useState("");
  const [ownership, setOwnership] = useState<"personal" | "shared">("personal");
  const [complex, setComplex] = useState(false);
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setDescription("");
    setAmountArs("");
    setAmountUsd("");
    setCategoryId(
      categories.find((c) => c.slug === "uncategorized")?.id ??
        categories[0]?.id ??
        "",
    );
    setPaidByUserId(members[0]?.userId ?? "");
    setOwnership("personal");
    setComplex(false);
    setItems([newItem()]);
    setScanning(false);
    setSaving(false);
    setError(null);
    setScanNote(null);
  }, [open, categories, members]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving && !scanning) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, scanning, onClose]);

  // Keep total in sync with items when complex
  useEffect(() => {
    if (!complex) return;
    const sum = items.reduce((s, it) => {
      let line = parseFloat(it.lineTotal.replace(",", "."));
      if (!Number.isFinite(line)) {
        const q = parseFloat(it.quantity.replace(",", ".")) || 0;
        const u = parseFloat(it.unitPrice.replace(",", ".")) || 0;
        line = q * u;
      }
      return s + (Number.isFinite(line) ? line : 0);
    }, 0);
    if (sum > 0) setAmountArs(sum.toFixed(2));
  }, [complex, items]);

  async function onScanFile(file: File) {
    setScanning(true);
    setError(null);
    setScanNote(null);
    try {
      const compressed = await compressImageForUpload(file);
      const fd = new FormData();
      fd.set("file", compressed);
      fd.set("dryRun", "1");
      const res = await fetch("/api/receipts", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`);
      }
      const ocr = data.ocr as {
        merchant?: string | null;
        date?: string | null;
        total?: number | null;
        items?: Array<{
          name: string;
          quantity?: number | null;
          unit_price?: number | null;
          line_total?: number | null;
        }>;
      };

      if (ocr.merchant) setDescription(ocr.merchant);
      if (ocr.date) setDate(ocr.date);
      if (ocr.total != null) setAmountArs(String(ocr.total));

      const superCat = categories.find((c) => c.slug === "supermercado");
      if (superCat) setCategoryId(superCat.id);
      setOwnership("shared");

      const ocrItems = ocr.items ?? [];
      if (ocrItems.length > 0) {
        setComplex(true);
        setItems(
          ocrItems.map((it) =>
            newItem({
              name: it.name || "",
              quantity:
                it.quantity != null ? String(it.quantity) : "1",
              unitPrice:
                it.unit_price != null ? String(it.unit_price) : "",
              lineTotal:
                it.line_total != null ? String(it.line_total) : "",
            }),
          ),
        );
        setScanNote(
          `Ticket leído: ${ocrItems.length} ítems. Revisá y guardá el gasto.`,
        );
      } else {
        setScanNote(
          "Ticket leído. Completá el monto si falta y guardá (podés desglosar en ítems).",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el ticket");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        date,
        description: description.trim(),
        amountArs: amountArs ? amountArs.replace(",", ".") : null,
        amountUsd: amountUsd ? amountUsd.replace(",", ".") : null,
        categoryId: categoryId || null,
        paidByUserId: paidByUserId || null,
        ownership,
      };
      if (complex) {
        payload.items = items
          .filter((i) => i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            quantity: i.quantity
              ? parseFloat(i.quantity.replace(",", "."))
              : 1,
            unitPrice: i.unitPrice
              ? parseFloat(i.unitPrice.replace(",", "."))
              : null,
            lineTotal: i.lineTotal
              ? parseFloat(i.lineTotal.replace(",", "."))
              : null,
            productCategory: i.productCategory || null,
          }));
      }
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo guardar");
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const busy = saving || scanning;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Cerrar"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2
              id="add-expense-title"
              className="text-lg font-semibold tracking-tight"
            >
              Agregar gasto
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* Scan CTA — solid button so it reads as the primary shortcut */}
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => scanRef.current?.click()}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-violet-600 px-4 py-3.5 text-base font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700 active:scale-[0.99] disabled:opacity-60"
            >
              {scanning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              {scanning ? "Leyendo ticket…" : "Escanear ticket"}
            </button>
            <p className="text-center text-xs text-zinc-500">
              La forma más fácil: sacá una foto y se autocompleta el comercio,
              la fecha, el total y los ítems. Después solo revisás y guardás.
            </p>
          </div>
          <input
            ref={scanRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onScanFile(f);
            }}
          />

          {scanNote && (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
              {scanNote}
            </p>
          )}

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-2 text-xs text-zinc-400 dark:bg-zinc-950">
                o completá a mano
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Fecha
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Categoría
              </span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Comercio / descripción
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Carrefour, Uber, Farmacia…"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Monto $
              </span>
              <input
                inputMode="decimal"
                value={amountArs}
                onChange={(e) => setAmountArs(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Monto USD (opcional)
              </span>
              <input
                inputMode="decimal"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Pagó
              </span>
              <select
                value={paidByUserId}
                onChange={(e) => setPaidByUserId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {memberLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Tipo
              </span>
              <select
                value={ownership}
                onChange={(e) =>
                  setOwnership(e.target.value as "personal" | "shared")
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="personal">Personal</option>
                <option value="shared">Compartido</option>
              </select>
            </label>
          </div>

          {/* Complex toggle */}
          <button
            type="button"
            onClick={() => {
              setComplex((v) => {
                if (!v && items.length === 0) setItems([newItem()]);
                return !v;
              });
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition",
              complex
                ? "border-emerald-500 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900",
            )}
          >
            <span>
              <span className="font-medium">Gasto con detalle (ítems)</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Como un ticket de súper: líneas editables y subcategorías
              </span>
            </span>
            <span
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition",
                complex ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-600",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                  complex ? "left-5" : "left-0.5",
                )}
              />
            </span>
          </button>

          {complex && (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Ítems del ticket
              </p>
              {items.map((it, idx) => (
                <div
                  key={it.key}
                  className="space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <div className="flex gap-2">
                    <input
                      value={it.name}
                      onChange={(e) =>
                        setItems((list) =>
                          list.map((row, i) =>
                            i === idx ? { ...row, name: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder={`Producto ${idx + 1}`}
                      className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setItems((list) =>
                          list.length <= 1
                            ? [newItem()]
                            : list.filter((_, i) => i !== idx),
                        )
                      }
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Quitar ítem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={it.quantity}
                      onChange={(e) =>
                        setItems((list) =>
                          list.map((row, i) =>
                            i === idx
                              ? { ...row, quantity: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Cant."
                      inputMode="decimal"
                      className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <input
                      value={it.unitPrice}
                      onChange={(e) =>
                        setItems((list) =>
                          list.map((row, i) =>
                            i === idx
                              ? { ...row, unitPrice: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="P. unit."
                      inputMode="decimal"
                      className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <input
                      value={it.lineTotal}
                      onChange={(e) =>
                        setItems((list) =>
                          list.map((row, i) =>
                            i === idx
                              ? { ...row, lineTotal: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Total"
                      inputMode="decimal"
                      className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
                    />
                  </div>
                  <select
                    value={it.productCategory}
                    onChange={(e) =>
                      setItems((list) =>
                        list.map((row, i) =>
                          i === idx
                            ? { ...row, productCategory: e.target.value }
                            : row,
                        ),
                      )
                    }
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                  >
                    <option value="">Subcategoría…</option>
                    {PRODUCT_SUBCATS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((list) => [...list, newItem()])}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar ítem
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !description.trim()}
            onClick={() => void save()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar gasto
          </button>
        </div>
      </div>
    </div>
  );
}
