import { createHash, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { ADMIN_EMAIL } from "@/lib/auth/allowlist";
import { getDb, hasDatabase, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import type { AppUser } from "@/lib/session";

/** Env var: shared bearer secret for El Tano / Jurio / other agents. */
export const AGENT_TOKEN_ENV = "AGENT_API_TOKEN";
/** Env var: Neon Auth / app user id to act as (preferred). */
export const AGENT_USER_ID_ENV = "AGENT_USER_ID";
/** Env var: email to resolve the app user if AGENT_USER_ID is unset. */
export const AGENT_USER_EMAIL_ENV = "AGENT_USER_EMAIL";

export function isAgentAuthConfigured(): boolean {
  return Boolean(process.env.AGENT_API_TOKEN?.trim());
}

export function parseBearerToken(
  authorization: string | null | undefined,
): string | null {
  if (!authorization) return null;
  const m = authorization.trim().match(/^Bearer\s+(\S+)/i);
  return m?.[1] ?? null;
}

/**
 * Compare bearer token to AGENT_API_TOKEN.
 * Hashes both sides so length differences cannot leak via timingSafeEqual.
 */
export function agentTokenMatches(provided: string): boolean {
  const expected = process.env.AGENT_API_TOKEN ?? "";
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Map a valid agent token to the household owner Luciano (or AGENT_USER_ID).
 * The PWA user must already exist (one login) unless AGENT_USER_ID is set.
 */
export async function resolveAgentUser(): Promise<AppUser | null> {
  const userId = process.env.AGENT_USER_ID?.trim();
  const emailEnv = process.env.AGENT_USER_EMAIL?.trim().toLowerCase();

  if (userId && !hasDatabase()) {
    return {
      id: userId,
      email: emailEnv || ADMIN_EMAIL,
      name: "Agent",
      image: null,
    };
  }

  if (!hasDatabase()) return null;

  await ensureSchema();
  const db = getDb();

  if (userId) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (row) {
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        image: row.image,
      };
    }
    return {
      id: userId,
      email: emailEnv || ADMIN_EMAIL,
      name: "Agent",
      image: null,
    };
  }

  const email = emailEnv || ADMIN_EMAIL;
  const [row] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
  };
}
