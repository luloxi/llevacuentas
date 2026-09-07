import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";
import { reclassifyTargetForDescription } from "@/lib/import/fiwind";

export type ReclassifyFiwindResult = {
  scanned: number;
  updated: number;
  alreadyOk: number;
  skipped: number;
};

/**
 * One-shot: existing household rows whose description is Fiwind noise
 * (TRANSFERENCIA ARS, amount-only Tipo, Conversiones, Compra KO, …)
 * get the accounting category. Never deletes. Re-import still only
 * applies to new files; this is how already-loaded rows catch up.
 */
export async function reclassifyFiwindNoise(
  householdId: string,
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
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId));

  let updated = 0;
  let alreadyOk = 0;
  let skipped = 0;

  for (const row of rows) {
    const slug = reclassifyTargetForDescription(row.descriptionNormalized);
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

  return {
    scanned: rows.length,
    updated,
    alreadyOk,
    skipped,
  };
}
