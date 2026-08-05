"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  FileSpreadsheet,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
  "Lácteos", "Panadería", "Bebidas", "Carnes", "Verduras", "Frutas",
  "Limpieza", "Higiene", "Snacks", "Congelados", "Almacén", "Otros",
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function memberLabel(m: Member) {
  const n = m.name.trim();
  return n ? (n.split(/\s+/)[0] ?? n) : "Sin nombre";
}

function categoryLabel(name: string) {
  return name.toLowerCase() === "uncategorized" ? "Sin categoría" : name;
}

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
  const cardRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [fromScan, setFromScan] = useState(false);
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
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode("choose");
      setFromScan(false);
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
      setImporting(false);
      setSaving(false);
      setError(null);
      setScanNote(null);
      setImportNote(null);
    }
    wasOpen.current = open;
  }, [open, categories, members]);

  useEffect(() => {
    if (!open) return;
    if (!categoryId && categories[0]) {
      setCategoryId(
        categories.find((c) => c.slug === "uncategorized")?.id ??
          categories[0].id,
      );
    }
    if (!paidByUserId && members[0]) setPaidByUserId(members[0].userId);
  }, [open, categories, members, categoryId, paidByUserId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !scanning && !importing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, scanning, importing, onClose]);

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
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
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
        setScanNote(`Leímos ${ocrItems.length} ítems del ticket`);
      } else {
        setScanNote("Ticket leído — revisá y guardá");
      }
      setFromScan(true);
      setMode("manual");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el ticket");
    } finally {
      setScanning(false);
    }
  }

  async function onCardFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    setImporting(true);
    setError(null);
    setImportNote(null);
    try {
      let total = 0;
      let inserted = 0;
      let already = 0;
      const msgs: string[] = [];

      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", "bbva");
        const res = await fetch("/api/import/bbva", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`${file.name}: ${await readErrorMessage(res)}`);
        }
        const data = (await res.json()) as {
          total?: number;
          inserted?: number;
          alreadyExists?: number;
          skipped?: number;
          message?: string;
        };
        if ((data.total ?? 0) === 0) {
          throw new Error(
            `No se leyeron movimientos de “${file.name}”. ¿Excel de Últimos movimientos o PDF de resumen BBVA?`,
          );
        }
        total += data.total ?? 0;
        inserted += data.inserted ?? 0;
        already += data.alreadyExists ?? data.skipped ?? 0;
        if (data.message) msgs.push(data.message);
      }

      const note =
        files.length > 1
          ? `${files.length} archivos · ${inserted} nuevos · ${already} ya estaban · ${total} filas`
          : msgs[0] ||
            `${inserted} nuevos · ${already} ya estaban · ${total} filas`;
      setImportNote(note);
      window.dispatchEvent(new Event("lc:card-imported"));
      onCreated();
      // Brief pause so user sees result, then close
      window.setTimeout(() => onClose(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImporting(false);
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
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const busy = saving || scanning || importing;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px]"
        aria-label="Cerrar"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <div className="animate-fade-up relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-[0_25px_80px_-20px_rgba(0,0,0,0.45)] dark:border-zinc-800 dark:bg-zinc-950">
        <div className="relative shrink-0 overflow-hidden px-5 pt-5 pb-3">
          {mode === "choose" && (
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/10 via-emerald-400/5 to-transparent dark:from-violet-500/15 dark:via-emerald-500/5"
              aria-hidden
            />
          )}
          <div className="relative flex items-start justify-between gap-3">
            <div>
              {mode === "choose" ? (
                <>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                    <Sparkles className="h-3 w-3" />
                    Nuevo gasto
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    ¿Cómo lo cargamos?
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Ticket, a mano o resumen de tarjeta.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    {fromScan ? "Desde el ticket" : "A mano"}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Completar gasto
                  </h2>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
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
          <input
            ref={cardRef}
            type="file"
            accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const list = e.target.files;
              e.target.value = "";
              if (list?.length) void onCardFiles(list);
            }}
          />

          {mode === "choose" && (
            <div className="flex flex-col gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => scanRef.current?.click()}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-fuchsia-700 p-[1px] text-left shadow-lg shadow-violet-600/30 transition active:scale-[0.985] disabled:opacity-60"
              >
                <div className="relative flex items-center gap-4 rounded-[0.95rem] bg-gradient-to-br from-violet-500 to-violet-700 px-5 py-5 text-white">
                  <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                    {scanning ? (
                      <Loader2 className="h-7 w-7 animate-spin" />
                    ) : (
                      <Camera className="h-7 w-7" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="relative min-w-0">
                    <span className="block text-lg font-semibold tracking-tight">
                      {scanning ? "Leyendo ticket…" : "Escanear ticket"}
                    </span>
                    <span className="mt-0.5 block text-sm text-violet-100/90">
                      Sacá una foto y lo completamos por vos
                    </span>
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFromScan(false);
                  setScanNote(null);
                  setMode("manual");
                }}
                className="group flex items-center gap-4 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 px-5 py-4.5 text-left shadow-sm transition hover:border-emerald-300/80 hover:bg-emerald-50/50 active:scale-[0.985] dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 ring-1 ring-emerald-200/60 dark:from-emerald-950 dark:to-teal-950 dark:text-emerald-300 dark:ring-emerald-900">
                  <PenLine className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Cargar a mano
                  </span>
                  <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
                    Comercio, monto y listo
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => cardRef.current?.click()}
                className="group flex items-center gap-4 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 px-5 py-4.5 text-left shadow-sm transition hover:border-sky-300/80 hover:bg-sky-50/50 active:scale-[0.985] dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-sky-800 dark:hover:bg-sky-950/20"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 ring-1 ring-sky-200/60 dark:from-sky-950 dark:to-blue-950 dark:text-sky-300 dark:ring-sky-900">
                  {importing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {importing ? "Importando…" : "Importar tarjeta"}
                  </span>
                  <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
                    Excel o PDF del resumen BBVA
                  </span>
                </span>
              </button>

              {importNote && (
                <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs font-medium text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                  {importNote}
                </p>
              )}
              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </p>
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-3.5 pt-1">
              {fromScan && scanNote && (
                <div className="flex items-start justify-between gap-2 rounded-xl border border-violet-200/80 bg-violet-50 px-3 py-2.5 dark:border-violet-900/50 dark:bg-violet-950/40">
                  <p className="text-xs font-medium leading-relaxed text-violet-900 dark:text-violet-100">
                    {scanNote}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => scanRef.current?.click()}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-900/50"
                  >
                    {scanning ? "…" : "Otra foto"}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Fecha</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Categoría</span>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{categoryLabel(c.name)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Comercio</span>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Carrefour, Uber…" autoFocus={!fromScan} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Pesos</span>
                  <input inputMode="decimal" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Dólares</span>
                  <input inputMode="decimal" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="—" className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Pagó</span>
                  <select value={paidByUserId} onChange={(e) => setPaidByUserId(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{memberLabel(m)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Visibilidad</span>
                  <select value={ownership} onChange={(e) => setOwnership(e.target.value as "personal" | "shared")} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                    <option value="personal">Solo yo</option>
                    <option value="shared">Hogar</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={() =>
                  setComplex((v) => {
                    if (!v && items.length === 0) setItems([newItem()]);
                    return !v;
                  })
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm",
                  complex
                    ? "border-emerald-500 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                    : "border-zinc-200 dark:border-zinc-700",
                )}
              >
                <span className="font-medium">Detalle por ítems</span>
                <span className={cn("relative h-6 w-11 rounded-full", complex ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-600")}>
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", complex ? "left-5" : "left-0.5")} />
                </span>
              </button>

              {complex && (
                <div className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  {items.map((it, idx) => (
                    <div key={it.key} className="space-y-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
                      <div className="flex gap-2">
                        <input value={it.name} onChange={(e) => setItems((list) => list.map((row, i) => i === idx ? { ...row, name: e.target.value } : row))} placeholder={`Producto ${idx + 1}`} className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
                        <button type="button" onClick={() => setItems((list) => list.length <= 1 ? [newItem()] : list.filter((_, i) => i !== idx))} className="p-1.5 text-zinc-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input value={it.quantity} onChange={(e) => setItems((list) => list.map((row, i) => i === idx ? { ...row, quantity: e.target.value } : row))} placeholder="Cant." inputMode="decimal" className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" />
                        <input value={it.unitPrice} onChange={(e) => setItems((list) => list.map((row, i) => i === idx ? { ...row, unitPrice: e.target.value } : row))} placeholder="P. unit." inputMode="decimal" className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" />
                        <input value={it.lineTotal} onChange={(e) => setItems((list) => list.map((row, i) => i === idx ? { ...row, lineTotal: e.target.value } : row))} placeholder="Total" inputMode="decimal" className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" />
                      </div>
                      <select value={it.productCategory} onChange={(e) => setItems((list) => list.map((row, i) => i === idx ? { ...row, productCategory: e.target.value } : row))} className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900">
                        <option value="">Subcategoría…</option>
                        {PRODUCT_SUBCATS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ))}
                  <button type="button" onClick={() => setItems((list) => [...list, newItem()])} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Plus className="h-3.5 w-3.5" /> Ítem
                  </button>
                </div>
              )}

              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" disabled={busy} onClick={() => { setMode("choose"); setFromScan(false); setScanNote(null); }} className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium dark:border-zinc-700">
                  Atrás
                </button>
                <button type="button" disabled={busy || !description.trim()} onClick={() => void save()} className="lc-btn lc-btn-primary flex-1 !py-3 disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
