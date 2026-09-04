import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

function serialize(row: typeof schema.debtSettings.$inferSelect | undefined) {
  if (!row) {
    return {
      ratePct: null as number | null,
      minPaymentArs: null as number | null,
      dueDay: null as number | null,
      notes: null as string | null,
      updatedAt: null as string | null,
    };
  }
  return {
    ratePct: row.ratePct != null ? Number(row.ratePct) : null,
    minPaymentArs: row.minPaymentArs != null ? Number(row.minPaymentArs) : null,
    dueDay: row.dueDay ?? null,
    notes: row.notes ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    await ensureSchema();
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.debtSettings)
      .where(eq(schema.debtSettings.userId, user.id))
      .limit(1);
    return NextResponse.json({ settings: serialize(row) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    await ensureSchema();
    const body = (await req.json()) as {
      ratePct?: number | null;
      minPaymentArs?: number | null;
      dueDay?: number | null;
      notes?: string | null;
    };

    let dueDay: number | null | undefined = undefined;
    if (body.dueDay !== undefined) {
      if (body.dueDay == null || body.dueDay === ("" as unknown)) {
        dueDay = null;
      } else {
        const d = Math.round(Number(body.dueDay));
        if (!Number.isFinite(d) || d < 1 || d > 31) {
          return NextResponse.json(
            { error: "El día de vencimiento tiene que ser entre 1 y 31" },
            { status: 400 },
          );
        }
        dueDay = d;
      }
    }

    const ratePct = body.ratePct !== undefined ? n(body.ratePct) : undefined;
    const minPaymentArs =
      body.minPaymentArs !== undefined ? n(body.minPaymentArs) : undefined;
    const notes =
      body.notes !== undefined
        ? body.notes == null
          ? null
          : String(body.notes).trim() || null
        : undefined;

    if (ratePct != null && (ratePct < 0 || ratePct > 1000)) {
      return NextResponse.json(
        { error: "La tasa parece rara (0–1000%)" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(schema.debtSettings)
      .where(eq(schema.debtSettings.userId, user.id))
      .limit(1);

    const values = {
      userId: user.id,
      ratePct:
        ratePct !== undefined
          ? ratePct != null
            ? String(ratePct)
            : null
          : existing?.ratePct ?? null,
      minPaymentArs:
        minPaymentArs !== undefined
          ? minPaymentArs != null
            ? String(minPaymentArs)
            : null
          : existing?.minPaymentArs ?? null,
      dueDay: dueDay !== undefined ? dueDay : existing?.dueDay ?? null,
      notes: notes !== undefined ? notes : existing?.notes ?? null,
      updatedAt: new Date(),
    };

    const [row] = await db
      .insert(schema.debtSettings)
      .values(values)
      .onConflictDoUpdate({
        target: schema.debtSettings.userId,
        set: {
          ratePct: values.ratePct,
          minPaymentArs: values.minPaymentArs,
          dueDay: values.dueDay,
          notes: values.notes,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    return NextResponse.json({ settings: serialize(row) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
