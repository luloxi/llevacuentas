import { and, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { CATEGORY_SEEDS } from "@/lib/categorize/rules";
import { readPreferredHouseholdId } from "@/lib/household-cookie";
import { pickActiveHouseholdId } from "@/lib/household-select";
import type { AppUser } from "@/lib/session";

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

export type HouseholdListItem = {
  id: string;
  name: string;
  role: "owner" | "member";
  joinedAt: Date;
};

export async function listUserHouseholds(
  userId: string,
): Promise<HouseholdListItem[]> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select({
      id: schema.households.id,
      name: schema.households.name,
      role: schema.householdMembers.role,
      joinedAt: schema.householdMembers.joinedAt,
    })
    .from(schema.householdMembers)
    .innerJoin(
      schema.households,
      eq(schema.households.id, schema.householdMembers.householdId),
    )
    .where(eq(schema.householdMembers.userId, userId));

  return rows.sort((a, b) => {
    const at = a.joinedAt ? a.joinedAt.getTime() : 0;
    const bt = b.joinedAt ? b.joinedAt.getTime() : 0;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
}

async function loadHouseholdContext(
  householdId: string,
  userId: string,
): Promise<HouseholdContext | null> {
  const db = getDb();
  const [household] = await db
    .select()
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
    .limit(1);
  if (!household) return null;

  const [membership] = await db
    .select()
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.householdId, householdId),
        eq(schema.householdMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return null;

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

export async function getUserHousehold(
  userId: string,
  preferredHouseholdId?: string | null,
): Promise<HouseholdContext | null> {
  await ensureSchema();
  const list = await listUserHouseholds(userId);
  if (list.length === 0) return null;

  const preferred =
    preferredHouseholdId != null
      ? preferredHouseholdId
      : await readPreferredHouseholdId();
  const id = pickActiveHouseholdId(
    list.map((h) => ({ householdId: h.id, joinedAt: h.joinedAt })),
    preferred,
  );
  if (!id) return null;
  return loadHouseholdContext(id, userId);
}

/** Load a household by id (token-bound scope). Null if missing or empty. */
export async function getHouseholdById(
  householdId: string,
): Promise<HouseholdContext | null> {
  await ensureSchema();
  const db = getDb();
  const [household] = await db
    .select()
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
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

  if (members.length === 0) return null;

  const acting =
    members.find((m) => m.role === "owner") ?? members[0] ?? null;
  if (!acting) return null;

  const [membership] = await db
    .select()
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.householdId, household.id),
        eq(schema.householdMembers.userId, acting.userId),
      ),
    )
    .limit(1);
  if (!membership) return null;

  return { household, membership, members };
}

/**
 * Acting app user for a household-scoped token.
 * Prefers the member who minted it; otherwise owner, otherwise any member.
 */
export async function pickHouseholdActingUser(
  householdId: string,
  preferredUserId?: string | null,
): Promise<AppUser | null> {
  const ctx = await getHouseholdById(householdId);
  if (!ctx) return null;
  const preferred = preferredUserId
    ? ctx.members.find((m) => m.userId === preferredUserId)
    : undefined;
  const owner = ctx.members.find((m) => m.role === "owner");
  const member = preferred ?? owner ?? ctx.members[0];
  if (!member) return null;
  return {
    id: member.userId,
    email: member.email,
    name: member.name,
    image: member.image,
  };
}

export async function createHousehold(
  userId: string,
  name = "Mi espacio",
  opts?: { additional?: boolean },
) {
  await ensureCategoriesSeeded();
  const db = getDb();

  if (!opts?.additional) {
    const existing = await getUserHousehold(userId);
    if (existing) return existing;
  }

  const [household] = await db
    .insert(schema.households)
    .values({ name, inviteCode: inviteCode() })
    .returning();

  await db.insert(schema.householdMembers).values({
    householdId: household.id,
    userId,
    role: "owner",
  });

  return getUserHousehold(userId, household.id);
}

/** Leave current household if the user is the only member (solo space). */
export async function leaveSoloHousehold(
  userId: string,
  householdIdHint?: string,
) {
  await ensureSchema();
  const db = getDb();
  const existing = await getUserHousehold(userId, householdIdHint);
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

  const [household] = await db
    .select()
    .from(schema.households)
    .where(eq(schema.households.inviteCode, code.toUpperCase().trim()))
    .limit(1);
  if (!household) throw new Error("Código de invitación inválido");

  const already = await listUserHouseholds(userId);
  if (already.some((h) => h.id === household.id)) {
    return getUserHousehold(userId, household.id);
  }

  // Empty onboarding solo space can be replaced; Casita is never dropped.
  if (already.length === 1) {
    const current = await getUserHousehold(userId, already[0]!.id);
    if (
      current &&
      current.members.length === 1 &&
      current.household.name === "Mi espacio"
    ) {
      await leaveSoloHousehold(userId, already[0]!.id);
    }
  }

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

  return getUserHousehold(userId, household.id);
}

type HouseholdAuth = {
  user: { id: string };
  householdId?: string | null;
};

export async function requireHousehold(
  userIdOrAuth: string | HouseholdAuth,
  preferredHouseholdId?: string | null,
) {
  const userId =
    typeof userIdOrAuth === "string" ? userIdOrAuth : userIdOrAuth.user.id;
  const preferred =
    typeof userIdOrAuth === "string"
      ? preferredHouseholdId
      : (userIdOrAuth.householdId ?? preferredHouseholdId);
  const ctx = await getUserHousehold(userId, preferred);
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
