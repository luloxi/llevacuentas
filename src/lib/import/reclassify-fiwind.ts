import { and, eq } from "drizzle-orm";
import {
  isInternalTransferDescription,
  isNonIncomeTransferLabel,
} from "@/lib/bbva/bank-entries";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";
import { reclassifyTargetForDescription } from "@/lib/import/fiwind";

export type ReclassifyFiwindResult = {
  scanned: number;
  updated: number;
  alreadyOk: number;
  skipped: number;
  /** Rainman: incomes removed (self / FX / DEBIN) */
  incomesRemoved: number;
  /** Rainman: txs marked Transferencia interna */
  internalMarked: number;
};

/**
 * One-shot: existing household rows whose description is Fiwind noise
 * (TRANSFERENCIA ARS, amount-only Tipo, Conversiones, Compra KO, …)
 * get the accounting category. Also Rainman:
 * self-transfer / own FX → Transferencia interna (isPayment, never Ingresos);
 * matching income labels are deleted so Variables stay clean.
 * Never deletes transactions.
 */
export async function reclassifyFiwindNoise(
  householdId: string,
  opts?: { userId?: string | null },
): Promise<ReclassifyFiwindResult> {
  const db = getDb();
  const { bySlug, byId } = await getCategoryMap({
    householdId,
    includeHidden: true,
  });

  const rows = await db
    .select({
      id: schema.transactions.id,
      descriptionNormalized: schema.transactions.descriptionNormalized,
      categoryId: schema.transactions.categoryId,
      isPayment: schema.transactions.isPayment,
      isCredit: schema.transactions.isCredit,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId));

  let updated = 0;
  let alreadyOk = 0;
  let skipped = 0;
  let internalMarked = 0;

  const internalCat =
    bySlug.get("transferencia-interna") ?? bySlug.get("conversiones");

  for (const row of rows) {
    const desc = row.descriptionNormalized;
    if (isInternalTransferDescription(desc)) {
      const patch: {
        isPayment?: boolean;
        isCredit?: boolean;
        categoryId?: string;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      let needs = false;
      if (!row.isPayment) {
        patch.isPayment = true;
        needs = true;
      }
      if (row.isCredit) {
        patch.isCredit = false;
        needs = true;
      }
      if (internalCat && row.categoryId !== internalCat.id) {
        patch.categoryId = internalCat.id;
        needs = true;
      }
      if (needs) {
        await db
          .update(schema.transactions)
          .set(patch)
          .where(
            and(
              eq(schema.transactions.id, row.id),
              eq(schema.transactions.householdId, householdId),
            ),
          );
        internalMarked += 1;
        updated += 1;
      } else {
        alreadyOk += 1;
      }
      continue;
    }

    const slug = reclassifyTargetForDescription(desc);
    if (!slug) {
      skipped += 1;
      continue;
    }
    const cat = bySlug.get(slug);
    if (!cat) {
      skipped += 1;
      continue;
    }
    const currentSlug = row.categoryId
      ? byId.get(row.categoryId)?.slug
      : null;
    if (currentSlug === slug) {
      alreadyOk += 1;
      continue;
    }
    await db
      .update(schema.transactions)
      .set({ categoryId: cat.id, updatedAt: new Date() })
      .where(
        and(
          eq(schema.transactions.id, row.id),
          eq(schema.transactions.householdId, householdId),
        ),
      );
    updated += 1;
  }

  let incomesRemoved = 0;
  if (opts?.userId) {
    const incomes = await db
      .select({
        id: schema.incomes.id,
        label: schema.incomes.label,
      })
      .from(schema.incomes)
      .where(
        and(
          eq(schema.incomes.householdId, householdId),
          eq(schema.incomes.userId, opts.userId),
        ),
      );
    for (const inc of incomes) {
      if (!isNonIncomeTransferLabel(inc.label)) continue;
      await db.delete(schema.incomes).where(eq(schema.incomes.id, inc.id));
      incomesRemoved += 1;
    }
  }

  return {
    scanned: rows.length,
    updated,
    alreadyOk,
    skipped,
    incomesRemoved,
    internalMarked,
  };
}