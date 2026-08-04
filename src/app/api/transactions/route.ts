import { NextResponse } from "next/server";
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
