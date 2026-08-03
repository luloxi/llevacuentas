import { and, desc, eq } from "drizzle-orm";
import { parseBbvaWorkbook, parseTransparenciaConsumos } from "@/lib/bbva/parse";
import { matchCategory, categoryNameToSlug } from "@/lib/categorize/rules";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";

export async function importBbvaFile(opts: {
  householdId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
}) {
  const movements = parseBbvaWorkbook(opts.buffer);
  const db = getDb();
  const { bySlug } = await getCategoryMap();

  const [statement] = await db
    .insert(schema.cardStatements)
    .values({
      householdId: opts.householdId,
      source: "bbva_xlsx",
      fileName: opts.fileName,
      importedBy: opts.userId,
      rowCount: movements.length,
    })
    .returning();

  let inserted = 0;
  let skipped = 0;

  for (const m of movements) {
    const catMatch = matchCategory(m.descriptionNormalized);
    const category = bySlug.get(catMatch.slug) ?? bySlug.get("uncategorized");

    const ownership =
      m.isPayment || catMatch.kind !== "expense"
        ? "personal"
        : catMatch.defaultOwnership;

    try {
      await db.insert(schema.transactions).values({
        householdId: opts.householdId,
        statementId: statement.id,
        date: m.date,
        descriptionRaw: m.descriptionRaw,
        descriptionNormalized: m.descriptionNormalized,
        amountArs: m.amountArs != null ? String(m.amountArs) : null,
        amountUsd: m.amountUsd != null ? String(m.amountUsd) : null,
        installment: m.installment,
        isPayment: m.isPayment,
        isCredit: m.isCredit,
        categoryId: category?.id,
        ownership,
        paidByUserId: opts.userId,
        externalFingerprint: m.fingerprint,
        source: "bbva_import",
      });
      inserted++;
    } catch {
      skipped++;
    }
  }

  return {
    statementId: statement.id,
    total: movements.length,
    inserted,
    skipped,
  };
}

export async function importTransparenciaConsumos(opts: {
  householdId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
}) {
  const rows = parseTransparenciaConsumos(opts.buffer);
  const db = getDb();
  const { bySlug } = await getCategoryMap();

  const [statement] = await db
    .insert(schema.cardStatements)
    .values({
      householdId: opts.householdId,
      source: "transparencia_xlsx",
      fileName: opts.fileName,
      importedBy: opts.userId,
      rowCount: rows.length,
    })
    .returning();

  let inserted = 0;
  let skipped = 0;

  for (const r of rows) {
    const slug = categoryNameToSlug(r.categoryName);
    const category = bySlug.get(slug) ?? bySlug.get("uncategorized");
    const catSeed = matchCategory(r.description);
    const ownership = catSeed.defaultOwnership;

    try {
      await db.insert(schema.transactions).values({
        householdId: opts.householdId,
        statementId: statement.id,
        date: r.date,
        descriptionRaw: r.description,
        descriptionNormalized: r.description,
        amountArs: r.amountArs != null ? String(r.amountArs) : null,
        amountUsd: r.amountUsd != null ? String(r.amountUsd) : null,
        isPayment: false,
        isCredit: false,
        categoryId: category?.id,
        ownership,
        paidByUserId: opts.userId,
        externalFingerprint: r.fingerprint,
        source: "transparencia",
      });
      inserted++;
    } catch {
      skipped++;
    }
  }

  return { statementId: statement.id, total: rows.length, inserted, skipped };
}

export async function listTransactions(
  householdId: string,
  opts?: {
    period?: string;
    categoryId?: string;
    q?: string;
  },
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId))
    .orderBy(desc(schema.transactions.date));

  return rows.filter((r) => {
    if (opts?.period && !r.date.startsWith(opts.period)) return false;
    if (opts?.categoryId && r.categoryId !== opts.categoryId) return false;
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
