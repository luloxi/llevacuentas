import { and, eq, inArray } from "drizzle-orm";
import {
  parseBbvaWorkbook,
  parseTransparenciaConsumos,
  type BbvaMovement,
} from "@/lib/bbva/parse";
import { matchCategory, categoryNameToSlug } from "@/lib/categorize/rules";
import { matchCategoryWithLearning } from "@/lib/categorize/learn";
import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import { getDb, schema } from "@/lib/db";
import { getCategoryMap } from "@/lib/household";

/** Cheap PDF sniff without loading pdf-parse / pdfjs. */
function looksLikePdf(buffer: Buffer, fileName?: string): boolean {
  if (fileName && /\.pdf$/i.test(fileName)) return true;
  return (
    buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

/** Stable key for “same expense” even if fingerprint algorithm changed. */
function logicalExpenseKey(m: {
  date: string;
  descriptionNormalized: string;
  amountArs: number | null;
  amountUsd: number | null;
  installment: string | null;
  isPayment?: boolean;
}): string {
  const ars =
    m.amountArs != null && Number.isFinite(m.amountArs)
      ? Math.abs(m.amountArs).toFixed(2)
      : "";
  const usd =
    m.amountUsd != null && Number.isFinite(m.amountUsd)
      ? Math.abs(m.amountUsd).toFixed(2)
      : "";
  return [
    m.date,
    m.descriptionNormalized.trim().toUpperCase(),
    ars,
    usd,
    m.installment ?? "",
    m.isPayment ? "1" : "0",
  ].join("|");
}

export type ImportBbvaResult = {
  statementId: string | null;
  total: number;
  uniqueInFile: number;
  duplicatesInFile: number;
  alreadyExists: number;
  inserted: number;
  /** alreadyExists + duplicatesInFile (compat) */
  skipped: number;
  learnedHits: number;
  /** % of unique rows in file that already existed in DB (0–100) */
  overlapPct: number;
  fullyDuplicate: boolean;
  warning: string | null;
  message: string;
};

function buildImportMessage(r: {
  total: number;
  uniqueInFile: number;
  duplicatesInFile: number;
  alreadyExists: number;
  inserted: number;
}): { message: string; warning: string | null; fullyDuplicate: boolean; overlapPct: number } {
  const overlapPct =
    r.uniqueInFile > 0
      ? Math.round((r.alreadyExists / r.uniqueInFile) * 100)
      : 0;
  const fullyDuplicate = r.uniqueInFile > 0 && r.inserted === 0;

  if (r.total === 0) {
    return {
      message: "No se leyeron movimientos del archivo.",
      warning: null,
      fullyDuplicate: false,
      overlapPct: 0,
    };
  }

  if (fullyDuplicate) {
    const warning =
      r.alreadyExists > 0
        ? `Este resumen parece ya estar cargado: ${r.alreadyExists} coincidencia${r.alreadyExists === 1 ? "" : "s"} con lo que ya tenés. No se importó nada nuevo.`
        : `El archivo no tenía movimientos nuevos para importar.`;
    return {
      message: warning,
      warning,
      fullyDuplicate: true,
      overlapPct,
    };
  }

  const parts: string[] = [];
  parts.push(
    `${r.inserted} movimiento${r.inserted === 1 ? "" : "s"} nuevo${r.inserted === 1 ? "" : "s"}`,
  );
  if (r.alreadyExists > 0) {
    parts.push(
      `${r.alreadyExists} ya existían (coincidencias con lo cargado)`,
    );
  }
  if (r.duplicatesInFile > 0) {
    parts.push(
      `${r.duplicatesInFile} fila${r.duplicatesInFile === 1 ? "" : "s"} repetida${r.duplicatesInFile === 1 ? "" : "s"} en el archivo`,
    );
  }
  parts.push(`${r.total} filas leídas`);

  let warning: string | null = null;
  if (overlapPct >= 80) {
    warning = `Alta superposición (${overlapPct}%): este archivo se parece mucho a un resumen ya importado. Solo se agregaron ${r.inserted} nuevos.`;
  } else if (r.alreadyExists > 0) {
    warning = `${r.alreadyExists} coincidencia${r.alreadyExists === 1 ? "" : "s"} con movimientos ya cargados (misma fecha, comercio e importe). Esos no se volvieron a importar.`;
  }

  return {
    message: parts.join(" · "),
    warning,
    fullyDuplicate: false,
    overlapPct,
  };
}

async function parseBbvaMovements(
  buffer: Buffer,
  fileName: string,
): Promise<{ movements: BbvaMovement[]; source: string }> {
  if (looksLikePdf(buffer, fileName)) {
    // Dynamic import keeps pdf-parse out of non-import API bundles
    // (e.g. /api/transactions must not load DOMMatrix-dependent code).
    const { parseBbvaStatementPdf } = await import("@/lib/bbva/parse-pdf");
    const movements = await parseBbvaStatementPdf(buffer);
    return { movements, source: "bbva_pdf" };
  }
  return {
    movements: parseBbvaWorkbook(buffer),
    source: "bbva_xlsx",
  };
}

/**
 * Import BBVA "Últimos movimientos" (Excel) or monthly "Resumen" PDF.
 * Dedupes by externalFingerprint (date + merchant + amounts + installment [+ cupón en PDF]):
 * - same expense on another day is kept
 * - re-uploading the same statement only inserts truly new rows and reports matches
 */
export async function importBbvaFile(opts: {
  householdId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<ImportBbvaResult> {
  const { movements, source } = await parseBbvaMovements(
    opts.buffer,
    opts.fileName,
  );
  const total = movements.length;

  if (total === 0) {
    const meta = buildImportMessage({
      total: 0,
      uniqueInFile: 0,
      duplicatesInFile: 0,
      alreadyExists: 0,
      inserted: 0,
    });
    return {
      statementId: null,
      total: 0,
      uniqueInFile: 0,
      duplicatesInFile: 0,
      alreadyExists: 0,
      inserted: 0,
      skipped: 0,
      learnedHits: 0,
      ...meta,
    };
  }

  // Dedupe within the file itself (same row twice in one export)
  const seenInFile = new Set<string>();
  const uniqueMovements = [];
  let duplicatesInFile = 0;
  for (const m of movements) {
    if (seenInFile.has(m.fingerprint)) {
      duplicatesInFile++;
      continue;
    }
    seenInFile.add(m.fingerprint);
    uniqueMovements.push(m);
  }

  const db = getDb();
  const fingerprints = uniqueMovements.map((m) => m.fingerprint);

  // 1) Exact fingerprint match (fast path)
  const existingRows =
    fingerprints.length > 0
      ? await db
          .select({ fp: schema.transactions.externalFingerprint })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.householdId, opts.householdId),
              inArray(schema.transactions.externalFingerprint, fingerprints),
            ),
          )
      : [];

  const existingFp = new Set(existingRows.map((r) => r.fp));

  // 2) Logical match: same date + merchant + amounts + cuota
  //    (covers re-imports after fingerprint algorithm changes)
  const dates = [...new Set(uniqueMovements.map((m) => m.date))];
  const existingLogical =
    dates.length > 0
      ? await db
          .select({
            date: schema.transactions.date,
            descriptionNormalized: schema.transactions.descriptionNormalized,
            amountArs: schema.transactions.amountArs,
            amountUsd: schema.transactions.amountUsd,
            installment: schema.transactions.installment,
            isPayment: schema.transactions.isPayment,
          })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.householdId, opts.householdId),
              inArray(schema.transactions.date, dates),
            ),
          )
      : [];

  const existingLogicalKeys = new Set(
    existingLogical.map((r) =>
      logicalExpenseKey({
        date: r.date,
        descriptionNormalized: r.descriptionNormalized,
        amountArs: r.amountArs != null ? Number(r.amountArs) : null,
        amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
        installment: r.installment,
        isPayment: r.isPayment,
      }),
    ),
  );

  // Track logical keys we insert in this batch (same file, different fp)
  const insertedLogical = new Set<string>();

  const toInsert = uniqueMovements.filter((m) => {
    if (existingFp.has(m.fingerprint)) return false;
    const key = logicalExpenseKey(m);
    if (existingLogicalKeys.has(key)) return false;
    if (insertedLogical.has(key)) return false;
    insertedLogical.add(key);
    return true;
  });
  const alreadyExists = uniqueMovements.length - toInsert.length;

  if (toInsert.length === 0) {
    const meta = buildImportMessage({
      total,
      uniqueInFile: uniqueMovements.length,
      duplicatesInFile,
      alreadyExists,
      inserted: 0,
    });
    return {
      statementId: null,
      total,
      uniqueInFile: uniqueMovements.length,
      duplicatesInFile,
      alreadyExists,
      inserted: 0,
      skipped: alreadyExists + duplicatesInFile,
      learnedHits: 0,
      ...meta,
    };
  }

  const { bySlug } = await getCategoryMap();

  const [statement] = await db
    .insert(schema.cardStatements)
    .values({
      householdId: opts.householdId,
      source,
      fileName: opts.fileName,
      importedBy: opts.userId,
      rowCount: toInsert.length,
    })
    .returning();

  let inserted = 0;
  let learnedHits = 0;
  let insertFailed = 0;
  const txSource = source === "bbva_pdf" ? "bbva_pdf" : "bbva_import";

  for (const m of toInsert) {
    const catMatch = await matchCategoryWithLearning(
      opts.householdId,
      m.descriptionNormalized,
    );
    if (catMatch.learned) learnedHits++;
    const category =
      (catMatch.categoryId ? { id: catMatch.categoryId } : null) ??
      bySlug.get(catMatch.slug) ??
      bySlug.get("uncategorized");

    const ownership =
      m.isPayment || catMatch.kind !== "expense"
        ? "personal"
        : catMatch.defaultOwnership;

    try {
      await db.insert(schema.transactions).values({
        householdId: opts.householdId,
        statementId: statement.id,
        date: m.date,
        descriptionRaw: m.descriptionRaw,
        descriptionNormalized: m.descriptionNormalized,
        amountArs: m.amountArs != null ? String(m.amountArs) : null,
        amountUsd: m.amountUsd != null ? String(m.amountUsd) : null,
        installment: m.installment,
        isPayment: m.isPayment,
        isCredit: m.isCredit,
        categoryId: category?.id,
        ownership,
        paidByUserId: opts.userId,
        externalFingerprint: m.fingerprint,
        source: txSource,
      });
      inserted++;
    } catch {
      // Race / unique index: treat as already exists
      insertFailed++;
    }
  }

  const finalAlreadyExists = alreadyExists + insertFailed;
  const meta = buildImportMessage({
    total,
    uniqueInFile: uniqueMovements.length,
    duplicatesInFile,
    alreadyExists: finalAlreadyExists,
    inserted,
  });

  return {
    statementId: statement.id,
    total,
    uniqueInFile: uniqueMovements.length,
    duplicatesInFile,
    alreadyExists: finalAlreadyExists,
    inserted,
    skipped: finalAlreadyExists + duplicatesInFile,
    learnedHits,
    ...meta,
  };
}

export async function importTransparenciaConsumos(opts: {
  householdId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
}) {
  const rows = parseTransparenciaConsumos(opts.buffer);
  const db = getDb();
  const { bySlug } = await getCategoryMap();

  // Dedupe within file + against existing fingerprints
  const seen = new Set<string>();
  const unique = [];
  let duplicatesInFile = 0;
  for (const r of rows) {
    if (seen.has(r.fingerprint)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(r.fingerprint);
    unique.push(r);
  }

  const fps = unique.map((r) => r.fingerprint);
  const existingRows =
    fps.length > 0
      ? await db
          .select({ fp: schema.transactions.externalFingerprint })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.householdId, opts.householdId),
              inArray(schema.transactions.externalFingerprint, fps),
            ),
          )
      : [];
  const existingFp = new Set(existingRows.map((r) => r.fp));
  const toInsert = unique.filter((r) => !existingFp.has(r.fingerprint));
  const alreadyExists = unique.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      statementId: null as string | null,
      total: rows.length,
      uniqueInFile: unique.length,
      duplicatesInFile,
      alreadyExists,
      inserted: 0,
      skipped: alreadyExists + duplicatesInFile,
      message:
        alreadyExists > 0
          ? `Ya estaba cargado: ${alreadyExists} coincidencias. No se importó nada nuevo.`
          : "No hay filas nuevas para importar.",
      warning:
        alreadyExists > 0
          ? `Este archivo tiene ${alreadyExists} coincidencias con lo ya cargado.`
          : null,
      fullyDuplicate: true,
    };
  }

  const [statement] = await db
    .insert(schema.cardStatements)
    .values({
      householdId: opts.householdId,
      source: "transparencia_xlsx",
      fileName: opts.fileName,
      importedBy: opts.userId,
      rowCount: toInsert.length,
    })
    .returning();

  let inserted = 0;
  let skipped = alreadyExists + duplicatesInFile;

  for (const r of toInsert) {
    const slug = categoryNameToSlug(r.categoryName);
    const category = bySlug.get(slug) ?? bySlug.get("uncategorized");
    const catSeed = matchCategory(r.description);
    const ownership = catSeed.defaultOwnership;

    try {
      await db.insert(schema.transactions).values({
        householdId: opts.householdId,
        statementId: statement.id,
        date: r.date,
        descriptionRaw: r.description,
        descriptionNormalized: r.description,
        amountArs: r.amountArs != null ? String(r.amountArs) : null,
        amountUsd: r.amountUsd != null ? String(r.amountUsd) : null,
        isPayment: false,
        isCredit: false,
        categoryId: category?.id,
        ownership,
        paidByUserId: opts.userId,
        externalFingerprint: r.fingerprint,
        source: "transparencia",
      });
      inserted++;
    } catch {
      skipped++;
    }
  }

  return {
    statementId: statement.id,
    total: rows.length,
    uniqueInFile: unique.length,
    duplicatesInFile,
    alreadyExists,
    inserted,
    skipped,
    message: `${inserted} nuevos · ${alreadyExists} ya existían · ${rows.length} filas leídas`,
    warning:
      alreadyExists > 0
        ? `${alreadyExists} coincidencias con lo ya cargado (no se reimportaron).`
        : null,
    fullyDuplicate: false,
  };
}

// listTransactions / updateTransaction live in @/lib/transactions
// so Consumos API does not pull pdf-parse into the serverless bundle.
