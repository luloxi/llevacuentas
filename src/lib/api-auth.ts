import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getCurrentUser, syncUser, type AppUser } from "@/lib/session";
import { ADMIN_EMAIL, isEmailAllowed } from "@/lib/auth/allowlist";
import { auth, isAuthConfigured } from "@/lib/auth/server";
import { extractBearerToken, isValidAgentRequest } from "@/lib/agent-token";
import { getDb, hasDatabase, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";

async function userFromAgentToken(
  authorization: string | null,
): Promise<{ user: AppUser } | { error: NextResponse } | null> {
  const bearer = extractBearerToken(authorization);
  if (!bearer) return null;

  const apiKey = process.env.AGENT_API_KEY;
  if (!isValidAgentRequest(authorization, apiKey)) {
    return {
      error: NextResponse.json(
        { error: "Token de agente inválido", code: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  if (!hasDatabase()) {
    return {
      error: NextResponse.json(
        {
          error: "DATABASE_URL no configurada",
          code: "agent_db_missing",
        },
        { status: 503 },
      ),
    };
  }

  await ensureSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, ADMIN_EMAIL))
    .limit(1);

  if (!row) {
    return {
      error: NextResponse.json(
        {
          error:
            "Usuario agente no encontrado. Iniciá sesión una vez en la app con lucianoolivabianco@gmail.com.",
          code: "agent_user_missing",
        },
        { status: 503 },
      ),
    };
  }

  const user: AppUser = {
    id: row.id,
    email: row.email ?? ADMIN_EMAIL,
    name: row.name ?? null,
    image: row.image ?? null,
  };
  await syncUser(user);
  return { user };
}

/**
 * Resolve logged-in user for API routes.
 * Accepts:
 *   1. Authorization: Bearer $AGENT_API_KEY (Cursor / Grok Bot agents)
 *   2. Neon Auth session cookie (PWA UI)
 * Returns { user } or a NextResponse error.
 */
export async function requireApiUser(): Promise<
  { user: AppUser } | { error: NextResponse }
> {
  const headerList = await headers();
  const agent = await userFromAgentToken(headerList.get("authorization"));
  if (agent) return agent;

  // Check session even if email not allowed — distinguish 401 vs 403
  if (isAuthConfigured() && auth) {
    const { data } = await auth.getSession();
    const raw = data?.user as
      | { id?: string; email?: string | null; name?: string | null; image?: string | null }
      | undefined;
    if (raw?.id) {
      if (!(await isEmailAllowed(raw.email))) {
        return {
          error: NextResponse.json(
            { error: "Email no autorizado", code: "forbidden" },
            { status: 403 },
          ),
        };
      }
      const user: AppUser = {
        id: raw.id,
        email: raw.email ?? null,
        name: raw.name ?? null,
        image: raw.image ?? null,
      };
      await syncUser(user);
      return { user };
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  await syncUser(user);
  return { user };
}
