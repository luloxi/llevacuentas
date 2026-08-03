import { auth, isAuthConfigured } from "@/lib/auth/server";

function notConfigured() {
  return Response.json(
    { error: "Auth is not configured. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET." },
    { status: 503 },
  );
}

export const GET =
  isAuthConfigured() && auth ? auth.handler().GET : async () => notConfigured();

export const POST =
  isAuthConfigured() && auth ? auth.handler().POST : async () => notConfigured();
