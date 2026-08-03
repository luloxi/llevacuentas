import { createNeonAuth } from "@neondatabase/auth/next/server";

function createAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl || !secret) {
    return null;
  }

  return createNeonAuth({
    baseUrl,
    cookies: {
      secret,
      sameSite: "lax",
    },
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "warn",
  });
}

export const auth = createAuth();

export function isAuthConfigured() {
  return Boolean(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
  );
}
