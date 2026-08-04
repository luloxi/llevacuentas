import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { createHash } from "crypto";
import { requireApiUser } from "@/lib/api-auth";
import { getCategoryMap, requireHousehold } from "@/lib/household";
import { getDb, schema } from "@/lib/db";
import {
  isOcrConfigured,
  mockReceiptOcr,
  parseReceiptImage,
} from "@/lib/receipts/ocr";
import { matchReceiptToTransactions } from "@/lib/receipts/match";

export async function GET() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;
  try {
    const ctx = await requireHousehold(sessionUser.id);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.householdId, ctx.household.id))
      .orderBy(desc(schema.receipts.createdAt));

    const withItems = await Promise.all(
      rows.map(async (r) => {
        const items = await db
          .select()
          .from(schema.receiptItems)
          .where(eq(schema.receiptItems.receiptId, r.id));
        return {
          ...r,
          totalArs: r.totalArs != null ? Number(r.totalArs) : null,
          items: items.map((i) => ({
            ...i,
            quantity: i.quantity != null ? Number(i.quantity) : null,
            unitPrice: i.unitPrice != null ? Number(i.unitPrice) : null,
            lineTotal: i.lineTotal != null ? Number(i.lineTotal) : null,
          })),
        };
      }),
    );

    return NextResponse.json({ receipts: withItems });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

/** Vercel request body limit is ~4.5MB; reject earlier with JSON. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error:
            "La foto es demasiado grande. Sacá otra o usá una resolución menor.",
        },
        { status: 413 },
      );
    }

    const ctx = await requireHousehold(sessionUser.id);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error:
            "La foto es demasiado grande. Sacá otra o usá una resolución menor.",
        },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";

    let imageUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `receipts/${ctx.household.id}/${Date.now()}-${file.name}`,
        buffer,
        { access: "public", contentType },
      );
      imageUrl = blob.url;
    } else {
      // Fallback: store as data URL in DB (ok for demos / small images)
      imageUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    }

    // OCR
    let ocr;
    let status: "parsed" | "failed" = "parsed";
    try {
      if (isOcrConfigured()) {
        ocr = await parseReceiptImage(
          imageUrl.startsWith("data:") ? imageUrl : imageUrl,
        );
      } else {
        ocr = mockReceiptOcr();
      }
    } catch (err) {
      status = "failed";
      ocr = mockReceiptOcr();
      console.error("OCR failed", err);
    }

    const db = getDb();
    const { bySlug, byId } = await getCategoryMap();

    const [receipt] = await db
      .insert(schema.receipts)
      .values({
        householdId: ctx.household.id,
        imageUrl: imageUrl.startsWith("data:")
          ? `local://${createHash("sha256").update(buffer).digest("hex").slice(0, 16)}`
          : imageUrl,
        merchantName: ocr.merchant,
        receiptDate: ocr.date,
        totalArs: ocr.total != null ? String(ocr.total) : null,
        currency: ocr.currency,
        ocrRaw: ocr,
        status,
        createdBy: sessionUser.id,
      })
      .returning();

    // Persist data URL separately if needed - store full URL when blob
    if (imageUrl.startsWith("data:")) {
      // Keep truncated local ref; put full data in ocrRaw for preview in demo
      await db
        .update(schema.receipts)
        .set({
          ocrRaw: { ...ocr, _previewDataUrl: imageUrl.slice(0, 100) + "…" },
        })
        .where(eq(schema.receipts.id, receipt.id));
    }

    for (const item of ocr.items) {
      await db.insert(schema.receiptItems).values({
        receiptId: receipt.id,
        name: item.name,
        quantity: item.quantity != null ? String(item.quantity) : "1",
        unitPrice: item.unit_price != null ? String(item.unit_price) : null,
        lineTotal: item.line_total != null ? String(item.line_total) : null,
      });
    }

    // Candidate transactions around receipt date
    let candidates: Array<{
      id: string;
      date: string;
      descriptionNormalized: string;
      amountArs: number | null;
      categorySlug?: string | null;
      hasReceipt?: boolean;
    }> = [];

    if (ocr.date) {
      const d = new Date(ocr.date + "T12:00:00Z");
      const from = new Date(d);
      from.setUTCDate(from.getUTCDate() - 1);
      const to = new Date(d);
      to.setUTCDate(to.getUTCDate() + 2);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);

      const txs = await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.householdId, ctx.household.id),
            gte(schema.transactions.date, fromStr),
            lte(schema.transactions.date, toStr),
          ),
        );

      const linked = await db
        .select({ transactionId: schema.receipts.transactionId })
        .from(schema.receipts)
        .where(eq(schema.receipts.householdId, ctx.household.id));
      const linkedSet = new Set(
        linked.map((l) => l.transactionId).filter(Boolean) as string[],
      );

      candidates = txs.map((t) => ({
        id: t.id,
        date: t.date,
        descriptionNormalized: t.descriptionNormalized,
        amountArs: t.amountArs != null ? Number(t.amountArs) : null,
        categorySlug: t.categoryId ? byId.get(t.categoryId)?.slug : null,
        hasReceipt: linkedSet.has(t.id),
      }));
    }

    const match = matchReceiptToTransactions(
      {
        merchantName: ocr.merchant,
        receiptDate: ocr.date,
        totalArs: ocr.total,
      },
      candidates,
    );

    let transactionId = match.transactionId;
    let createdTransaction = false;

    if (transactionId) {
      await db
        .update(schema.receipts)
        .set({ transactionId, status: "matched" })
        .where(eq(schema.receipts.id, receipt.id));
    } else if (
      match.candidates.length === 0 &&
      ocr.total != null &&
      ocr.date
    ) {
      // Create new bank-like transaction from receipt
      const superCat = bySlug.get("supermercado");
      const merchant = ocr.merchant || "Supermercado";
      const fp = createHash("sha256")
        .update(`receipt|${ocr.date}|${merchant}|${ocr.total}`)
        .digest("hex")
        .slice(0, 32);

      try {
        const [tx] = await db
          .insert(schema.transactions)
          .values({
            householdId: ctx.household.id,
            date: ocr.date,
            descriptionRaw: merchant,
            descriptionNormalized: merchant,
            amountArs: String(ocr.total),
            categoryId: superCat?.id,
            ownership: "shared",
            paidByUserId: sessionUser.id,
            externalFingerprint: fp,
            source: "receipt",
          })
          .returning();
        transactionId = tx.id;
        createdTransaction = true;
        await db
          .update(schema.receipts)
          .set({ transactionId, status: "matched" })
          .where(eq(schema.receipts.id, receipt.id));
      } catch {
        // fingerprint collision — try link existing
        const [existing] = await db
          .select()
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.householdId, ctx.household.id),
              eq(schema.transactions.externalFingerprint, fp),
            ),
          )
          .limit(1);
        if (existing) {
          transactionId = existing.id;
          await db
            .update(schema.receipts)
            .set({ transactionId, status: "matched" })
            .where(eq(schema.receipts.id, receipt.id));
        }
      }
    }

    return NextResponse.json({
      receipt: {
        ...receipt,
        totalArs: ocr.total,
        status: transactionId ? "matched" : status,
        transactionId,
      },
      ocr,
      match,
      createdTransaction,
      imageUrl: imageUrl.startsWith("data:") ? imageUrl : imageUrl,
    });
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
    const db = getDb();
    const [row] = await db
      .update(schema.receipts)
      .set({
        transactionId: body.transactionId ?? null,
        status: body.transactionId ? "matched" : "parsed",
      })
      .where(
        and(
          eq(schema.receipts.id, body.id),
          eq(schema.receipts.householdId, ctx.household.id),
        ),
      )
      .returning();
    return NextResponse.json({ receipt: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
