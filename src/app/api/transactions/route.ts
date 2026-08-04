import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { listTransactions, updateTransaction } from "@/lib/import/bbva";
import { getDb, schema } from "@/lib/db";

export async function GET(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;
  try {
    const ctx = await requireHousehold(sessionUser.id);
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const q = searchParams.get("q") ?? undefined;
    const uncategorizedOnly =
      searchParams.get("uncategorized") === "1" ||
      searchParams.get("uncategorized") === "true";

    const [rows, { cats, byId }] = await Promise.all([
      listTransactions(ctx.household.id, {
        period,
        categoryId,
        q,
        uncategorizedOnly,
      }),
      getCategoryMap(),
    ]);

    const db = getDb();
    const txIds = rows.map((r) => r.id);
    const receiptByTx = new Map<
      string,
      {
        id: string;
        merchantName: string | null;
        receiptDate: string | null;
        totalArs: number | null;
        items: Array<{
          id: string;
          name: string;
          quantity: number | null;
          unitPrice: number | null;
          lineTotal: number | null;
          productCategory: string | null;
        }>;
      }
    >();

    if (txIds.length > 0) {
      const receipts = await db
        .select()
        .from(schema.receipts)
        .where(eq(schema.receipts.householdId, ctx.household.id));

      const linked = receipts.filter(
        (r) => r.transactionId && txIds.includes(r.transactionId),
      );
      const receiptIds = linked.map((r) => r.id);
      const items =
        receiptIds.length > 0
          ? await db
              .select()
              .from(schema.receiptItems)
              .where(inArray(schema.receiptItems.receiptId, receiptIds))
          : [];

      for (const r of linked) {
        if (!r.transactionId) continue;
        receiptByTx.set(r.transactionId, {
          id: r.id,
          merchantName: r.merchantName,
          receiptDate: r.receiptDate,
          totalArs: r.totalArs != null ? Number(r.totalArs) : null,
          items: items
            .filter((i) => i.receiptId === r.id)
            .map((i) => ({
              id: i.id,
              name: i.name,
              quantity: i.quantity != null ? Number(i.quantity) : null,
              unitPrice: i.unitPrice != null ? Number(i.unitPrice) : null,
              lineTotal: i.lineTotal != null ? Number(i.lineTotal) : null,
              productCategory: i.productCategory,
            })),
        });
      }
    }

    const data = rows.map((r) => {
      const receipt = receiptByTx.get(r.id) ?? null;
      return {
        id: r.id,
        date: r.date,
        descriptionNormalized: r.descriptionNormalized,
        amountArs: r.amountArs != null ? Number(r.amountArs) : null,
        amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
        installment: r.installment,
        isPayment: r.isPayment,
        paidByUserId: r.paidByUserId,
        source: r.source,
        category: r.categoryId ? (byId.get(r.categoryId) ?? null) : null,
        hasTicket: Boolean(receipt) || r.source === "receipt",
        receipt,
      };
    });

    const members = ctx.members.map((m) => ({
      userId: m.userId,
      name: m.displayName || m.name || m.email || m.userId,
    }));

    return NextResponse.json({
      transactions: data,
      categories: cats,
      members,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "NO_HOUSEHOLD") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Create a manual expense (simple or with line items / ticket detail). */
export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;
  try {
    const ctx = await requireHousehold(sessionUser.id);
    const body = (await req.json()) as {
      date?: string;
      description?: string;
      amountArs?: number | string | null;
      amountUsd?: number | string | null;
      categoryId?: string | null;
      paidByUserId?: string | null;
      ownership?: "personal" | "shared";
      items?: Array<{
        name: string;
        quantity?: number | null;
        unitPrice?: number | null;
        lineTotal?: number | null;
        productCategory?: string | null;
      }>;
    };

    const date = (body.date || "").trim();
    const description = (body.description || "").trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Fecha inválida (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
    if (!description) {
      return NextResponse.json({ error: "Falta la descripción" }, { status: 400 });
    }

    const items = Array.isArray(body.items)
      ? body.items.filter((i) => i?.name?.trim())
      : [];

    let amountArs: number | null =
      body.amountArs != null && body.amountArs !== ""
        ? Math.abs(Number(body.amountArs))
        : null;
    if (Number.isNaN(amountArs as number)) amountArs = null;

    if (items.length > 0 && (amountArs == null || amountArs === 0)) {
      const sum = items.reduce((s, i) => {
        const lt =
          i.lineTotal != null
            ? Number(i.lineTotal)
            : i.unitPrice != null && i.quantity != null
              ? Number(i.unitPrice) * Number(i.quantity)
              : 0;
        return s + (Number.isFinite(lt) ? Math.abs(lt) : 0);
      }, 0);
      if (sum > 0) amountArs = sum;
    }

    if (amountArs == null && body.amountUsd == null) {
      return NextResponse.json(
        { error: "Indicá un monto en $ o USD" },
        { status: 400 },
      );
    }

    const amountUsd =
      body.amountUsd != null && body.amountUsd !== ""
        ? Math.abs(Number(body.amountUsd))
        : null;

    const { byId, bySlug } = await getCategoryMap();
    let categoryId =
      body.categoryId && byId.has(body.categoryId) ? body.categoryId : null;
    if (!categoryId && items.length > 0) {
      categoryId = bySlug.get("supermercado")?.id ?? null;
    }
    if (!categoryId) {
      categoryId = bySlug.get("uncategorized")?.id ?? null;
    }

    const paidBy =
      body.paidByUserId &&
      ctx.members.some((m) => m.userId === body.paidByUserId)
        ? body.paidByUserId
        : sessionUser.id;

    const ownership =
      body.ownership === "shared" || body.ownership === "personal"
        ? body.ownership
        : items.length > 0
          ? "shared"
          : "personal";

    const fp = createHash("sha256")
      .update(
        `manual|${date}|${description}|${amountArs ?? ""}|${amountUsd ?? ""}|${Date.now()}|${Math.random()}`,
      )
      .digest("hex")
      .slice(0, 32);

    const db = getDb();
    const [tx] = await db
      .insert(schema.transactions)
      .values({
        householdId: ctx.household.id,
        date,
        descriptionRaw: description,
        descriptionNormalized: description,
        amountArs: amountArs != null ? String(amountArs) : null,
        amountUsd:
          amountUsd != null && !Number.isNaN(amountUsd)
            ? String(amountUsd)
            : null,
        categoryId,
        ownership,
        paidByUserId: paidBy,
        externalFingerprint: fp,
        source: items.length > 0 ? "receipt" : "manual",
      })
      .returning();

    let receipt = null;
    if (items.length > 0) {
      const [rec] = await db
        .insert(schema.receipts)
        .values({
          householdId: ctx.household.id,
          imageUrl: "manual://expense",
          merchantName: description,
          receiptDate: date,
          totalArs: amountArs != null ? String(amountArs) : null,
          currency: "ARS",
          status: "matched",
          transactionId: tx.id,
          createdBy: sessionUser.id,
          ocrRaw: { source: "manual", items },
        })
        .returning();
      receipt = rec;

      for (const item of items) {
        const qty = item.quantity != null ? Number(item.quantity) : 1;
        const unit =
          item.unitPrice != null ? Number(item.unitPrice) : null;
        let line =
          item.lineTotal != null ? Number(item.lineTotal) : null;
        if (line == null && unit != null && Number.isFinite(qty)) {
          line = unit * qty;
        }
        await db.insert(schema.receiptItems).values({
          receiptId: rec.id,
          name: item.name.trim(),
          quantity: Number.isFinite(qty) ? String(qty) : "1",
          unitPrice: unit != null && Number.isFinite(unit) ? String(unit) : null,
          lineTotal: line != null && Number.isFinite(line) ? String(line) : null,
          productCategory: item.productCategory?.trim() || null,
        });
      }
    }

    return NextResponse.json({ transaction: tx, receipt }, { status: 201 });
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
  const { user: sessionUser } = authResult;
  try {
    const ctx = await requireHousehold(sessionUser.id);
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    // Load description before update for learning
    const db = getDb();
    const [before] = await db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.id, body.id),
          eq(schema.transactions.householdId, ctx.household.id),
        ),
      )
      .limit(1);

    const row = await updateTransaction(ctx.household.id, body.id, {
      categoryId: body.categoryId,
      ownership: body.ownership,
      paidByUserId: body.paidByUserId,
      splitPct: body.splitPct,
    });

    let learned = 0;
    let similarUpdated = 0;
    if (
      body.categoryId &&
      typeof body.categoryId === "string" &&
      before?.descriptionNormalized
    ) {
      const {
        learnFromCategorization,
        applyCategoryToSimilar,
      } = await import("@/lib/categorize/learn");
      const { patterns } = await learnFromCategorization({
        householdId: ctx.household.id,
        description: before.descriptionNormalized,
        categoryId: body.categoryId,
      });
      learned = patterns.length;
      similarUpdated = await applyCategoryToSimilar({
        householdId: ctx.household.id,
        description: before.descriptionNormalized,
        categoryId: body.categoryId,
        excludeTxId: body.id,
      });
    }

    return NextResponse.json({
      transaction: row,
      learned,
      similarUpdated,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
