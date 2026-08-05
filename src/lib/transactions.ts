import { and, desc, eq } from "drizzle-orm";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";
import { periodFromDateString } from "@/lib/utils";

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
    // Pesificación / transferencia deuda: not a real spend
    if (
      !opts?.includePayments &&
      isBankAccountingEntry(r.descriptionNormalized)
    ) {
      return false;
    }
    if (opts?.period) {
      // Strict calendar month from stored date text (never Date() / TZ)
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
  },
) {
  const db = getDb();
  const [row] = await db
    .update(schema.transactions)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.householdId, householdId),
      ),
    )
    .returning();
  return row;
}
