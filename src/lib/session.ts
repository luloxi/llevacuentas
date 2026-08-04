import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, isAuthConfigured } from "@/lib/auth/server";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { getDb, hasDatabase } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { schema } from "@/lib/db";

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

type SessionResult =
  | { status: "ok"; user: AppUser }
  | { status: "anonymous" }
  | { status: "forbidden"; email: string | null }
  | { status: "unconfigured" };

export async function resolveSession(): Promise<SessionResult> {
  if (!isAuthConfigured() || !auth) {
    return { status: "unconfigured" };
  }

  const { data } = await auth.getSession();
  const raw = data?.user as
    | {
        id?: string;
        email?: string | null;
        name?: string | null;
        image?: string | null;
      }
    | undefined;

  if (!raw?.id) return { status: "anonymous" };

  if (!(await isEmailAllowed(raw.email))) {
    return { status: "forbidden", email: raw.email ?? null };
  }

  return {
    status: "ok",
    user: {
      id: raw.id,
      email: raw.email ?? null,
      name: raw.name ?? null,
      image: raw.image ?? null,
    },
  };
}

/** Upsert app user row so FKs work. */
export async function syncUser(user: AppUser) {
  if (!hasDatabase()) return;
  await ensureSchema();
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.users)
      .set({
        email: user.email,
        name: user.name,
        image: user.image,
      })
      .where(eq(schema.users.id, user.id));
    return;
  }

  if (user.email) {
    const byEmail = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, user.email))
      .limit(1);
    if (byEmail[0]) {
      // Prefer existing row id stability for households — rare edge case
      return byEmail[0];
    }
  }

  await db.insert(schema.users).values({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  });
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const s = await resolveSession();
  if (s.status === "ok") return s.user;
  return null;
}

export async function requireUser(): Promise<AppUser> {
  const s = await resolveSession();
  if (s.status === "forbidden") redirect("/login?error=forbidden");
  if (s.status !== "ok") redirect("/login");
  await syncUser(s.user);
  return s.user;
}
