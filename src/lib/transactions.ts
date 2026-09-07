import { and, desc, eq } from "drizzle-orm";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import { isPeriodDebtSource } from "@/lib/import/source";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";
import { periodFromDateString } from "@/lib/utils";
import { isConsumosHiddenPayment } from "@/lib/reintegro-hogar";

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
    if (
      !opts?.includePayments &&
      isConsumosHiddenPayment(r.isPayment, r.descriptionNormalized)
    ) {
      return false;
    }
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
    /** Internal transfer / non-spend — hidden from Consumos + neta. */
    isPayment?: boolean;
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
    isPayment?: boolean;
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

/**
 * Move a gasto to another household the user belongs to.
 * Receipts follow; household-scoped categories fall back to uncategorized.
 * Assigning to a household ⇒ ownership shared; Personal stays in-place via PATCH ownership.
 */
export async function moveTransactionToHousehold(opts: {
  fromHouseholdId: string;
  toHouseholdId: string;
  txId: string;
  userId: string;
  /** Default shared (assign to hogar). Personal bank space uses "personal". */
  ownership?: "personal" | "shared";
}) {
  const {
    fromHouseholdId,
    toHouseholdId,
    txId,
    userId,
    ownership = "shared",
  } = opts;
  if (fromHouseholdId === toHouseholdId) {
    throw new Error("Ya está en ese hogar");
  }
  const db = getDb();

  const [before] = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.id, txId),
        eq(schema.transactions.householdId, fromHouseholdId),
      ),
    )
    .limit(1);
  if (!before) throw new Error("No encontrado");
  if (!isVisibleToUser(before, userId)) throw new Error("Sin permiso");
  if (
    before.ownership === "personal" &&
    before.paidByUserId !== userId
  ) {
    throw new Error("Sin permiso");
  }

  const { byId, bySlug } = await getCategoryMap({
    householdId: toHouseholdId,
    includeHidden: true,
  });
  let nextCategoryId = before.categoryId;
  if (nextCategoryId) {
    const cat = byId.get(nextCategoryId);
    // Drop categories that belong to another household (not system / not target).
    if (!cat) {
      nextCategoryId = bySlug.get("uncategorized")?.id ?? null;
    }
  }

  let fingerprint = before.externalFingerprint;
  const clash = await db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.householdId, toHouseholdId),
        eq(schema.transactions.externalFingerprint, fingerprint),
      ),
    )
    .limit(1);
  if (clash.length) {
    fingerprint = `${fingerprint}:moved:${Date.now().toString(36)}`.slice(0, 64);
  }

  const [row] = await db
    .update(schema.transactions)
    .set({
      householdId: toHouseholdId,
      ownership,
      categoryId: nextCategoryId,
      externalFingerprint: fingerprint,
      paidByUserId: before.paidByUserId ?? userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.transactions.id, txId),
        eq(schema.transactions.householdId, fromHouseholdId),
      ),
    )
    .returning();

  if (!row) throw new Error("No se pudo mover");

  await db
    .update(schema.receipts)
    .set({ householdId: toHouseholdId })
    .where(eq(schema.receipts.transactionId, txId));

  return row;
}
