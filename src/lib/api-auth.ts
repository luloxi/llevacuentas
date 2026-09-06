import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, syncUser, type AppUser } from "@/lib/session";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { auth, isAuthConfigured } from "@/lib/auth/server";
import { parseBearerToken, resolveBearerAuth } from "@/lib/agent/auth";

export type ApiAuthKind = "session" | "household_token" | "global_token";

export type ApiAuthSuccess = {
  user: AppUser;
  householdId?: string;
  authKind: ApiAuthKind;
};

/**
 * Resolve logged-in user for API routes.
 * - PWA: Neon Auth cookie session
 * - Household MCP/agents: Authorization: Bearer <token del hogar>
 * - Admin/dev fallback: Authorization: Bearer AGENT_API_TOKEN
 * Returns { user, householdId?, authKind } or a NextResponse error.
 */
export async function requireApiUser(): Promise<
  ApiAuthSuccess | { error: NextResponse }
> {
  const authorization = (await headers()).get("authorization");
  const bearer = parseBearerToken(authorization);
  if (bearer) {
    const resolved = await resolveBearerAuth(bearer);
    if (!resolved) {
      return {
        error: NextResponse.json(
          { error: "Token inválido", code: "unauthorized" },
          { status: 401 },
        ),
      };
    }
    await syncUser(resolved.user);
    return {
      user: resolved.user,
      householdId: resolved.householdId,
      authKind: resolved.kind,
    };
  }

  return requireSessionUser();
}

/**
 * Cookie session only (PWA). Rejects Bearer — used to mint/rotate/revoke
 * household tokens so a stolen API token cannot mint another.
 */
export async function requireSessionUser(): Promise<
  ApiAuthSuccess | { error: NextResponse }
> {
  if (isAuthConfigured() && auth) {
    const { data } = await auth.getSession();
    const raw = data?.user as
      | {
          id?: string;
          email?: string | null;
          name?: string | null;
          image?: string | null;
        }
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
      return { user, authKind: "session" };
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  await syncUser(user);
  return { user, authKind: "session" };
}
