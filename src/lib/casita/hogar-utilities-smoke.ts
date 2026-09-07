import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";
import { fingerprintParts } from "@/lib/money";
import type { AppUser } from "@/lib/session";

/** Distinct from casita_csv Personal dump — stays on Casita as shared Hogar. */
export const CASITA_HOGAR_UTILITIES_SOURCE = "casita_hogar_utilities";
export const CASITA_HOGAR_UTILITIES_FILE = "casita-hogar-utilities-smoke";

/**
 * Smoke rows for Cubierto (hOlQBdhf): shared Casita utilities with real ARS
 * montos in the current test month. Not Sep 3 (purged as covered by Katherine).
 */
export const CASITA_HOGAR_UTILITIES_SMOKE = [
  {
    date: "2026-09-05",
    description: "Luz",
    categorySlug: "luz" as const,
    amountArs: 45000,
  },
  {
    date: "2026-09-10",
    description: "Internet",
    categorySlug: "internet" as const,
    amountArs: 25000,
  },
] as const;

export type CasitaHogarUtilitySmokeRow =
  (typeof CASITA_HOGAR_UTILITIES_SMOKE)[number];

export function casitaHogarUtilitySmokeFingerprint(
  row: Pick<
    CasitaHogarUtilitySmokeRow,
    "date" | "description" | "categorySlug" | "amountArs"
  >,
): string {
  return createHash("sha256")
    .update(
      fingerprintParts([
        "casita-hogar-util-smoke",
        row.date,
        row.description,
        row.categorySlug,
        Number(row.amountArs).toFixed(2),
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

function moneyAbs2(value: number): string {
  return Math.abs(value).toFixed(2);
}

/**
 * Idempotent: seed shared Luz/Internet on Casita with real montos so Monk can
 * smoke Tipo Cubierto → neta baja + Resumen Cubiertos. Never touches Personal
 * dump, Invoice IOG, Katherine, or Cubierto UI.
 */
export async function seedCasitaHogarUtilitiesSmoke(
  user: AppUser,
  casitaHouseholdId: string,
): Promise<number> {
  const db = getDb();
  const rows = CASITA_HOGAR_UTILITIES_SMOKE;
  const fps = rows.map(casitaHogarUtilitySmokeFingerprint);

  const already = await db
    .select({
      fp: schema.transactions.externalFingerprint,
      amountArs: schema.transactions.amountArs,
      id: schema.transactions.id,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, casitaHouseholdId));

  const byFp = new Map(already.map((r) => [r.fp, r]));
  const missing = rows.filter((_, i) => !byFp.has(fps[i]!));

  // Repair: existing smoke rows must keep a visible MONTO.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const fp = fps[i]!;
    const existing = byFp.get(fp);
    if (!existing) continue;
    if (existing.amountArs != null && Number(existing.amountArs) > 0) continue;
    await db
      .update(schema.transactions)
      .set({
        amountArs: moneyAbs2(row.amountArs),
        ownership: "shared",
        isPayment: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.transactions.id, existing.id));
  }

  if (missing.length === 0) return 0;

  const { bySlug } = await getCategoryMap({ householdId: casitaHouseholdId });

  const [statement] = await db
    .insert(schema.cardStatements)
    .values({
      householdId: casitaHouseholdId,
      source: CASITA_HOGAR_UTILITIES_SOURCE,
      fileName: CASITA_HOGAR_UTILITIES_FILE,
      importedBy: user.id,
      rowCount: missing.length,
    })
    .returning();

  let inserted = 0;
  for (const row of missing) {
    const abs = moneyAbs2(row.amountArs);
    if (!abs || Number(abs) <= 0) continue;
    const category =
      bySlug.get(row.categorySlug) ?? bySlug.get("uncategorized");
    try {
      await db.insert(schema.transactions).values({
        householdId: casitaHouseholdId,
        statementId: statement.id,
        date: row.date,
        descriptionRaw: row.description,
        descriptionNormalized: row.description,
        amountArs: abs,
        amountUsd: null,
        installment: null,
        isPayment: false,
        isCredit: false,
        categoryId: category?.id,
        ownership: "shared",
        paidByUserId: user.id,
        splitPct: 50,
        externalFingerprint: casitaHogarUtilitySmokeFingerprint(row),
        source: CASITA_HOGAR_UTILITIES_SOURCE,
        bank: null,
      });
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) throw e;
    }
  }

  if (inserted > 0) {
    console.info(
      `[casita] seeded ${inserted} hogar utility smoke row(s) for Cubierto (Luz/Internet)`,
    );
  }
  return inserted;
}

/** Pure: smoke dates must never collide with Sep3 Katherine purge. */
export function isCasitaSep3PurgeDate(date: string): boolean {
  return date === "2026-09-03";
}
