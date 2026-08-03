import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { listTransactions, updateTransaction } from "@/lib/import/bbva";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const ctx = await requireHousehold(session.user.id);
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const q = searchParams.get("q") ?? undefined;

    const [rows, { cats, byId }] = await Promise.all([
      listTransactions(ctx.household.id, { period, categoryId, q }),
      getCategoryMap(),
    ]);

    const data = rows.map((r) => ({
      ...r,
      amountArs: r.amountArs != null ? Number(r.amountArs) : null,
      amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
      category: r.categoryId ? byId.get(r.categoryId) ?? null : null,
    }));

    return NextResponse.json({ transactions: data, categories: cats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "NO_HOUSEHOLD") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const ctx = await requireHousehold(session.user.id);
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const row = await updateTransaction(ctx.household.id, body.id, {
      categoryId: body.categoryId,
      ownership: body.ownership,
      paidByUserId: body.paidByUserId,
      splitPct: body.splitPct,
    });
    return NextResponse.json({ transaction: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
