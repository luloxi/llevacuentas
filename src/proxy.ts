import { NextResponse, type NextRequest } from "next/server";
import { auth, isAuthConfigured } from "@/lib/auth/server";

/**
 * Neon Auth OAuth completes only when this proxy exchanges
 * `neon_auth_session_verifier` + session challenge cookie for
 * `__Secure-neon-auth.session_token` (and session_data).
 *
 * API routes are excluded from the matcher: Neon Auth middleware
 * would 307-redirect unauthenticated POSTs to /login (HTML), which
 * breaks fetch().json() in the client (button stuck loading).
 * Route handlers already return proper JSON 401/403 via requireApiUser.
 */
const neonAuthProxy =
  isAuthConfigured() && auth
    ? auth.middleware({ loginUrl: "/login" })
    : null;

export async function proxy(request: NextRequest) {
  if (!neonAuthProxy) {
    return NextResponse.next();
  }
  return neonAuthProxy(request);
}

export const config = {
  matcher: [
    /*
     * Pages only — skip /api, static assets.
     * OAuth callback lands on pages like /dashboard?neon_auth_session_verifier=...
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
