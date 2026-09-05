import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { getDb, hasDatabase, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { polarWebhookSecret } from "@/lib/polar";

function webhookHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function metaUserId(metadata: Record<string, unknown> | undefined): string | null {
  const raw = metadata?.userId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function resolveUserId(sub: Subscription): string | null {
  return (
    metaUserId(sub.metadata) ??
    (sub.customer?.externalId?.trim() || null)
  );
}

function periodEnd(sub: Subscription): Date | null {
  const end = sub.currentPeriodEnd;
  if (!end) return null;
  const d = end instanceof Date ? end : new Date(end);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function upsertSubscription(sub: Subscription) {
  const userId = resolveUserId(sub);
  if (!userId) {
    console.warn(
      "[billing/webhook] subscription without user id",
      sub.id,
    );
    return;
  }
  if (!hasDatabase()) {
    console.warn("[billing/webhook] no DATABASE_URL, skip sync");
    return;
  }

  await ensureSchema();
  const db = getDb();

  const existingUser = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!existingUser[0]) {
    await db.insert(schema.users).values({ id: userId }).onConflictDoNothing();
  }

  await db
    .insert(schema.subscriptions)
    .values({
      userId,
      polarSubscriptionId: sub.id,
      status: sub.status,
      currentPeriodEnd: periodEnd(sub),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.polarSubscriptionId,
      set: {
        userId,
        status: sub.status,
        currentPeriodEnd: periodEnd(sub),
        updatedAt: new Date(),
      },
    });
}

export async function POST(req: Request) {
  const secret = polarWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Falta configurar Polar", code: "polar_unconfigured" },
      { status: 503 },
    );
  }

  const body = await req.text();
  let event;
  try {
    event = validateEvent(body, webhookHeaders(req), secret);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Webhook inválido";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (
      event.type === "subscription.created" ||
      event.type === "subscription.updated" ||
      event.type === "subscription.canceled"
    ) {
      await upsertSubscription(event.data);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al sincronizar";
    console.error("[billing/webhook]", event.type, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 202 });
}
