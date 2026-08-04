import { NextResponse, type NextRequest } from "next/server";
import { auth, isAuthConfigured } from "@/lib/auth/server";

/**
 * Neon Auth OAuth completes only when this proxy exchanges
 * `neon_auth_session_verifier` + session challenge cookie for
 * `__Secure-neon-auth.session_token` (and session_data).
 * Without it, Google redirects back but the app never gets a session.
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
     * Run on all app routes. Skip static assets.
     * Keep /api included so session cookies stay consistent;
     * /api/auth is already skipped inside Neon Auth middleware.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
