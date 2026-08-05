"use client";

import { formatArs, formatUsd, formatDateAr } from "@/lib/utils";

type CategoryOpt = { id: string; slug: string; name: string };

type Tx = {
  id: string;
  date: string;
  descriptionNormalized: string;
  amountArs: number | null;
  amountUsd: number | null;
  category: CategoryOpt | null;
};

/**
 * Expense row for Resumen: name always visible on mobile (stacked layout).
 */
export function MesAMesTxRow({
  t,
  categories,
  savingId,
  onChangeCategory,
}: {
  t: Tx;
  categories: CategoryOpt[];
  savingId: string | null;
  onChangeCategory: (txId: string, categoryId: string) => void;
}) {
  const hasArs =
    t.amountArs != null &&
    Number.isFinite(t.amountArs) &&
    Math.abs(t.amountArs) > 0;
  const hasUsd =
    t.amountUsd != null &&
    Number.isFinite(t.amountUsd) &&
    Math.abs(t.amountUsd) > 0;

  return (
    <li className="rounded-xl border border-zinc-100/80 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs tabular-nums text-zinc-500">
            {formatDateAr(t.date)}
          </p>
          <p className="mt-0.5 break-words font-medium leading-snug text-zinc-900 dark:text-zinc-50">
            {t.descriptionNormalized || "Sin descripción"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {hasArs && (
            <p className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
              {formatArs(Math.abs(t.amountArs!))}
            </p>
          )}
          {hasUsd && (
            <p className="text-xs font-medium tabular-nums text-sky-700 dark:text-sky-300">
              {formatUsd(Math.abs(t.amountUsd!))}
            </p>
          )}
          {!hasArs && !hasUsd && (
            <p className="text-zinc-400">—</p>
          )}
        </div>
      </div>
      <div className="mt-2">
        <select
          value={t.category?.id ?? ""}
          disabled={savingId === t.id}
          onChange={(e) => onChangeCategory(t.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="lc-input w-full !px-2 !py-1.5 text-xs"
        >
          <option value="">Sin categoría</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
