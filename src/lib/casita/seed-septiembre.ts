import { readFileSync } from "fs";
import { join } from "path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { ensureCategoriesSeeded, getCategoryMap } from "@/lib/household";
import { matchCategoryWithLearning } from "@/lib/categorize/learn";
import { INVOICE_IOG_HOUSEHOLD_NAME } from "@/lib/invoice-iog/catalog";
import { isOwnAccountTransferDescription } from "@/lib/bbva/bank-entries";
import { isHogarReintegroDescription } from "@/lib/reintegro-hogar";
import type { AppUser } from "@/lib/session";
import {
  CASITA_HOUSEHOLD_NAME,
  CASITA_OWNER_EMAIL,
  CASITA_SEPT_FILE,
  CASITA_SEPT_SOURCE,
  casitaSeptFingerprint,
  moneyAbs2,
  parseCasitaSeptiembreCsv,
  type CasitaSeptRow,
} from "./septiembre-csv";

/**
 * Live/manual Casita alquiler/luz/agua on 2026-09-03 — covered by the
 * Katherine Fernanda Fiwind reintegro (~225750 ARS same day). Not in the
 * septiembre CSV; purge on ensure so they never double-count.
 */
export const CASITA_SEP3_SERVICES_COVERED_BY_REINTEGRO = {
  date: "2026-09-03",
  categorySlugs: ["alquiler", "luz", "agua"] as const,
} as const;

function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === CASITA_OWNER_EMAIL;
}

function loadFixtureRows(): CasitaSeptRow[] {
  const path = join(
    process.cwd(),
    "fixtures",
    "casita",
    "gastos-septiembre.csv",
  );
  const text = readFileSync(path, "utf8");
  return parseCasitaSeptiembreCsv(text);
}

let inflight: Promise<void> | null = null;

/**
 * Idempotent: import septiembre CSV into Casita (NOT Invoice IOG).
 * tipo=gasto → transactions; tipo=ingreso → incomes.
 */
export async function ensureCasitaSeptiembreForUser(
  user: AppUser,
): Promise<void> {
  if (!isOwnerEmail(user.email)) return;
  if (inflight) {
    await inflight;
    return;
  }
  inflight = seedCasitaSeptiembre(user).finally(() => {
    inflight = null;
  });
  await inflight;
}

async function resolveCasitaHouseholdId(userId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.households.id,
      name: schema.households.name,
      joinedAt: schema.householdMembers.joinedAt,
    })
    .from(schema.householdMembers)
    .innerJoin(
      schema.households,
      eq(schema.households.id, schema.householdMembers.householdId),
    )
    .where(eq(schema.householdMembers.userId, userId));

  const casita = rows.find((r) => r.name === CASITA_HOUSEHOLD_NAME);
  if (casita) return casita.id;

  const nonIog = rows
    .filter((r) => r.name !== INVOICE_IOG_HOUSEHOLD_NAME)
    .sort((a, b) => {
      const at = a.joinedAt ? a.joinedAt.getTime() : 0;
      const bt = b.joinedAt ? b.joinedAt.getTime() : 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });
  return nonIog[0]?.id ?? null;
}

async function seedCasitaSeptiembre(user: AppUser): Promise<void> {
  await ensureSchema();
  await ensureCategoriesSeeded();
  const db = getDb();

  const householdId = await resolveCasitaHouseholdId(user.id);
  if (!householdId) return;

  // Never write into Invoice IOG
  const [hh] = await db
    .select({ name: schema.households.name })
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
    .limit(1);
  if (!hh || hh.name === INVOICE_IOG_HOUSEHOLD_NAME) return;

  const rows = loadFixtureRows();
  if (rows.length === 0) return;

  const gastos = rows.filter((r) => r.tipo === "gasto");
  const ingresos = rows.filter((r) => r.tipo === "ingreso");

  await seedGastos(user, householdId, gastos);
  await seedIngresos(user, householdId, ingresos);
  await backfillCasitaSeptOwnAccountTransfers(householdId, user.id);
  await backfillCasitaSeptHogarReintegros(householdId);
  await purgeCasitaSep3ServicesCoveredByReintegro(householdId);
}

async function seedGastos(
  user: AppUser,
  householdId: string,
  gastos: CasitaSeptRow[],
) {
  if (gastos.length === 0) return;
  const db = getDb();
  const fps = gastos.map(casitaSeptFingerprint);
  const already = await db
    .select({ fp: schema.transactions.externalFingerprint })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId));
  const have = new Set(already.map((r) => r.fp));
  const missing = gastos.filter((_, i) => !have.has(fps[i]!));

  if (missing.length > 0) {
    const [statement] = await db
      .insert(schema.cardStatements)
      .values({
        householdId,
        source: CASITA_SEPT_SOURCE,
        fileName: CASITA_SEPT_FILE,
        importedBy: user.id,
        rowCount: missing.length,
      })
      .returning();

    const { bySlug } = await getCategoryMap({ householdId });

    for (const row of missing) {
      const abs = moneyAbs2(row.amountArs);
      if (!abs || Number(abs) <= 0) continue;
      const catMatch = await matchCategoryWithLearning(
        householdId,
        row.description,
      );
      const category =
        (catMatch.categoryId ? { id: catMatch.categoryId } : null) ??
        bySlug.get(catMatch.slug) ??
        bySlug.get("uncategorized");
      try {
        await db.insert(schema.transactions).values({
          householdId,
          statementId: statement.id,
          date: row.date,
          descriptionRaw: row.description,
          descriptionNormalized: row.description,
          amountArs: abs,
          amountUsd: null,
          installment: null,
          isPayment: casitaSeptGastoIsPayment(row.description),
          isCredit: false,
          categoryId: category?.id,
          ownership: "personal",
          paidByUserId: user.id,
          splitPct: 50,
          externalFingerprint: casitaSeptFingerprint(row),
          source: CASITA_SEPT_SOURCE,
          bank: "Fiwind",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/unique|duplicate/i.test(msg)) throw e;
      }
    }
  }

  // Backfill: Open 25 (and any other CSV gasto) that landed with null montos.
  await backfillCasitaSeptAmounts(householdId, gastos);
}

/**
 * Idempotent repair: match by date + description (any source/fingerprint) and
 * fill amount_ars from the fixture when both currencies are missing.
 * Prefer never leaving imported Casita sept rows without a visible monto.
 */
async function backfillCasitaSeptAmounts(
  householdId: string,
  gastos: CasitaSeptRow[],
) {
  const db = getDb();
  for (const row of gastos) {
    const abs = moneyAbs2(row.amountArs);
    if (!abs || Number(abs) <= 0) continue;
    const desc = row.description.trim();
    await db
      .update(schema.transactions)
      .set({
        amountArs: abs,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.transactions.householdId, householdId),
          eq(schema.transactions.date, row.date),
          sql`lower(trim(${schema.transactions.descriptionNormalized})) = ${desc.toLowerCase()}`,
          isNull(schema.transactions.amountArs),
          isNull(schema.transactions.amountUsd),
        ),
      );
  }
}

async function seedIngresos(
  user: AppUser,
  householdId: string,
  ingresos: CasitaSeptRow[],
) {
  if (ingresos.length === 0) return;
  const db = getDb();

  const already = await db
    .select({
      fp: schema.incomes.externalFingerprint,
    })
    .from(schema.incomes)
    .where(
      and(
        eq(schema.incomes.householdId, householdId),
        eq(schema.incomes.userId, user.id),
      ),
    );
  const have = new Set(
    already.map((r) => r.fp).filter((fp): fp is string => Boolean(fp)),
  );

  // Also dedupe against legacy rows without fingerprint
  const legacy = await db
    .select({
      date: schema.incomes.date,
      label: schema.incomes.label,
      amountArs: schema.incomes.amountArs,
    })
    .from(schema.incomes)
    .where(
      and(
        eq(schema.incomes.householdId, householdId),
        eq(schema.incomes.userId, user.id),
      ),
    );
  const legacyKeys = new Set(
    legacy.map(
      (r) =>
        `${r.date}|${r.label.trim().toUpperCase()}|${
          r.amountArs != null ? Number(r.amountArs).toFixed(2) : ""
        }`,
    ),
  );

  for (const row of ingresos) {
    if (isOwnAccountTransferDescription(row.description)) continue;
    const fp = casitaSeptFingerprint(row);
    if (have.has(fp)) continue;
    const key = `${row.date}|${row.description.trim().toUpperCase()}|${moneyAbs2(row.amountArs)}`;
    if (legacyKeys.has(key)) continue;
    try {
      await db.insert(schema.incomes).values({
        userId: user.id,
        householdId,
        kind: "variable",
        frequency: null,
        date: row.date,
        label: row.description,
        amountArs: moneyAbs2(row.amountArs),
        amountUsd: null,
        externalFingerprint: fp,
      });
      have.add(fp);
      legacyKeys.add(key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) throw e;
    }
  }
}

/**
 * Mark “A/De una cuenta tuya” (and similar) gastos as Transferencia interna,
 * and drop matching ingresos so they never inflate neta.
 */
async function backfillCasitaSeptOwnAccountTransfers(
  householdId: string,
  userId: string,
) {
  const db = getDb();
  const txs = await db
    .select({
      id: schema.transactions.id,
      descriptionNormalized: schema.transactions.descriptionNormalized,
      isPayment: schema.transactions.isPayment,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId));

  for (const r of txs) {
    if (!isOwnAccountTransferDescription(r.descriptionNormalized)) continue;
    if (r.isPayment) continue;
    await db
      .update(schema.transactions)
      .set({ isPayment: true, updatedAt: new Date() })
      .where(eq(schema.transactions.id, r.id));
  }

  const incomes = await db
    .select({
      id: schema.incomes.id,
      label: schema.incomes.label,
    })
    .from(schema.incomes)
    .where(
      and(
        eq(schema.incomes.householdId, householdId),
        eq(schema.incomes.userId, userId),
      ),
    );

  for (const r of incomes) {
    if (!isOwnAccountTransferDescription(r.label)) continue;
    await db.delete(schema.incomes).where(eq(schema.incomes.id, r.id));
  }
}

/**
 * Mark roommate hogar-service reimbursements as isPayment (out of neta).
 * Covers bare Fiwind CSV payee lines and Retiro/Pago a … forms.
 */
async function backfillCasitaSeptHogarReintegros(householdId: string) {
  const db = getDb();
  const txs = await db
    .select({
      id: schema.transactions.id,
      descriptionNormalized: schema.transactions.descriptionNormalized,
      isPayment: schema.transactions.isPayment,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId));

  for (const r of txs) {
    if (r.isPayment) continue;
    if (!isHogarReintegroDescription(r.descriptionNormalized)) continue;
    await db
      .update(schema.transactions)
      .set({ isPayment: true, updatedAt: new Date() })
      .where(eq(schema.transactions.id, r.id));
  }
}

/**
 * Pure matcher: Sep3 alquiler/luz/agua covered by Katherine reintegro.
 * Never matches hogar-reintegro payee rows (Katherine / Katho), even if they
 * were miscategorized as a service slug.
 */
export function matchesCasitaSep3ServiceCoveredByReintegro(opts: {
  descriptionNormalized: string;
  categorySlug?: string | null;
}): string | null {
  if (isHogarReintegroDescription(opts.descriptionNormalized)) return null;

  const slugSet = new Set<string>(
    CASITA_SEP3_SERVICES_COVERED_BY_REINTEGRO.categorySlugs,
  );
  const descKey = opts.descriptionNormalized
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const descIsService =
    descKey === "ALQUILER" || descKey === "LUZ" || descKey === "AGUA";

  const slug = opts.categorySlug ?? undefined;
  const byCat = Boolean(slug && slugSet.has(slug));
  if (!byCat && !descIsService) return null;

  let resolved = slug && slugSet.has(slug) ? slug : null;
  if (!resolved && descIsService) {
    resolved =
      descKey === "ALQUILER"
        ? "alquiler"
        : descKey === "LUZ"
          ? "luz"
          : "agua";
  }
  if (!resolved || !slugSet.has(resolved)) return null;
  return resolved;
}

/**
 * Idempotent: delete Casita alquiler/luz/agua on 2026-09-03 (covered by
 * Katherine reintegro). Matches category slug, or exact service name as
 * description when category is missing/wrong. Never deletes Katherine.
 */
export async function purgeCasitaSep3ServicesCoveredByReintegro(
  householdId: string,
): Promise<number> {
  const db = getDb();
  const { date } = CASITA_SEP3_SERVICES_COVERED_BY_REINTEGRO;

  const cats = await db
    .select({ id: schema.categories.id, slug: schema.categories.slug })
    .from(schema.categories);
  const catIdToSlug = new Map(cats.map((c) => [c.id, c.slug]));

  const txs = await db
    .select({
      id: schema.transactions.id,
      descriptionNormalized: schema.transactions.descriptionNormalized,
      categoryId: schema.transactions.categoryId,
      amountArs: schema.transactions.amountArs,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.householdId, householdId),
        eq(schema.transactions.date, date),
      ),
    );

  const toDelete: Array<{
    id: string;
    slug: string;
    amountArs: string | null;
  }> = [];

  for (const t of txs) {
    const categorySlug = t.categoryId
      ? catIdToSlug.get(t.categoryId) ?? null
      : null;
    const resolved = matchesCasitaSep3ServiceCoveredByReintegro({
      descriptionNormalized: t.descriptionNormalized,
      categorySlug,
    });
    if (!resolved) continue;

    toDelete.push({
      id: t.id,
      slug: resolved,
      amountArs: t.amountArs != null ? String(t.amountArs) : null,
    });
  }

  if (toDelete.length === 0) return 0;

  const ids = toDelete.map((d) => d.id);
  // Clear reverse cross-hogar links before delete (no FK on linked_transaction_id).
  for (const id of ids) {
    await db
      .update(schema.transactions)
      .set({ linkedTransactionId: null, updatedAt: new Date() })
      .where(eq(schema.transactions.linkedTransactionId, id));
  }
  for (const id of ids) {
    await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  }

  const summary = toDelete
    .map((d) => `${d.slug}${d.amountArs != null ? `=${d.amountArs}` : ""}`)
    .join(", ");
  console.info(
    `[casita] purged ${toDelete.length} Sep3 service(s) covered by reintegro: ${summary}`,
  );
  return toDelete.length;
}

/** Seed flags for a CSV gasto description (own-account or hogar reintegro). */
export function casitaSeptGastoIsPayment(description: string): boolean {
  return (
    isOwnAccountTransferDescription(description) ||
    isHogarReintegroDescription(description)
  );
}
