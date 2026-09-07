import { and, desc, eq } from "drizzle-orm";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import { isPeriodDebtSource } from "@/lib/import/source";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";
import { periodFromDateString } from "@/lib/utils";

/**
 * Visibility:
 * - shared → visible to every household member
 * - personal → only the member who paid / owns it (paidByUserId)
 */
export function isVisibleToUser(
  tx: { ownership: string; paidByUserId: string | null },
  userId: string,
): boolean {
  if (tx.ownership === "shared") return true;
  return tx.paidByUserId === userId;
}

/**
 * List household transactions for Consumos / analysis APIs.
 * Kept free of PDF/xlsx import deps so /api/transactions can load on serverless.
 */
export async function listTransactions(
  householdId: string,
  opts?: {
    period?: string;
    categoryId?: string;
    q?: string;
    /** Only rows with no category or Uncategorized */
    uncategorizedOnly?: boolean;
    /** Include card payments / credits (default false — Consumos shows expenses only) */
    includePayments?: boolean;
    /**
     * When set, apply privacy: personal only if paidByUserId matches,
     * shared always visible. Required for multi-member households.
     */
    viewerUserId?: string;
    /** Only shared (Hogar). Ignores personal even of the viewer. */
    sharedOnly?: boolean;
  },
) {
  const db = getDb();
  const { byId, bySlug } = await getCategoryMap();
  const uncatId = bySlug.get("uncategorized")?.id ?? null;

  const rows = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId))
    .orderBy(desc(schema.transactions.date));

  return rows.filter((r) => {
    if (!opts?.includePayments && r.isPayment) return false;
    if (!opts?.includePayments && r.isCredit) return false;
    if (
      !opts?.includePayments &&
      isBankAccountingEntry(r.descriptionNormalized)
    ) {
      return false;
    }
    if (!opts?.includePayments && isPeriodDebtSource(r.source)) {
      return false;
    }

    if (opts?.sharedOnly) {
      if (r.ownership !== "shared") return false;
    } else if (opts?.viewerUserId) {
      if (!isVisibleToUser(r, opts.viewerUserId)) return false;
    }

    if (opts?.period) {
      if (periodFromDateString(r.date) !== opts.period) return false;
    }
    if (opts?.categoryId && r.categoryId !== opts.categoryId) return false;
    if (opts?.uncategorizedOnly) {
      const slug = r.categoryId ? byId.get(r.categoryId)?.slug : null;
      const bare =
        !r.categoryId || r.categoryId === uncatId || slug === "uncategorized";
      if (!bare) return false;
    }
    if (opts?.q) {
      const q = opts.q.toUpperCase();
      if (!r.descriptionNormalized.toUpperCase().includes(q)) return false;
    }
    return true;
  });
}

export async function updateTransaction(
  householdId: string,
  id: string,
  patch: {
    categoryId?: string | null;
    ownership?: "personal" | "shared";
    paidByUserId?: string | null;
    splitPct?: number;
    bank?: string | null;
    date?: string;
    amountArs?: number | null;
    amountUsd?: number | null;
  },
) {
  const db = getDb();

  if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) {
    throw new Error("Fecha inválida (YYYY-MM-DD)");
  }

  const { amountArs, amountUsd, ...rest } = patch;
  const set: {
    categoryId?: string | null;
    ownership?: "personal" | "shared";
    paidByUserId?: string | null;
    splitPct?: number;
    bank?: string | null;
    date?: string;
    amountArs?: string | null;
    amountUsd?: string | null;
    updatedAt: Date;
  } = { ...rest, updatedAt: new Date() };

  if ("amountArs" in patch) {
    if (amountArs == null) {
      set.amountArs = null;
    } else {
      const n = Number(amountArs);
      if (Number.isNaN(n)) throw new Error("Monto $ inválido");
      set.amountArs = String(Math.abs(n));
    }
  }
  if ("amountUsd" in patch) {
    if (amountUsd == null) {
      set.amountUsd = null;
    } else {
      const n = Number(amountUsd);
      if (Number.isNaN(n)) throw new Error("Monto USD inválido");
      set.amountUsd = String(Math.abs(n));
    }
  }

  const [row] = await db
    .update(schema.transactions)
    .set(set)
    .where(
      and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.householdId, householdId),
      ),
    )
    .returning();
  return row;
}
