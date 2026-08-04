"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, PenLine, Plus, Trash2, X } from "lucide-react";
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

function categoryLabel(name: string): string {
  if (name.toLowerCase() === "uncategorized") return "Sin categoría";
  return name;
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
  const [mode, setMode] = useState<"choose" | "scan" | "manual">("choose");
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
    setMode("choose");
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
              quantity: it.quantity != null ? String(it.quantity) : "1",
              unitPrice: it.unit_price != null ? String(it.unit_price) : "",
              lineTotal: it.line_total != null ? String(it.line_total) : "",
            }),
          ),
        );
        setScanNote(
          `Ticket leído: ${ocrItems.length} ítems. Revisá y guardá.`,
        );
      } else {
        setScanNote(
          "Ticket leído. Completá lo que falte y guardá.",
        );
      }
      setMode("manual");
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
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Cerrar"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <div className="animate-fade-up relative z-10 flex max-h-[min(94vh,900px)] w-full max-w-lg flex-col rounded-t-3xl border border-emerald-900/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
          <h2
            id="add-expense-title"
            className="text-lg font-bold tracking-tight"
          >
            {mode === "choose"
              ? "Nuevo gasto"
              : mode === "scan"
                ? "Escanear ticket"
                : "Completar gasto"}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {mode === "choose" && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-center text-sm text-zinc-500">
                ¿Cómo querés cargar el gasto?
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode("scan");
                  window.setTimeout(() => scanRef.current?.click(), 80);
                }}
                className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b from-violet-500 to-violet-700 px-5 py-7 text-white shadow-lg shadow-violet-600/30 transition active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                  <Camera className="h-7 w-7" strokeWidth={2} />
                </span>
                <span className="text-base font-semibold">Escanear ticket</span>
                <span className="text-xs text-violet-100/90">
                  Foto → se completa solo
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setMode("manual")}
                className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-zinc-200 bg-zinc-50 px-5 py-6 transition hover:border-emerald-400 hover:bg-emerald-50/50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <PenLine className="h-6 w-6" />
                </span>
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Cargar a mano
                </span>
                <span className="text-xs text-zinc-500">
                  Comercio, monto y categoría
                </span>
              </button>
            </div>
          )}

          {mode === "scan" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <button
                type="button"
                disabled={busy}
                onClick={() => scanRef.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-2xl bg-gradient-to-b from-violet-500 to-violet-700 px-5 py-10 text-white shadow-lg shadow-violet-600/30 transition active:scale-[0.98] disabled:opacity-70"
              >
                {scanning ? (
                  <Loader2 className="h-10 w-10 animate-spin" />
                ) : (
                  <Camera className="h-10 w-10" strokeWidth={1.75} />
                )}
                <span className="text-lg font-semibold">
                  {scanning ? "Leyendo ticket…" : "Abrir cámara"}
                </span>
                {!scanning && (
                  <span className="text-sm text-violet-100/90">
                    o elegir foto de la galería
                  </span>
                )}
              </button>

              {error && (
                <p className="w-full rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setMode("manual");
                }}
                className="text-sm font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
              >
                Preferís cargarlo a mano →
              </button>
            </div>
          )}

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

          {mode === "manual" && (
            <div className="space-y-4 pb-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode("scan");
                  window.setTimeout(() => scanRef.current?.click(), 80);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/60"
              >
                <Camera className="h-4 w-4" />
                Escanear ticket en su lugar
              </button>

              {scanNote && (
                <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
                  {scanNote}
                </p>
              )}

              <div className="grid gap-3 grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Fecha
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Categoría
                  </span>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryLabel(c.name)}
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
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              <div className="grid gap-3 grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Monto $
                  </span>
                  <input
                    inputMode="decimal"
                    value={amountArs}
                    onChange={(e) => setAmountArs(e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    USD (opcional)
                  </span>
                  <input
                    inputMode="decimal"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>

              <div className="grid gap-3 grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Pagó
                  </span>
                  <select
                    value={paidByUserId}
                    onChange={(e) => setPaidByUserId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </label>
              </div>

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
                  <span className="font-medium">Detalle por ítems</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Líneas del ticket de súper
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
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {mode === "manual" && (
          <div className="flex shrink-0 gap-2 border-t border-zinc-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !description.trim()}
              onClick={() => void save()}
              className="lc-btn lc-btn-primary flex-1 !py-3 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        )}

        {mode === "choose" && (
          <div className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="w-full rounded-xl py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
