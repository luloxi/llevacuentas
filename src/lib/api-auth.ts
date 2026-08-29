import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, syncUser, type AppUser } from "@/lib/session";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { auth, isAuthConfigured } from "@/lib/auth/server";
import {
  agentTokenMatches,
  isAgentAuthConfigured,
  parseBearerToken,
  resolveAgentUser,
} from "@/lib/agent/auth";

/**
 * Resolve logged-in user for API routes.
 * - PWA: Neon Auth cookie session
 * - Agents (El Tano / Jurio): Authorization: Bearer AGENT_API_TOKEN
 * Returns { user } or a NextResponse error.
 */
export async function requireApiUser(): Promise<
  { user: AppUser } | { error: NextResponse }
> {
  const authorization = (await headers()).get("authorization");
  const bearer = parseBearerToken(authorization);
  if (bearer) {
    if (!isAgentAuthConfigured() || !agentTokenMatches(bearer)) {
      return {
        error: NextResponse.json(
          { error: "Token inválido", code: "unauthorized" },
          { status: 401 },
        ),
      };
    }
    const user = await resolveAgentUser();
    if (!user) {
      return {
        error: NextResponse.json(
          {
            error:
              "Agente autenticado pero no hay usuario de app. Configurá AGENT_USER_ID o iniciá sesión una vez en la PWA con AGENT_USER_EMAIL.",
            code: "agent_user_missing",
          },
          { status: 401 },
        ),
      };
    }
    await syncUser(user);
    return { user };
  }

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
