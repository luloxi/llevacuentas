import type { BbvaMovement } from "@/lib/bbva/parse";
import { parseStatementWorkbook } from "@/lib/bbva/parse";
import {
  detectBankFromFileName,
  detectBankFromText,
  detectFileKind,
  emptyParseMessage,
  type StatementFileKind,
} from "@/lib/import/source";

export type StatementParseResult = {
  movements: BbvaMovement[];
  source: string;
  detectedBank: string | null;
  fileKind: StatementFileKind;
  pdfTextLength?: number;
  hint: string | null;
};

function workbookSource(
  fileKind: StatementFileKind,
  classicBbva: boolean,
  detectedBank: string | null,
): string {
  if (fileKind === "csv") return "csv";
  if (classicBbva && (!detectedBank || detectedBank === "BBVA")) {
    return "bbva_xlsx";
  }
  if (fileKind === "xls") return "xls";
  return "xlsx";
}

/**
 * Single pipeline for PWA import, agent import, and MCP.
 * BBVA PDF first, then generic PDF, then AI; tables via the workbook parser.
 */
export async function parseStatementFile(
  buffer: Buffer,
  fileName: string,
): Promise<StatementParseResult> {
  const fileKind = detectFileKind(buffer, fileName);
  const fromName = detectBankFromFileName(fileName);

  if (fileKind === "pdf") {
    const { extractPdfText, parseBbvaPdfText, parseGenericPdfText } =
      await import("@/lib/bbva/parse-pdf");
    const text = await extractPdfText(buffer);
    const detectedBank = detectBankFromText(text) ?? fromName;
    const pdfTextLength = text.length;

    const bbvaMovements = parseBbvaPdfText(text);
    if (bbvaMovements.length > 0) {
      const source =
        detectedBank && detectedBank !== "BBVA" ? "pdf" : "bbva_pdf";
      return {
        movements: bbvaMovements,
        source,
        detectedBank: detectedBank ?? "BBVA",
        fileKind,
        pdfTextLength,
        hint: null,
      };
    }

    const generic = parseGenericPdfText(text);
    if (generic.length > 0) {
      return {
        movements: generic,
        source: "pdf",
        detectedBank,
        fileKind,
        pdfTextLength,
        hint: null,
      };
    }

    const { isAiPdfImportConfigured, parseStatementPdfWithAi } = await import(
      "@/lib/import/parse-pdf-ai"
    );
    if (isAiPdfImportConfigured()) {
      try {
        const aiMovements = await parseStatementPdfWithAi(buffer, fileName);
        if (aiMovements.length > 0) {
          return {
            movements: aiMovements,
            source: "pdf_ai",
            detectedBank,
            fileKind,
            pdfTextLength,
            hint: null,
          };
        }
      } catch (e) {
        const hint = e instanceof Error ? e.message : null;
        const empty = emptyParseMessage({
          fileName,
          fileKind,
          pdfTextLength,
        });
        return {
          movements: [],
          source: "pdf_ai",
          detectedBank,
          fileKind,
          pdfTextLength,
          hint: hint ?? empty.hint,
        };
      }
    }

    const empty = emptyParseMessage({ fileName, fileKind, pdfTextLength });
    return {
      movements: [],
      source: detectedBank && detectedBank !== "BBVA" ? "pdf" : "bbva_pdf",
      detectedBank,
      fileKind,
      pdfTextLength,
      hint: empty.hint,
    };
  }

  const parsed = parseStatementWorkbook(buffer, fileName);
  const detectedBank = parsed.detectedBank ?? fromName;
  const kind: StatementFileKind =
    fileKind === "unknown" ? parsed.fileKind : fileKind;
  const source = workbookSource(kind, parsed.classicBbva, detectedBank);
  const hint =
    parsed.movements.length === 0
      ? emptyParseMessage({ fileName, fileKind: kind }).hint
      : null;

  return {
    movements: parsed.movements,
    source,
    detectedBank,
    fileKind: kind,
    hint,
  };
}
