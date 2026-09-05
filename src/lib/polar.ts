import { Polar } from "@polar-sh/sdk";

export const PRO_PLAN = {
  name: "Pro",
  amountArs: 9990,
  interval: "mes",
} as const;

export function polarServer(): "sandbox" | "production" {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

export function isPolarCheckoutConfigured(): boolean {
  return Boolean(
    process.env.POLAR_ACCESS_TOKEN?.trim() &&
      process.env.POLAR_PRODUCT_ID?.trim(),
  );
}

export function polarWebhookSecret(): string | null {
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function getPolar(): Polar | null {
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return new Polar({
    accessToken: token,
    server: polarServer(),
  });
}

export function polarProductId(): string | null {
  const id = process.env.POLAR_PRODUCT_ID?.trim();
  return id || null;
}

/** Public origin for Polar success/return URLs. */
export function appUrlFromRequest(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}
