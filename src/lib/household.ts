import { and, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { CATEGORY_SEEDS } from "@/lib/categorize/rules";

const inviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

/** Max members per shared space (1 solo or several people). */
export const MAX_HOUSEHOLD_MEMBERS = 12;

export async function ensureCategoriesSeeded() {
  await ensureSchema();
  const db = getDb();

  // Upsert system categories so new ones (alquiler, luz, etc.) appear on existing DBs
  for (const cat of CATEGORY_SEEDS) {
    const [row] = await db
      .insert(schema.categories)
      .values({
        slug: cat.slug,
        name: cat.name,
        kind: cat.kind,
        defaultOwnership: cat.defaultOwnership,
        isSystem: true,
        householdId: null,
      })
      .onConflictDoNothing()
      .returning();

    if (row) {
      for (const pattern of cat.patterns) {
        if (pattern.includes("%")) continue;
        await db.insert(schema.merchantRules).values({
          pattern: pattern.toUpperCase(),
          categoryId: row.id,
          priority: cat.priority,
        });
      }
    }
  }
}

export type HouseholdContext = {
  household: typeof schema.households.$inferSelect;
  membership: typeof schema.householdMembers.$inferSelect;
  members: Array<{
    userId: string;
    role: "owner" | "member";
    displayName: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
  }>;
};

export async function getUserHousehold(
  userId: string,
): Promise<HouseholdContext | null> {
  await ensureSchema();
  const db = getDb();
  const [membership] = await db
    .select()
    .from(schema.householdMembers)
    .where(eq(schema.householdMembers.userId, userId))
    .limit(1);
  if (!membership) return null;

  const [household] = await db
    .select()
    .from(schema.households)
    .where(eq(schema.households.id, membership.householdId))
    .limit(1);
  if (!household) return null;

  const members = await db
    .select({
      userId: schema.householdMembers.userId,
      role: schema.householdMembers.role,
      displayName: schema.householdMembers.displayName,
      name: schema.users.name,
      email: schema.users.email,
      image: schema.users.image,
    })
    .from(schema.householdMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
    .where(eq(schema.householdMembers.householdId, household.id));

  return { household, membership, members };
}

export async function createHousehold(userId: string, name = "Mi espacio") {
  await ensureCategoriesSeeded();
  const db = getDb();

  const existing = await getUserHousehold(userId);
  if (existing) return existing;

  const [household] = await db
    .insert(schema.households)
    .values({ name, inviteCode: inviteCode() })
    .returning();

  await db.insert(schema.householdMembers).values({
    householdId: household.id,
    userId,
    role: "owner",
  });

  return getUserHousehold(userId);
}

/** Leave current household if the user is the only member (solo space). */
export async function leaveSoloHousehold(userId: string) {
  await ensureSchema();
  const db = getDb();
  const existing = await getUserHousehold(userId);
  if (!existing) return;

  if (existing.members.length > 1) {
    throw new Error(
      "No podés dejar este hogar mientras haya otras personas. Pediles que se vayan primero o que te saquen.",
    );
  }

  const householdId = existing.household.id;

  await db
    .delete(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.householdId, householdId),
        eq(schema.householdMembers.userId, userId),
      ),
    );

  await db
    .delete(schema.households)
    .where(eq(schema.households.id, householdId));
}

export async function joinHousehold(userId: string, code: string) {
  await ensureCategoriesSeeded();
  const db = getDb();

  const existing = await getUserHousehold(userId);
  if (existing) {
    if (existing.members.length > 1) {
      throw new Error(
        "Ya pertenecés a un hogar compartido. Por ahora solo uno por usuario.",
      );
    }
    await leaveSoloHousehold(userId);
  }

  const [household] = await db
    .select()
    .from(schema.households)
    .where(eq(schema.households.inviteCode, code.toUpperCase().trim()))
    .limit(1);
  if (!household) throw new Error("Código de invitación inválido");

  const count = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.householdMembers)
    .where(eq(schema.householdMembers.householdId, household.id));

  if ((count[0]?.c ?? 0) >= MAX_HOUSEHOLD_MEMBERS) {
    throw new Error(
      `Este espacio ya tiene el máximo de ${MAX_HOUSEHOLD_MEMBERS} personas.`,
    );
  }

  await db.insert(schema.householdMembers).values({
    householdId: household.id,
    userId,
    role: "member",
  });

  return getUserHousehold(userId);
}

export async function requireHousehold(userId: string) {
  const ctx = await getUserHousehold(userId);
  if (!ctx) throw new Error("NO_HOUSEHOLD");
  return ctx;
}

/**
 * Category map for the household.
 * - System categories + custom of this household
 * - Excludes hidden (for UI dropdowns) unless includeHidden
 */
export async function getCategoryMap(opts?: {
  householdId?: string;
  includeHidden?: boolean;
}) {
  await ensureCategoriesSeeded();
  const db = getDb();

  let cats = await db.select().from(schema.categories);

  if (opts?.householdId) {
    cats = cats.filter(
      (c) => !c.householdId || c.householdId === opts.householdId,
    );

    if (!opts.includeHidden) {
      try {
        const hiddenRows = await db
          .select({ categoryId: schema.householdCategoryPrefs.categoryId })
          .from(schema.householdCategoryPrefs)
          .where(
            and(
              eq(schema.householdCategoryPrefs.householdId, opts.householdId),
              eq(schema.householdCategoryPrefs.hidden, true),
            ),
          );
        const hidden = new Set(hiddenRows.map((r) => r.categoryId));
        cats = cats.filter(
          (c) => c.slug === "uncategorized" || !hidden.has(c.id),
        );
      } catch {
        // Prefs table may still be warming up — show all
      }
    }
  }

  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  return { cats, bySlug, byId };
}
