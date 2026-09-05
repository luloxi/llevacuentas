import { isBankAccountingEntry } from "@/lib/bbva/bank-entries";
import {
  parseBbvaWorkbook,
  type BbvaMovement,
} from "@/lib/bbva/parse";
import { periodFromDateString } from "@/lib/utils";

function looksLikePdf(buffer: Buffer, fileName?: string): boolean {
  if (fileName && /\.pdf$/i.test(fileName)) return true;
  return (
    buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

export async function parseStatementMovements(
  buffer: Buffer,
  fileName: string,
): Promise<{ movements: BbvaMovement[]; source: string }> {
  if (looksLikePdf(buffer, fileName)) {
    const { parseBbvaStatementPdf } = await import("@/lib/bbva/parse-pdf");
    const bbvaMovements = await parseBbvaStatementPdf(buffer);
    if (bbvaMovements.length > 0) {
      return { movements: bbvaMovements, source: "bbva_pdf" };
    }
    const { isAiPdfImportConfigured, parseStatementPdfWithAi } = await import(
      "@/lib/import/parse-pdf-ai"
    );
    if (isAiPdfImportConfigured()) {
      const aiMovements = await parseStatementPdfWithAi(buffer, fileName);
      return { movements: aiMovements, source: "pdf_ai" };
    }
    return { movements: [], source: "bbva_pdf" };
  }
  return {
    movements: parseBbvaWorkbook(buffer),
    source: "bbva_xlsx",
  };
}

export type PeriodFileSummary = {
  period: string;
  expenseCount: number;
  amountArs: number;
  amountUsd: number;
};

export type ParsedStatementSummary = {
  source: string;
  total: number;
  expenseCount: number;
  paymentCount: number;
  accountingCount: number;
  periods: string[];
  byPeriod: PeriodFileSummary[];
};

/**
 * Summarize a parsed statement in memory (no DB).
 * Used by tests and as a preview alongside importBbvaFile.
 */
export function summarizeParsedMovements(
  movements: BbvaMovement[],
  source = "bbva_xlsx",
): ParsedStatementSummary {
  let expenseCount = 0;
  let paymentCount = 0;
  let accountingCount = 0;
  const byPeriod = new Map<string, PeriodFileSummary>();

  for (const m of movements) {
    const accounting = isBankAccountingEntry(m.descriptionNormalized);
    if (m.isPayment) paymentCount += 1;
    else if (accounting) accountingCount += 1;
    else expenseCount += 1;

    if (m.isPayment || accounting) continue;

    const period = periodFromDateString(m.date);
    const cur = byPeriod.get(period) ?? {
      period,
      expenseCount: 0,
      amountArs: 0,
      amountUsd: 0,
    };
    cur.expenseCount += 1;
    cur.amountArs += m.amountArs != null ? Math.abs(m.amountArs) : 0;
    cur.amountUsd += m.amountUsd != null ? Math.abs(m.amountUsd) : 0;
    byPeriod.set(period, cur);
  }

  const periods = [...byPeriod.keys()].sort().reverse();
  return {
    source,
    total: movements.length,
    expenseCount,
    paymentCount,
    accountingCount,
    periods,
    byPeriod: periods.map((p) => byPeriod.get(p)!),
  };
}
