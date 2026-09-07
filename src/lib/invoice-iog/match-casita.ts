import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { CASITA_OWNER_EMAIL } from "@/lib/casita/septiembre-csv";
import { isPeriodDebtSource } from "@/lib/import/source";
import { amountsClose } from "@/lib/money";
import {
  INVOICE_IOG_HOUSEHOLD_NAME,
  INVOICE_IOG_OWNER_EMAIL,
  INVOICE_IOG_SOURCE,
  INVOICE_IOG_TOOL_RULES,
} from "@/lib/invoice-iog/catalog";
import type { AppUser } from "@/lib/session";

export type MatchCandidate = {
  id: string;
  date: string;
  descriptionNormalized: string;
  amountArs: number | null;
  amountUsd: number | null;
  bank: string | null;
  source: string;
};

export type MatchPair = {
  invoiceIogId: string;
  casitaId: string;
  via: "usd" | "ars";
  dateDiffDays: number;
};

/** Prod import sources that may omit bank or use generic names. */
const IMPORT_SOURCES = new Set([
  "bbva_import",
  "bbva_pdf",
  "xlsx_import",
  "csv_import",
  "statement_pdf",
  "transparencia",
  "pdf_ai",
  "pdf",
  "casita_csv", // Fiwind CSV seed / exports (bank often Fiwind)
]);

function isOwner(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e === INVOICE_IOG_OWNER_EMAIL || e === CASITA_OWNER_EMAIL;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function dayDiff(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.abs(da - db) / 86_400_000;
}

/** BBVA card or Fiwind wallet spends in Casita (incl. real prod import sources). */
export function isBbvaOrFiwindCandidate(row: {
  bank: string | null;
  source: string;
}): boolean {
  const bank = (row.bank ?? "").toLowerCase();
  const source = (row.source ?? "").toLowerCase();
  if (source === INVOICE_IOG_SOURCE) return false;
  // Period xls / resumen PDF feed Deuda, not Consumos neta matching.
  if (isPeriodDebtSource(source)) return false;
  if (bank.includes("bbva") || bank.includes("fiwind")) return true;
  if (source.includes("bbva") || source.includes("fiwind")) return true;
  if (IMPORT_SOURCES.has(source)) return true;
  return false;
}

/**
 * Canonical merchant keys shared by Invoice IOG descriptions and BBVA/Fiwind
 * memos (OPENAI, CURSOR, DIGITALOCEAN, RAILWAY, …).
 */
export function invoiceIogMerchantKeys(description: string): string[] {
  const u = (description ?? "").toUpperCase();
  const keys = new Set<string>();

  for (const rule of INVOICE_IOG_TOOL_RULES) {
    const pat = rule.pattern.toUpperCase();
    if (u.includes(pat)) {
      keys.add(pat.replace(/\s+/g, ""));
    }
  }

  if (/DIGITAL\s*OCEAN|DIGITALOCEAN/.test(u)) keys.add("DIGITALOCEAN");
  if (/\bDO\.COM\b|\bDO\s+DROPLET/.test(u)) keys.add("DIGITALOCEAN");
  if (/\bCHATGPT\b|\bOPENAI\b/.test(u)) {
    keys.add("OPENAI");
    keys.add("CHATGPT");
  }
  if (/\bCLAUDE\b|\bANTHROPIC\b/.test(u)) {
    keys.add("CLAUDE");
    keys.add("ANTHROPIC");
  }
  if (/\bSUPERGROK\b|\bGROK\b.*\bXAI\b|\bXAI\b/.test(u)) keys.add("SUPERGROK");

  return [...keys];
}

export function merchantsOverlap(a: string, b: string): boolean {
  const ka = invoiceIogMerchantKeys(a);
  const kb = invoiceIogMerchantKeys(b);
  if (ka.length === 0 || kb.length === 0) return false;
  return ka.some((k) => kb.includes(k));
}

/**
 * Same economic amount: IOG usd↔Casita usd, IOG arsLiq↔Casita ars,
 * cross when BBVA parked USD in the ARS column.
 * `loose` widens ARS % (use when merchant keywords already agree).
 */
export function amountMatchVia(
  iog: { amountArs: number | null; amountUsd: number | null },
  casita: { amountArs: number | null; amountUsd: number | null },
  opts?: { loose?: boolean },
): "usd" | "ars" | null {
  const iu = iog.amountUsd;
  const ia = iog.amountArs;
  const cu = casita.amountUsd;
  const ca = casita.amountArs;
  const loose = Boolean(opts?.loose);

  if (iu != null && iu > 0) {
    if (cu != null && Math.abs(iu - cu) <= 0.05) return "usd";
    // BBVA sometimes parks the USD figure in the $ column
    if (ca != null && Math.abs(iu - ca) <= 0.05) return "usd";
  }

  if (ia != null && ia > 0) {
    if (ca != null) {
      // Tight: same liquidated pesos (±1)
      if (Math.abs(ia - ca) <= 1) return "ars";
      // Always allow small FX drift on converted ARS
      if (amountsClose(ia, ca, { absTol: 50, pctTol: 0.03 })) return "ars";
      // Merchant-confirmed: wider FX / tax drift
      if (loose && amountsClose(ia, ca, { absTol: 200, pctTol: 0.08 })) {
        return "ars";
      }
    }
    if (cu != null && Math.abs(ia - cu) <= 1) return "ars";
  }

  return null;
}

/**
 * 1:1 greedy match by amount, preferring closer dates + merchant overlap
 * (max 120d window).
 */
export function matchInvoiceIogToCasita(
  iogRows: MatchCandidate[],
  casitaRows: MatchCandidate[],
  opts?: { maxDateDiffDays?: number },
): MatchPair[] {
  const maxDiff = opts?.maxDateDiffDays ?? 120;
  const used = new Set<string>();
  const pairs: MatchPair[] = [];

  const sortedIog = [...iogRows].sort((a, b) => a.date.localeCompare(b.date));

  for (const io of sortedIog) {
    let best: {
      casita: MatchCandidate;
      via: "usd" | "ars";
      dateDiffDays: number;
      score: number;
    } | null = null;

    for (const c of casitaRows) {
      if (used.has(c.id)) continue;
      const merchant = merchantsOverlap(
        io.descriptionNormalized,
        c.descriptionNormalized,
      );
      const via = amountMatchVia(
        { amountArs: io.amountArs, amountUsd: io.amountUsd },
        { amountArs: c.amountArs, amountUsd: c.amountUsd },
        { loose: merchant },
      );
      if (!via) continue;
      const dateDiffDays = dayDiff(io.date, c.date);
      if (dateDiffDays > maxDiff) continue;
      const score =
        (via === "usd" ? 200 : 100) -
        dateDiffDays +
        (merchant ? 150 : 0) +
        (c.bank ? 1 : 0);
      if (!best || score > best.score) {
        best = { casita: c, via, dateDiffDays, score };
      }
    }

    if (!best) continue;
    used.add(best.casita.id);
    pairs.push({
      invoiceIogId: io.id,
      casitaId: best.casita.id,
      via: best.via,
      dateDiffDays: best.dateDiffDays,
    });
  }

  return pairs;
}

export type MatchCasitaResult = {
  matched: number;
  total: number;
  pairs: MatchPair[];
};

let inflight: Promise<MatchCasitaResult> | null = null;

/**
 * Link Invoice IOG gastos ↔ Personal/Casita BBVA/Fiwind by same amount.
 * Bank loads live as Personal; Casita is an assign label. Leaves IOG as
 * source of truth; tags bank rows via linkedTransactionId (excluded from
 * Personal/Casita neta). Idempotent: never clears existing links; only fills nulls.
 */
export async function ensureInvoiceIogCasitaMatchesForUser(
  user: AppUser,
): Promise<MatchCasitaResult> {
  if (!isOwner(user.email)) {
    return { matched: 0, total: 0, pairs: [] };
  }
  if (inflight) return inflight;
  inflight = runMatch(user).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function householdIdByName(
  userId: string,
  name: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.households.id })
    .from(schema.householdMembers)
    .innerJoin(
      schema.households,
      eq(schema.households.id, schema.householdMembers.householdId),
    )
    .where(
      and(
        eq(schema.householdMembers.userId, userId),
        eq(schema.households.name, name),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}


async function runMatch(user: AppUser): Promise<MatchCasitaResult> {
  await ensureSchema();
  const db = getDb();

  const iogId = await householdIdByName(user.id, INVOICE_IOG_HOUSEHOLD_NAME);
  if (!iogId) {
    return { matched: 0, total: 0, pairs: [] };
  }

  // Bank candidates: all non–Invoice IOG hogares (Personal dump + Casita assigns).
  const memberHh = await db
    .select({
      id: schema.households.id,
      name: schema.households.name,
    })
    .from(schema.householdMembers)
    .innerJoin(
      schema.households,
      eq(schema.households.id, schema.householdMembers.householdId),
    )
    .where(eq(schema.householdMembers.userId, user.id));
  const bankHouseholdIds = memberHh
    .filter((h) => h.name !== INVOICE_IOG_HOUSEHOLD_NAME)
    .map((h) => h.id);
  if (bankHouseholdIds.length === 0) {
    return { matched: 0, total: 0, pairs: [] };
  }

  const iogTxs = await db
    .select({
      id: schema.transactions.id,
      date: schema.transactions.date,
      descriptionNormalized: schema.transactions.descriptionNormalized,
      amountArs: schema.transactions.amountArs,
      amountUsd: schema.transactions.amountUsd,
      bank: schema.transactions.bank,
      source: schema.transactions.source,
      linkedTransactionId: schema.transactions.linkedTransactionId,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.householdId, iogId),
        eq(schema.transactions.source, INVOICE_IOG_SOURCE),
      ),
    );

  const casitaTxs = await db
    .select({
      id: schema.transactions.id,
      householdId: schema.transactions.householdId,
      date: schema.transactions.date,
      descriptionNormalized: schema.transactions.descriptionNormalized,
      amountArs: schema.transactions.amountArs,
      amountUsd: schema.transactions.amountUsd,
      bank: schema.transactions.bank,
      source: schema.transactions.source,
      linkedTransactionId: schema.transactions.linkedTransactionId,
      isPayment: schema.transactions.isPayment,
      isCredit: schema.transactions.isCredit,
    })
    .from(schema.transactions)
    .where(inArray(schema.transactions.householdId, bankHouseholdIds));

  const iogCandidates: MatchCandidate[] = iogTxs.map((t) => ({
    id: t.id,
    date: t.date,
    descriptionNormalized: t.descriptionNormalized,
    amountArs: toNum(t.amountArs),
    amountUsd: toNum(t.amountUsd),
    bank: t.bank,
    source: t.source,
  }));

  const alreadyLinkedIog = new Set(
    iogTxs.filter((t) => t.linkedTransactionId).map((t) => t.id),
  );

  // Keep previously matched; only match remaining (idempotent, never clears)
  const unmatchedIog = iogCandidates.filter((t) => !alreadyLinkedIog.has(t.id));

  const casitaCandidates: MatchCandidate[] = casitaTxs
    .filter(
      (t) =>
        !t.isPayment &&
        !t.isCredit &&
        !t.linkedTransactionId &&
        isBbvaOrFiwindCandidate(t),
    )
    .map((t) => ({
      id: t.id,
      date: t.date,
      descriptionNormalized: t.descriptionNormalized,
      amountArs: toNum(t.amountArs),
      amountUsd: toNum(t.amountUsd),
      bank: t.bank,
      source: t.source,
    }));

  const newPairs = matchInvoiceIogToCasita(unmatchedIog, casitaCandidates);

  for (const pair of newPairs) {
    // Bank (Personal/Casita) → IOG. Excluded from bank-side neta.
    await db
      .update(schema.transactions)
      .set({
        linkedTransactionId: pair.invoiceIogId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.transactions.id, pair.casitaId),
          inArray(schema.transactions.householdId, bankHouseholdIds),
          isNull(schema.transactions.linkedTransactionId),
        ),
      );

    // IOG → Casita for reverse lookup (IOG stays in its own neta).
    await db
      .update(schema.transactions)
      .set({
        linkedTransactionId: pair.casitaId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.transactions.id, pair.invoiceIogId),
          eq(schema.transactions.householdId, iogId),
          isNull(schema.transactions.linkedTransactionId),
        ),
      );
  }

  const matched = alreadyLinkedIog.size + newPairs.length;
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.householdId, iogId),
        eq(schema.transactions.source, INVOICE_IOG_SOURCE),
        isNotNull(schema.transactions.linkedTransactionId),
      ),
    );

  const total = iogTxs.length;
  const matchedCount = row?.c ?? matched;

  console.info(
    `[invoice-iog↔casita] matched ${matchedCount} of ${total} (new ${newPairs.length})`,
  );

  return {
    matched: matchedCount,
    total,
    pairs: newPairs,
  };
}
