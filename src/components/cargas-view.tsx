"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  Loader2,
  PenLine,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { ImportForm } from "@/components/import-form";
import { PageHeader, PageStack, Surface } from "@/components/ui";
import { formatDateAr, cn } from "@/lib/utils";

type CargaItem = {
  id: string;
  kind: "statement" | "receipt" | "manual";
  typeLabel: string;
  date: string;
  fileName: string | null;
  count: number;
  status: string;
  source: string | null;
  detail: string | null;
};

type Filter = "all" | "statement" | "receipt" | "manual";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return formatDateAr(iso.slice(0, 10));
  }
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);
}

function KindIcon({ kind }: { kind: CargaItem["kind"] }) {
  if (kind === "receipt") return <Receipt className="h-4 w-4" />;
  if (kind === "manual") return <PenLine className="h-4 w-4" />;
  return <FileSpreadsheet className="h-4 w-4" />;
}

export function CargasView() {
  const [items, setItems] = useState<CargaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cargas", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las cargas");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Todas" },
    { id: "statement", label: "Resúmenes" },
    { id: "receipt", label: "Tickets" },
    { id: "manual", label: "Manuales" },
  ];

  return (
    <PageStack>
      <PageHeader
        eyebrow="Historial"
        title="Cargas"
        description="Resúmenes de tarjeta (PDF/Excel), tickets escaneados y cargas manuales. Los duplicados no se vuelven a importar."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="lc-btn lc-btn-ghost !px-3 !py-2 text-sm"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Actualizar
          </button>
        }
      />

      <Surface elevated>
        <ImportForm
          compact
          onDone={() => {
            void load();
            window.dispatchEvent(new Event("lc:card-imported"));
          }}
        />
      </Surface>

      <Surface>
        <p className="text-sm font-medium text-[var(--foreground)]">
          Cómo sacar el resumen
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--muted-fg)]">
          <li>
            <span className="font-medium text-[var(--foreground)]">BBVA:</span>{" "}
            home banking → Tarjetas → <em>Últimos movimientos</em> (Excel) o{" "}
            <em>Resumen con vencimiento</em> (PDF).
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Fiwind:</span>{" "}
            app → Actividad o Tarjeta → exportar / compartir (Excel, CSV o PDF).
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">
              Si el banco no da archivo:
            </span>{" "}
            en la web, Imprimir → Guardar como PDF (no una foto). CSV/Excel entra
            mejor. Desde el celu, “Compartir” el PDF a LlevaCuentas.
          </li>
        </ul>
      </Surface>

      <Surface className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)]">
            MCP / agentes
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted-fg)]">
            Conectá grok.com o Cursor con el token de este hogar (se genera en
            /mcp).
          </p>
        </div>
        <Link href="/mcp" className="lc-btn lc-btn-ghost !px-3 !py-2 text-sm shrink-0">
          Cómo conectar MCP
        </Link>
      </Surface>


      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              filter === f.id
                ? "bg-[var(--brand-soft)] text-[var(--brand-fg)]"
                : "bg-[var(--surface-muted)] text-[var(--muted-fg)] hover:text-[var(--foreground)]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <Surface className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--muted-fg)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial…
        </Surface>
      ) : filtered.length === 0 ? (
        <Surface className="py-10 text-center text-sm text-[var(--muted-fg)]">
          Todavía no hay cargas{filter !== "all" ? " de este tipo" : ""}.
        </Surface>
      ) : (
        <Surface padding={false} className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 px-4 py-3 sm:px-5"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--brand-fg)]">
                  <KindIcon kind={item.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {item.typeLabel}
                    </p>
                    <p className="text-xs text-[var(--muted-fg)]">
                      {formatWhen(item.date)}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-[var(--muted-fg)]">
                    {item.fileName ||
                      (item.kind === "manual"
                        ? `Gastos del ${formatDateAr(item.detail)}`
                        : "Sin nombre")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 font-medium text-[var(--foreground)]">
                      {item.count}{" "}
                      {item.kind === "receipt"
                        ? item.count === 1
                          ? "ítem"
                          : "ítems"
                        : item.count === 1
                          ? "movimiento"
                          : "movimientos"}
                    </span>
                    <span className="rounded-md bg-[var(--brand-soft)]/60 px-2 py-0.5 text-[var(--brand-fg)]">
                      {item.status}
                    </span>
                    {item.source && item.kind === "statement" && (
                      <span className="inline-flex items-center gap-1 text-[var(--muted-fg)]">
                        <FileText className="h-3 w-3" />
                        {item.source}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </PageStack>
  );
}
