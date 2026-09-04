import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { getUserHousehold } from "@/lib/household";
import { periodFromDateString } from "@/lib/utils";

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

function serialize(row: typeof schema.incomes.$inferSelect) {
  return {
    id: row.id,
    date: row.date,
    label: row.label,
    amountArs: row.amountArs != null ? Number(row.amountArs) : null,
    amountUsd: row.amountUsd != null ? Number(row.amountUsd) : null,
    createdAt: row.createdAt?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    await ensureSchema();
    const ctx = await getUserHousehold(user.id);
    if (!ctx) {
      return NextResponse.json({ error: "Sin espacio" }, { status: 400 });
    }

    const url = new URL(req.url);
    const period = url.searchParams.get("period"); // YYYY-MM optional

    const db = getDb();
    const rows = await db
      .select()
      .from(schema.incomes)
      .where(eq(schema.incomes.userId, user.id))
      .orderBy(desc(schema.incomes.date), desc(schema.incomes.createdAt));

    const filtered = period
      ? rows.filter((r) => periodFromDateString(r.date) === period)
      : rows;

    return NextResponse.json({
      incomes: filtered.map(serialize),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    await ensureSchema();
    const ctx = await getUserHousehold(user.id);
    if (!ctx) {
      return NextResponse.json({ error: "Sin espacio" }, { status: 400 });
    }

    const body = (await req.json()) as {
      date?: string;
      label?: string;
      amountArs?: number | null;
      amountUsd?: number | null;
    };

    const date = (body.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Fecha inválida (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
    const label = (body.label || "").trim();
    if (!label) {
      return NextResponse.json({ error: "Falta la descripción" }, { status: 400 });
    }

    const amountArs = n(body.amountArs);
    const amountUsd = n(body.amountUsd);
    if (
      (amountArs == null || amountArs === 0) &&
      (amountUsd == null || amountUsd === 0)
    ) {
      return NextResponse.json(
        { error: "Poné un monto en pesos y/o dólares" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [row] = await db
      .insert(schema.incomes)
      .values({
        userId: user.id,
        householdId: ctx.household.id,
        date,
        label,
        amountArs: amountArs != null ? String(amountArs) : null,
        amountUsd: amountUsd != null ? String(amountUsd) : null,
      })
      .returning();

    return NextResponse.json({ income: serialize(row) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    await ensureSchema();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const db = getDb();
    await db
      .delete(schema.incomes)
      .where(
        and(eq(schema.incomes.id, id), eq(schema.incomes.userId, user.id)),
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
