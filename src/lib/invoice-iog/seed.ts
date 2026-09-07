import { and, eq, sql } from "drizzle-orm";
import gastosJson from "../../../fixtures/invoice-iog/invoice-iog-gastos.json";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { ensureCategoriesSeeded } from "@/lib/household";
import { customAlphabet } from "nanoid";
import {
  INVOICE_IOG_HOUSEHOLD_NAME,
  INVOICE_IOG_OWNER_EMAIL,
  INVOICE_IOG_RUBROS,
  INVOICE_IOG_RUBRO_SLUGS,
  INVOICE_IOG_SOURCE,
  INVOICE_IOG_TOOL_RULES,
  invoiceIogAmounts,
  invoiceIogFingerprint,
  uniqueInvoiceIogItems,
  type InvoiceIogFixture,
  type InvoiceIogRubro,
} from "./catalog";
import type { AppUser } from "@/lib/session";

const inviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const fixture = gastosJson as InvoiceIogFixture;

function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === INVOICE_IOG_OWNER_EMAIL;
}

let inflight: Promise<void> | null = null;

/**
 * Idempotent: create household "Invoice IOG" for Luciano and import the 68
 * Gastos rows. Never writes into Casita.
 */
export async function ensureInvoiceIogForUser(user: AppUser): Promise<void> {
  if (!isOwnerEmail(user.email)) return;
  if (inflight) {
    await inflight;
    return;
  }
  inflight = seedInvoiceIog(user).finally(() => {
    inflight = null;
  });
  await inflight;
}

async function seedInvoiceIog(user: AppUser): Promise<void> {
  await ensureSchema();
  await ensureCategoriesSeeded();
  const db = getDb();

  const items = uniqueInvoiceIogItems(fixture.items);
  if (items.length === 0) return;

  const existing = await db
    .select({
      id: schema.households.id,
      name: schema.households.name,
    })
    .from(schema.householdMembers)
    .innerJoin(
      schema.households,
      eq(schema.households.id, schema.householdMembers.householdId),
    )
    .where(
      and(
        eq(schema.householdMembers.userId, user.id),
        eq(schema.households.name, INVOICE_IOG_HOUSEHOLD_NAME),
      ),
    )
    .limit(1);

  let householdId = existing[0]?.id ?? null;

  if (!householdId) {
    const [created] = await db
      .insert(schema.households)
      .values({
        name: INVOICE_IOG_HOUSEHOLD_NAME,
        inviteCode: inviteCode(),
      })
      .returning();
    householdId = created.id;
    await db
      .insert(schema.householdMembers)
      .values({
        householdId,
        userId: user.id,
        role: "owner",
      })
      .onConflictDoNothing();
  } else {
    await db
      .insert(schema.householdMembers)
      .values({
        householdId,
        userId: user.id,
        role: "owner",
      })
      .onConflictDoNothing();
  }

  const categoryIds = await ensureInvoiceIogCategories(householdId);
  await ensureToolRules(householdId, categoryIds);
  await hideCasitaSystemCats(householdId, categoryIds);

  const fps = items.map(invoiceIogFingerprint);
  const already = await db
    .select({ fp: schema.transactions.externalFingerprint })
    .from(schema.transactions)
    .where(eq(schema.transactions.householdId, householdId));
  const have = new Set(already.map((r) => r.fp));
  const missing = items.filter((item, i) => !have.has(fps[i]!));
  if (missing.length === 0) return;

  const [statement] = await db
    .insert(schema.cardStatements)
    .values({
      householdId,
      source: INVOICE_IOG_SOURCE,
      fileName: "invoice-iog-gastos.json",
      importedBy: user.id,
      rowCount: items.length,
    })
    .returning();

  for (const item of missing) {
    const amounts = invoiceIogAmounts(item);
    const rubro = item.rubro as InvoiceIogRubro;
    const categoryId = categoryIds.get(rubro) ?? null;
    try {
      await db.insert(schema.transactions).values({
        householdId,
        statementId: statement.id,
        date: item.date,
        descriptionRaw: item.desc,
        descriptionNormalized: item.desc,
        amountArs: amounts.amountArs,
        amountUsd: amounts.amountUsd,
        installment: null,
        isPayment: false,
        isCredit: false,
        categoryId,
        ownership: "personal",
        paidByUserId: user.id,
        splitPct: 50,
        externalFingerprint: invoiceIogFingerprint(item),
        source: INVOICE_IOG_SOURCE,
        bank: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) throw e;
    }
  }
}

async function ensureInvoiceIogCategories(householdId: string) {
  const db = getDb();
  const ids = new Map<InvoiceIogRubro, string>();

  for (const rubro of INVOICE_IOG_RUBROS) {
    const slug = INVOICE_IOG_RUBRO_SLUGS[rubro];
    const [bySlug] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
      .limit(1);

    if (bySlug) {
      ids.set(rubro, bySlug.id);
      continue;
    }

    const [row] = await db
      .insert(schema.categories)
      .values({
        slug,
        name: rubro,
        kind: "expense",
        defaultOwnership: "personal",
        isSystem: false,
        householdId,
      })
      .onConflictDoNothing()
      .returning();

    if (row) {
      ids.set(rubro, row.id);
      continue;
    }

    const [again] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
      .limit(1);
    if (again) ids.set(rubro, again.id);
  }

  return ids;
}

async function ensureToolRules(
  householdId: string,
  categoryIds: Map<InvoiceIogRubro, string>,
) {
  const db = getDb();
  for (const rule of INVOICE_IOG_TOOL_RULES) {
    const categoryId = categoryIds.get(rule.rubro);
    if (!categoryId) continue;
    const [hit] = await db
      .select({ id: schema.merchantRules.id })
      .from(schema.merchantRules)
      .where(
        and(
          eq(schema.merchantRules.householdId, householdId),
          eq(schema.merchantRules.pattern, rule.pattern),
        ),
      )
      .limit(1);
    if (hit) continue;
    await db.insert(schema.merchantRules).values({
      householdId,
      pattern: rule.pattern,
      categoryId,
      priority: rule.priority,
    });
  }
}

/** Keep Invoice IOG dropdown on the 5 rubros + uncategorized. */
async function hideCasitaSystemCats(
  householdId: string,
  keep: Map<InvoiceIogRubro, string>,
) {
  const db = getDb();
  const keepIds = new Set(keep.values());
  const cats = await db.select().from(schema.categories);
  for (const cat of cats) {
    if (!cat.isSystem) continue;
    if (cat.slug === "uncategorized") continue;
    if (keepIds.has(cat.id)) continue;
    if (cat.householdId && cat.householdId !== householdId) continue;
    await db
      .insert(schema.householdCategoryPrefs)
      .values({
        householdId,
        categoryId: cat.id,
        hidden: true,
      })
      .onConflictDoNothing();
  }
}

/** Cheap existence check used by tests / scripts. */
export async function countInvoiceIogTransactions(
  householdId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.householdId, householdId),
        eq(schema.transactions.source, INVOICE_IOG_SOURCE),
      ),
    );
  return row?.c ?? 0;
}
