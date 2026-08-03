import { eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { CATEGORY_SEEDS } from "@/lib/categorize/rules";

const inviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export async function ensureCategoriesSeeded() {
  await ensureSchema();
  const db = getDb();
  const existing = await db.select().from(schema.categories).limit(1);
  if (existing.length > 0) return;

  for (const cat of CATEGORY_SEEDS) {
    const [row] = await db
      .insert(schema.categories)
      .values({
        slug: cat.slug,
        name: cat.name,
        kind: cat.kind,
        defaultOwnership: cat.defaultOwnership,
        isSystem: true,
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

export async function createHousehold(userId: string, name = "Nuestro hogar") {
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

export async function joinHousehold(userId: string, code: string) {
  await ensureCategoriesSeeded();
  const db = getDb();

  const existing = await getUserHousehold(userId);
  if (existing) {
    throw new Error(
      "Ya pertenecés a un hogar. Por ahora solo un hogar por usuario.",
    );
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

  if ((count[0]?.c ?? 0) >= 2) {
    throw new Error("Este hogar ya tiene 2 personas (límite de pareja).");
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

export async function getCategoryMap() {
  await ensureCategoriesSeeded();
  const db = getDb();
  const cats = await db.select().from(schema.categories);
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  return { cats, bySlug, byId };
}
