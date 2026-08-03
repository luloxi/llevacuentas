import { NextResponse } from "next/server";
import { getCurrentUser, syncUser, type AppUser } from "@/lib/session";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { auth, isAuthConfigured } from "@/lib/auth/server";

/**
 * Resolve logged-in user for API routes.
 * Returns { user } or a NextResponse error.
 */
export async function requireApiUser(): Promise<
  { user: AppUser } | { error: NextResponse }
> {
  // Check session even if email not allowed — distinguish 401 vs 403
  if (isAuthConfigured() && auth) {
    const { data } = await auth.getSession();
    const raw = data?.user as
      | { id?: string; email?: string | null; name?: string | null; image?: string | null }
      | undefined;
    if (raw?.id) {
      if (!isEmailAllowed(raw.email)) {
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
